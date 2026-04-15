// MVP map generation

import type { GameMap, TerrainType } from '../map/types.js';
import type { RNGState } from '../../core/rng.js';
import { createMap } from '../map/createMap.js';
import { hexToKey, hexDistance, getNeighbors } from '../../core/grid.js';
import { rngChance, rngNextFloat } from '../../core/rng.js';

/**
 * Generate an MVP map with random terrain distribution plus deterministic river corridors.
 */
export function generateMvpMap(
  rng: RNGState,
  width = 40,
  height = 30
): GameMap {
  const map = createMap(width, height);

  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      const key = hexToKey({ q, r });
      const tile = map.tiles.get(key);

      if (tile) {
        tile.terrain = pickTerrain(rng);
      }
    }
  }

  carveRivers(map, rng);
  carveJungles(map, rng);
  carveSwamps(map, rng);
  ensureJungleNearStart(map, { q: 6, r: 27 }, 1);

  carveHills(map, rng);
  ensureHillsNearStart(map, { q: 6, r: 15 }, 2);

  carveMountains(map, rng);

  carveSavannahs(map, rng);
  ensureSavannahNearStart(map, { q: 20, r: 27 }, 1);

  ensureRiverNearStart(map, { q: 34, r: 3 }, 2);
  ensureCoastNearStart(map, { q: 34, r: 15 }, 2);

  carveOceanBorder(map);

  return map;
}

function pickTerrain(rng: RNGState): TerrainType {
  const r = rngNextFloat(rng);
  if (r < 0.02) return 'swamp';
  if (r < 0.04) return 'jungle';
  if (r < 0.11) return 'tundra';
  if (r < 0.24) return 'desert';
  if (r < 0.39) return 'hill';
  if (r < 0.51) return 'forest';
  if (r < 0.66) return 'savannah';
  if (r < 0.79) return 'plains';
  return 'coast';
}

function carveRivers(map: GameMap, rng: RNGState): void {
  const riverCount = 1;

  for (let i = 0; i < riverCount; i++) {
    let q = Math.floor((i + 1) * map.width / (riverCount + 1));

    for (let r = 0; r < map.height; r++) {
      const tile = map.tiles.get(hexToKey({ q, r }));
      if (tile) {
        tile.terrain = 'river';
      }

      const drift = rngNextFloat(rng);
      if (drift < 0.3 && q > 1) {
        q -= 1;
      } else if (drift > 0.7 && q < map.width - 2) {
        q += 1;
      }
    }
  }
}

function carveJungles(map: GameMap, rng: RNGState): void {
  const clusterCount = Math.max(1, Math.floor(map.width * map.height / 500));

  for (let i = 0; i < clusterCount; i++) {
    const centerQ = Math.floor(rngNextFloat(rng) * map.width);
    const centerR = Math.floor(rngNextFloat(rng) * map.height);
    const radius = 1 + Math.floor(rngNextFloat(rng) * 1);

    for (let q = Math.max(0, centerQ - radius); q <= Math.min(map.width - 1, centerQ + radius); q++) {
      for (let r = Math.max(0, centerR - radius); r <= Math.min(map.height - 1, centerR + radius); r++) {
        const distance = Math.abs(q - centerQ) + Math.abs(r - centerR);
        if (distance > radius + 1) {
          continue;
        }

        const key = hexToKey({ q, r });
        const tile = map.tiles.get(key);
        if (!tile) {
          continue;
        }

        if (tile.terrain === 'river' || tile.terrain === 'coast') {
          continue;
        }

        if (distance <= radius || rngNextFloat(rng) > 0.6) {
          tile.terrain = 'jungle';
        }
      }
    }
  }
}

