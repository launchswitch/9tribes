import { getDirectionIndex, getNeighbors, hexDistance, hexToKey } from '../core/grid.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { Unit } from '../features/units/types.js';
import type { GameState, UnitId } from '../game/types.js';
import {
  getCombatAttackModifier,
  getCombatDefenseModifier,
  getDesertSwarmBonus,
} from './factionIdentitySystem.js';
import {
  getVeteranDefenseBonus,
  getVeteranMoraleBonus,
  getVeteranStatBonus,
  resolveCombat,
  type CombatResult,
} from './combatSystem.js';
import { resolveCapabilityDoctrine } from './capabilityDoctrine.js';
import { canUseCharge, clearPreparedAbility } from './abilitySystem.js';
import { applyCombatSignals } from './combatSignalSystem.js';
import { unlockHybridRecipes } from './hybridSystem.js';
import { awardCombatXP } from './xpSystem.js';
import { tryPromoteUnit } from './veterancySystem.js';
import { tryLearnFromKill } from './learnByKillSystem.js';
import { attemptCapture, attemptNonCombatCapture, hasCaptureAbility } from './captureSystem.js';
import { addExhaustion, EXHAUSTION_CONFIG } from './warExhaustionSystem.js';
import { applyContactTransfer } from './capabilitySystem.js';
import { destroyTransport, isTransportUnit } from './transportSystem.js';
import {
  applyKnockback,
  applyPoisonDoT,
  enterStealth,
  findRetreatHex,
  getBulwarkDefenseBonus,
  getTidalCoastDebuff,
} from './signatureAbilitySystem.js';
import { calculateFlankingBonus, isRearAttack } from './zocSystem.js';
import { getFactionCityIds, syncAllFactionSettlementIds } from './factionOwnershipSystem.js';
import {
  recordBattleFought,
  recordEnemyKilled,
  recordPromotion,
  updateCombatRecordOnElimination,
  updateCombatRecordOnLoss,
  updateCombatRecordOnWin,
} from './historySystem.js';
import { getUnitAtHex } from './occupancySystem.js';
import { getWallDefenseBonus } from './siegeSystem.js';
import {
  applyCombatSynergies,
  type CombatContext,
  type CombatResult as SynergyCombatResult,
} from './synergyEffects.js';
import {
  calculateSynergyAttackBonus,
  calculateSynergyDefenseBonus,
  getSynergyEngine,
} from './synergyRuntime.js';
import type { FactionId, HexCoord } from '../types.js';

export type CombatActionEffectCategory = 'positioning' | 'ability' | 'synergy' | 'aftermath';

export interface CombatActionEffect {
  label: string;
  detail: string;
  category: CombatActionEffectCategory;
}

export interface CombatActionPreview {
  attackerId: UnitId;
  defenderId: UnitId;
  result: CombatResult;
  round: number;
  attackerFactionId: string;
  defenderFactionId: string;
  attackerPrototypeName: string;
  defenderPrototypeName: string;
  triggeredEffects: CombatActionEffect[];
  braceTriggered: boolean;
  attackerWasStealthed: boolean;
  details: CombatActionPreviewDetails;
}

export interface CombatActionPreviewDetails {
  attackerTerrainId: string;
  defenderTerrainId: string;
  isChargeAttack: boolean;
  chargeAttackBonus: number;
  synergyAttackModifier: number;
  synergyDefenseModifier: number;
  improvementDefenseBonus: number;
  wallDefenseBonus: number;
  totalKnockbackDistance: number;
  poisonTrapPositions: HexCoord[];
  poisonTrapDamage: number;
  poisonTrapSlow: number;
  healOnRetreatAmount: number;
  sandstormDamage: number;
  contaminateActive: boolean;
  frostbiteColdDoT: number;
  frostbiteSlow: number;
  attackerSynergyEffects: string[];
  defenderSynergyEffects: string[];
  swiftChargeTriggered: boolean;
  stampedeTriggered: boolean;
}

export interface CombatActionFeedback {
  lastLearnedDomain: { unitId: string; domainId: string } | null;
  hitAndRunRetreat: { unitId: string; to: { q: number; r: number } } | null;
  resolution: CombatActionResolution;
}

export interface CombatActionResolution {
  triggeredEffects: CombatActionEffect[];
  capturedOnKill: boolean;
  retreatCaptured: boolean;
  poisonApplied: boolean;
  reStealthTriggered: boolean;
  reflectionDamageApplied: number;
  combatHealingApplied: number;
  sandstormTargetsHit: number;
  contaminatedHexApplied: boolean;
  frostbiteApplied: boolean;
  hitAndRunTriggered: boolean;
  healOnRetreatApplied: number;
  totalKnockbackDistance: number;
}

export interface CombatActionApplyResult {
  state: GameState;
  feedback: CombatActionFeedback;
}

const WATER_TERRAIN = new Set(['coast', 'river', 'ocean']);

function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
}

