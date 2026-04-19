// Siege System
// Handles wall degradation during siege, wall repair when safe,
// and city capture when walls are breached and city is encircled.

import type { GameState } from '../game/types.js';
import type { City } from '../features/cities/types.js';
import type { FactionId } from '../types.js';
import { isCityEncircled } from './territorySystem.js';
import { getHexesInRange, hexDistance } from '../core/grid.js';
import {
  addExhaustion,
  EXHAUSTION_CONFIG,
} from './warExhaustionSystem.js';
import { syncFactionSettlementIds } from './factionOwnershipSystem.js';
import { tryLearnFromCityCapture } from './learnByKillSystem.js';
import { destroyVillagesInCityTerritory } from './villageSystem.js';
import { MAX_LEARNED_DOMAINS } from './knowledgeSystem.js';

export const SIEGE_CONFIG = {
  WALL_DAMAGE_PER_TURN: 20,
  WALL_REPAIR_PER_TURN: 3,
  CAPTURED_WALL_HP_PERCENT: 50,
};

/**
 * Apply wall damage to a besieged city.
 * Pirate Lords (coral_people) have Coastal Walls: half wall damage.
 */
export function degradeWalls(city: City, isCoastalWalls = false): City {
  if (!city.besieged) return city;
  const damage = isCoastalWalls
    ? Math.ceil(SIEGE_CONFIG.WALL_DAMAGE_PER_TURN / 2)
    : SIEGE_CONFIG.WALL_DAMAGE_PER_TURN;
  return {
    ...city,
    wallHP: Math.max(0, city.wallHP - damage),
  };
}

/**
 * Repair walls when not besieged.
 */
export function repairWalls(city: City): City {
  if (city.besieged) return city;
  if (city.wallHP >= city.maxWallHP) return city;
  return {
    ...city,
    wallHP: Math.min(city.maxWallHP, city.wallHP + SIEGE_CONFIG.WALL_REPAIR_PER_TURN),
  };
}

/**
 * Get wall defense bonus for a city at a given position.
 * Returns floor(wallHP / 20), range 0-5.
 * Pirate Lords (coral_people) multiply the bonus by wallDefenseMultiplier,
 * but only for their capital (starting city).
 */
export function getWallDefenseBonus(state: GameState, position: { q: number; r: number }, wallDefenseMultiplier: number = 2): number {
  for (const [, city] of state.cities) {
    if (city.position.q === position.q && city.position.r === position.r) {
      let bonus = Math.floor(city.wallHP / 20);
      // Pirate Lords: multiplied wall defense on capital only (coastal fortress)
      if (city.factionId === 'coral_people' && city.isCapital) {
        bonus *= wallDefenseMultiplier;
      }
      return bonus;
    }
  }
  return 0;
}

/**
 * Check if a city has a defending garrison (friendly units on or adjacent to the city).
 * Defenders block capture even when walls are breached.
 */
export function hasDefendingGarrison(city: City, state: GameState): boolean {
  for (const [, unit] of state.units) {
    if (unit.factionId !== city.factionId || unit.hp <= 0) continue;
    const dist = hexDistance(unit.position, city.position);
    if (dist <= 1) return true;
  }
  return false;
}

/**
 * Check if city is vulnerable to capture.
 * Requires: walls breached AND city still encircled AND no defending garrison.
 */
export function isCityVulnerable(city: City, state: GameState): boolean {
  return city.wallHP <= 0 && isCityEncircled(city, state) && !hasDefendingGarrison(city, state);
}

/**
 * Determine which besieging faction captures the city.
 * Returns the faction with the most adjacent units.
 */
export function getCapturingFaction(
  city: City,
  state: GameState
): FactionId | null {
  const adjacentCounts = new Map<FactionId, number>();
  const neighbors = getHexesInRange(city.position, 1)
    .filter(h => !(h.q === city.position.q && h.r === city.position.r));

  for (const hex of neighbors) {
    for (const [, unit] of state.units) {
      if (
        unit.hp > 0 &&
        unit.position.q === hex.q &&
        unit.position.r === hex.r &&
        unit.factionId !== city.factionId
      ) {
        adjacentCounts.set(
          unit.factionId,
          (adjacentCounts.get(unit.factionId) ?? 0) + 1
        );
      }
    }
  }

  if (adjacentCounts.size === 0) return null;

  let maxFaction: FactionId | null = null;
  let maxCount = 0;
  for (const [factionId, count] of adjacentCounts) {
    if (count > maxCount) {
      maxCount = count;
      maxFaction = factionId;
    }
  }
  return maxFaction;
}

