// src/systems/villageSystem.ts

import type { GameState, City } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId, VillageId, HexCoord, CityId } from '../types.js';
import type { Village } from '../features/villages/types.js';
import { createVillageId } from '../core/ids.js';
import { getHexesInRange, hexToKey } from '../core/grid.js';
import { rngShuffle } from '../core/rng.js';
import { isHexOccupied } from './occupancySystem.js';
import {
  getFactionCityIds,
  getFactionVillageCount,
  syncFactionSettlementIds,
} from './factionOwnershipSystem.js';
import { getCitySiteBonuses, getSettlementOccupancyBlocker } from './citySiteSystem.js';

const BASE_VILLAGE_SPAWN_GAP = 4;
const VILLAGES_PER_CITY_CAP = 6;

export type VillageSpawnReadiness = {
  eligible: boolean;
  cityExists: boolean;
  cooldownMet: boolean;
  validSpawnHex: boolean;
  villageCapMet: boolean;
  latestVillageRound: number | null;
  roundsUntilCooldownReady: number;
};

function getVillageSpawnInterval(state: GameState, city: City): number {
  return Math.max(1, BASE_VILLAGE_SPAWN_GAP - getCitySiteBonuses(city, state.map).villageCooldownReduction);
}

/**
 * Count villages within a city's territory radius belonging to the same faction.
 */