function humanizeCombatEffect(effect: string): { label: string; detail: string } | null {
  const poisonAura = effect.match(/^poison_aura_radius_(\d+)$/);
  if (poisonAura) {
    return { label: 'Poison Aura', detail: `Applied poison pressure in radius ${poisonAura[1]}.` };
  }
  const landAura = effect.match(/^land_aura_radius_(\d+)$/);
  if (landAura) {
    return { label: 'Land Aura', detail: `Granted a defensive aura in radius ${landAura[1]}.` };
  }
  const healingRadius = effect.match(/^extended_healing_radius_(\d+)$/);
  if (healingRadius) {
    return { label: 'Extended Healing', detail: `Healing aura extended to radius ${healingRadius[1]}.` };
  }
  const stealthReveal = effect.match(/^stealth_aura_reveal_(\d+)$/);
  if (stealthReveal) {
    return { label: 'Stealth Aura', detail: `Threatened hidden enemies within radius ${stealthReveal[1]}.` };
  }
  const combatHealing = effect.match(/^combat_healing_(\d+)%$/);
  if (combatHealing) {
    return { label: 'Combat Healing', detail: `Converted ${combatHealing[1]}% of dealt damage into healing.` };
  }
  const sandstorm = effect.match(/^sandstorm_damage_(\d+)_accuracy_debuff_(\d+\.?\d*)$/);
  if (sandstorm) {
    return { label: 'Sandstorm', detail: `Dealt ${sandstorm[1]} area damage and reduced accuracy by ${formatPercent(-Number(sandstorm[2]))}.` };
  }
  const withering = effect.match(/^withering_healing_reduction_(\d+)%$/);
  if (withering) {
    return { label: 'Withering', detail: `Reduced incoming healing by ${withering[1]}%.` };
  }
  const poisonMultiplier = effect.match(/^poison_multiplier_(\d+\.?\d*)x$/);
  if (poisonMultiplier) {
    return { label: 'Poison Multiplier', detail: `Amplified attack output by ${poisonMultiplier[1]}x.` };
  }
  const frostSpeed = effect.match(/^frost_speed_movement_(\d+)$/);
  if (frostSpeed) {
    return { label: 'Frost Speed', detail: `Adjusted movement by ${frostSpeed[1]} on frozen ground.` };
  }
  const healOnRetreat = effect.match(/^heal_on_retreat_(\d+)$/);
  if (healOnRetreat) {
    return { label: 'Heal On Retreat', detail: `Recovered ${healOnRetreat[1]} HP after disengaging.` };
  }
  const swarmSpeed = effect.match(/^swarm_speed_(\d+)$/);
  if (swarmSpeed) {
    return { label: 'Swarm Speed', detail: `Reduced movement cost by ${swarmSpeed[1]}.` };
  }
  const adaptiveMultiplier = effect.match(/^adaptive_multiplier_(\d+\.?\d*)x$/);
  if (adaptiveMultiplier) {
    return { label: 'Adaptive Multiplier', detail: `Triple-stack multiplier boosted combat by ${adaptiveMultiplier[1]}x.` };
  }

  const labels: Record<string, string> = {
    charge_shield: 'Charge Shield',
    anti_displacement: 'Anti-Displacement',
    dug_in: 'Dug In',
    terrain_fortress: 'Terrain Fortress',
    charge_cooldown_reset: 'Charge Reset',
    ram_attack: 'Ram Attack',
    stealth_charge: 'Stealth Charge',
    double_charge: 'Double Charge',
    poison_trap: 'Poison Trap',
    contaminate_coastal: 'Contaminate',
    stealth_healing: 'Stealth Healing',
    terrain_poison: 'Terrain Poison',
    aura_overlap: 'Aura Overlap',
    wave_cavalry_amphibious: 'Wave Cavalry',
    stealth_recharge: 'Stealth Recharge',
    desert_fortress: 'Desert Fortress',
    frostbite: 'Frostbite',
    frost_defense: 'Frost Defense',
    bear_charge: 'Bear Charge',
    bear_cover: 'Bear Cover',
    ice_zone_difficult_terrain: 'Ice Zone',
    bear_mount: 'Bear Mount',
    terrain_share: 'Terrain Share',
    pack_bonus: 'Pack Bonus',
    oasis_neutral_terrain: 'Oasis',
    permanent_stealth_terrain: 'Permanent Stealth Terrain',
    shadow_network: 'Shadow Network',
    nomad_network: 'Nomad Network',
    impassable_retreat: 'Impassable Retreat',
    paladin_sustain: 'Paladin Sustain',
    juggernaut_doubled: 'Juggernaut Doubled',
    ambush_damage: 'Ambush Damage',
  };

  const label = labels[effect];
  if (!label) {
    return null;
  }

  return { label, detail: label };
}

function pushCombatEffect(
  effects: CombatActionEffect[],
  label: string,
  detail: string,
  category: CombatActionEffectCategory,
): void {
  effects.push({ label, detail, category });
}

function getImprovementBonus(state: GameState, position: { q: number; r: number }) {
  for (const improvement of state.improvements.values()) {
    if (improvement.position.q === position.q && improvement.position.r === position.r) {
      return improvement.defenseBonus ?? 0;
    }
  }
  for (const city of state.cities.values()) {
    if (city.position.q === position.q && city.position.r === position.r) {
      return 1;
    }
  }
  for (const village of state.villages.values()) {
    if (village.position.q === position.q && village.position.r === position.r) {
      return 0.5;
    }
  }

  return 0;
}

function removeDeadUnitsFromFactions(factions: GameState['factions'], units: GameState['units']) {
  const nextFactions = new Map(factions);
  for (const [factionId, faction] of nextFactions.entries()) {
    nextFactions.set(factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((unitId) => units.has(unitId as UnitId)),
    });
  }
  return nextFactions;
}

function canAttackTarget(state: GameState, registry: RulesRegistry, attacker: Unit, defender: Unit): boolean {
  const attackerPrototype = state.prototypes.get(attacker.prototypeId as never);
  if (!attackerPrototype) {
    return false;
  }

  const attackRange = attackerPrototype.derivedStats.range ?? 1;
  if (hexDistance(attacker.position, defender.position) > attackRange) {
    return false;
  }

  const chassis = registry.getChassis(attackerPrototype.chassisId);
  const isNavalUnit = chassis?.movementClass === 'naval';
  if (!isNavalUnit) {
    return true;
  }

  const faction = state.factions.get(attacker.factionId);
  const doctrine = faction
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), faction)
    : undefined;
  if (doctrine?.amphibiousAssaultEnabled === true) {
    return true;
  }

  const defenderTerrain = state.map?.tiles.get(hexToKey(defender.position))?.terrain ?? '';
  return WATER_TERRAIN.has(defenderTerrain);
}

function rotateUnitToward(unit: Unit, target: HexCoord): Unit {
  const facing = getDirectionIndex(unit.position, target);
  if (facing === null) {
    return unit;
  }
  return { ...unit, facing };
}

function writeUnitToState(state: GameState, unit: Unit | undefined): GameState {
  if (!unit) {
    return state;
  }

  const units = new Map(state.units);
  if (unit.hp <= 0) {
    units.delete(unit.id);
  } else {
    units.set(unit.id, unit);
  }
  return {
    ...state,
    units,
    factions: removeDeadUnitsFromFactions(state.factions, units),
  };
}

function applyKnockbackDistance(
  state: GameState,
  attackerId: UnitId,
  defenderId: UnitId,
  distance: number,
): { state: GameState; appliedDistance: number } {
  let current = state;
  let appliedDistance = 0;

  for (let step = 0; step < distance; step += 1) {
    const attacker = current.units.get(attackerId);
    const defender = current.units.get(defenderId);
    if (!attacker || !defender) {
      break;
    }

    const knockbackHex = applyKnockback(current, attacker, defender, 1);
    if (!knockbackHex) {
      break;
    }

    current = writeUnitToState(current, {
      ...defender,
      position: knockbackHex,
    });
    appliedDistance += 1;
  }

  return { state: current, appliedDistance };
}

function createCombatActionPreviewRecord(
  state: GameState,
  attackerId: UnitId,
  defenderId: UnitId,
  result: CombatResult,
  triggeredEffects: CombatActionEffect[],
  braceTriggered: boolean,
  attackerWasStealthed: boolean,
  details: CombatActionPreviewDetails,
): CombatActionPreview | null {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);
  const attackerPrototype = attacker ? state.prototypes.get(attacker.prototypeId as never) : null;
  const defenderPrototype = defender ? state.prototypes.get(defender.prototypeId as never) : null;
  if (!attacker || !defender || !attackerPrototype || !defenderPrototype) {
    return null;
  }

  return {
    attackerId,
    defenderId,
    result,
    round: state.round,
    attackerFactionId: attacker.factionId,
    defenderFactionId: defender.factionId,
    attackerPrototypeName: attackerPrototype.name,
    defenderPrototypeName: defenderPrototype.name,
    triggeredEffects,
    braceTriggered,
    attackerWasStealthed,
    details,
  };
}

