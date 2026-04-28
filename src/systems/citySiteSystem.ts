import { hexDistance, getHexesInRange, hexToKey } from '../core/grid.js';
import { keyToHex } from '../core/hex.js';
import type { CitySiteBonuses, CitySiteTrait } from '../features/cities/types.js';
import type { City, GameState } from '../game/types.js';
import type { FactionId, HexCoord } from '../types.js';
import type { GameMap, TerrainType } from '../world/map/types.js';
import { getFactionCityIds } from './factionOwnershipSystem.js';

const FRESH_WATER_TERRAINS = new Set<TerrainType>(['river']);
const OASIS_TERRAINS = new Set<TerrainType>(['oasis']);
const WOODLAND_TERRAINS = new Set<TerrainType>(['forest', 'jungle']);
const OPEN_LAND_TERRAINS = new Set<TerrainType>(['plains', 'savannah']);

export const CITY_SITE_PRODUCTION_BONUS = 0.5;
export const CITY_SITE_SUPPLY_BONUS = 0.5;
export const CITY_SITE_VILLAGE_COOLDOWN_REDUCTION = 1;
export const CITY_SITE_RESEARCH_BONUS = 2;

export type SettlementOccupancyBlocker = 'city' | 'village' | 'improvement' | null;

export const EMPTY_CITY_SITE_BONUSES: CitySiteBonuses = {
  productionBonus: 0,
  supplyBonus: 0,
  villageCooldownReduction: 0,
  researchBonus: 0,
  traits: [
    { key: 'fresh_water', label: 'Fresh Water', effect: 'Village growth: 1 every 3 turns (was 1 every 4)', active: false, count: 0 },
    { key: 'oasis', label: 'Oasis', effect: 'Village growth: 1 every 3 turns, +2 camel research', active: false, count: 0 },
    { key: 'woodland', label: 'Woodland', effect: '+0.5 production', active: false, count: 0 },
    { key: 'open_land', label: 'Open Land', effect: '+0.5 supply', active: false, count: 0 },
  ],
};

export function evaluateCitySiteBonuses(
  map: GameMap | undefined,
  position: HexCoord,
  territoryRadius = 2,
): CitySiteBonuses {
  if (!map) {
    return cloneCitySiteBonuses(EMPTY_CITY_SITE_BONUSES);
  }

  const freshWaterCount = countTerrainsInRange(map, position, territoryRadius, FRESH_WATER_TERRAINS);
  const oasisCount = countTerrainsInRange(map, position, territoryRadius, OASIS_TERRAINS);
  const woodlandCount = countTerrainsInRange(map, position, territoryRadius, WOODLAND_TERRAINS);
  const openLandCount = countTerrainsInRange(map, position, territoryRadius, OPEN_LAND_TERRAINS);

  const hasRiver = freshWaterCount > 0;
  const hasOasis = oasisCount > 0;
  const hasWaterBonus = hasRiver || hasOasis;

  const traits: CitySiteTrait[] = [
    {
      key: 'fresh_water',
      label: 'Fresh Water',
      effect: 'Village growth: 1 every 3 turns (was 1 every 4)',
      active: hasRiver && !hasOasis,
      count: freshWaterCount,
    },
    {
      key: 'oasis',
      label: 'Oasis',
      effect: 'Village growth: 1 every 3 turns, +2 camel research',
      active: hasOasis,
      count: oasisCount,
    },
    {
      key: 'woodland',
      label: 'Woodland',
      effect: `+${CITY_SITE_PRODUCTION_BONUS} production`,
      active: woodlandCount > 0,
      count: woodlandCount,
    },
    {
      key: 'open_land',
      label: 'Open Land',
      effect: `+${CITY_SITE_SUPPLY_BONUS} supply`,
      active: openLandCount > 0,
      count: openLandCount,
    },
  ];

  return {
    productionBonus: woodlandCount > 0 ? CITY_SITE_PRODUCTION_BONUS : 0,
    supplyBonus: openLandCount > 0 ? CITY_SITE_SUPPLY_BONUS : 0,
    villageCooldownReduction: hasWaterBonus ? CITY_SITE_VILLAGE_COOLDOWN_REDUCTION : 0,
    researchBonus: hasOasis ? CITY_SITE_RESEARCH_BONUS : 0,
    traits,
  };
}

export function getCitySiteBonuses(
  city: Pick<City, 'position' | 'territoryRadius' | 'siteBonuses'>,
  map: GameMap | undefined,
): CitySiteBonuses {
  return city.siteBonuses
    ? cloneCitySiteBonuses(city.siteBonuses)
    : evaluateCitySiteBonuses(map, city.position, city.territoryRadius ?? 2);
}

export function createCitySiteBonuses(
  map: GameMap | undefined,
  position: HexCoord,
  territoryRadius = 2,
): CitySiteBonuses {
  return evaluateCitySiteBonuses(map, position, territoryRadius);
}

export function getFactionVillageCooldownReduction(
  state: GameState,
  factionId: FactionId,
): number {
  const map = state.map;
  for (const cityId of getFactionCityIds(state, factionId)) {
    const city = state.cities.get(cityId);
    if (!city) continue;
    if (getCitySiteBonuses(city, map).villageCooldownReduction > 0) {
      return CITY_SITE_VILLAGE_COOLDOWN_REDUCTION;
    }
  }

  return 0;
}

