// Morale System - War Engine v2
// Handles morale loss from combat, rout checks, recovery, and rout execution

import type { Unit } from '../features/units/types.js';
import type { GameState } from '../game/types.js';
import type { HexCoord } from '../types.js';
import { hexDistance, getNeighbors } from '../core/grid.js';
import { getTile } from '../world/map/getTile.js';
import { isUnitVisibleTo } from './fogSystem.js';
import { isWaterTerrain } from './factionIdentitySystem.js';

// Morale configuration constants
export const MORALE_CONFIG = {
  MORALE_DAMAGE_FACTOR: 12.0,     // each HP lost = 12 morale lost
  ALLY_LOSS_MORALE: 12,           // morale lost when nearby ally destroyed
  ROUT_THRESHOLD: 25,             // below this, unit routes
  ROUT_RECOVERY_PER_TURN: 8,      // passive recovery when not in combat
  TRIUMPH_BONUS: 8,               // morale recovered when killing enemy
  RALLIED_THRESHOLD: 60,          // morale must reach this to un-route
  RALLY_BONUS_PER_TURN: 10,       // extra recovery for routed units trying to rally
  DESPERATE_ATTACK_PENALTY: 0.25, // attack multiplier when cornered and routed
};

export const TRIUMPH_MORALE_BONUS = MORALE_CONFIG.TRIUMPH_BONUS;

/**
 * Calculate morale loss from taking damage.
 * Returns a non-negative number representing morale points lost.
 */
export function calculateMoraleLoss(
  damageTaken: number,
  maxHp: number,
  veteranMoraleBonus: number
): number {
  if (damageTaken <= 0) return 0;

  const hpFraction = damageTaken / maxHp;
  const rawLoss = hpFraction * maxHp * MORALE_CONFIG.MORALE_DAMAGE_FACTOR;

  // Veteran morale bonus reduces morale loss (percentage reduction)
  const reducedLoss = rawLoss * (1 - veteranMoraleBonus);

  return Math.max(0, Math.round(reducedLoss * 10) / 10);
}

/**
 * Apply morale loss to a unit. Sets routed flag if morale drops below threshold.
 * Returns the updated morale value.
 */
export function applyMoraleLoss(unit: Unit, loss: number): number {
  const newMorale = Math.max(0, unit.morale - loss);

  if (newMorale <= MORALE_CONFIG.ROUT_THRESHOLD && !unit.routed) {
    unit.routed = true;
  }

  return newMorale;
}

/**
 * Recover morale at the start of a turn for a unit not in combat.
 * Routed units get extra recovery to help them rally.
 */
export function recoverMorale(unit: Unit): number {
  if (unit.hp <= 0) return unit.morale;

  let recovery = MORALE_CONFIG.ROUT_RECOVERY_PER_TURN;

  // Routed units get extra recovery to help rally
  if (unit.routed) {
    recovery += MORALE_CONFIG.RALLY_BONUS_PER_TURN;
  }

  return Math.min(100, unit.morale + recovery);
}

/**
 * Check if a routed unit can rally (morale has recovered enough).
 * Returns true if the unit rallied.
 */
export function checkRally(unit: Unit): boolean {
  if (!unit.routed) return false;

  if (unit.morale >= MORALE_CONFIG.RALLIED_THRESHOLD) {
    unit.routed = false;
    return true;
  }

  return false;
}

/**
 * Find the best hex for a routed unit to flee to.
 * Returns the hex furthest from the nearest enemy, or null if trapped.
 */
export function findFleeHex(
  unit: Unit,
  state: GameState
): HexCoord | null {
  const neighbors = getNeighbors(unit.position);

  // Find nearest enemy distance from current position (visible only)
  let nearestEnemyDist = Infinity;
  for (const [, other] of state.units) {
    if (other.factionId === unit.factionId || other.hp <= 0) continue;
    if (!isUnitVisibleTo(state, unit.factionId, other)) continue;
    const dist = hexDistance(unit.position, other.position);
    if (dist < nearestEnemyDist) nearestEnemyDist = dist;
  }

  // Score each neighbor by distance from nearest enemy
  let bestHex: HexCoord | null = null;
  let bestScore = -Infinity;

  for (const hex of neighbors) {
    // Check if hex is passable (not occupied by friendly)
    let occupied = false;
    for (const [, other] of state.units) {
      if (other.factionId === unit.factionId && other.hp > 0 &&
          other.position.q === hex.q && other.position.r === hex.r) {
        occupied = true;
        break;
      }
    }
    if (occupied) continue;

    // Skip water terrain for non-naval units (infantry cannot enter ocean/coast/river)
    const targetTile = getTile(state.map, hex);
    if (targetTile && isWaterTerrain(targetTile.terrainId)) {
      continue;
    }

    // Cannot flee into an enemy or neutral city
    let hasEnemyCity = false;
    for (const [, city] of state.cities) {
      if (city.factionId !== unit.factionId &&
          city.position.q === hex.q && city.position.r === hex.r) {
        hasEnemyCity = true;
        break;
      }
    }
    if (hasEnemyCity) continue;

    // Calculate minimum distance to any visible enemy from this hex
    let minDistToEnemy = Infinity;
    for (const [, other] of state.units) {
      if (other.factionId === unit.factionId || other.hp <= 0) continue;
      if (!isUnitVisibleTo(state, unit.factionId, other)) continue;
      const dist = hexDistance(hex, other.position);
      if (dist < minDistToEnemy) minDistToEnemy = dist;
    }

    // Prefer hexes further from enemies
    const score = minDistToEnemy;
    if (score > bestScore) {
      bestScore = score;
      bestHex = hex;
    }
  }

  return bestHex;
}