function maybeAbsorbFaction(
  state: GameState,
  victorFactionId: FactionId,
  defeatedFactionId: FactionId,
): GameState {
  const stillAlive = Array.from(state.units.values()).some(
    (unit) => unit.factionId === defeatedFactionId && unit.hp > 0,
  );
  if (stillAlive) {
    return state;
  }

  const defeatedFaction = state.factions.get(defeatedFactionId);
  const victorFaction = state.factions.get(victorFactionId);
  if (!defeatedFaction || !victorFaction) {
    return state;
  }

  let current = applyContactTransfer(state, victorFactionId, defeatedFactionId, 'absorption');
  current = updateCombatRecordOnElimination(current, victorFactionId);

  const newCities = new Map(current.cities);
  for (const cityId of getFactionCityIds(current, defeatedFactionId)) {
    const city = current.cities.get(cityId);
    if (city) {
      newCities.set(cityId, { ...city, factionId: victorFactionId, turnsSinceCapture: 0 });
    }
  }

  const newVillages = new Map(current.villages);
  for (const village of current.villages.values()) {
    if (village.factionId === defeatedFactionId) {
      newVillages.set(village.id, { ...village, factionId: victorFactionId });
    }
  }

  const newFactions = new Map(current.factions);
  newFactions.set(defeatedFactionId, {
    ...defeatedFaction,
    cityIds: [],
    villageIds: [],
  });

  return syncAllFactionSettlementIds({
    ...current,
    cities: newCities,
    villages: newVillages,
    factions: newFactions,
  });
}

