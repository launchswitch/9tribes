import { createImprovementId } from '../../core/ids.js';
import { hexDistance, hexToKey } from '../../core/grid.js';
import type { GameState, UnitId } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { resolveResearchDoctrine } from '../capabilityDoctrine.js';
import { getNearbySupportScore, getNearestFriendlyCity, getUnitIntent, scoreStrategicTerrain } from '../strategicAi.js';
import { canUseBrace } from '../abilitySystem.js';

import { getTerrainAt, getImprovementAtHex, isFortificationHex, countFriendlyUnitsNearHex, countUnitsNearHex, countFortificationsNearHex } from './helpers.js';

interface FieldFortOpportunity {
  score: number;
  reason: string;
}

const FIELD_FORT_DECISION_SCORE = 6;
const FIELD_FORT_ATTACK_MARGIN = 1;

export { FIELD_FORT_ATTACK_MARGIN, FIELD_FORT_DECISION_SCORE };

export function shouldBrace(
  unit: import('../../features/units/types.js').Unit,
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

function canUseCharge(prototype: { tags?: string[] }): boolean {
  return prototype.tags?.includes('charge') ?? false;
}

function hasAdjacentEnemy(state: GameState, unit: import('../../features/units/types.js').Unit): boolean {
  for (const other of state.units.values()) {
    if (other.hp <= 0 || other.factionId === unit.factionId) continue;
    if (hexDistance(unit.position, other.position) === 1) return true;
  }
  return false;
}

export function getFieldFortOpportunity(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
  fortsBuiltThisRound?: Set<FactionId>,
): FieldFortOpportunity | null {
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
    return null;
  }

  if (!doctrine.canBuildFieldForts) {
    return null;
  }

  const prototype = state.prototypes.get(unit.prototypeId);
  const movementClass = prototype ? registry.getChassis(prototype.chassisId)?.movementClass : undefined;
  const role = prototype?.derivedStats.role;
  if (!(movementClass === 'infantry' || role === 'ranged')) {
    return null;
  }

  if (getImprovementAtHex(state, unit.position)) {
    return null;
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
  const defensiveHold = isDefensiveAssignment && terrain === 'hill' && cityDistance <= 3;
  if (
    nearbyFriendlySupport <= 0
    || nearbyFortCount > 0
    || (!defensiveHold && nearbyEnemies <= 0)
  ) {
    return null;
  }

  let score = Math.min(nearbyFriendlySupport, 2) * 1.5;
  score += Math.min(nearbyEnemies, 2) * 3;
  if (terrain === 'hill') score += 3;
  if (isDefensiveAssignment) score += 3;
  if (cityDistance <= 1) {
    score += 2.5;
  } else if (cityDistance <= 2) {
    score += 1.5;
  } else if (cityDistance <= 3) {
    score += 0.5;
  }
  if (unitIntent?.threatenedCityId && nearestCity?.id === unitIntent.threatenedCityId) {
    score += 2;
  } else if (nearestCity?.besieged) {
    score += 1.5;
  }

  const reason = nearbyEnemies > 0
    ? `pressure=${nearbyEnemies} support=${nearbyFriendlySupport} terrain=${terrain}`
    : `hold=${isDefensiveAssignment ? unitIntent?.assignment : 'none'} terrain=${terrain} city=${cityDistance}`;
  return { score, reason };
}

export function buildFieldFortIfEligible(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
  fortsBuiltThisRound?: Set<FactionId>
): GameState {
  const opportunity = getFieldFortOpportunity(state, factionId, unitId, registry, fortsBuiltThisRound);
  if (!opportunity) {
    return state;
  }

  const faction = state.factions.get(factionId);
  const unit = state.units.get(unitId);
  if (!faction || !unit) {
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

export function applyHillDugInIfEligible(
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
