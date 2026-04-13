import { createImprovementId } from '../core/ids.js';
import { getDirectionIndex, getHexesInRange, getNeighbors, hexDistance, hexToKey } from '../core/grid.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { getRoleEffectiveness } from '../data/roleEffectiveness.js';
import { getWeaponEffectiveness } from '../data/weaponEffectiveness.js';
import type { GameState, Unit } from '../game/types.js';
import type { FactionId, HexCoord, UnitId } from '../types.js';
import {
  canUseAmbush,
  canUseBrace,
  canUseCharge,
  clearPreparedAbility,
  getTerrainAt as getAbilityTerrainAt,
  hasAdjacentEnemy,
  prepareAbility,
  shouldClearAmbush,
} from './abilitySystem.js';
import {
  applyCombatAction,
  previewCombatAction,
  type CombatActionPreview,
} from './combatActionSystem.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';
import { describeCapabilityLevels } from './capabilitySystem.js';
import {
  resolveCombat,
  getVeteranStatBonus,
  getVeteranDefenseBonus,
  getVeteranMoraleBonus,
} from './combatSystem.js';
import { getHexVisibility } from './fogSystem.js';
import { findFleeHex } from './moraleSystem.js';
import { moveUnit, getValidMoves, canMoveTo } from './movementSystem.js';
import { getUnitAtHex } from './occupancySystem.js';
import {
  canBoardTransport,
  boardTransport,
  disembarkUnit,
  getEmbarkedUnits,
  getValidDisembarkHexes,
  isTransportUnit,
  isUnitEmbarked,
  updateEmbarkedPositions,
} from './transportSystem.js';
import { tryPromoteUnit } from './veterancySystem.js';
import { calculateFlankingBonus, isRearAttack } from './zocSystem.js';
import {
  getCombatAttackModifier,
  getCombatDefenseModifier,
  isUnitRiverStealthed,
} from './factionIdentitySystem.js';
import {
  getNearbySupportScore,
  getNearestFriendlyCity,
  getUnitIntent,
  scoreStrategicTerrain,
} from './strategicAi.js';
import {
  computeRetreatRisk,
  scoreAttackCandidate,
  scoreMoveCandidate,
  scoreStrategicTarget,
  shouldEngageTarget,
} from './aiTactics.js';
import type { UnitStrategicIntent } from './factionStrategy.js';
import {
  log,
  recordAiIntent,
  recordCombatEvent,
  type SimulationTrace,
  type TraceAiIntentEvent,
  type TraceCombatEffect,
} from './warEcologySimulation.js';
import { attemptNonCombatCapture, getCaptureParams, hasCaptureAbility } from './captureSystem.js';

export type UnitActivationCombatMode = 'apply' | 'preview';

export interface UnitActivationOptions {
  trace?: SimulationTrace;
  fortsBuiltThisRound?: Set<FactionId>;
  combatMode?: UnitActivationCombatMode;
}

export interface UnitActivationResult {
  state: GameState;
  pendingCombat: CombatActionPreview | null;
}

function getTerrainAt(state: GameState, pos: HexCoord): string {
  return getAbilityTerrainAt(state, pos);
}

function describeCombatOutcome(result: {
  defenderDestroyed: boolean;
  attackerDestroyed: boolean;
  defenderFled: boolean;
  attackerFled: boolean;
  defenderRouted: boolean;
  attackerRouted: boolean;
}): string {
  if (result.defenderDestroyed) return 'Defender destroyed';
  if (result.attackerDestroyed) return 'Attacker destroyed';
  if (result.defenderFled) return 'Defender fled';
  if (result.defenderRouted) return 'Defender routed';
  if (result.attackerFled) return 'Attacker fled';
  if (result.attackerRouted) return 'Attacker routed';
  return 'Exchange';
}

function formatCombatSummary(
  attackerName: string,
  defenderName: string,
  defenderDamage: number,
  attackerDamage: number,
  outcome: string,
  effects: TraceCombatEffect[]
): string {
  const highlights = effects.slice(0, 3).map((effect) => effect.label.toLowerCase());
  const highlightText = highlights.length > 0 ? `; ${highlights.join(', ')}` : '';
  return `${attackerName} dealt ${defenderDamage}, took ${attackerDamage}. ${outcome}${highlightText}.`;
}


function rotateUnitToward(unit: Unit, target: HexCoord): Unit {
  const facing = getDirectionIndex(unit.position, target);
  if (facing === null) {
    return unit;
  }
  return { ...unit, facing };
}

function shouldBrace(
  unit: Unit,
  prototype: { tags?: string[] },
  state: GameState,
  canUniversalBrace: boolean = false,
): boolean {
  if ((!canUseBrace(prototype as any) && !canUniversalBrace) || hasAdjacentEnemy(state, unit) === false) {
    return false;
  }

  return Array.from(state.units.values()).some((other) => {
    if (other.hp <= 0 || other.factionId === unit.factionId) {
      return false;
    }
    const enemyPrototype = state.prototypes.get(other.prototypeId);
    if (!enemyPrototype) {
      return false;
    }
    return hexDistance(unit.position, other.position) === 1 && canUseCharge(enemyPrototype);
  });
}

export function maybeExpirePreparedAbility(unit: Unit, round: number, state: GameState): Unit {
  if (!unit.preparedAbility) {
    return unit;
  }

  if ((unit.preparedAbilityExpiresOnRound ?? round) < round) {
    return clearPreparedAbility(unit);
  }

  if (shouldClearAmbush(unit, state)) {
    return clearPreparedAbility(unit);
  }

  return unit;
}

/**
 * Choose the best available prototype based on current progression and faction context.
 * Returns [chassisId, prototypeId] or null if no valid choice.
 */

function getImprovementBonus(state: GameState, pos: HexCoord): number {
  // Check improvements first (e.g. field forts)
  for (const [, improvement] of state.improvements) {
    if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
      return improvement.defenseBonus ?? 0;
    }
  }
  // Cities give +100% defense
  for (const [, city] of state.cities) {
    if (city.position.q === pos.q && city.position.r === pos.r) {
      return 1;
    }
  }
  // Villages give +50% defense
  for (const [, village] of state.villages) {
    if (village.position.q === pos.q && village.position.r === pos.r) {
      return 0.5;
    }
  }
  return 0;
}

function getImprovementAtHex(state: GameState, pos: HexCoord) {
  for (const [, improvement] of state.improvements) {
    if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
      return improvement;
    }
  }
  return null;
}

function isFortificationHex(state: GameState, pos: HexCoord): boolean {
  return getImprovementAtHex(state, pos)?.type === 'fortification';
}