function carveSwamps(map: GameMap, rng: RNGState): void {
  const clusterCount = Math.max(1, Math.floor(map.width * map.height / 350));

  for (let i = 0; i < clusterCount; i++) {
    const centerQ = Math.floor(rngNextFloat(rng) * map.width);
    const centerR = Math.floor(rngNextFloat(rng) * map.height);
    const radius = 1 + Math.floor(rngNextFloat(rng) * 1);

    for (let q = Math.max(0, centerQ - radius); q <= Math.min(map.width - 1, centerQ + radius); q++) {
      for (let r = Math.max(0, centerR - radius); r <= Math.min(map.height - 1, centerR + radius); r++) {
        const distance = Math.abs(q - centerQ) + Math.abs(r - centerR);
        if (distance > radius + 1) continue;
        const key = hexToKey({ q, r });
        const tile = map.tiles.get(key);
        if (!tile) continue;
        if (tile.terrain === 'river' || tile.terrain === 'coast' || tile.terrain === 'ocean' || tile.terrain === 'mountain') continue;
        if (tile.terrain === 'swamp') continue;
        if (distance <= radius || rngNextFloat(rng) > 0.6) {
          tile.terrain = 'swamp';
        }
      }
    }
  }
}

/**
 * Guarantee at least one jungle cluster near a faction's start position.
 * If no jungle tile exists within `radius` of `startHex`, stamp a small cluster there.
 */
function ensureJungleNearStart(
  map: GameMap,
  startHex: { q: number; r: number },
  radius: number
): void {
  // Check if any jungle tile already exists within radius of start
  let hasJungleNearby = false;
  for (const [, tile] of map.tiles) {
    if (tile.terrain === 'jungle') {
      const dist = hexDistance(startHex, tile.position);
      if (dist <= radius) {
        hasJungleNearby = true;
        break;
      }
    }
  }

  if (hasJungleNearby) return;

  // No jungle nearby — find the best center for a cluster (start hex or an adjacent one)
  const candidates = [
    startHex,
    ...getNeighbors(startHex),
  ];

  for (const center of candidates) {
    const key = hexToKey(center);
    const tile = map.tiles.get(key);
    if (!tile) continue;

    // Prefer non-river, non-coast tiles for the cluster center
    if (tile.terrain !== 'river' && tile.terrain !== 'coast') {
      // Stamp a small jungle cluster (radius 1) around this center
      for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nq = center.q + dq;
          const nr = center.r + dr;
          const nkey = hexToKey({ q: nq, r: nr });
          const ntile = map.tiles.get(nkey);
          if (!ntile) continue;
          if (ntile.terrain === 'river' || ntile.terrain === 'coast' || ntile.terrain === 'ocean') continue;
          ntile.terrain = 'jungle';
        }
      }
      return;
    }
  }

  // Fallback: force the start tile itself to jungle even if river/coast
  const startKey = hexToKey(startHex);
  const startTile = map.tiles.get(startKey);
  if (startTile) {
    startTile.terrain = 'jungle';
  }
}

function carveSavannahs(map: GameMap, rng: RNGState): void {
  const clusterCount = Math.max(1, Math.floor(map.width * map.height / 400));

  for (let i = 0; i < clusterCount; i++) {
    const centerQ = Math.floor(rngNextFloat(rng) * map.width);
    const centerR = Math.floor(rngNextFloat(rng) * map.height);
    const radius = 1 + Math.floor(rngNextFloat(rng) * 1);

    for (let q = Math.max(0, centerQ - radius); q <= Math.min(map.width - 1, centerQ + radius); q++) {
      for (let r = Math.max(0, centerR - radius); r <= Math.min(map.height - 1, centerR + radius); r++) {
        const distance = Math.abs(q - centerQ) + Math.abs(r - centerR);
        if (distance > radius + 1) continue;
        const key = hexToKey({ q, r });
        const tile = map.tiles.get(key);
        if (!tile) continue;
        if (tile.terrain === 'river' || tile.terrain === 'coast' || tile.terrain === 'ocean' || tile.terrain === 'mountain') continue;
        if (distance <= radius || rngNextFloat(rng) > 0.6) {
          tile.terrain = 'savannah';
        }
      }
    }
  }
}

