// Zone of Control System
// Enemy units exert ZoC on adjacent hexes: +1 movement cost, forced stop, flanking bonuses

import type { GameState } from '../game/types.js';
import type { Unit } from '../features/units/types.js';
import type { HexCoord, FactionId } from '../types.js';
import type { ResearchDoctrine } from './capabilityDoctrine.js';
import { getDirectionIndex, getNeighbors, getOppositeDirection } from '../core/grid.js';
import { getUnitAtHex } from './occupancySystem.js';

/** Naval chassis IDs — any unit with one of these is in the naval ZoC domain. */
const NAVAL_CHASSIS_IDS = new Set(['naval_frame', 'ranged_naval_frame', 'galley_frame']);

/**
 * Check if two units share a movement domain (both naval or both land).
 * Cross-domain units (naval vs land) do NOT exert ZoC on each other.
 */
function sameMovementDomain(a: Unit, b: Unit, state: GameState): boolean {
  const protoA = state.prototypes.get(a.prototypeId);
  const protoB = state.prototypes.get(b.prototypeId);
  // If we can't determine chassis, assume same domain (conservative)
  if (!protoA || !protoB) return true;
  const aNaval = NAVAL_CHASSIS_IDS.has(protoA.chassisId);
  const bNaval = NAVAL_CHASSIS_IDS.has(protoB.chassisId);
  return aNaval === bNaval;
}

/**
 * Get all enemy units adjacent to a hex that exert Zone of Control.
 * Only units in the same movement domain (naval/naval or land/land) apply.
 */
export function getZoCBlockers(
  hex: HexCoord,
  movingFactionId: FactionId,
  state: GameState,
  movingUnit?: Unit
): Unit[] {
  const neighbors = getNeighbors(hex);
  const blockers: Unit[] = [];

  for (const neighborHex of neighbors) {
    const unitId = getUnitAtHex(state, neighborHex);
    if (unitId) {
      const unit = state.units.get(unitId);
      if (unit && unit.factionId !== movingFactionId && unit.hp > 0 && !unit.routed) {
        if (!movingUnit || sameMovementDomain(movingUnit, unit, state)) {
          blockers.push(unit);
        }
      }
    }
  }

  return blockers;
}

/**
 * Extended ZoC check that includes aura projection from fortified units.
 * Fortified enemy units project ZoC from all 6 adjacent hexes.
 * Field fort improvements project uncancellable ZoC — no unit can ignore it.
 */
export function getZoCBlockersWithAura(
  hex: HexCoord,
  movingFactionId: FactionId,
  state: GameState,
  doctrine?: ResearchDoctrine,
  movingUnit?: Unit
): { blockers: Unit[]; fortZoC: boolean } {
  const blockers = getZoCBlockers(hex, movingFactionId, state, movingUnit);
  let fortZoC = false;

  // Hill-dug-in units project ZoC aura (doctrine-gated)
  if (doctrine?.zoCAuraEnabled) {
    const neighbors = getNeighbors(hex);
    for (const neighborHex of neighbors) {
      const unitId = getUnitAtHex(state, neighborHex);
      if (unitId) {
        const unit = state.units.get(unitId);
        if (unit && unit.factionId !== movingFactionId && unit.hp > 0 && !unit.routed && unit.hillDugIn) {
          if (!blockers.find(b => b.id === unit.id) && (!movingUnit || sameMovementDomain(movingUnit, unit, state))) {
            blockers.push(unit);
          }
        }
      }
    }
  }

  // Field fort improvements project uncancellable ZoC — even mounted units can't ignore it
  const neighbors = getNeighbors(hex);
  for (const neighborHex of neighbors) {
    // Check if any hex adjacent to this one has a fortification improvement
    for (const [, improvement] of state.improvements) {
      if (improvement.position.q === neighborHex.q && improvement.position.r === neighborHex.r) {
        if (improvement.type === 'fortification') {
          fortZoC = true;
          break;
        }
      }
    }
    if (fortZoC) break;
  }

  return { blockers, fortZoC };
}

/**
 * Calculate ZoC movement penalty for entering a hex.
 * Returns 0 if no enemy ZoC, 1 if enemy ZoC present.
 * Cavalry ignores ZoC movement cost, EXCEPT from field forts (uncancellable).
 */