export function previewCombatAction(
  state: GameState,
  registry: RulesRegistry,
  attackerId: UnitId,
  defenderId: UnitId,
): CombatActionPreview | null {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);
  if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0 || !state.map) {
    return null;
  }

  if (attacker.factionId !== state.activeFactionId || defender.factionId === attacker.factionId || attacker.attacksRemaining <= 0 || attacker.movesRemaining <= 0) {
    return null;
  }

  if (!canAttackTarget(state, registry, attacker, defender)) {
    return null;
  }

  const attackerPrototype = state.prototypes.get(attacker.prototypeId as never);
  const defenderPrototype = state.prototypes.get(defender.prototypeId as never);
  if (!attackerPrototype || !defenderPrototype) {
    return null;
  }

  const attackerTerrainId = state.map.tiles.get(hexToKey(attacker.position))?.terrain ?? 'plains';
  const defenderTerrainId = state.map.tiles.get(hexToKey(defender.position))?.terrain ?? 'plains';
  const attackerTerrain = registry.getTerrain(attackerTerrainId);
  const defenderTerrain = registry.getTerrain(defenderTerrainId);
  const attackerFaction = state.factions.get(attacker.factionId);
  const defenderFaction = state.factions.get(defender.factionId);
  const attackerDoctrine = attackerFaction
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), attackerFaction)
    : undefined;
  const defenderDoctrine = defenderFaction
    ? resolveCapabilityDoctrine(state.research.get(defender.factionId), defenderFaction)
    : undefined;
  const canChargeAttack =
    (attackerPrototype.derivedStats.range ?? 1) <= 1
    && (canUseCharge(attackerPrototype) || attackerDoctrine?.chargeTranscendenceEnabled === true);
  const isChargeAttack = canChargeAttack
    && (
      attackerDoctrine?.chargeTranscendenceEnabled === true
      || attacker.movesRemaining < attacker.maxMoves
    );
  const attackerOnFort = getImprovementBonus(state, attacker.position) > 0;
  const defenderOnFort = getImprovementBonus(state, defender.position) > 0;
  const flankingBonus = defenderOnFort ? 0 : calculateFlankingBonus(attacker, defender, state);
  const rearAttackBonus = (defenderOnFort ? false : isRearAttack(attacker, defender)) ? 0.2 : 0;
  const braceTriggered = defender.preparedAbility === 'brace'
    && (attackerPrototype.derivedStats.role === 'mounted' || (attackerPrototype.derivedStats.range ?? 1) <= 1);
  const ambushAttackBonus = attacker.preparedAbility === 'ambush' ? 0.15 : 0;
  const attackerWasStealthed = attacker.isStealthed ?? false;
  let chargeAttackBonus = isChargeAttack && !braceTriggered ? 0.15 : 0;
  let swiftChargeTriggered = false;
  if (isChargeAttack && !braceTriggered && attackerPrototype.tags?.includes('cavalry')) {
    chargeAttackBonus = registry.getSignatureAbility('plains_riders')?.swiftChargeBonus ?? 0.3;
    swiftChargeTriggered = true;
  }
  let stampedeTriggered = false;
  if (
    isChargeAttack
    && !braceTriggered
    && (attackerPrototype.tags?.includes('elephant') || attackerPrototype.tags?.includes('chariot'))
  ) {
    chargeAttackBonus += registry.getSignatureAbility('savannah_lions')?.stampedeBonus ?? 0.3;
    stampedeTriggered = true;
  }
  const braceDefenseBonus = defender.preparedAbility === 'brace'
    ? (defenderDoctrine?.fortressTranscendenceEnabled ? 0.4 : 0.2)
    : 0;
  let situationalAttackModifier = getCombatAttackModifier(attackerFaction, attackerTerrain, defenderTerrain);
  let situationalDefenseModifier = getCombatDefenseModifier(defenderFaction, defenderTerrain);

  const desertAbility = registry.getSignatureAbility('desert_nomads');
  const desertSwarmConfig = desertAbility
    ? {
        threshold: desertAbility.desertSwarmThreshold ?? 3,
        attackBonus: desertAbility.desertSwarmAttackBonus ?? 1,
        defenseMultiplier: desertAbility.desertSwarmDefenseMultiplier ?? 1.1,
      }
    : undefined;
  const attackerSwarm = getDesertSwarmBonus(attackerFaction, attacker, state, desertSwarmConfig);
  if (attackerSwarm.attackBonus > 0) {
    situationalAttackModifier += attackerSwarm.attackBonus;
  }
  const defenderSwarm = getDesertSwarmBonus(defenderFaction, defender, state, desertSwarmConfig);
  if (defenderSwarm.defenseMultiplier > 1) {
    situationalDefenseModifier += defenderSwarm.defenseMultiplier - 1;
  }

  let tidalAssaultTriggered = false;
  if (attackerPrototype.tags?.includes('naval') && (attackerPrototype.tags?.includes('shock') || attackerPrototype.tags?.includes('ranged'))) {
    const isWaterToLand = ['coast', 'river'].includes(attackerTerrainId) && !['coast', 'river'].includes(defenderTerrainId);
    if (isWaterToLand) {
      situationalAttackModifier += registry.getSignatureAbility('coral_people')?.tidalAssaultBonus ?? 0.2;
      situationalDefenseModifier -= getTidalCoastDebuff();
      tidalAssaultTriggered = true;
    }
  }

  const attackerIsCamel = attackerPrototype.tags?.includes('camel') ?? false;
  const defenderIsCavalry = defenderPrototype.tags?.includes('cavalry') ?? false;
  if (attackerIsCamel && defenderIsCavalry) {
    situationalAttackModifier += 0.3;
  }
  if (defenderIsCavalry && !attackerIsCamel && (defenderPrototype.tags?.includes('camel') ?? false)) {
    situationalAttackModifier -= 0.2;
  }

  let bulwarkTriggered = false;
  for (const hex of getNeighbors(defender.position)) {
    const neighborUnitId = getUnitAtHex(state, hex);
    if (!neighborUnitId) {
      continue;
    }
    const neighborUnit = state.units.get(neighborUnitId);
    if (!neighborUnit || neighborUnit.factionId !== defender.factionId || neighborUnit.hp <= 0) {
      continue;
    }
    const neighborPrototype = state.prototypes.get(neighborUnit.prototypeId);
    if (neighborPrototype?.tags?.includes('fortress')) {
      situationalDefenseModifier += getBulwarkDefenseBonus(defender, state, registry);
      bulwarkTriggered = true;
      break;
    }
  }

  let fortifiedVolleyTriggered = false;
  let fortifiedCoverTriggered = false;
  const attackerIsRanged = attackerPrototype.derivedStats.role === 'ranged' || (attackerPrototype.derivedStats.range ?? 1) > 1;
  if (attackerIsRanged && attackerOnFort) {
    const attackerIsFortress = attackerPrototype.tags?.includes('fortress') ?? false;
    const attackerIsSiege = attackerPrototype.tags?.includes('siege') ?? false;
    const volleyBonus = attackerIsSiege ? 0.4 : attackerIsFortress ? 0.3 : 0.15;
    situationalAttackModifier += volleyBonus;
    fortifiedVolleyTriggered = true;
  }
  const defenderIsRanged = defenderPrototype.derivedStats.role === 'ranged' || (defenderPrototype.derivedStats.range ?? 1) > 1;
  if (defenderIsRanged && defenderOnFort) {
    const defenderIsFortress = defenderPrototype.tags?.includes('fortress') ?? false;
    situationalDefenseModifier += defenderIsFortress ? 0.3 : 0.15;
    fortifiedCoverTriggered = true;
  }

  const defenderOnCity = Array.from(state.cities.values()).some(
    (city) => city.position.q === defender.position.q && city.position.r === defender.position.r,
  );
  if ((attackerPrototype.tags?.includes('siege') ?? false) && defenderOnCity) {
    situationalAttackModifier += 0.25;
  }

  const retaliationDamageMultiplier = braceTriggered && isChargeAttack ? 1.1 : 1;

  if (defender.hillDugIn) {
    situationalDefenseModifier += 0.2;
  }
  if (attackerDoctrine?.greedyCaptureEnabled && defender.hp < defender.maxHp * 0.5) {
    situationalAttackModifier += 0.15;
  }
  if (attackerDoctrine?.antiFortificationEnabled && (defender.preparedAbility === 'brace' || defenderOnFort)) {
    situationalAttackModifier += 0.2;
  }
  if (attackerDoctrine?.chargeRoutedBonusEnabled && isChargeAttack && defender.routed) {
    situationalAttackModifier += 0.5;
  }
  if (defenderDoctrine?.shieldWallEnabled) {
    const defenderIsInfantry = defenderPrototype.derivedStats.role === 'melee'
      && !(defenderPrototype.tags?.includes('cavalry') || defenderPrototype.tags?.includes('elephant'));
    if (attackerIsRanged && defenderIsInfantry) {
      const supportRadius = defenderDoctrine.fortressTranscendenceEnabled ? 2 : 1;
      const hasSupportAlly = Array.from(state.units.values()).some((neighbor) =>
        neighbor.id !== defender.id
        && neighbor.factionId === defender.factionId
        && neighbor.hp > 0
        && hexDistance(neighbor.position, defender.position) <= supportRadius);
      if (hasSupportAlly) {
        situationalDefenseModifier += defenderDoctrine.fortressAuraUpgradeEnabled ? 0.25 : 0.15;
      }
    }
  }
  if (
    defenderDoctrine?.canopyCoverEnabled
    && defenderPrototype.derivedStats.role === 'ranged'
    && (defenderTerrain?.id === 'forest' || defenderTerrain?.id === 'jungle')
  ) {
    situationalDefenseModifier += 0.3;
  }
  if (defenderDoctrine?.roughTerrainDefenseEnabled && ['forest', 'jungle', 'hill', 'swamp'].includes(defenderTerrain?.id ?? '')) {
    situationalDefenseModifier += 0.2;
  }
  if (defenderDoctrine?.undyingEnabled && defender.hp < defender.maxHp * 0.2) {
    situationalDefenseModifier += 0.5;
  }

  const forestFirstStrike = attackerDoctrine?.forestAmbushEnabled === true && attackerTerrain?.id === 'forest';

  const resolveSynergies = (unit: Unit, prototype: typeof attackerPrototype, faction: typeof attackerFaction, enemyUnit: Unit, enemyPrototype: typeof defenderPrototype) => {
    const engine = getSynergyEngine();
    const triple = faction?.activeTripleStack ?? null;
    const synergies = triple
      ? triple.pairs
      : prototype.tags
        ? engine.resolveUnitPairs(prototype.tags)
        : [];

    const context: CombatContext = {
      attackerId: unit.id,
      defenderId: enemyUnit.id,
      attackerTags: prototype.tags ?? [],
      defenderTags: enemyPrototype.tags ?? [],
      attackerHp: unit.hp,
      defenderHp: enemyUnit.hp,
      terrain: state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? 'plains',
      isCharge: unit.id === attacker.id ? isChargeAttack : false,
      isStealthAttack: unit.id === attacker.id ? attackerWasStealthed : (unit.isStealthed ?? false),
      isRetreat: false,
      isStealthed: unit.isStealthed ?? false,
      position: { x: unit.position.q, y: unit.position.r },
      attackerPosition: { x: unit.position.q, y: unit.position.r },
      defenderPosition: { x: enemyUnit.position.q, y: enemyUnit.position.r },
    };

    return applyCombatSynergies(context, synergies, triple);
  };

  const attackerSynergyResult = resolveSynergies(attacker, attackerPrototype, attackerFaction, defender, defenderPrototype);
  const defenderSynergyResult = resolveSynergies(defender, defenderPrototype, defenderFaction, attacker, attackerPrototype);
  const synergyAttackModifier = calculateSynergyAttackBonus(attackerSynergyResult);
  const synergyDefenseModifier = calculateSynergyDefenseBonus(defenderSynergyResult);
  situationalAttackModifier += synergyAttackModifier;
  situationalDefenseModifier += synergyDefenseModifier;

  const attackerChassis = registry.getChassis(attackerPrototype.chassisId);
  if (attackerDoctrine?.navalCoastalBonusEnabled && attackerChassis?.movementClass === 'naval' && ['coast', 'river'].includes(attackerTerrain?.id ?? '')) {
    situationalAttackModifier += 0.25;
  }

  const improvementDefenseBonus = getImprovementBonus(state, defender.position);
  const wallDefenseBonus = getWallDefenseBonus(
    state,
    defender.position,
    registry.getSignatureAbility('coral_people')?.wallDefenseMultiplier ?? 2,
  );
  const result = resolveCombat(
    attacker,
    defender,
    attackerPrototype,
    defenderPrototype,
    getVeteranStatBonus(registry, attacker.veteranLevel),
    getVeteranDefenseBonus(registry, defender.veteranLevel),
    attackerTerrain,
    defenderTerrain,
    improvementDefenseBonus + wallDefenseBonus,
    getVeteranMoraleBonus(registry, defender.veteranLevel),
    registry,
    flankingBonus,
    situationalAttackModifier + chargeAttackBonus,
    situationalDefenseModifier,
    state.rngState,
    rearAttackBonus,
    braceDefenseBonus,
    ambushAttackBonus,
    (rearAttackBonus > 0 ? 18 : 0) + (attacker.preparedAbility === 'ambush' ? 10 : 0),
    retaliationDamageMultiplier,
    0,
    isChargeAttack,
    attackerWasStealthed,
    attackerSynergyResult.chargeShield,
    defenderSynergyResult.antiDisplacement || defenderDoctrine?.armorPenetrationEnabled === true,
    attackerSynergyResult.stealthChargeMultiplier,
    attackerSynergyResult.sandstormAccuracyDebuff,
    forestFirstStrike,
  );

  let totalKnockbackDistance = result.defenderKnockedBack ? result.knockbackDistance : 0;
  if (result.defenderKnockedBack && attackerDoctrine?.elephantStampede2Enabled && attackerPrototype.tags?.includes('elephant')) {
    totalKnockbackDistance = 2;
  }
  totalKnockbackDistance += attackerSynergyResult.knockbackDistance;

  const triggeredEffects: CombatActionEffect[] = [];

  if (flankingBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Flanking', `Attack gained ${formatPercent(flankingBonus)} from adjacent allied pressure.`, 'positioning');
  }
  if (rearAttackBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Rear Attack', `Hit from behind for ${formatPercent(rearAttackBonus)} and extra morale damage.`, 'positioning');
  }
  if (chargeAttackBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Charge', `Attack gained ${formatPercent(chargeAttackBonus)} from momentum.`, 'ability');
  }
  if (braceTriggered) {
    pushCombatEffect(triggeredEffects, 'Brace', `Defender braced for ${formatPercent(braceDefenseBonus)} defense and stronger retaliation.`, 'ability');
  }
  if (ambushAttackBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Ambush', `Prepared ambush added ${formatPercent(ambushAttackBonus)} attack.`, 'ability');
  }
  if (attackerWasStealthed) {
    pushCombatEffect(triggeredEffects, 'Stealth Ambush', 'Attacker opened from stealth for a major burst bonus.', 'ability');
  }
  if (tidalAssaultTriggered) {
    pushCombatEffect(triggeredEffects, 'Tidal Assault', 'Naval shock force attacked from water and reduced the defender’s footing.', 'ability');
  }
  if (bulwarkTriggered) {
    pushCombatEffect(triggeredEffects, 'Bulwark', 'Adjacent fortress support hardened the defender.', 'ability');
  }
  if (fortifiedVolleyTriggered) {
    pushCombatEffect(triggeredEffects, 'Fortified Volley', 'Ranged unit fired from a field fort for bonus attack.', 'ability');
  }
  if (fortifiedCoverTriggered) {
    pushCombatEffect(triggeredEffects, 'Fortified Cover', 'Ranged defender in a field fort gained fortified cover.', 'ability');
  }
  if (swiftChargeTriggered) {
    pushCombatEffect(triggeredEffects, 'Swift Charge', 'Cavalry signature charge replaced the baseline charge bonus.', 'ability');
  }
  if (stampedeTriggered) {
    pushCombatEffect(triggeredEffects, 'Stampede', 'Elephant momentum stacked extra charge damage.', 'ability');
  }
  if (result.roleModifier !== 0) {
    const sign = result.roleModifier > 0 ? '+' : '';
    pushCombatEffect(
      triggeredEffects,
      'Role Effectiveness',
      `${attackerPrototype.derivedStats.role ?? 'unknown'} vs ${defenderPrototype.derivedStats.role ?? 'unknown'}: ${sign}${(result.roleModifier * 100).toFixed(0)}%`,
      'positioning',
    );
  }
  if (result.weaponModifier !== 0) {
    const sign = result.weaponModifier > 0 ? '+' : '';
    pushCombatEffect(triggeredEffects, 'Weapon Effectiveness', `${sign}${(result.weaponModifier * 100).toFixed(0)}%`, 'ability');
  }
  if (synergyAttackModifier !== 0) {
    pushCombatEffect(triggeredEffects, 'Synergy Attack Bonus', `Pair or triple synergies added ${formatPercent(synergyAttackModifier)} attack pressure.`, 'synergy');
  }
  if (synergyDefenseModifier !== 0) {
    pushCombatEffect(triggeredEffects, 'Synergy Defense Bonus', `Pair or triple synergies added ${formatPercent(synergyDefenseModifier)} defense.`, 'synergy');
  }
  for (const effectCode of [...attackerSynergyResult.additionalEffects, ...defenderSynergyResult.additionalEffects]) {
    const effect = humanizeCombatEffect(effectCode);
    if (effect) {
      pushCombatEffect(triggeredEffects, effect.label, effect.detail, 'synergy');
    }
  }

  return createCombatActionPreviewRecord(
    state,
    attackerId,
    defenderId,
    result,
    triggeredEffects,
    braceTriggered,
    attackerWasStealthed,
    {
      attackerTerrainId,
      defenderTerrainId,
      isChargeAttack,
      chargeAttackBonus,
      synergyAttackModifier,
      synergyDefenseModifier,
      improvementDefenseBonus,
      wallDefenseBonus,
      totalKnockbackDistance,
      poisonTrapPositions: attackerSynergyResult.poisonTrapDamage > 0
        ? [{ q: attacker.position.q, r: attacker.position.r }]
        : attackerSynergyResult.poisonTrapPositions.map((position) => ({ q: position.x, r: position.y })),
      poisonTrapDamage: attackerSynergyResult.poisonTrapDamage,
      poisonTrapSlow: attackerSynergyResult.poisonTrapSlow,
      healOnRetreatAmount: attackerSynergyResult.healOnRetreatAmount,
      sandstormDamage: attackerSynergyResult.sandstormDamage,
      contaminateActive: attackerSynergyResult.contaminateActive,
      frostbiteColdDoT: attackerSynergyResult.frostbiteColdDoT,
      frostbiteSlow: attackerSynergyResult.frostbiteSlow,
      attackerSynergyEffects: attackerSynergyResult.additionalEffects,
      defenderSynergyEffects: defenderSynergyResult.additionalEffects,
      swiftChargeTriggered,
      stampedeTriggered,
    },
  );
}