function carveHills(map: GameMap, rng: RNGState): void {
  const clusterCount = Math.max(1, Math.floor(map.width * map.height / 180));

  for (let i = 0; i < clusterCount; i++) {
    const centerQ = Math.floor(rngNextFloat(rng) * map.width);
    const centerR = Math.floor(rngNextFloat(rng) * map.height);
    const radius = 2 + Math.floor(rngNextFloat(rng) * 2);

    for (let q = Math.max(0, centerQ - radius); q <= Math.min(map.width - 1, centerQ + radius); q++) {
      for (let r = Math.max(0, centerR - radius); r <= Math.min(map.height - 1, centerR + radius); r++) {
        const distance = Math.abs(q - centerQ) + Math.abs(r - centerR);
        if (distance > radius + 1) continue;
        const key = hexToKey({ q, r });
        const tile = map.tiles.get(key);
        if (!tile) continue;
        if (tile.terrain === 'river' || tile.terrain === 'coast' || tile.terrain === 'ocean' || tile.terrain === 'mountain') continue;
        if (distance <= radius || rngNextFloat(rng) > 0.45) {
          tile.terrain = 'hill';
        }
      }
    }
  }
}

/**
 * Carve mountain clusters — rare, small, impassable terrain.
 * Avoids water tiles and start positions.
 */
function carveMountains(map: GameMap, rng: RNGState): void {
  const clusterCount = Math.max(1, Math.floor(map.width * map.height / 600));

  for (let i = 0; i < clusterCount; i++) {
    const centerQ = Math.floor(rngNextFloat(rng) * map.width);
    const centerR = Math.floor(rngNextFloat(rng) * map.height);
    const radius = 1 + Math.floor(rngNextFloat(rng) * 1);

    for (let q = Math.max(0, centerQ - radius); q <= Math.min(map.width - 1, centerQ + radius); q++) {
      for (let r = Math.max(0, centerR - radius); r <= Math.min(map.height - 1, centerR + radius); r++) {
        const distance = Math.abs(q - centerQ) + Math.abs(r - centerR);
        if (distance > radius + 1) continue;
        const key = hexToKey({ q, r });
        const tile = map.tiles.get(key);
        if (!tile) continue;
        if (tile.terrain === 'river' || tile.terrain === 'coast' || tile.terrain === 'ocean' || tile.terrain === 'swamp' || tile.terrain === 'mountain') continue;
        // Don't place mountains near known start positions
        const nearStart =
          (q >= 4 && q <= 8 && r >= 13 && r <= 17) ||
          (q >= 32 && q <= 36 && r >= 1 && r <= 5) ||
          (q >= 18 && q <= 22 && r >= 25 && r <= 29);
        if (nearStart) continue;
        if (distance <= radius || rngNextFloat(rng) > 0.5) {
          tile.terrain = 'mountain';
        }
      }
    }
  }
}

/**
 * Guarantee at least one hill cluster near a faction's start position.
 */
function ensureHillsNearStart(
  map: GameMap,
  startHex: { q: number; r: number },
  radius: number
): void {
  let hasHillNearby = false;
  for (const [, tile] of map.tiles) {
    if (tile.terrain === 'hill') {
      const dist = hexDistance(startHex, tile.position);
      if (dist <= radius) {
        hasHillNearby = true;
        break;
      }
    }
  }

  if (hasHillNearby) return;

  const candidates = [startHex, ...getNeighbors(startHex)];

  for (const center of candidates) {
    const key = hexToKey(center);
    const tile = map.tiles.get(key);
    if (!tile) continue;
    if (tile.terrain !== 'river' && tile.terrain !== 'coast') {
      for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nq = center.q + dq;
          const nr = center.r + dr;
          const nkey = hexToKey({ q: nq, r: nr });
          const ntile = map.tiles.get(nkey);
          if (!ntile) continue;
          if (ntile.terrain === 'river' || ntile.terrain === 'coast' || ntile.terrain === 'ocean') continue;
          ntile.terrain = 'hill';
        }
      }
      return;
    }
  }

  const startKey = hexToKey(startHex);
  const startTile = map.tiles.get(startKey);
  if (startTile) {
    startTile.terrain = 'hill';
  }
}

/**
 * Guarantee at least one savannah cluster near a faction's start position.
 * If no savannah tile exists within `radius` of `startHex`, stamp a small cluster there.
 */