export function getSettlementOccupancyBlocker(
  state: GameState,
  position: HexCoord,
): SettlementOccupancyBlocker {
  for (const city of state.cities.values()) {
    if (city.position.q === position.q && city.position.r === position.r) {
      return 'city';
    }
  }

  for (const village of state.villages.values()) {
    if (village.position.q === position.q && village.position.r === position.r) {
      return 'village';
    }
  }

  for (const improvement of state.improvements.values()) {
    if (improvement.position.q === position.q && improvement.position.r === position.r) {
      return 'improvement';
    }
  }

  return null;
}

export function formatSettlementOccupancyBlocker(
  blocker: SettlementOccupancyBlocker,
): string | undefined {
  switch (blocker) {
    case 'city':
      return 'Blocked by an existing city.';
    case 'village':
      return 'Blocked by an existing village.';
    case 'improvement':
      return 'Blocked by an existing improvement.';
    default:
      return undefined;
  }
}

/**
 * Find the best hex on the map for a faction to found a new city.
 * Scores by terrain bonuses, distance from existing settlements (both friendly and enemy),
 * and proximity to the settler's current position.
 */
export function findBestCitySiteForFaction(
  state: GameState,
  factionId: FactionId,
  settlerPosition: HexCoord,
  options: { maxCandidateDistance?: number } = {},
): HexCoord | null {
  const map = state.map;
  if (!map) return null;

  const maxDist = options.maxCandidateDistance ?? 20;

  // Collect positions of all existing cities (friendly + enemy) for spacing
  const allCityPositions: HexCoord[] = [];
  const friendlyCityPositions: HexCoord[] = [];
  for (const city of state.cities.values()) {
    allCityPositions.push(city.position);
    if (city.factionId === factionId) {
      friendlyCityPositions.push(city.position);
    }
  }

  // Collect positions of all villages for spacing
  const villagePositions: HexCoord[] = [];
  for (const village of state.villages.values()) {
    villagePositions.push(village.position);
  }

  let bestHex: HexCoord | null = null;
  let bestScore = -Infinity;

  for (const [key, tile] of map.tiles) {
    const hex = keyToHex(key);

    // Skip impassable terrain
    if (tile.terrain === 'mountain' || tile.terrain === 'ocean') {
      continue;
    }

    // Must not be too far from the settler
    const distFromSettler = hexDistance(settlerPosition, hex);
    if (distFromSettler > maxDist) continue;

    // Must not overlap existing settlement
    if (getSettlementOccupancyBlocker(state, hex) !== null) continue;

    // Must be at least 3 hexes from any existing city (minimum spacing)
    let tooClose = false;
    for (const cityPos of allCityPositions) {
      if (hexDistance(hex, cityPos) < 3) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Must be at least 2 hexes from any village
    for (const villagePos of villagePositions) {
      if (hexDistance(hex, villagePos) < 2) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Score the hex
    const bonuses = evaluateCitySiteBonuses(map, hex, 2);
    let score = 0;

    // Terrain bonus score
    score += bonuses.productionBonus * 10;
    score += bonuses.supplyBonus * 8;
    score += bonuses.villageCooldownReduction * 6;

    // Prefer distance from settler (closer is better)
    score -= distFromSettler * 0.5;

    // Prefer moderate distance from friendly cities (spread out but not isolated)
    let minFriendlyCityDist = Infinity;
    for (const fcp of friendlyCityPositions) {
      minFriendlyCityDist = Math.min(minFriendlyCityDist, hexDistance(hex, fcp));
    }
    if (friendlyCityPositions.length === 0) minFriendlyCityDist = 0;
    // Sweet spot around 5-8 hexes from existing friendly city
    if (minFriendlyCityDist >= 4 && minFriendlyCityDist <= 8) {
      score += 5;
    } else if (minFriendlyCityDist < 4) {
      score -= 3;
    }

    // Slight penalty for being very close to enemy cities
    for (const ecp of allCityPositions) {
      const enemyDist = hexDistance(hex, ecp);
      if (enemyDist < 4) {
        score -= (4 - enemyDist) * 3;
      }
    }

    // Prefer coast/river tiles slightly
    if (tile.terrain === 'coast' || tile.terrain === 'river') {
      score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestHex = hex;
    }
  }

  return bestHex;
}

function countTerrainsInRange(
  map: GameMap,
  position: HexCoord,
  territoryRadius: number,
  terrains: Set<TerrainType>,
): number {
  let count = 0;

  for (const hex of getHexesInRange(position, territoryRadius)) {
    const tile = map.tiles.get(hexToKey(hex));
    if (tile && terrains.has(tile.terrain)) {
      count += 1;
    }
  }

  return count;
}

function cloneCitySiteBonuses(bonuses: CitySiteBonuses): CitySiteBonuses {
  return {
    productionBonus: bonuses.productionBonus,
    supplyBonus: bonuses.supplyBonus,
    villageCooldownReduction: bonuses.villageCooldownReduction,
    researchBonus: bonuses.researchBonus,
    traits: bonuses.traits.map((trait) => ({ ...trait })),
  };
}