export function getZoCMovementCost(
  hex: HexCoord,
  movingUnit: Unit,
  state: GameState,
  doctrine?: ResearchDoctrine
): number {
  const { blockers, fortZoC } = getZoCBlockersWithAura(hex, movingUnit.factionId, state, doctrine, movingUnit);

  // Fort ZoC cannot be ignored by any unit type
  if (fortZoC) return 1;

  // Mounted units ignore normal unit ZoC
  if (isMounted(movingUnit, state) || canIgnoreZoCWithHitAndRun(movingUnit, state, doctrine)) {
    return 0;
  }

  return blockers.length > 0 ? 1 : 0;
}

export function isHexInEnemyZoC(
  hex: HexCoord,
  movingUnit: Unit,
  state: GameState,
  doctrine?: ResearchDoctrine
): boolean {
  return getZoCMovementCost(hex, movingUnit, state, doctrine) > 0;
}

export function entersEnemyZoC(
  originHex: HexCoord,
  targetHex: HexCoord,
  movingUnit: Unit,
  state: GameState,
  doctrine?: ResearchDoctrine
): boolean {
  // Check if target hex has fort ZoC (uncancellable by mounted units)
  const { fortZoC } = getZoCBlockersWithAura(targetHex, movingUnit.factionId, state, doctrine, movingUnit);

  // Mounted units ignore normal unit ZoC
  if (isMounted(movingUnit, state) || canIgnoreZoCWithHitAndRun(movingUnit, state, doctrine)) {
    // But cannot ignore fort ZoC
    if (fortZoC) {
      return !isOnFortAtHex(state, originHex); // already in fort = no ZoC entry
    }
    return false;
  }

  return !isHexInEnemyZoC(originHex, movingUnit, state, doctrine) && isHexInEnemyZoC(targetHex, movingUnit, state, doctrine);
}

function isOnFortAtHex(gameState: GameState, pos: HexCoord): boolean {
  for (const [, improvement] of gameState.improvements) {
    if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
      return improvement.type === 'fortification';
    }
  }
  return false;
}

/**
 * Check if a unit is cavalry (based on prototype chassis).
 * @deprecated Use isMounted instead for broader mounted unit support
 */
function isCavalry(unit: Unit, state: GameState): boolean {
  return isMounted(unit, state);
}

/**
 * Check if a unit is mounted (cavalry, camel, heavy cavalry, or any unit with mounted tags).
 * Mounted units ignore Zone of Control.
 */
function isMounted(unit: Unit, state: GameState): boolean {
  const prototype = state.prototypes.get(unit.prototypeId);
  if (!prototype) return false;
  // Check by chassis ID
  const chassis = prototype.chassisId;
  if (chassis === 'cavalry_frame' || chassis === 'camel_frame' || chassis === 'heavy_cavalry') return true;
  // Check by tags (catches future variants)
  const tags = prototype.tags ?? [];
  if (tags.includes('cavalry') || tags.includes('mounted')) return true;
  return false;
}

function canIgnoreZoCWithHitAndRun(
  unit: Unit,
  state: GameState,
  doctrine?: ResearchDoctrine,
): boolean {
  if (!doctrine?.hitrunZocIgnoreEnabled) {
    return false;
  }

  const prototype = state.prototypes.get(unit.prototypeId);
  if (!prototype) return false;
  const tags = prototype.tags ?? [];
  return tags.includes('skirmish') || tags.includes('stealth');
}

/**
 * Calculate flanking bonus for an attacker.
 * +15% damage per allied unit adjacent to the defender (excluding the attacker).
 */
export function calculateFlankingBonus(
  attacker: Unit,
  defender: Unit,
  state: GameState
): number {
  const defenderNeighbors = getNeighbors(defender.position);
  let flankingAllies = 0;

  for (const hex of defenderNeighbors) {
    const unitId = getUnitAtHex(state, hex);
    if (unitId) {
      const neighbor = state.units.get(unitId);
      if (
        neighbor &&
        neighbor.factionId === attacker.factionId &&
        neighbor.id !== attacker.id &&
        neighbor.hp > 0
      ) {
        flankingAllies++;
      }
    }
  }

  return flankingAllies * 0.15;
}

export function isRearAttack(
  attacker: Unit,
  defender: Unit
): boolean {
  if (defender.routed) {
    return false;
  }

  const attackDirection = getDirectionIndex(defender.position, attacker.position);
  if (attackDirection === null) {
    return false;
  }

  const rearCenter = getOppositeDirection(defender.facing);
  const rearLeft = (rearCenter + 7) % 8;
  const rearRight = (rearCenter + 1) % 8;
  return attackDirection === rearCenter || attackDirection === rearLeft || attackDirection === rearRight;
}