function ensureSavannahNearStart(
  map: GameMap,
  startHex: { q: number; r: number },
  radius: number
): void {
  let hasSavannahNearby = false;
  for (const [, tile] of map.tiles) {
    if (tile.terrain === 'savannah') {
      const dist = hexDistance(startHex, tile.position);
      if (dist <= radius) {
        hasSavannahNearby = true;
        break;
      }
    }
  }

  if (hasSavannahNearby) return;

  const candidates = [
    startHex,
    ...getNeighbors(startHex),
  ];

  for (const center of candidates) {
    const key = hexToKey(center);
    const tile = map.tiles.get(key);
    if (!tile) continue;

    if (tile.terrain !== 'river' && tile.terrain !== 'coast') {
      for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nq = center.q + dq;
          const nr = center.r + dr;
          const nkey = hexToKey({ q: nq, r: nr });
          const ntile = map.tiles.get(nkey);
          if (!ntile) continue;
          if (ntile.terrain === 'river' || ntile.terrain === 'coast' || ntile.terrain === 'ocean') continue;
          ntile.terrain = 'savannah';
        }
      }
      return;
    }
  }

  const startKey = hexToKey(startHex);
  const startTile = map.tiles.get(startKey);
  if (startTile) {
    startTile.terrain = 'savannah';
  }
}

/**
 * Guarantee at least one river tile near a faction's start position.
 * If no river tile exists within `radius` of `startHex`, carve a vertical
 * river strip (5 hexes: r-2 to r+2) through the start position's q column,
 * preserving existing coast tiles.
 */
function ensureRiverNearStart(
  map: GameMap,
  startHex: { q: number; r: number },
  radius: number
): void {
  let hasRiverNearby = false;
  for (const [, tile] of map.tiles) {
    if (tile.terrain === 'river') {
      const dist = hexDistance(startHex, tile.position);
      if (dist <= radius) {
        hasRiverNearby = true;
        break;
      }
    }
  }

  if (hasRiverNearby) return;

  // Carve a 5-hex vertical river strip through the start column
  for (let dr = -2; dr <= 2; dr++) {
    const nr = startHex.r + dr;
    const key = hexToKey({ q: startHex.q, r: nr });
    const tile = map.tiles.get(key);
    if (!tile) continue;
    if (tile.terrain === 'coast' || tile.terrain === 'ocean') continue; // preserve water
    tile.terrain = 'river';
  }
}

/**
 * Guarantee at least one coast tile near a faction's start position.
 * If no coast tile exists within `radius` of `startHex`, stamp a small
 * coast cluster around the start position.
 */
function ensureCoastNearStart(
  map: GameMap,
  startHex: { q: number; r: number },
  radius: number
): void {
  let hasCoastNearby = false;
  for (const [, tile] of map.tiles) {
    if (tile.terrain === 'coast') {
      const dist = hexDistance(startHex, tile.position);
      if (dist <= radius) {
        hasCoastNearby = true;
        break;
      }
    }
  }

  if (hasCoastNearby) return;

  // Stamp coast in a small ring around the start position (preserve the center hex)
  for (const neighbor of getNeighbors(startHex)) {
    const key = hexToKey(neighbor);
    const tile = map.tiles.get(key);
    if (!tile) continue;
    if (tile.terrain === 'river' || tile.terrain === 'ocean') continue; // preserve water
    tile.terrain = 'coast';
  }
}

/**
 * Carve a 1-hex ocean border around the entire map perimeter.
 * Ocean is impassable to land units — creates a naval highway for naval frames.
 * Runs after all other carving so it takes priority at map edges.
 */
function carveOceanBorder(map: GameMap): void {
  for (let q = 0; q < map.width; q++) {
    for (let r = 0; r < map.height; r++) {
      const edgeDistance = Math.min(q, r, map.width - 1 - q, map.height - 1 - r);
      if (edgeDistance === 0) {
        const key = hexToKey({ q, r });
        const tile = map.tiles.get(key);
        if (tile) {
          tile.terrain = 'ocean';
        }
      }
    }
  }
}
