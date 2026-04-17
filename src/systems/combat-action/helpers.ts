import { getDirectionIndex, hexDistance, hexToKey } from '../../core/grid.js';
import type { GameState, UnitId } from '../../game/types.js';
import type { Unit } from '../../features/units/types.js';
import type { HexCoord } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { resolveCapabilityDoctrine } from '../capabilityDoctrine.js';
import { clearPreparedAbility } from '../abilitySystem.js';
import { applyKnockback } from '../signatureAbilitySystem.js';
import { destroyTransport, isTransportUnit } from '../transportSystem.js';

export const WATER_TERRAIN = new Set(['coast', 'river', 'ocean']);

export function getImprovementBonus(state: GameState, position: { q: number; r: number }) {
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

export function removeDeadUnitsFromFactions(factions: GameState['factions'], units: GameState['units']) {
  const nextFactions = new Map(factions);
  for (const [factionId, faction] of nextFactions.entries()) {
    nextFactions.set(factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((unitId) => units.has(unitId as UnitId)),
    });
  }
  return nextFactions;
}

export function canAttackTarget(state: GameState, registry: RulesRegistry, attacker: Unit, defender: Unit): boolean {
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

export function rotateUnitToward(unit: Unit, target: HexCoord): Unit {
  const facing = getDirectionIndex(unit.position, target);
  if (facing === null) {
    return unit;
  }
  return { ...unit, facing };
}

export function writeUnitToState(state: GameState, unit: Unit | undefined): GameState {
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

export function applyKnockbackDistance(
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

export function createCombatActionPreviewRecord(
  state: GameState,
  attackerId: UnitId,
  defenderId: UnitId,
  result: import('../combatSystem.js').CombatResult,
  triggeredEffects: import('./types.js').CombatActionEffect[],
  braceTriggered: boolean,
  attackerWasStealthed: boolean,
  details: import('./types.js').CombatActionPreviewDetails,
): import('./types.js').CombatActionPreview | null {
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

export function destroyTransportIfApplicable(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
): GameState {
  const unit = state.units.get(unitId);
  if (!unit) return state;
  const proto = state.prototypes.get(unit.prototypeId as never);
  if (proto && isTransportUnit(proto, registry)) {
    const destroyResult = destroyTransport(state, unit.id, state.transportMap);
    return { ...destroyResult.state, transportMap: destroyResult.transportMap };
  }
  return state;
}