/**
 * Execute city capture: transfer ownership, reset walls, update war exhaustion.
 */
export interface CaptureCityResult {
  state: GameState;
  learnedDomain?: {
    unitId: string;
    domainId: string;
    fromFactionId: string;
  };
}

export function captureCity(
  city: City,
  newOwnerFactionId: FactionId,
  state: GameState
): GameState {
  return captureCityWithResult(city, newOwnerFactionId, state).state;
}

/**
 * Execute city capture: raze the city (destroy it), destroy its villages,
 * transfer the loser's nativeDomain to the victor.
 */
export function captureCityWithResult(
  city: City,
  newOwnerFactionId: FactionId,
  state: GameState
): CaptureCityResult {
  const oldOwnerFactionId = city.factionId;

  // Destroy villages in the city's territory before removing the city
  let currentState = destroyVillagesInCityTerritory(state, city);

  // Remove city from the map entirely (raze)
  const cities = new Map(currentState.cities);
  cities.delete(city.id);

  // Update faction city lists — old owner loses the city, victor does NOT gain it
  const factions = new Map(currentState.factions);

  const oldFaction = factions.get(oldOwnerFactionId);
  if (oldFaction) {
    factions.set(oldOwnerFactionId, {
      ...oldFaction,
      cityIds: oldFaction.cityIds.filter(id => id !== city.id),
    });
  }

  // Update war exhaustion
  const warExhaustion = new Map(currentState.warExhaustion);

  const victimWE = warExhaustion.get(oldOwnerFactionId);
  if (victimWE) {
    warExhaustion.set(
      oldOwnerFactionId,
      addExhaustion(victimWE, EXHAUSTION_CONFIG.CITY_CAPTURED)
    );
  }

  const attackerWE = warExhaustion.get(newOwnerFactionId);
  if (attackerWE) {
    warExhaustion.set(
      newOwnerFactionId,
      addExhaustion(attackerWE, EXHAUSTION_CONFIG.CITY_CAPTURED_ATTACKER)
    );
  }

  currentState = {
    ...currentState,
    cities,
    factions,
    warExhaustion,
  };

  currentState = syncFactionSettlementIds(currentState, oldOwnerFactionId);
  currentState = syncFactionSettlementIds(currentState, newOwnerFactionId);

  // Try domain learning: adjacent capturing unit receives the old owner's nativeDomain (100%)
  const learnResult = tryLearnFromCityCapture(city, newOwnerFactionId, currentState);

  // Faction-level domain transfer: victor gains the loser's nativeDomain
  const victorFaction = learnResult.state.factions.get(newOwnerFactionId);
  const loserFaction = learnResult.state.factions.get(oldOwnerFactionId);
  if (victorFaction && loserFaction) {
    const loserDomain = loserFaction.nativeDomain;
    const alreadyHas =
      loserDomain === victorFaction.nativeDomain ||
      victorFaction.learnedDomains.includes(loserDomain);
    if (!alreadyHas && victorFaction.learnedDomains.length < MAX_LEARNED_DOMAINS - 1) {
      const updatedFactions = new Map(learnResult.state.factions);
      updatedFactions.set(newOwnerFactionId, {
        ...victorFaction,
        learnedDomains: [...victorFaction.learnedDomains, loserDomain],
      });
      currentState = { ...learnResult.state, factions: updatedFactions };
    } else {
      currentState = learnResult.state;
    }
  } else {
    currentState = learnResult.state;
  }

  return {
    state: currentState,
    learnedDomain: learnResult.learned
      ? { unitId: learnResult.unitId!, domainId: learnResult.domainId!, fromFactionId: learnResult.fromFactionId! }
      : undefined,
  };
}
