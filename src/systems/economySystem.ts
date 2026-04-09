// Economy System - Resource income calculation for war-civ-2
// Derives production and supply income from territory, cities, and villages

import type { GameState } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import type { FactionEconomy } from '../features/economy/types.js';
import { createFactionEconomy } from '../features/economy/types.js';
import { getHexesInRange, hexToKey } from '../core/grid.js';
import { calculateTerritoryYield } from './territorySystem.js';
import { calculateProductionPenalty } from './warExhaustionSystem.js';
import { getEconomyProductionBonus, getEconomySupplyBonus } from './factionIdentitySystem.js';
import { getFactionCityIds, getFactionVillageIds } from './factionOwnershipSystem.js';
import { getFactionProjectedSupplyDemand } from './productionSystem.js';
import { getCitySiteBonuses } from './citySiteSystem.js';

// Base city production income per turn
const CITY_BASE_PRODUCTION = 2;
// Base city supply income per turn
const CITY_BASE_SUPPLY = 3;
// Captured city ramp: turns of zero output after capture
const CAPTURE_RAMP_TURNS = 5;

/**
 * Get the capture ramp multiplier for a city.
 * 0 during CAPTURE_RAMP_TURNS after capture, then +1 each turn until reaching 1.0.
 */
export function getCaptureRampMultiplier(turnsSinceCapture: number | undefined): number {
  if (turnsSinceCapture === undefined || turnsSinceCapture === null) return 1;
  if (turnsSinceCapture <= CAPTURE_RAMP_TURNS) return 0;
  const rampTurn = turnsSinceCapture - CAPTURE_RAMP_TURNS;
  return Math.min(1, rampTurn / CAPTURE_RAMP_TURNS);
}

/**
 * Increment turnsSinceCapture for all captured cities of a faction.
 * Call once per turn before deriving resource income.
 */
export function advanceCaptureTimers(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const cities = new Map(state.cities);
  let changed = false;
  for (const cityId of faction.cityIds) {
    const city = cities.get(cityId);
    if (!city || city.turnsSinceCapture === undefined) continue;
    cities.set(cityId, { ...city, turnsSinceCapture: city.turnsSinceCapture + 1 });
    changed = true;
  }
  return changed ? { ...state, cities } : state;
}
/**
 * Derive resource income for a faction based on:
 * - City base income (flat per city)
 * - Village production bonus (+1 per village)
 * - Terrain yields from hexes within radius 2 of each city
 * - Territory supply bonus (from territorySystem)
 * - War exhaustion production penalty
 */
export function deriveResourceIncome(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry
): FactionEconomy {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return createFactionEconomy(factionId);
  }

  const economy = createFactionEconomy(factionId);
  const map = state.map;
  if (!map) {
    return economy;
  }

  // Track claimed hexes to avoid double-counting
  const claimedHexes = new Set<string>();

  // City base income + terrain yields
  for (const cityId of getFactionCityIds(state, factionId)) {
    const city = state.cities.get(cityId);
    if (!city) continue;

    // Besieged cities produce nothing
    if (city.besieged) {
      continue;
    }

    // Captured city ramp-up
    const ramp = getCaptureRampMultiplier(city.turnsSinceCapture);

    // Flat city income
    economy.productionPool += CITY_BASE_PRODUCTION * ramp;
    economy.supplyIncome += CITY_BASE_SUPPLY * ramp;
    const siteBonuses = getCitySiteBonuses(city, map);
    economy.productionPool += siteBonuses.productionBonus * ramp;
    economy.supplyIncome += siteBonuses.supplyBonus * ramp;

    // Territory yields: hexes within radius 2 of city (also scaled by ramp)
    if (ramp > 0) {
      const hexesInRange = getHexesInRange(city.position, 2);
      for (const hex of hexesInRange) {
        const key = hexToKey(hex);
        if (claimedHexes.has(key)) continue;
        claimedHexes.add(key);

        const tile = map.tiles.get(key);
        if (!tile) continue;

        const terrainYield = registry.getTerrainYield(tile.terrain);
        if (terrainYield) {
          economy.productionPool += terrainYield.productionYield + getEconomyProductionBonus(faction, tile.terrain);
          economy.supplyIncome += getEconomySupplyBonus(faction, tile.terrain);
        }
      }
    }
  }

  // Village production bonus
  for (const villageId of getFactionVillageIds(state, factionId)) {
    const village = state.villages.get(villageId);
    if (!village) continue;
    economy.productionPool += village.productionBonus;
    economy.supplyIncome += village.supplyBonus;
  }

  // Territory supply bonus
  const territorySupply = calculateTerritoryYield(factionId, state);
  economy.supplyIncome += territorySupply;

  // Supply demand is derived from per-prototype logistical cost.
  economy.supplyDemand = getFactionProjectedSupplyDemand(state, factionId, registry);

  // War exhaustion production penalty
  const we = state.warExhaustion.get(factionId);
  if (we && we.exhaustionPoints > 0) {
    const penalty = calculateProductionPenalty(we.exhaustionPoints);
    economy.productionPool *= (1 - penalty);
  }

  // Round production to avoid floating point drift
  economy.productionPool = Number(economy.productionPool.toFixed(2));
  economy.supplyIncome = Number(economy.supplyIncome.toFixed(2));
  economy.supplyDemand = Number(economy.supplyDemand.toFixed(2));

  return economy;
}

/**
 * Check if a faction has a supply deficit.
 * Returns the deficit amount (0 if supply is sufficient).
 */
export function getSupplyDeficit(economy: FactionEconomy): number {
  return Math.max(0, economy.supplyDemand - economy.supplyIncome);
}