export function applyCombatAction(
  state: GameState,
  registry: RulesRegistry,
  preview: CombatActionPreview,
): CombatActionApplyResult {
  const baseResolution: CombatActionResolution = {
    triggeredEffects: [...preview.triggeredEffects],
    capturedOnKill: false,
    retreatCaptured: false,
    poisonApplied: false,
    reStealthTriggered: false,
    reflectionDamageApplied: 0,
    combatHealingApplied: 0,
    sandstormTargetsHit: 0,
    contaminatedHexApplied: false,
    frostbiteApplied: false,
    hitAndRunTriggered: false,
    healOnRetreatApplied: 0,
    totalKnockbackDistance: 0,
  };

  const attacker = state.units.get(preview.attackerId);
  const defender = state.units.get(preview.defenderId);
  if (!attacker || !defender) {
    return {
      state,
      feedback: {
        lastLearnedDomain: null,
        hitAndRunRetreat: null,
        resolution: baseResolution,
      },
    };
  }

  const attackerPrototype = state.prototypes.get(attacker.prototypeId as never);
  const defenderPrototype = state.prototypes.get(defender.prototypeId as never);
  if (!attackerPrototype || !defenderPrototype) {
    return {
      state,
      feedback: {
        lastLearnedDomain: null,
        hitAndRunRetreat: null,
        resolution: baseResolution,
      },
    };
  }

  let nextAttacker: Unit = {
    ...attacker,
    hp: Math.max(0, attacker.hp - preview.result.attackerDamage),
    morale: Math.max(0, attacker.morale - preview.result.attackerMoraleLoss),
    routed: preview.result.attackerRouted || preview.result.attackerFled,
    hillDugIn: false,
    attacksRemaining: 0,
    movesRemaining: 0,
    activatedThisRound: true,
    status: 'spent',
  };
  let nextDefender: Unit = {
    ...defender,
    hp: Math.max(0, defender.hp - preview.result.defenderDamage),
    morale: Math.max(0, defender.morale - preview.result.defenderMoraleLoss),
    routed: preview.result.defenderRouted || preview.result.defenderFled,
    hillDugIn: false,
    status: preview.result.defenderDestroyed ? 'spent' : defender.status,
  };

  if (preview.attackerWasStealthed && nextAttacker.hp > 0) {
    nextAttacker = { ...nextAttacker, isStealthed: false, turnsSinceStealthBreak: 1 };
  }
  if (nextAttacker.preparedAbility) {
    nextAttacker = clearPreparedAbility(nextAttacker);
  }
  if (preview.braceTriggered && nextDefender.preparedAbility) {
    nextDefender = clearPreparedAbility(nextDefender);
  }

  let feedback: CombatActionFeedback = {
    lastLearnedDomain: null,
    hitAndRunRetreat: null,
    resolution: baseResolution,
  };

  if (preview.result.defenderDestroyed && !preview.result.attackerDestroyed && nextAttacker.hp > 0) {
    const learnResult = tryLearnFromKill(nextAttacker, defender, state, state.rngState);
    nextAttacker = learnResult.unit;
    if (learnResult.learned && learnResult.domainId) {
      feedback = {
        ...feedback,
        lastLearnedDomain: {
          unitId: nextAttacker.id,
          domainId: learnResult.domainId,
        },
      };
    }
  }

  if (nextAttacker.hp > 0) {
    nextAttacker = awardCombatXP(nextAttacker, preview.result.defenderDestroyed, !preview.result.attackerDestroyed);
    nextAttacker = tryPromoteUnit(nextAttacker, registry);
  }

  const nextUnits = new Map(state.units);
  if (nextAttacker.hp > 0) {
    nextUnits.set(preview.attackerId, nextAttacker);
  } else {
    nextUnits.delete(preview.attackerId);
  }
  if (nextDefender.hp > 0) {
    nextUnits.set(preview.defenderId, nextDefender);
  } else {
    nextUnits.delete(preview.defenderId);
  }

  let current: GameState = {
    ...state,
    units: nextUnits,
    factions: removeDeadUnitsFromFactions(state.factions, nextUnits),
    rngState: preview.result.rngState,
  };

  const attackerFaction = current.factions.get(attacker.factionId);
  const attackerDoctrine = attackerFaction
    ? resolveCapabilityDoctrine(current.research.get(attacker.factionId), attackerFaction)
    : undefined;
  const defenderFaction = current.factions.get(defender.factionId);
  const defenderDoctrine = defenderFaction
    ? resolveCapabilityDoctrine(current.research.get(defender.factionId), defenderFaction)
    : undefined;
  const attackerTerrainId = current.map?.tiles.get(hexToKey(attacker.position))?.terrain ?? '';
  const isGreedyCoastal = attackerFaction?.identityProfile.passiveTrait === 'greedy'
    && WATER_TERRAIN.has(attackerTerrainId);
  const autoCaptureAbility = attackerDoctrine?.autoCaptureEnabled && defender.hp <= defender.maxHp * 0.25
    ? {
        greedyCaptureChance: 1,
        greedyCaptureCooldown: 0,
        greedyCaptureHpFraction: 0.25,
      }
    : null;
  let capturedOnKill = false;
  let retreatCaptured = false;
  if (
    preview.result.defenderDestroyed
    && nextAttacker.hp > 0
    && (hasCaptureAbility(attackerPrototype, registry) || isGreedyCoastal || autoCaptureAbility)
  ) {
    const captureResult = attemptCapture(
      current,
      nextAttacker,
      defender,
      registry,
      autoCaptureAbility
        ?? (isGreedyCoastal && !hasCaptureAbility(attackerPrototype, registry)
          ? registry.getSignatureAbility(attacker.factionId)
          : null),
      current.rngState,
    );
    current = captureResult.state;
    capturedOnKill = captureResult.captured;
  }

  if (!preview.result.defenderDestroyed && preview.result.defenderFled && nextAttacker.hp > 0 && attackerDoctrine?.captureRetreatEnabled) {
    const retreatCapture = attemptNonCombatCapture(
      current,
      preview.attackerId,
      preview.defenderId,
      registry,
      0.15,
      0.25,
      0,
      current.rngState,
    );
    current = retreatCapture.state;
    retreatCaptured = retreatCapture.captured;
  }

  let totalKnockbackDistance = 0;
  if (preview.details.totalKnockbackDistance > 0 && !preview.result.defenderDestroyed && !retreatCaptured) {
    const knockbackResult = applyKnockbackDistance(current, preview.attackerId, preview.defenderId, preview.details.totalKnockbackDistance);
    current = knockbackResult.state;
    totalKnockbackDistance = knockbackResult.appliedDistance;
  }

  if (preview.result.defenderDestroyed && !capturedOnKill) {
    const destroyedDefender = current.units.get(preview.defenderId) ?? defender;
    const proto = current.prototypes.get(destroyedDefender.prototypeId as never);
    if (proto && isTransportUnit(proto, registry)) {
      const destroyResult = destroyTransport(current, destroyedDefender.id, current.transportMap);
      current = { ...destroyResult.state, transportMap: destroyResult.transportMap };
    }
  }
  if (preview.result.attackerDestroyed) {
    const destroyedAttacker = current.units.get(preview.attackerId) ?? attacker;
    const proto = current.prototypes.get(destroyedAttacker.prototypeId as never);
    if (proto && isTransportUnit(proto, registry)) {
      const destroyResult = destroyTransport(current, destroyedAttacker.id, current.transportMap);
      current = { ...destroyResult.state, transportMap: destroyResult.transportMap };
    }
  }

  current = applyCombatSignals(current, attacker.factionId, preview.result.signals);
  current = applyContactTransfer(current, attacker.factionId, defender.factionId, 'contact');
  current = maybeAbsorbFaction(current, attacker.factionId as FactionId, defender.factionId as FactionId);
  current = unlockHybridRecipes(current, attacker.factionId, registry);

  if (preview.result.defenderDestroyed && !capturedOnKill) {
    current = updateCombatRecordOnWin(current, attacker.factionId as FactionId, current.round);
    current = updateCombatRecordOnLoss(current, defender.factionId as FactionId, current.round);
  } else if (preview.result.attackerDestroyed) {
    current = updateCombatRecordOnLoss(current, attacker.factionId as FactionId, current.round);
    current = updateCombatRecordOnWin(current, defender.factionId as FactionId, current.round);
  }

  const attackerWarExhaustion = current.warExhaustion.get(attacker.factionId);
  const defenderWarExhaustion = current.warExhaustion.get(defender.factionId);
  if (preview.result.defenderDestroyed && attackerWarExhaustion) {
    current = {
      ...current,
      warExhaustion: new Map(current.warExhaustion).set(
        attacker.factionId,
        addExhaustion(attackerWarExhaustion, EXHAUSTION_CONFIG.UNIT_KILLED),
      ),
    };
  }
  if (preview.result.attackerDestroyed && defenderWarExhaustion) {
    current = {
      ...current,
      warExhaustion: new Map(current.warExhaustion).set(
        defender.factionId,
        addExhaustion(defenderWarExhaustion, EXHAUSTION_CONFIG.UNIT_KILLED),
      ),
    };
  }

  const hitAndRunEligible =
    attackerDoctrine?.universalHitAndRunEnabled
    || (attackerDoctrine?.hitAndRunEnabled && attackerPrototype.tags?.includes('cavalry') && attackerPrototype.tags?.includes('skirmish'));
  if (hitAndRunEligible) {
    const retreatingAttacker = current.units.get(preview.attackerId);
    if (retreatingAttacker && retreatingAttacker.hp > 0) {
      const retreatHex = findRetreatHex(retreatingAttacker, current);
      if (retreatHex) {
        const unitsAfterRetreat = new Map(current.units);
        unitsAfterRetreat.set(retreatingAttacker.id, {
          ...retreatingAttacker,
          position: retreatHex,
          status: 'ready',
          movesRemaining: Math.max(0, retreatingAttacker.movesRemaining - 1),
        });
        current = { ...current, units: unitsAfterRetreat };
        feedback = {
          ...feedback,
          hitAndRunRetreat: { unitId: retreatingAttacker.id, to: retreatHex },
        };
      }
    }
  }

  let updatedAttacker = current.units.get(preview.attackerId);
  let updatedDefender = current.units.get(preview.defenderId);

  if (updatedAttacker) {
    updatedAttacker = recordBattleFought(
      updatedAttacker,
      defender.id,
      preview.result.defenderDestroyed,
      preview.result.attackerDamage,
      preview.result.defenderDamage,
    );
    if (preview.result.defenderDestroyed) {
      updatedAttacker = recordEnemyKilled(updatedAttacker, defender.id);
    }
    if (updatedAttacker.veteranLevel !== attacker.veteranLevel) {
      updatedAttacker = recordPromotion(updatedAttacker, attacker.veteranLevel, updatedAttacker.veteranLevel);
    }
    current = writeUnitToState(current, updatedAttacker);
  }

  updatedAttacker = current.units.get(preview.attackerId);
  updatedDefender = current.units.get(preview.defenderId);

  const canInflictPoison = attackerPrototype.tags?.includes('poison') ?? false;
  let poisonApplied = false;
  if (!preview.result.defenderDestroyed && preview.result.defenderDamage > 0 && canInflictPoison && updatedDefender) {
    const extraStacks = attackerDoctrine?.poisonPersistenceEnabled ? 1 : 0;
    updatedDefender = applyPoisonDoT(
      updatedDefender,
      (attackerDoctrine?.poisonStacksOnHit ?? 1) + extraStacks,
      attackerDoctrine?.poisonDamagePerStack ?? 3,
      3,
    );
    updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId } as Unit;
    current = writeUnitToState(current, updatedDefender);
    poisonApplied = true;
  }

  let contaminatedHexApplied = false;
  if (preview.result.defenderDestroyed && attackerDoctrine?.contaminateTerrainEnabled && canInflictPoison) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(defender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }

  updatedAttacker = current.units.get(preview.attackerId);
  updatedDefender = current.units.get(preview.defenderId);

  if (updatedAttacker) {
    current = writeUnitToState(current, rotateUnitToward(updatedAttacker, defender.position));
  }
  updatedAttacker = current.units.get(preview.attackerId);
  if (updatedDefender && !preview.result.defenderDestroyed) {
    current = writeUnitToState(
      current,
      rotateUnitToward(updatedDefender, updatedAttacker?.position ?? attacker.position),
    );
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let reflectionDamageApplied = 0;
  if (defenderDoctrine?.damageReflectionEnabled && preview.result.defenderDamage > 0 && updatedAttacker) {
    reflectionDamageApplied = Math.max(1, Math.floor(preview.result.defenderDamage * 0.25));
    updatedAttacker = {
      ...updatedAttacker,
      hp: Math.max(0, updatedAttacker.hp - reflectionDamageApplied),
    };
    current = writeUnitToState(current, updatedAttacker);
  }

  updatedAttacker = current.units.get(preview.attackerId);
  if (preview.details.stampedeTriggered && updatedAttacker) {
    current = writeUnitToState(current, {
      ...updatedAttacker,
      movesRemaining: updatedAttacker.movesRemaining + 1,
    });
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let reStealthTriggered = false;
  if (
    updatedAttacker
    && (
      preview.details.attackerSynergyEffects.includes('stealth_recharge')
      || (attackerDoctrine?.stealthRechargeEnabled && attackerPrototype.tags?.includes('stealth'))
    )
  ) {
    const hasAdjacentEnemy = getNeighbors(updatedAttacker.position).some((hex) => {
      const neighborUnitId = getUnitAtHex(current, hex);
      if (!neighborUnitId) {
        return false;
      }
      const neighbor = current.units.get(neighborUnitId);
      return Boolean(neighbor && neighbor.hp > 0 && neighbor.factionId !== updatedAttacker!.factionId);
    });
    if (!hasAdjacentEnemy) {
      updatedAttacker = enterStealth(
        {
          ...updatedAttacker,
          turnsSinceStealthBreak: 0,
        },
        attackerPrototype.tags ?? [],
      );
      current = writeUnitToState(current, updatedAttacker);
      reStealthTriggered = updatedAttacker.isStealthed ?? false;
    }
  }

  const hitAndRunTriggered = feedback.hitAndRunRetreat !== null;
  if (hitAndRunTriggered && preview.details.poisonTrapPositions.length > 0) {
    const poisonTraps = new Map(current.poisonTraps);
    for (const position of preview.details.poisonTrapPositions) {
      poisonTraps.set(hexToKey(position), {
        damage: preview.details.poisonTrapDamage,
        slow: preview.details.poisonTrapSlow,
        ownerFactionId: attacker.factionId,
      });
    }
    current = { ...current, poisonTraps };
  }
  updatedAttacker = current.units.get(preview.attackerId);
  let healOnRetreatApplied = 0;
  if (hitAndRunTriggered && preview.details.healOnRetreatAmount > 0 && updatedAttacker) {
    healOnRetreatApplied = preview.details.healOnRetreatAmount;
    current = writeUnitToState(current, {
      ...updatedAttacker,
      hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + healOnRetreatApplied),
    });
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let combatHealingApplied = 0;
  const combatHealingEffect = preview.details.attackerSynergyEffects.find((effectCode) => effectCode.includes('combat_healing'));
  if (combatHealingEffect && updatedAttacker) {
    const healMatch = combatHealingEffect.match(/combat_healing_(\d+)%/);
    if (healMatch) {
      const healPercent = parseInt(healMatch[1], 10) / 100;
      const healAmount = Math.floor(preview.result.defenderDamage * healPercent);
      if (healAmount > 0) {
        combatHealingApplied = healAmount;
        current = writeUnitToState(current, {
          ...updatedAttacker,
          hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + healAmount),
        });
      }
    }
  }

  updatedDefender = current.units.get(preview.defenderId);
  let sandstormTargetsHit = 0;
  if (preview.details.sandstormDamage > 0 && updatedDefender && !preview.result.defenderDestroyed && !retreatCaptured) {
    const sandstormUnits = new Map(current.units);
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) {
        continue;
      }
      const adjUnit = sandstormUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        sandstormUnits.set(adjUnitId, {
          ...adjUnit,
          hp: Math.max(0, adjUnit.hp - preview.details.sandstormDamage),
        });
        sandstormTargetsHit += 1;
      }
    }
    current = { ...current, units: sandstormUnits };
  }

  updatedDefender = current.units.get(preview.defenderId);
  if (preview.details.contaminateActive && updatedDefender && !preview.result.defenderDestroyed && !retreatCaptured) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(updatedDefender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }

  updatedDefender = current.units.get(preview.defenderId);
  let frostbiteApplied = false;
  if (preview.details.frostbiteColdDoT > 0 && updatedDefender && !preview.result.defenderDestroyed && !retreatCaptured) {
    frostbiteApplied = true;
    current = writeUnitToState(current, {
      ...updatedDefender,
      frozen: true,
      frostbiteStacks: preview.details.frostbiteColdDoT,
      frostbiteDoTDuration: 3,
      movesRemaining: Math.max(0, updatedDefender.movesRemaining - preview.details.frostbiteSlow),
    });
  }

  updatedDefender = current.units.get(preview.defenderId);
  const triggeredEffects = [...preview.triggeredEffects];
  if (poisonApplied && updatedDefender) {
    pushCombatEffect(triggeredEffects, 'Poisoned', `Defender was poisoned for ${updatedDefender.poisonStacks} stack damage over time.`, 'aftermath');
  }
  if (reflectionDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Reflection', `Defender reflected ${reflectionDamageApplied} damage back to the attacker.`, 'aftermath');
  }
  if (totalKnockbackDistance > 0 && !preview.result.defenderDestroyed) {
    pushCombatEffect(triggeredEffects, 'Knockback', `Defender was displaced ${totalKnockbackDistance} hex${totalKnockbackDistance === 1 ? '' : 'es'}.`, 'aftermath');
  }
  if (reStealthTriggered) {
    pushCombatEffect(triggeredEffects, 'Stealth Recharge', 'Attacker slipped back into stealth after the exchange.', 'aftermath');
  }
  if (combatHealingApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Combat Healing', `Attacker recovered ${combatHealingApplied} HP from dealt damage.`, 'aftermath');
  }
  if (sandstormTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Sandstorm Splash', `Area damage hit ${sandstormTargetsHit} nearby unit${sandstormTargetsHit === 1 ? '' : 's'}.`, 'aftermath');
  }
  if (contaminatedHexApplied) {
    pushCombatEffect(triggeredEffects, 'Contamination', 'The defender hex became contaminated after the strike.', 'aftermath');
  }
  if (frostbiteApplied) {
    pushCombatEffect(triggeredEffects, 'Frostbite', `Defender took ${preview.details.frostbiteColdDoT} cold DoT and ${preview.details.frostbiteSlow} slow.`, 'aftermath');
  }
  if (hitAndRunTriggered && preview.details.poisonTrapPositions.length > 0) {
    pushCombatEffect(triggeredEffects, 'Poison Trap', 'Attacker left a poison trap on the retreat path.', 'aftermath');
  }
  if (hitAndRunTriggered) {
    pushCombatEffect(triggeredEffects, 'Hit And Run', 'Attacker disengaged after combat to avoid being pinned.', 'aftermath');
  }
  if (healOnRetreatApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Retreat Heal', `Attacker recovered ${healOnRetreatApplied} HP while withdrawing.`, 'aftermath');
  }

  feedback = {
    ...feedback,
    resolution: {
      triggeredEffects,
      capturedOnKill,
      retreatCaptured,
      poisonApplied,
      reStealthTriggered,
      reflectionDamageApplied,
      combatHealingApplied,
      sandstormTargetsHit,
      contaminatedHexApplied,
      frostbiteApplied,
      hitAndRunTriggered,
      healOnRetreatApplied,
      totalKnockbackDistance,
    },
  };

  return { state: current, feedback };
}