export function countVillagesInCityTerritory(state: GameState, city: City): number {
  const hexes = getHexesInRange(city.position, city.territoryRadius);
  const hexSet = new Set(hexes.map(h => `${h.q},${h.r}`));
  let count = 0;
  for (const village of state.villages.values()) {
    if (village.factionId === city.factionId && hexSet.has(`${village.position.q},${village.position.r}`)) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a city can currently spawn a village inside its territory.
 */
export function canSpawnVillage(
  state: GameState,
  cityId: CityId,
  registry?: RulesRegistry,
): boolean {
  return getVillageSpawnReadiness(state, cityId, registry).eligible;
}

export function getVillageSpawnReadiness(
  state: GameState,
  cityId: CityId,
  registry?: RulesRegistry,
): VillageSpawnReadiness {
  const city = state.cities.get(cityId);
  if (!city) {
    return {
      eligible: false,
      cityExists: false,
      cooldownMet: false,
      validSpawnHex: false,
      villageCapMet: false,
      latestVillageRound: null,
      roundsUntilCooldownReady: 0,
    };
  }

  const latestVillageRound = city.lastVillageSpawnRound ?? null;
  const requiredCooldownGap = getVillageSpawnInterval(state, city);
  const roundsSinceLastSpawn = latestVillageRound === null ? state.round : state.round - latestVillageRound;
  const cooldownMet = roundsSinceLastSpawn >= requiredCooldownGap;
  const validSpawnHex = registry ? findVillageSpawnHexForCity(state, city, registry) !== null : false;
  const villageCount = countVillagesInCityTerritory(state, city);
  const villageCapMet = villageCount < VILLAGES_PER_CITY_CAP;

  return {
    eligible: cooldownMet && validSpawnHex && villageCapMet,
    cityExists: true,
    cooldownMet,
    validSpawnHex,
    villageCapMet,
    latestVillageRound,
    roundsUntilCooldownReady: cooldownMet ? 0 : Math.max(0, requiredCooldownGap - roundsSinceLastSpawn),
  };
}

/**
 * Find a valid random hex to spawn a village within a city's territory radius.
 */
export function findVillageSpawnHexForCity(
  state: GameState,
  city: City,
  registry: RulesRegistry,
): HexCoord | null {
  const candidateHexes = rngShuffle(
    state.rngState,
    getHexesInRange(city.position, city.territoryRadius).filter(
      (hex) => hex.q !== city.position.q || hex.r !== city.position.r,
    ),
  );

  for (const hex of candidateHexes) {
    if (isValidSpawnHex(state, hex, registry)) {
      return hex;
    }
  }

  return null;
}

function isValidSpawnHex(
  state: GameState,
  hex: HexCoord,
  registry: RulesRegistry,
): boolean {
  if (!state.map) return false;

  const tile = state.map.tiles.get(hexToKey(hex));
  if (!tile) return false;

  const terrainDef = registry.getTerrain(tile.terrain);
  if (terrainDef && terrainDef.passable === false) {
    return false;
  }

  if (isHexOccupied(state, hex)) {
    return false;
  }

  if (getSettlementOccupancyBlocker(state, hex)) {
    return false;
  }

  return true;
}

/**
 * Spawn a village at the given position.
 */
export function spawnVillage(
  state: GameState,
  factionId: FactionId,
  position: HexCoord,
  _registry: RulesRegistry,
  sourceCityId?: CityId,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const villageId = createVillageId();
  const village: Village = {
    id: villageId,
    factionId,
    position,
    name: `${faction.name} Outpost`,
    foundedRound: state.round,
    productionBonus: 1,
    supplyBonus: 1,
  };

  const newVillages = new Map(state.villages);
  newVillages.set(villageId, village);

  const newFaction = {
    ...faction,
    villageIds: [...faction.villageIds, villageId],
  };
  const newFactions = new Map(state.factions);
  newFactions.set(factionId, newFaction);

  const newCities = new Map(state.cities);
  if (sourceCityId) {
    const sourceCity = state.cities.get(sourceCityId);
    if (sourceCity) {
      newCities.set(sourceCityId, {
        ...sourceCity,
        lastVillageSpawnRound: state.round,
      });
    }
  }

  return syncFactionSettlementIds({
    ...state,
    villages: newVillages,
    factions: newFactions,
    cities: newCities,
  }, factionId);
}

/**
 * Evaluate all faction cities and spawn any villages that are due.
 */
export function evaluateAndSpawnVillage(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
): GameState {
  let current = state;

  for (const cityId of getFactionCityIds(current, factionId)) {
    if (!canSpawnVillage(current, cityId, registry)) {
      continue;
    }

    const city = current.cities.get(cityId);
    if (!city) {
      continue;
    }

    const position = findVillageSpawnHexForCity(current, city, registry);
    if (!position) {
      continue;
    }

    current = spawnVillage(current, factionId, position, registry, cityId);
  }

  return current;
}

/**
 * Get the number of villages belonging to a faction.
 */
export function getVillageCount(state: GameState, factionId: FactionId): number {
  return getFactionVillageCount(state, factionId);
}

export function getVillageSpawnReadinessWithRegistry(
  state: GameState,
  cityId: CityId,
  registry: RulesRegistry,
): VillageSpawnReadiness {
  return getVillageSpawnReadiness(state, cityId, registry);
}

/**
 * Destroy a village.
 */
export function destroyVillage(state: GameState, villageId: VillageId): GameState {
  const village = state.villages.get(villageId);
  if (!village) return state;

  const factionId = village.factionId;
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const newVillages = new Map(state.villages);
  newVillages.delete(villageId);

  const newFaction = {
    ...faction,
    villageIds: faction.villageIds.filter((id) => id !== villageId),
  };
  const newFactions = new Map(state.factions);
  newFactions.set(factionId, newFaction);

  return syncFactionSettlementIds({
    ...state,
    villages: newVillages,
    factions: newFactions,
  }, factionId);
}

/**
 * Destroy all villages within a city's territory radius.
 * Used when a city is razed to clean up its supporting villages.
 */
export function destroyVillagesInCityTerritory(state: GameState, city: City): GameState {
  const hexes = getHexesInRange(city.position, city.territoryRadius);
  const hexSet = new Set(hexes.map(h => `${h.q},${h.r}`));
  const toDestroy: VillageId[] = [];
  for (const village of state.villages.values()) {
    if (hexSet.has(`${village.position.q},${village.position.r}`)) {
      toDestroy.push(village.id);
    }
  }
  let result = state;
  for (const villageId of toDestroy) {
    result = destroyVillage(result, villageId);
  }
  return result;
}
