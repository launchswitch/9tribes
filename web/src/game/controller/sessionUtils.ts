/**
 * Pure helper functions extracted from GameSession.
 * None of these depend on `this` — they take explicit state and return new state.
 */

import type { GameState, Unit, UnitId } from '../../../../src/game/types.js';
import type { HexCoord } from '../../../../src/types.js';
import { createImprovementId } from '../../../../src/core/ids.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { updateFogState } from '../../../../src/systems/fogSystem.js';
import { isCityEncircled } from '../../../../src/systems/territorySystem.js';
import { calculatePrototypeCost, getDomainIdsByTags, isUnlockPrototype } from '../../../../src/systems/knowledgeSystem.js';
import { getUnitCost } from '../../../../src/systems/productionSystem.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';

// ---------------------------------------------------------------------------
// Fog
// ---------------------------------------------------------------------------

export function refreshFogForAllFactions(state: GameState): GameState {
  let nextState = state;
  for (const fid of nextState.factions.keys()) {
    nextState = updateFogState(nextState, fid);
  }
  return nextState;
}

// ---------------------------------------------------------------------------
// Siege
// ---------------------------------------------------------------------------

export function updateSiegeState(state: GameState): GameState {
  const cities = new Map(state.cities);
  let changed = false;
  for (const [cityId, city] of cities) {
    const encircled = isCityEncircled(city, state);
    if (encircled && !city.besieged) {
      cities.set(cityId, { ...city, besieged: true, turnsUnderSiege: 0 });
      changed = true;
    } else if (!encircled && city.besieged) {
      cities.set(cityId, { ...city, besieged: false, turnsUnderSiege: 0 });
      changed = true;
    } else if (city.besieged) {
      cities.set(cityId, { ...city, turnsUnderSiege: (city.turnsUnderSiege ?? 0) + 1 });
      changed = true;
    }
  }
  return changed ? { ...state, cities } : state;
}

// ---------------------------------------------------------------------------
// Improvements & Forts
// ---------------------------------------------------------------------------

export function getImprovementAtHex(state: GameState, position: { q: number; r: number }) {
  for (const improvement of state.improvements.values()) {
    if (improvement.position.q === position.q && improvement.position.r === position.r) {
      return improvement;
    }
  }
  return null;
}

export function isFortificationHex(state: GameState, position: { q: number; r: number }): boolean {
  return getImprovementAtHex(state, position)?.type === 'fortification';
}

export function getFortBuildEligibility(
  state: GameState,
  registry: RulesRegistry,
  unit: Unit,
): { canBuild: boolean; defenseBonus: number } {
  const faction = state.factions.get(unit.factionId);
  const research = state.research.get(unit.factionId as never);
  const doctrine = faction ? resolveCapabilityDoctrine(research, faction) : undefined;
  if (!faction || faction.id !== 'hill_clan' || !doctrine?.canBuildFieldForts) {
    return { canBuild: false, defenseBonus: 0 };
  }

  if (unit.hp <= 0 || unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
    return { canBuild: false, defenseBonus: 0 };
  }

  const prototype = state.prototypes.get(unit.prototypeId as never);
  if (!prototype) {
    return { canBuild: false, defenseBonus: 0 };
  }

  const movementClass = registry.getChassis(prototype.chassisId)?.movementClass;
  const role = prototype.derivedStats.role;
  if (!(movementClass === 'infantry' || role === 'ranged')) {
    return { canBuild: false, defenseBonus: 0 };
  }

  if (getImprovementAtHex(state, unit.position)) {
    return { canBuild: false, defenseBonus: 0 };
  }

  const fieldFort = registry.getImprovement('field_fort');
  return {
    canBuild: true,
    defenseBonus: fieldFort?.defenseBonus ?? 1,
  };
}

export function buildFortAtUnit(
  state: GameState,
  unit: Unit,
  defenseBonus: number,
): GameState {
  const fortId = createImprovementId();
  const improvements = new Map(state.improvements);
  improvements.set(fortId, {
    id: fortId,
    type: 'fortification',
    position: { ...unit.position },
    ownerFactionId: unit.factionId,
    defenseBonus,
  });

  const units = new Map(state.units);
  units.set(unit.id, {
    ...unit,
    movesRemaining: 0,
    attacksRemaining: 0,
    status: 'fortified' as const,
  });

  return {
    ...state,
    improvements,
    units,
  };
}

// ---------------------------------------------------------------------------
// Prototype cost
// ---------------------------------------------------------------------------

export function getPrototypeCost(state: GameState, registry: RulesRegistry, prototypeId: string): number {
  const prototype = state.prototypes.get(prototypeId as never);
  if (!prototype) {
    return 10;
  }

  // Prototype-level cost override (faction-specific starting units)
  if (prototype.productionCost != null) {
    return prototype.productionCost;
  }

  // Unlock prototypes (hybrid recipes) use the mastery cost modifier
  if (isUnlockPrototype(prototype)) {
    const faction = state.factions.get(prototype.factionId as never);
    if (faction) {
      return calculatePrototypeCost(
        getUnitCost(prototype.chassisId),
        faction,
        getDomainIdsByTags(prototype.tags ?? []),
        prototype,
      );
    }
  }

  // Starting prototypes use hardcoded balance-tuned costs
  switch (prototype.chassisId) {
    case 'infantry_frame':
      return 8;
    case 'heavy_infantry_frame':
      return 11;
    case 'ranged_frame':
      return 10;
    case 'cavalry_frame':
      return 14;
    case 'naval_frame':
      return 12;
    case 'camel_frame':
      return 10;
    case 'elephant_frame':
      return 14;
    default:
      return 10;
  }
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

export function getAiUnitIds(state: GameState, factionId: string): string[] {
  return Array.from(state.units.values())
    .filter((unit) => unit.factionId === factionId && unit.hp > 0)
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === 'ready' ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    })
    .map((unit) => unit.id);
}

// ---------------------------------------------------------------------------
// Name helpers
// ---------------------------------------------------------------------------

export function getPrototypeName(state: GameState, prototypeId: string): string {
  return state.prototypes.get(prototypeId as never)?.name ?? prototypeId;
}

export function getActiveFactionName(state: GameState): string {
  const activeFactionId = state.activeFactionId;
  if (!activeFactionId) {
    return 'no faction';
  }
  return state.factions.get(activeFactionId)?.name ?? activeFactionId;
}
