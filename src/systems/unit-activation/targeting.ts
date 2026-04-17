import { getHexesInRange, getNeighbors, hexDistance, hexToKey } from '../../core/grid.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { getRoleEffectiveness } from '../../data/roleEffectiveness.js';
import { getWeaponEffectiveness } from '../../data/weaponEffectiveness.js';
import type { GameState } from '../../game/types.js';
import type { FactionId, HexCoord, UnitId } from '../../types.js';
import { isUnitRiverStealthed } from '../factionIdentitySystem.js';
import { getUnitIntent } from '../strategicAi.js';
import { scoreAttackCandidate, scoreStrategicTarget } from '../aiTactics.js';

import {
  getImprovementBonus,
  isFortificationHex,
  countFriendlyUnitsNearHex,
  getNearestFriendlyDistanceToHex,
} from './helpers.js';

export function findBestTargetChoice(
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
export function findBestRangedTarget(
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
          // Ranged attacks take no retaliation — always a positive trade, boost score
          extraScore: extraScore + 12 + (defenderOnFort ? (friendlySupport > 0 ? -4 : -18) : 0),
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