function countFriendlyUnitsNearHex(
  state: GameState,
  factionId: FactionId,
  pos: HexCoord,
  radius: number,
  excludedUnitId?: UnitId,
): number {
  let count = 0;
  for (const unit of state.units.values()) {
    if (unit.hp <= 0 || unit.factionId !== factionId) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    if (hexDistance(pos, unit.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

function countFortificationsNearHex(state: GameState, pos: HexCoord, radius: number): number {
  let count = 0;
  for (const improvement of state.improvements.values()) {
    if (improvement.type !== 'fortification') continue;
    if (hexDistance(pos, improvement.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

function countUnitsNearHex(
  state: GameState,
  pos: HexCoord,
  radius: number,
  predicate: (unit: Unit) => boolean,
): number {
  let count = 0;
  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (!predicate(unit)) continue;
    if (hexDistance(pos, unit.position) <= radius) {
      count += 1;
    }
  }
  return count;
}


function findBestTargetChoice(
  state: GameState,
  unitId: UnitId,
  position: HexCoord,
  friendlyFactionId: FactionId,
  myPrototype: { role: string; tags?: string[] },
  registry: RulesRegistry,
  threatenedCityPosition?: HexCoord,
) {
  let bestTarget: typeof state.units extends Map<any, infer U> ? U : never = null as any;
  let bestScore = -Infinity;
  const strategy = state.factionStrategies.get(friendlyFactionId);
  const actingUnit = state.units.get(unitId);
  const unitIntent = actingUnit ? getUnitIntent(strategy, unitId) : undefined;
  const nearestFriendlyDist = actingUnit
    ? getNearestFriendlyDistanceToHex(state, friendlyFactionId, position)
    : 99;
  const anchorDistance = unitIntent ? hexDistance(position, unitIntent.anchor) : 0;

  for (const targetPos of getNeighbors(position)) {
    for (const [, unit] of state.units) {
      if (
        unit.factionId !== friendlyFactionId &&
        unit.hp > 0 &&
        unit.position.q === targetPos.q &&
        unit.position.r === targetPos.r
      ) {
        const targetPrototype = state.prototypes.get(unit.prototypeId);
        if (!targetPrototype) continue;

        // River-stealthed units (plains_riders on river) are invisible to AI targeting
        const targetTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
        const targetFaction = state.factions.get(unit.factionId);
        if (isUnitRiverStealthed(targetFaction, targetTerrain)) continue;
        
        // Stealth-tagged units with isStealthed=true are invisible to AI targeting
        if (unit.isStealthed) continue;

        const targetRole = targetPrototype.derivedStats.role;
        const targetMovementClass = registry.getChassis(targetPrototype.chassisId)?.movementClass ?? 'infantry';

        const roleMod = getRoleEffectiveness(myPrototype.role, targetRole);
        const myWeaponTags: string[] = [];
        for (const compId of (myPrototype as any).componentIds ?? []) {
          const comp = registry.getComponent(compId);
          if (comp?.slotType === 'weapon' && comp.tags) myWeaponTags.push(...comp.tags);
        }
        const weaponMod = getWeaponEffectiveness(myWeaponTags, targetMovementClass);
        const reverseRoleMod = getRoleEffectiveness(targetRole, myPrototype.role);
        const strategicScore = scoreStrategicTarget({
          isFocusTarget: Boolean(strategy?.focusTargetUnitIds.includes(unit.id)),
          isAdjacentToPrimaryObjectiveCity: Boolean(
            strategy?.primaryCityObjectiveId
            && Array.from(state.cities.values()).some(
              (city) =>
                city.id === strategy.primaryCityObjectiveId
                && city.factionId !== friendlyFactionId
                && hexDistance(city.position, unit.position) <= 1,
            ),
          ),
          isRouted: unit.routed,
          hpRatio: unit.hp / Math.max(1, unit.maxHp),
          attacksFromThreatenedCityHex: Boolean(
            strategy?.threatenedCities.some((threat) => {
              const city = state.cities.get(threat.cityId);
              return city && city.position.q === position.q && city.position.r === position.r;
            }),
          ),
          finishOffPriorityTarget: strategy?.absorptionGoal.targetFactionId === unit.factionId
            && Boolean(strategy.absorptionGoal.finishOffPriority),
          isolatedFromAnchor: Boolean(unitIntent && nearestFriendlyDist > 3 && anchorDistance > 4),
          // For defender units: reward attacking enemies near the city being defended
          defenderProximityToThreatenedCity: threatenedCityPosition
            ? hexDistance(unit.position, threatenedCityPosition)
            : undefined,
        });

        // Pirate Lords: prefer targets on coast/water (their home terrain)
        let extraScore = 0;
        const attackerFaction = state.factions.get(friendlyFactionId);
        if (attackerFaction?.identityProfile.passiveTrait === 'greedy') {
          const targetTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
          if (targetTerrain === 'coast' || targetTerrain === 'river' || targetTerrain === 'ocean') {
            extraScore += 3;
          }
        }

        const attackingIntoFort = isFortificationHex(state, unit.position);
        const friendlySupport = countFriendlyUnitsNearHex(state, friendlyFactionId, unit.position, 2, unitId);
        if (
          attackingIntoFort
          && friendlySupport === 0
          && unit.hp / Math.max(1, unit.maxHp) > 0.35
          && !unit.routed
        ) {
          continue;
        }
        if (attackingIntoFort) {
          extraScore += friendlySupport > 0 ? -4 : -18;
        }

        const score = scoreAttackCandidate({
          roleEffectiveness: roleMod,
          weaponEffectiveness: weaponMod,
          reverseRoleEffectiveness: reverseRoleMod,
          targetHpRatio: unit.hp / Math.max(1, unit.maxHp),
          targetRouted: unit.routed,
          strategicTargetScore: strategicScore,
          extraScore,
        });

        if (score > bestScore) {
          bestScore = score;
          bestTarget = unit;
        }
      }
    }
  }

  return { target: bestTarget, score: bestScore };
}

/** Ranged targeting for units with range > 1. Scores all enemies within Chebyshev range. */
function findBestRangedTarget(
  state: GameState,
  unitId: UnitId,
  position: HexCoord,
  friendlyFactionId: FactionId,
  myPrototype: { role: string; tags?: string[]; derivedStats?: { range?: number } },
  registry: RulesRegistry,
  range: number,
  threatenedCityPosition?: HexCoord,
) {
  let bestTarget: typeof state.units extends Map<any, infer U> ? U : never = null as any;
  let bestScore = -Infinity;
  const strategy = state.factionStrategies.get(friendlyFactionId);
  const actingUnit = state.units.get(unitId);
  const unitIntent = actingUnit ? getUnitIntent(strategy, unitId) : undefined;
  const isSiege = myPrototype.tags?.includes('siege') ?? false;
  const nearestFriendlyDist = actingUnit
    ? getNearestFriendlyDistanceToHex(state, friendlyFactionId, position)
    : 99;
  const anchorDistance = unitIntent ? hexDistance(position, unitIntent.anchor) : 0;

  const hexesInRange = getHexesInRange(position, range);

  for (const hex of hexesInRange) {
    // Skip the unit's own hex
    if (hex.q === position.q && hex.r === position.r) continue;

    for (const [, unit] of state.units) {
      if (
        unit.factionId !== friendlyFactionId &&
        unit.hp > 0 &&
        unit.position.q === hex.q &&
        unit.position.r === hex.r
      ) {
        const targetPrototype = state.prototypes.get(unit.prototypeId);
        if (!targetPrototype) continue;

        // River-stealthed units are invisible to AI targeting
        const targetTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
        const targetFaction = state.factions.get(unit.factionId);
        if (isUnitRiverStealthed(targetFaction, targetTerrain)) continue;

        // Stealth-tagged units with isStealthed=true are invisible
        if (unit.isStealthed) continue;

        const targetRole = targetPrototype.derivedStats.role;
        const targetMovementClass = registry.getChassis(targetPrototype.chassisId)?.movementClass ?? 'infantry';

        const dist = hexDistance(position, unit.position);
        const roleMod = getRoleEffectiveness(myPrototype.role, targetRole);
        const myWeaponTags: string[] = [];
        for (const compId of (myPrototype as any).componentIds ?? []) {
          const comp = registry.getComponent(compId);
          if (comp?.slotType === 'weapon' && comp.tags) myWeaponTags.push(...comp.tags);
        }
        const weaponMod = getWeaponEffectiveness(myWeaponTags, targetMovementClass);
        const reverseRoleMod = getRoleEffectiveness(targetRole, myPrototype.role);
        const strategicScore = scoreStrategicTarget({
          isFocusTarget: Boolean(strategy?.focusTargetUnitIds.includes(unit.id)),
          isAdjacentToPrimaryObjectiveCity: Boolean(
            strategy?.primaryCityObjectiveId
            && Array.from(state.cities.values()).some(
              (city) =>
                city.id === strategy.primaryCityObjectiveId
                && city.factionId !== friendlyFactionId
                && hexDistance(city.position, unit.position) <= 1,
            ),
          ),
          isRouted: unit.routed,
          hpRatio: unit.hp / Math.max(1, unit.maxHp),
          attacksFromThreatenedCityHex: Boolean(
            strategy?.threatenedCities.some((threat) => {
              const city = state.cities.get(threat.cityId);
              return city && city.position.q === position.q && city.position.r === position.r;
            }),
          ),
          finishOffPriorityTarget: strategy?.absorptionGoal.targetFactionId === unit.factionId
            && Boolean(strategy.absorptionGoal.finishOffPriority),
          isolatedFromAnchor: Boolean(unitIntent && nearestFriendlyDist > 3 && anchorDistance > 4),
          // For defender units: reward attacking enemies near the city being defended
          defenderProximityToThreatenedCity: threatenedCityPosition
            ? hexDistance(unit.position, threatenedCityPosition)
            : undefined,
        });

        // Pirate Lords: prefer targets on coast/water
        let extraScore = 0;
        const attackerFaction = state.factions.get(friendlyFactionId);
        if (attackerFaction?.identityProfile.passiveTrait === 'greedy') {
          const tTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
          if (tTerrain === 'coast' || tTerrain === 'river' || tTerrain === 'ocean') {
            extraScore += 3;
          }
        }
        const isOnCity = [...state.cities.values()].some(
          (city) => city.position.q === unit.position.q && city.position.r === unit.position.r
        );
        const defenderOnFort = getImprovementBonus(state, unit.position) > 0;
        const friendlySupport = countFriendlyUnitsNearHex(state, friendlyFactionId, unit.position, 2, unitId);
        if (
          defenderOnFort
          && friendlySupport === 0
          && unit.hp / Math.max(1, unit.maxHp) > 0.35
          && !unit.routed
        ) {
          continue;
        }
        const score = scoreAttackCandidate({
          roleEffectiveness: roleMod,
          weaponEffectiveness: weaponMod,
          reverseRoleEffectiveness: reverseRoleMod,
          targetHpRatio: unit.hp / Math.max(1, unit.maxHp),
          targetRouted: unit.routed,
          strategicTargetScore: strategicScore,
          extraScore: extraScore + (defenderOnFort ? (friendlySupport > 0 ? -4 : -18) : 0),
          distancePenalty: dist * 0.5,
          isSiegeVsCity: isSiege && isOnCity,
          isSiegeVsFort: isSiege && defenderOnFort,
        });

        if (score > bestScore) {
          bestScore = score;
          bestTarget = unit;
        }
      }
    }
  }

  return { target: bestTarget, score: bestScore };
}

function getNearestFriendlyDistanceToHex(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord,
  excludedUnitId?: UnitId,
): number {
  let nearest = Infinity;
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    nearest = Math.min(nearest, hexDistance(unit.position, hex));
  }
  return nearest === Infinity ? 99 : nearest;
}

function countNearbyUnitPressure(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord,
  excludedUnitId?: UnitId,
): { nearbyEnemies: number; nearbyFriendlies: number } {
  let nearbyEnemies = 0;
  let nearbyFriendlies = 0;

  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    if (hexDistance(hex, unit.position) > 2) continue;

    if (unit.factionId === factionId) {
      nearbyFriendlies += 1;
    } else {
      nearbyEnemies += 1;
    }
  }

  return { nearbyEnemies, nearbyFriendlies };
}

function getAliveFactions(state: GameState): Set<FactionId> {
  const factionsWithUnits = new Set(
    Array.from(state.units.values())
      .filter((u) => u.hp > 0)
      .map((unit) => unit.factionId)
  );
  const factionsWithCities = new Set(
    Array.from(state.cities.values())
      .filter((city) => !city.besieged)
      .map((city) => city.factionId)
  );

  return new Set([...factionsWithUnits, ...factionsWithCities]);
}

function removeUnitFromFaction(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return state;
  }

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    unitIds: faction.unitIds.filter((id) => id !== unitId),
  });

  return { ...state, factions };
}


function setUnitActivated(state: GameState, unitId: UnitId): GameState {
  const unit = state.units.get(unitId);
  if (!unit) {
    return state;
  }

  const units = new Map(state.units);
  units.set(unitId, {
    ...unit,
    activatedThisRound: true,
    status: 'spent',
  });

  return { ...state, units };
}

function buildFieldFortIfEligible(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
  fortsBuiltThisRound?: Set<FactionId>
): GameState {
  const faction = state.factions.get(factionId);
  const unit = state.units.get(unitId);
  const research = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(research, faction);
  if (
    !faction ||
    !unit ||
    factionId !== ('hill_clan' as FactionId) ||
    unit.hp <= 0 ||
    fortsBuiltThisRound?.has(factionId) ||
    unit.movesRemaining !== unit.maxMoves ||
    unit.status !== 'ready'
  ) {
    return state;
  }

  // Field fort build eligibility: 
  // - zoCAuraEnabled (fortress_t2) indicates the faction has developed fortification doctrine
  // - Units with the right movement class can construct field forts
  if (!doctrine.canBuildFieldForts) {
    return state;
  }

  const prototype = state.prototypes.get(unit.prototypeId);
  const movementClass = prototype ? registry.getChassis(prototype.chassisId)?.movementClass : undefined;
  const role = prototype?.derivedStats.role;
  if (!(movementClass === 'infantry' || role === 'ranged')) {
    return state;
  }

  if (getImprovementAtHex(state, unit.position)) {
    return state;
  }

  const strategy = state.factionStrategies.get(factionId);
  const unitIntent = getUnitIntent(strategy, unitId);
  const nearbyEnemies = countUnitsNearHex(state, unit.position, 2, (other) => other.factionId !== factionId);
  const nearbyFriendlySupport = countFriendlyUnitsNearHex(state, factionId, unit.position, 2, unitId);
  const nearbyFortCount = countFortificationsNearHex(state, unit.position, 2);
  const nearestCity = getNearestFriendlyCity(state, factionId, unit.position);
  const cityDistance = nearestCity ? hexDistance(unit.position, nearestCity.position) : 99;
  const terrain = getTerrainAt(state, unit.position);
  const isDefensiveAssignment =
    unitIntent?.assignment === 'defender'
    || unitIntent?.assignment === 'recovery'
    || unitIntent?.assignment === 'reserve';
  const worthwhile =
    nearbyFriendlySupport > 0
    && nearbyFortCount === 0
    && (
      nearbyEnemies > 0
      || (isDefensiveAssignment && terrain === 'hill' && cityDistance <= 3)
    );
  if (!worthwhile) {
    return state;
  }

  const fortId = createImprovementId();
  const improvements = new Map(state.improvements);
  const fieldFort = registry.getImprovement('field_fort');
  improvements.set(fortId, {
    id: fortId,
    type: 'fortification',
    position: { ...unit.position },
    ownerFactionId: factionId,
    defenseBonus: fieldFort?.defenseBonus ?? 2,
  });
  fortsBuiltThisRound?.add(factionId);
  return { ...state, improvements };
}

function applyHillDugInIfEligible(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId
): GameState {
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  const unit = state.units.get(unitId);
  if (!faction || !unit || unit.hp <= 0) {
    return state;
  }

  const doctrine = resolveResearchDoctrine(research, faction);
  if (!doctrine.rapidEntrenchEnabled || getTerrainAt(state, unit.position) !== 'hill') {
    return state;
  }

  const units = new Map(state.units);
  units.set(unitId, { ...unit, hillDugIn: true });
  return { ...state, units };
}


function performStrategicMovement(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const unit = state.units.get(unitId);
  if (!unit || unit.hp <= 0 || !state.map) {
    return state;
  }

  const faction = state.factions.get(unit.factionId);
  const prototype = state.prototypes.get(unit.prototypeId);
  const strategy = state.factionStrategies.get(unit.factionId);
  if (!faction || !prototype) {
    return state;
  }

  // Skip embarked units — they move with their transport
  if (isUnitEmbarked(unitId, state.transportMap)) {
    return state;
  }

  const unitIntent = getUnitIntent(strategy, unitId) ?? buildFallbackIntent(state, unit);
  const waypoint = resolveWaypoint(state, unit, unitIntent);

  // Transport units with embarked troops: move toward waypoint, then auto-disembark
  if (isTransportUnit(prototype, registry)) {
    const embarked = getEmbarkedUnits(unitId, state.transportMap);
    if (embarked.length > 0) {
      return moveTransportAndDisembark(state, unitId, registry, waypoint, unitIntent, trace);
    }
  }

  const validMoves = getValidMoves(state, unitId, state.map, registry);

  // Pirate Lords: score boarding a transport as a move option alongside regular moves
  const isGreedyInfantry = faction.identityProfile.passiveTrait === 'greedy'
    && !isTransportUnit(prototype, registry)
    && !isUnitEmbarked(unitId, state.transportMap);

  let bestBoardTransportId: UnitId | null = null;
  let bestBoardScore = -Infinity;

  if (isGreedyInfantry) {
    for (const [, candidate] of state.units) {
      if (candidate.factionId !== unit.factionId) continue;
      if (candidate.hp <= 0) continue;
      if (hexDistance(unit.position, candidate.position) !== 1) continue;

      const candidatePrototype = state.prototypes.get(candidate.prototypeId);
      if (!candidatePrototype) continue;
      const chassis = registry.getChassis(candidatePrototype.chassisId);
      if (!chassis?.tags?.includes('transport')) continue;

      if (canBoardTransport(state, unitId, candidate.id, registry, state.transportMap)) {
        // Score boarding: how much closer would the transport get us to the waypoint?
        const transportToWaypoint = hexDistance(candidate.position, waypoint);
        const selfToWaypoint = hexDistance(unit.position, waypoint);
        // Board if transport is closer to waypoint, or if we have no good moves
        let boardScore = (selfToWaypoint - transportToWaypoint) * 6;
        // Bonus for offensive posture — prioritize raiding
        if (unitIntent.assignment === 'raider' || unitIntent.assignment === 'siege_force') {
          boardScore += 4;
        }
        if (boardScore > bestBoardScore) {
          bestBoardScore = boardScore;
          bestBoardTransportId = candidate.id;
        }
      }
    }
  }

  if (validMoves.length === 0) {
    // No regular moves — board transport if available
    if (bestBoardTransportId) {
      const result = boardTransport(state, unitId, bestBoardTransportId, state.transportMap);
      log(trace, `${faction.name} infantry boarded transport (no moves)`);
      return { ...result.state, transportMap: result.transportMap };
    }
    return state;
  }

  const originSupport = getNearbySupportScore(state, unit.factionId, unit.position);
  const originAnchorDistance = hexDistance(unit.position, unitIntent.anchor);
  let bestMove: HexCoord | null = null;
  let bestScore = -Infinity;
  let bestTargetCityId = unitIntent.objectiveCityId;
  let bestTargetUnitId = unitIntent.objectiveUnitId;

  // For defender units: compute distance to threatened city for engagement scoring
  const threatenedCity = unitIntent.threatenedCityId
    ? state.cities.get(unitIntent.threatenedCityId)
    : undefined;
  const threatenedCityPosition = threatenedCity?.position;
  const originThreatenedCityDistance = threatenedCityPosition
    ? hexDistance(unit.position, threatenedCityPosition)
    : Infinity;

  for (const move of validMoves) {
    const waypointDistance = hexDistance(move, waypoint);
    const originWaypointDistance = hexDistance(unit.position, waypoint);
    const supportScore = getNearbySupportScore(state, unit.factionId, move);
    let terrainScore = scoreStrategicTerrain(state, unit.factionId, move);
    const anchorDistance = hexDistance(move, unitIntent.anchor);
    const nearestCity = getNearestFriendlyCity(state, unit.factionId, move);
    const cityDistance = nearestCity ? hexDistance(move, nearestCity.position) : 99;
    const moveVisibility = getHexVisibility(state, unit.factionId, move);
    if (isFortificationHex(state, move)) {
      const isDefensiveAssignment =
        unitIntent.assignment === 'defender'
        || unitIntent.assignment === 'recovery'
        || unitIntent.assignment === 'reserve';
      terrainScore += isDefensiveAssignment ? 8 : 4;
    }
    const score = scoreMoveCandidate({
      assignment: unitIntent.assignment,
      originWaypointDistance,
      waypointDistance,
      terrainScore,
      supportScore,
      originSupport,
      originAnchorDistance,
      anchorDistance,
      cityDistance,
      hiddenExplorationBonus: moveVisibility === 'hidden' && !['siege_force', 'main_army', 'raider'].includes(unitIntent.assignment),
      unsafeAfterMove: wouldBeUnsafeAfterMove(state, unit, move, unitIntent),
      // For defender units: encourage moving toward the threatened city
      threatenedCityDistance: threatenedCityPosition
        ? hexDistance(move, threatenedCityPosition)
        : undefined,
    });

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  // Compare best regular move against boarding
  if (bestBoardTransportId && bestBoardScore > bestScore) {
    const result = boardTransport(state, unitId, bestBoardTransportId, state.transportMap);
    log(trace, `${faction.name} infantry boarded transport (scored ${bestBoardScore.toFixed(1)} vs move ${bestScore.toFixed(1)})`);
    return { ...result.state, transportMap: result.transportMap };
  }

  if (!bestMove || bestScore <= 0) {
    return state;
  }

  const moved = moveUnit(state, unitId, bestMove, state.map, registry);
  recordAiIntent(trace, {
    round: moved.round,
    factionId: moved.units.get(unitId)?.factionId ?? unit.factionId,
    unitId,
    intent: mapAssignmentToIntent(unitIntent),
    from: unit.position,
    to: bestMove,
    reason: unitIntent.reason,
    targetUnitId: bestTargetUnitId,
    targetCityId: bestTargetCityId,
  });
  return moved;
}

/**
 * Transport with embarked troops: move toward waypoint, then auto-disembark
 * if near enemy objectives (villages, cities, or units).
 */
function moveTransportAndDisembark(
  state: GameState,
  transportId: UnitId,
  registry: RulesRegistry,
  waypoint: HexCoord,
  unitIntent: UnitStrategicIntent,
  trace?: SimulationTrace
): GameState {
  if (!state.map) return autoDisembark(state, transportId, registry, trace);
  const validMoves = getValidMoves(state, transportId, state.map, registry);
  if (validMoves.length === 0) {
    // Can't move — try to disembark anyway if near objectives
    return autoDisembark(state, transportId, registry, trace);
  }

  // Score moves toward waypoint
  let bestMove: HexCoord | null = null;
  let bestScore = -Infinity;
  const originWaypointDistance = hexDistance(
    (state.units.get(transportId) ?? { position: waypoint }).position,
    waypoint
  );

  for (const move of validMoves) {
    const waypointDistance = hexDistance(move, waypoint);
    let score = (originWaypointDistance - waypointDistance) * 8;
    // Prefer coast near enemy objectives
    const terrainId = state.map?.tiles.get(hexToKey(move))?.terrain ?? '';
    if (terrainId === 'coast' || terrainId === 'river') score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  if (!bestMove || bestScore <= 0) {
    return autoDisembark(state, transportId, registry, trace);
  }

  const moved = moveUnit(state, transportId, bestMove, state.map!, registry);
  // Update embarked positions after transport moves
  const updated = updateEmbarkedPositions(moved, transportId, bestMove, moved.transportMap);
  log(trace, `transport ${transportId} moved to ${hexToKey(bestMove)} with embarked troops`);

  // After moving, check if we should disembark
  return autoDisembark(updated, transportId, registry, trace);
}

/**
 * Auto-disembark embarked units if transport is near enemy objectives.
 */
function autoDisembark(
  state: GameState,
  transportId: UnitId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const transport = state.units.get(transportId);
  if (!transport) return state;

  const factionId = transport.factionId;
  const embarked = getEmbarkedUnits(transportId, state.transportMap);
  if (embarked.length === 0) return state;

  // Check if there's an enemy village, city, or unit nearby worth disembarking for
  let nearObjective = false;
  for (const [, village] of state.villages) {
    if (village.factionId === factionId) continue;
    if (hexDistance(transport.position, village.position) <= 2) {
      nearObjective = true;
      break;
    }
  }
  if (!nearObjective) {
    for (const [, city] of state.cities) {
      if (city.factionId === factionId) continue;
      if (hexDistance(transport.position, city.position) <= 3) {
        nearObjective = true;
        break;
      }
    }
  }
  if (!nearObjective) {
    for (const [, enemy] of state.units) {
      if (enemy.factionId === factionId || enemy.hp <= 0) continue;
      if (hexDistance(transport.position, enemy.position) <= 2) {
        nearObjective = true;
        break;
      }
    }
  }

  if (!nearObjective) return state;

  // Disembark all embarked units
  const disembarkHexes = getValidDisembarkHexes(state, transportId, registry, state.transportMap);
  if (disembarkHexes.length === 0) return state;

  let current = state;
  let currentTransportMap = new Map(state.transportMap);

  for (const embarkedId of embarked) {
    if (disembarkHexes.length === 0) break;
    // Pick the hex closest to nearest enemy objective
    let bestHex = disembarkHexes[0];
    let bestDist = Infinity;
    for (const hex of disembarkHexes) {
      let minDist = Infinity;
      for (const [, village] of current.villages) {
        if (village.factionId === factionId) continue;
        minDist = Math.min(minDist, hexDistance(hex, village.position));
      }
      for (const [, city] of current.cities) {
        if (city.factionId === factionId) continue;
        minDist = Math.min(minDist, hexDistance(hex, city.position));
      }
      if (minDist < bestDist) {
        bestDist = minDist;
        bestHex = hex;
      }
    }

    const result = disembarkUnit(current, transportId, embarkedId, bestHex, registry, currentTransportMap);
    current = result.state;
    currentTransportMap = result.transportMap;
    // Remove used hex from options
    disembarkHexes.splice(disembarkHexes.indexOf(bestHex), 1);
    log(trace, `${factionId} disembarked unit ${embarkedId} at ${hexToKey(bestHex)}`);
  }

  return current;
}

function buildFallbackIntent(state: GameState, unit: Unit): UnitStrategicIntent {
  const city = getNearestFriendlyCity(state, unit.factionId, unit.position);
  const strategy = state.factionStrategies.get(unit.factionId);
  const posture = strategy?.posture;

  // During exploration/offensive posture, fall forward toward map center
  // instead of retreating to a friendly city
  if ((posture === 'exploration' || posture === 'offensive') && state.map) {
    const centerQ = Math.floor(state.map.width / 2);
    const centerR = Math.floor(state.map.height / 2);
    return {
      assignment: 'raider',
      waypointKind: 'front_anchor',
      waypoint: { q: centerQ, r: centerR },
      anchor: city?.position ?? unit.position,
      isolationScore: 0,
      isolated: false,
      reason: 'fallback movement toward map center to search for enemies',
    };
  }

  const waypoint = city?.position ?? unit.position;
  return {
    assignment: 'reserve',
    waypointKind: 'friendly_city',
    waypoint,
    anchor: waypoint,
    isolationScore: 0,
    isolated: false,
    reason: 'fallback movement toward the nearest friendly city',
  };
}

function resolveWaypoint(state: GameState, unit: Unit, intent: UnitStrategicIntent): HexCoord {
  if (intent.objectiveUnitId) {
    const liveTarget = state.units.get(intent.objectiveUnitId);
    if (liveTarget && liveTarget.hp > 0) {
      return liveTarget.position;
    }
  }
  if (intent.objectiveCityId) {
    const city = state.cities.get(intent.objectiveCityId);
    if (city) {
      return city.position;
    }
  }
  return intent.waypoint;
}

function wouldBeUnsafeAfterMove(
  state: GameState,
  unit: Unit,
  move: HexCoord,
  intent: UnitStrategicIntent
): boolean {
  let nearestFriendly = Infinity;
  let nearbyEnemies = 0;
  for (const other of state.units.values()) {
    if (other.id === unit.id || other.hp <= 0) continue;
    const dist = hexDistance(move, other.position);
    if (other.factionId === unit.factionId) {
      nearestFriendly = Math.min(nearestFriendly, dist);
    } else if (dist <= 2) {
      nearbyEnemies += 1;
    }
  }
  return nearestFriendly > 3 && hexDistance(move, intent.anchor) > 4 && nearbyEnemies > 0;
}

function mapAssignmentToIntent(intent: UnitStrategicIntent): TraceAiIntentEvent['intent'] {
  if (intent.assignment === 'recovery') return 'retreat';
  if (intent.assignment === 'defender' || intent.assignment === 'reserve') return 'regroup';
  if (intent.assignment === 'siege_force') return 'siege';
  if (intent.assignment === 'raider') return 'support';
  return 'advance';
}

export function activateUnit(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  options: UnitActivationOptions = {},
): UnitActivationResult {
  const { trace, fortsBuiltThisRound, combatMode = 'apply' } = options;
  const unit = state.units.get(unitId);
  if (!unit || unit.hp <= 0 || !state.map) {
    return { state, pendingCombat: null };
  }

  const factionId = unit.factionId;
  const faction = state.factions.get(factionId);
  const prototype = state.prototypes.get(unit.prototypeId);
  if (!faction || !prototype) {
    return { state: setUnitActivated(state, unitId), pendingCombat: null };
  }

  let current: GameState = {
    ...state,
    activeFactionId: factionId,
    turnNumber: state.turnNumber + 1,
  };

  const map = current.map!;
  const actingUnit = current.units.get(unitId);
  if (!actingUnit || actingUnit.hp <= 0) {
    return { state: current, pendingCombat: null };
  }

  if (actingUnit.preparedAbility === 'ambush' && hasAdjacentEnemy(current, actingUnit)) {
    const units = new Map(current.units);
    units.set(unitId, clearPreparedAbility(actingUnit));
    current = { ...current, units };
  }

  if (actingUnit.routed) {
    const fleeHex = findFleeHex(actingUnit, current);
    if (fleeHex && canMoveTo(current, unitId, fleeHex, map, registry)) {
      current = moveUnit(current, unitId, fleeHex, map, registry);
      // Update embarked unit positions if moving unit is a transport
      const movedUnit = current.units.get(unitId);
      if (movedUnit) {
        const movedProto = current.prototypes.get(movedUnit.prototypeId);
        if (movedProto && isTransportUnit(movedProto, registry)) {
          current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
        }
      }
      log(trace, `${faction.name} ${prototype.name} routed and fled`);
    }
    return { state: setUnitActivated(current, unitId), pendingCombat: null };
  }

  let activeUnit = current.units.get(unitId)!;
  const unitRange = prototype.derivedStats.range ?? 1;
  const factionDoctrine = resolveResearchDoctrine(current.research.get(factionId), faction);
  const canChargeAttack =
    unitRange <= 1 && (canUseCharge(prototype) || factionDoctrine.chargeTranscendenceEnabled);
  const strategy = current.factionStrategies.get(factionId);
  const unitIntent = getUnitIntent(strategy, unitId);
  // For defender units: get the threatened city position for engagement scoring
  const threatenedCityForUnit = unitIntent?.threatenedCityId
    ? current.cities.get(unitIntent.threatenedCityId)
    : undefined;
  const threatenedCityPosition = threatenedCityForUnit?.position;
  const shouldEngageFromPosition = (unitAtPosition: Unit, attackScore: number): boolean => {
    const strategy = current.factionStrategies.get(factionId);
    const unitIntent = getUnitIntent(strategy, unitId);
    const nearestFriendlyDist = getNearestFriendlyDistanceToHex(current, factionId, unitAtPosition.position);
    const nearbyPressure = countNearbyUnitPressure(current, factionId, unitAtPosition.position, unitId);
    const anchorDistance = unitIntent ? hexDistance(unitAtPosition.position, unitIntent.anchor) : 0;
    const retreatRisk = computeRetreatRisk({
      hpRatio: unitAtPosition.hp / Math.max(1, unitAtPosition.maxHp),
      nearbyEnemies: nearbyPressure.nearbyEnemies,
      nearbyFriendlies: nearbyPressure.nearbyFriendlies,
      nearestFriendlyDistance: nearestFriendlyDist,
      anchorDistance,
    });
    return shouldEngageTarget(strategy?.personality, { attackScore, retreatRisk });
  };

  let enemyChoice = unitRange > 1
    ? findBestRangedTarget(current, unitId, activeUnit.position, factionId, prototype as any, registry, unitRange, threatenedCityPosition)
    : findBestTargetChoice(current, unitId, activeUnit.position, factionId, prototype as any, registry, threatenedCityPosition);
  let enemy: typeof enemyChoice.target | undefined = enemyChoice.target;
  if (enemy && !shouldEngageFromPosition(activeUnit, enemyChoice.score)) {
    enemy = undefined;
  }

  // Ranged units (range > 1) attack from their current position — no need to charge/move adjacent
  if (!enemy && activeUnit.movesRemaining > 0 && canChargeAttack) {
    let chargeMove: HexCoord | null = null;
    let bestChargeScore = -Infinity;

    for (const move of getValidMoves(current, unitId, map, registry)) {
      const choice = findBestTargetChoice(current, unitId, move, factionId, prototype as any, registry, threatenedCityPosition);
      if (!choice.target) continue;
      const score = choice.score + (registry.getTerrain(getTerrainAt(current, move))?.defenseModifier ?? 0);
      if (score > bestChargeScore) {
        bestChargeScore = score;
        chargeMove = move;
      }
    }

    if (chargeMove && bestChargeScore > 0) {
      current = moveUnit(current, unitId, chargeMove, map, registry);
      // Update embarked unit positions if moving unit is a transport
      const movedUnit = current.units.get(unitId);
      if (movedUnit) {
        const movedProto = current.prototypes.get(movedUnit.prototypeId);
        if (movedProto && isTransportUnit(movedProto, registry)) {
          current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
        }
      }
      activeUnit = current.units.get(unitId)!;
      // Unit may have been destroyed by an opportunity attack during the charge move.
      if (!activeUnit) {
        return { state: setUnitActivated(current, unitId), pendingCombat: null };
      }
      enemyChoice = findBestTargetChoice(current, unitId, activeUnit.position, factionId, prototype as any, registry, threatenedCityPosition);
      enemy = enemyChoice.target;
      if (enemy && !shouldEngageFromPosition(activeUnit, enemyChoice.score)) {
        enemy = undefined;
      }
      log(trace, `${faction.name} ${prototype.name} charged into position`);
    }
  }

  if (
    enemy &&
    activeUnit.attacksRemaining > 0 &&
    shouldBrace(
      activeUnit,
      prototype,
      current,
      factionDoctrine.fortressTranscendenceEnabled,
    ) &&
    enemyChoice.score <= 0
  ) {
    const units = new Map(current.units);
    units.set(unitId, prepareAbility(activeUnit, 'brace', current.round));
    log(trace, `${faction.name} ${prototype.name} braced`);
    current = { ...current, units };
    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return { state: current, pendingCombat: null };
  }

  if (enemy && activeUnit.attacksRemaining > 0) {
    const enemyPrototype = current.prototypes.get(enemy.prototypeId);
    if (!enemyPrototype) {
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }

    const combatPreview = previewCombatAction(current, registry, activeUnit.id, enemy.id);
    if (!combatPreview) {
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }
    if (combatMode === 'preview') {
      return { state: current, pendingCombat: combatPreview };
    }

    const appliedCombat = applyCombatAction(current, registry, combatPreview);
    current = appliedCombat.state;

    const result = combatPreview.result;
    const resolution = appliedCombat.feedback.resolution;
    const updatedAttacker = current.units.get(activeUnit.id) ?? { ...activeUnit, hp: 0, morale: 0, routed: true };
    const updatedDefender = current.units.get(enemy.id) ?? { ...enemy, hp: 0, morale: 0, routed: true };

    if (resolution.capturedOnKill) {
      log(trace, `${faction.name} ${prototype.name} CAPTURED ${enemyPrototype.name}!`);
    }
    if (resolution.retreatCaptured) {
      log(trace, `${faction.name} ${prototype.name} captured retreating ${enemyPrototype.name}.`);
    }

    const roleInfo = result.roleModifier !== 0 ? ` role:${result.roleModifier > 0 ? '+' : ''}${(result.roleModifier * 100).toFixed(0)}%` : '';
    const weaponInfo = result.weaponModifier !== 0 ? ` weapon:${result.weaponModifier > 0 ? '+' : ''}${(result.weaponModifier * 100).toFixed(0)}%` : '';
    const rearInfo = result.rearAttackBonus > 0 ? ' rear:+20%' : '';
    const abilityInfo = `${result.ambushAttackBonus > 0 ? ' ambush' : ''}${combatPreview.details.chargeAttackBonus > 0 ? ' charge' : ''}${combatPreview.braceTriggered ? ' counter-braced' : ''}`;
    const stealthInfo = combatPreview.attackerWasStealthed ? ' stealth-ambush' : '';
    const poisonInfo = resolution.poisonApplied ? ` poisoned(${updatedDefender.poisonStacks ?? 0})` : '';
    const knockbackInfo = resolution.totalKnockbackDistance > 0 && !result.defenderDestroyed ? ' knocked-back' : '';
    const strikeFirstInfo = combatPreview.details.isChargeAttack && prototype.tags?.includes('cavalry') && result.defenderDestroyed && result.attackerDamage === 0 ? ' strike-first-kill' : '';
    const moraleInfo = ` morale:${result.defenderMoraleLoss.toFixed(0)}lost${result.defenderRouted ? ' ROUTED' : ''}${result.defenderFled ? ' FLED' : ''}`;
    log(
      trace,
      `${faction.name} ${prototype.name} fought ${enemyPrototype.name}${roleInfo}${weaponInfo}${rearInfo}${abilityInfo}${stealthInfo}${poisonInfo}${knockbackInfo}${strikeFirstInfo}${moraleInfo} | capabilities: ${describeCapabilityLevels(
        current.factions.get(factionId)!
      )}`
    );
    const outcomeLabel = describeCombatOutcome(result);
    const summary = formatCombatSummary(
      prototype.name,
      enemyPrototype.name,
      result.defenderDamage,
      result.attackerDamage,
      outcomeLabel,
      resolution.triggeredEffects
    );
    recordCombatEvent(trace, {
      round: current.round,
      attackerUnitId: updatedAttacker.id,
      defenderUnitId: updatedDefender.id,
      attackerFactionId: updatedAttacker.factionId,
      defenderFactionId: updatedDefender.factionId,
      attackerPrototypeId: updatedAttacker.prototypeId,
      defenderPrototypeId: updatedDefender.prototypeId,
      attackerPrototypeName: prototype.name,
      defenderPrototypeName: enemyPrototype.name,
      attackerDamage: result.attackerDamage,
      defenderDamage: result.defenderDamage,
      attackerHpAfter: updatedAttacker.hp,
      defenderHpAfter: updatedDefender.hp,
      attackerDestroyed: result.attackerDestroyed,
      defenderDestroyed: result.defenderDestroyed,
      attackerRouted: result.attackerRouted,
      defenderRouted: result.defenderRouted,
      attackerFled: result.attackerFled,
      defenderFled: result.defenderFled,
      summary,
      breakdown: {
        attacker: {
          unitId: activeUnit.id,
          factionId: activeUnit.factionId,
          prototypeId: activeUnit.prototypeId,
          prototypeName: prototype.name,
          position: activeUnit.position,
          terrain: combatPreview.details.attackerTerrainId,
          hpBefore: activeUnit.hp,
          hpAfter: updatedAttacker.hp,
          maxHp: activeUnit.maxHp,
          baseStat: result.attackerBaseAttack,
        },
        defender: {
          unitId: enemy.id,
          factionId: enemy.factionId,
          prototypeId: enemy.prototypeId,
          prototypeName: enemyPrototype.name,
          position: enemy.position,
          terrain: combatPreview.details.defenderTerrainId,
          hpBefore: enemy.hp,
          hpAfter: updatedDefender.hp,
          maxHp: enemy.maxHp,
          baseStat: result.defenderBaseDefense,
        },
        modifiers: {
          roleModifier: result.roleModifier,
          weaponModifier: result.weaponModifier,
          flankingBonus: result.flankingBonus,
          rearAttackBonus: result.rearAttackBonus,
          chargeBonus: combatPreview.details.chargeAttackBonus,
          braceDefenseBonus: result.braceDefenseBonus,
          ambushBonus: result.ambushAttackBonus,
          hiddenAttackBonus: result.hiddenAttackBonus,
          stealthAmbushBonus: combatPreview.attackerWasStealthed ? 0.5 : 0,
          situationalAttackModifier: result.situationalAttackModifier,
          situationalDefenseModifier: result.situationalDefenseModifier,
          synergyAttackModifier: combatPreview.details.synergyAttackModifier,
          synergyDefenseModifier: combatPreview.details.synergyDefenseModifier,
          improvementDefenseBonus: combatPreview.details.improvementDefenseBonus,
          wallDefenseBonus: combatPreview.details.wallDefenseBonus,
          finalAttackStrength: result.attackStrength,
          finalDefenseStrength: result.defenseStrength,
          baseMultiplier: result.baseMultiplier,
          positionalMultiplier: result.positionalMultiplier,
          damageVarianceMultiplier: result.damageVarianceMultiplier,
          retaliationVarianceMultiplier: result.retaliationVarianceMultiplier,
        },
        morale: {
          attackerLoss: result.attackerMoraleLoss,
          defenderLoss: result.defenderMoraleLoss,
          attackerRouted: result.attackerRouted,
          defenderRouted: result.defenderRouted,
          attackerFled: result.attackerFled,
          defenderFled: result.defenderFled,
        },
        outcome: {
          attackerDamage: result.attackerDamage,
          defenderDamage: result.defenderDamage,
          attackerDestroyed: result.attackerDestroyed,
          defenderDestroyed: result.defenderDestroyed,
          defenderKnockedBack: resolution.totalKnockbackDistance > 0 && !result.defenderDestroyed,
          knockbackDistance: resolution.totalKnockbackDistance,
        },
        triggeredEffects: resolution.triggeredEffects,
      },
    });

    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return { state: current, pendingCombat: null };
  }

  if (
    !enemy &&
    canUseAmbush(prototype, getAbilityTerrainAt(current, activeUnit.position)) &&
    !hasAdjacentEnemy(current, activeUnit)
  ) {
    const units = new Map(current.units);
    units.set(unitId, prepareAbility(activeUnit, 'ambush', current.round));
    log(trace, `${faction.name} ${prototype.name} prepared an ambush`);
    current = { ...current, units };
    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return { state: current, pendingCombat: null };
  }

  // Slave Galley: non-combat capture — attempt to enslave enemies within range 3
  // (Unit-based, not faction passive — only fires when unit has capture ability via slaver_net component)
  if (isTransportUnit(prototype, registry)
    && hasCaptureAbility(prototype, registry)
    && (activeUnit?.attacksRemaining ?? 0) > 0) {
    const greedyAbility = registry.getSignatureAbility(factionId);
    const captureParams = getCaptureParams(prototype, registry);
    // Use component's capture chance; fall back to signature ability for non-component sources
    const nonCombatChance = captureParams?.chance ?? greedyAbility?.greedyNonCombatCaptureChance ?? 0.5;
    const hpFraction = captureParams?.hpFraction ?? greedyAbility?.greedyCaptureHpFraction ?? 0.5;
    const captureCooldown = captureParams?.cooldown ?? greedyAbility?.greedyCaptureCooldown ?? 4;

    let bestCaptureTarget: UnitId | null = null;
    let bestCaptureDist = Infinity;
    // Find enemy units within range 3 (prioritize weaker, closer targets)
    for (const [, enemy] of current.units) {
      if (enemy.factionId === factionId || enemy.hp <= 0) continue;
      const dist = hexDistance(activeUnit.position, enemy.position);
      if (dist > 3) continue;
      // Prefer lower HP targets
      const currentBest = bestCaptureTarget ? current.units.get(bestCaptureTarget) : null;
      if (dist < bestCaptureDist || (dist === bestCaptureDist && enemy.hp < (currentBest?.hp ?? Infinity))) {
        bestCaptureDist = dist;
        bestCaptureTarget = enemy.id as UnitId;
      }
    }

    if (bestCaptureTarget) {
      const captureResult = attemptNonCombatCapture(
        current, unitId, bestCaptureTarget, registry, nonCombatChance, hpFraction, captureCooldown, current.rngState
      );
      if (captureResult.captured) {
        const capturedUnit = captureResult.state.units.get(bestCaptureTarget);
        const capturedProto = capturedUnit ? captureResult.state.prototypes.get(capturedUnit.prototypeId) : null;
        log(trace, `${faction.name} ${prototype.name} ENSLAVED ${capturedProto?.name ?? 'unit'} (non-combat capture)`);
        current = captureResult.state;
        current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
        current = applyHillDugInIfEligible(current, factionId, unitId);
        return { state: setUnitActivated(current, unitId), pendingCombat: null };
      } else {
        // Failed capture — spend the attack anyway
        const units = new Map(current.units);
        const failedUnit = current.units.get(unitId);
        if (failedUnit) {
          units.set(unitId, { ...failedUnit, attacksRemaining: 0 });
          current = { ...current, units };
        }
      }
    }
  }

  current = performStrategicMovement(current, unitId, registry, trace);

  const movedUnit = current.units.get(unitId);
  if (movedUnit) {
    if (movedUnit.attacksRemaining <= 0) {
      current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
      current = applyHillDugInIfEligible(current, factionId, unitId);
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }

    // After strategic movement, check for adjacent enemies and attack if possible
    if (movedUnit.hp > 0) {
      const postMoveTarget = findBestTargetChoice(
        current, unitId, movedUnit.position, factionId, prototype as any, registry, threatenedCityPosition
      );
      if (postMoveTarget.target && postMoveTarget.score > 0) {
        const postMoveEnemy = postMoveTarget.target;
        const postMovePreview = previewCombatAction(current, registry, movedUnit.id, postMoveEnemy.id);
        if (postMovePreview) {
          if (combatMode === 'preview') {
            return { state: current, pendingCombat: postMovePreview };
          }
          const postMoveCombat = applyCombatAction(current, registry, postMovePreview);
          current = postMoveCombat.state;
          const enemyProto = current.prototypes.get(postMoveEnemy.prototypeId);
          log(trace, `${faction.name} ${prototype.name} attacked ${enemyProto?.name ?? 'enemy'} after movement`);
          current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
          current = applyHillDugInIfEligible(current, factionId, unitId);
          return { state: setUnitActivated(current, unitId), pendingCombat: null };
        }
      }
    }
  }

  current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
  current = applyHillDugInIfEligible(current, factionId, unitId);

  return { state: setUnitActivated(current, unitId), pendingCombat: null };
}

export function activateAiUnit(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  options: UnitActivationOptions = {},
): UnitActivationResult {
  return activateUnit(state, unitId, registry, options);
}


