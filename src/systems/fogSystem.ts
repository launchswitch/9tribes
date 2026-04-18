// Fog of War System - Manages visibility and last seen snapshots for factions
import type { GameState } from '../game/types.js';
import type { FactionId, HexCoord } from '../types.js';
import type { TerrainType } from '../world/map/types.js';
import { getHexesInRange, hexToKey, keyToHex } from '../core/hex.js';
import { hexDistance } from '../core/grid.js';
import type { Unit } from '../features/units/types.js';
import type { Prototype } from '../features/prototypes/types.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';

// --- Types ---
export type HexVisibility = 'hidden' | 'explored' | 'visible';

export interface LastSeenSnapshot {
  round: number;
  terrain: TerrainType;
  unit?: { factionId: FactionId; prototypeName: string; hp: number; maxHp: number };
  city?: { factionId: FactionId; name: string };
  village?: { factionId: FactionId };
}

export interface FactionFogState {
  hexVisibility: Map<string, HexVisibility>;
  lastSeen: Map<string, LastSeenSnapshot>;
}

// Visibility radii
const UNIT_VISIBILITY_RADIUS = 3;
const CITY_VISIBILITY_RADIUS = 3;
const VILLAGE_VISIBILITY_RADIUS = 2;

/** Extra vision bonus for mounted/scout units */
const MOUNTED_SCOUT_VISIBILITY_BONUS = 1;
const STEALTH_CLOAK_RADIUS = 1;
const STEALTH_REVEAL_RADIUS = 2;

export function isUnitCloakedByRiverStealthAura(
  state: GameState,
  unit: Unit
): boolean {
  if (unit.hp <= 0) return false;

  const faction = state.factions.get(unit.factionId);
  if (!faction) return false;

  const doctrine = resolveResearchDoctrine(state.research.get(unit.factionId), faction);
  if (!doctrine.stealthCloakAuraEnabled) return false;

  for (const sourceId of faction.unitIds) {
    if (sourceId === unit.id) continue;

    const source = state.units.get(sourceId);
    if (!source || source.hp <= 0 || !source.isStealthed) continue;

    const sourcePrototype = state.prototypes.get(source.prototypeId);
    if (!(sourcePrototype?.tags?.includes('stealth') ?? false)) continue;

    if (hexDistance(source.position, unit.position) <= STEALTH_CLOAK_RADIUS) {
      return true;
    }
  }

  return false;
}

export function isUnitEffectivelyStealthed(
  state: GameState,
  unit: Unit
): boolean {
  if (unit.hp <= 0) return false;
  return unit.isStealthed || isUnitCloakedByRiverStealthAura(state, unit);
}

function isRevealedByStealthAura(
  state: GameState,
  factionId: FactionId,
  unit: Unit
): boolean {
  const faction = state.factions.get(factionId);
  if (!faction) return false;

  const doctrine = resolveResearchDoctrine(state.research.get(factionId), faction);
  if (!doctrine.stealthRevealEnabled) return false;

  for (const scoutId of faction.unitIds) {
    const scout = state.units.get(scoutId);
    if (!scout || scout.hp <= 0 || !scout.isStealthed) continue;

    const prototype = state.prototypes.get(scout.prototypeId);
    if (!(prototype?.tags?.includes('stealth') ?? false)) continue;

    if (hexDistance(scout.position, unit.position) <= STEALTH_REVEAL_RADIUS) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate current visibility for a faction.
 * Returns a new FactionFogState with visible hexes set to 'visible',
 * previously explored hexes set to 'explored'.
 * Also updates lastSeen snapshots for hexes transitioning from visible→explored.
 */
export function calculateVisibility(state: GameState, factionId: FactionId): FactionFogState {
  const newVisibleKeys = new Set<string>();
  const faction = state.factions.get(factionId);
  if (!faction) {
    return {
      hexVisibility: new Map(),
      lastSeen: new Map(),
    };
  }

  // 1. Get all living friendly units and add their visibility range
  for (const unitId of faction.unitIds) {
    const unit = state.units.get(unitId);
    if (unit && unit.hp > 0) {
      const prototype = state.prototypes.get(unit.prototypeId);
      const role = prototype?.derivedStats?.role;
      const isMounted = role === 'mounted';
      const radius = UNIT_VISIBILITY_RADIUS + (isMounted ? MOUNTED_SCOUT_VISIBILITY_BONUS : 0);
      const visibleHexes = getHexesInRange(unit.position, radius);
      for (const hex of visibleHexes) {
        newVisibleKeys.add(hexToKey(hex));
      }
    }
  }

  // 2. Get all friendly cities and add their visibility range
  for (const cityId of faction.cityIds) {
    const city = state.cities.get(cityId);
    if (city) {
      const visibleHexes = getHexesInRange(city.position, CITY_VISIBILITY_RADIUS);
      for (const hex of visibleHexes) {
        newVisibleKeys.add(hexToKey(hex));
      }
    }
  }

  // 3. Get all friendly villages and add their visibility range
  for (const villageId of faction.villageIds) {
    const village = state.villages.get(villageId);
    if (village) {
      const visibleHexes = getHexesInRange(village.position, VILLAGE_VISIBILITY_RADIUS);
      for (const hex of visibleHexes) {
        newVisibleKeys.add(hexToKey(hex));
      }
    }
  }

  // 4. Merge with previous fog state
  const previousFogState = state.fogState?.get(factionId);
  const previousVisibility = previousFogState?.hexVisibility ?? new Map();
  const previousLastSeen = previousFogState?.lastSeen ?? new Map();

  const hexVisibility = new Map<string, HexVisibility>();
  const lastSeen = new Map<string, LastSeenSnapshot>(previousLastSeen);

  // Keys in new visible set → 'visible'
  for (const key of newVisibleKeys) {
    hexVisibility.set(key, 'visible');
  }

  // Keys that were 'visible' or 'explored' before → 'explored'
  for (const [key, visibility] of previousVisibility) {
    if (visibility === 'visible' || visibility === 'explored') {
      if (!newVisibleKeys.has(key)) {
        // Transitioning from visible to explored - capture snapshot
        captureLastSeenSnapshot(state, key, lastSeen);
        hexVisibility.set(key, 'explored');
      }
    }
  }

  return {
    hexVisibility,
    lastSeen,
  };
}

/**
 * Capture a last seen snapshot for a hex transitioning from visible to explored
 */
function captureLastSeenSnapshot(
  state: GameState,
  key: string,
  lastSeen: Map<string, LastSeenSnapshot>
): void {
  const hex = keyToHex(key);
  const terrain = state.map?.tiles.get(key)?.terrain ?? 'plains';

  // Check for unit at this position
  for (const unit of state.units.values()) {
    if (unit.position.q === hex.q && unit.position.r === hex.r && unit.hp > 0) {
      const prototype = state.prototypes.get(unit.prototypeId);
      lastSeen.set(key, {
        round: state.round,
        terrain,
        unit: {
          factionId: unit.factionId,
          prototypeName: prototype?.name ?? 'Unknown',
          hp: unit.hp,
          maxHp: unit.maxHp,
        },
      });
      return;
    }
  }

  // Check for city at this position
  for (const city of state.cities.values()) {
    if (city.position.q === hex.q && city.position.r === hex.r) {
      lastSeen.set(key, {
        round: state.round,
        terrain,
        city: {
          factionId: city.factionId,
          name: city.name,
        },
      });
      return;
    }
  }

  // Check for village at this position
  for (const village of state.villages.values()) {
    if (village.position.q === hex.q && village.position.r === hex.r) {
      lastSeen.set(key, {
        round: state.round,
        terrain,
        village: {
          factionId: village.factionId,
        },
      });
      return;
    }
  }

  // Just terrain
  lastSeen.set(key, {
    round: state.round,
    terrain,
  });
}

/**
 * Get all enemy units from last-seen snapshots (includes recently expired visibility)
 */
export function getLastSeenEnemyUnits(
  state: GameState,
  factionId: FactionId
): Array<{ position: HexCoord; factionId: FactionId; prototypeName: string; hp: number; maxHp: number; roundsAgo: number }> {
  const fogState = state.fogState?.get(factionId);
  if (!fogState) return [];

  const result: Array<{ position: HexCoord; factionId: FactionId; prototypeName: string; hp: number; maxHp: number; roundsAgo: number }> = [];
  const currentRound = state.round;

  for (const [key, snapshot] of fogState.lastSeen) {
    if (!snapshot.unit) continue;
    if (snapshot.unit.factionId === factionId) continue;
    const position = keyToHex(key);
    result.push({
      position,
      factionId: snapshot.unit.factionId,
      prototypeName: snapshot.unit.prototypeName,
      hp: snapshot.unit.hp,
      maxHp: snapshot.unit.maxHp,
      roundsAgo: currentRound - snapshot.round,
    });
  }

  return result;
}

/**
 * Get all enemy cities from last-seen snapshots
 */
export function getLastSeenEnemyCities(
  state: GameState,
  factionId: FactionId
): Array<{ position: HexCoord; cityId: string; factionId: FactionId; name: string; roundsAgo: number }> {
  const fogState = state.fogState?.get(factionId);
  if (!fogState) return [];

  const result: Array<{ position: HexCoord; cityId: string; factionId: FactionId; name: string; roundsAgo: number }> = [];
  const currentRound = state.round;

  // Use a stable cityId derived from position to avoid needing actual city objects
  for (const [key, snapshot] of fogState.lastSeen) {
    if (!snapshot.city) continue;
    if (snapshot.city.factionId === factionId) continue;
    const position = keyToHex(key);
    // Find the actual city to get its id
    const actualCity = Array.from(state.cities.values()).find(
      (c) => c.position.q === position.q && c.position.r === position.r
    );
    result.push({
      position,
      cityId: actualCity?.id ?? `lastSeen_${key}`,
      factionId: snapshot.city.factionId,
      name: snapshot.city.name,
      roundsAgo: currentRound - snapshot.round,
    });
  }

  return result;
}

/**
 * Get all explored (visible OR explored, not hidden) hex keys for a faction
 */
export function getExploredHexKeys(state: GameState, factionId: FactionId): Set<string> {
  const fogState = state.fogState?.get(factionId);
  if (!fogState) return new Set();

  const keys = new Set<string>();
  for (const [key, visibility] of fogState.hexVisibility) {
    if (visibility === 'visible' || visibility === 'explored') {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Get visibility level for a specific hex
 */
export function getHexVisibility(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord
): HexVisibility {
  const fogState = state.fogState?.get(factionId);
  return fogState?.hexVisibility.get(hexToKey(hex)) ?? 'hidden';
}

/**
 * Is this hex currently visible to this faction?
 */
export function isHexVisible(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord
): boolean {
  return getHexVisibility(state, factionId, hex) === 'visible';
}

/**
 * Get all enemy units currently visible to this faction (non-stealthed)
 */
export function getVisibleEnemyUnits(
  state: GameState,
  factionId: FactionId
): Array<{ unit: Unit; prototype: Prototype }> {
  const result: Array<{ unit: Unit; prototype: Prototype }> = [];
  const visibleKeys = getVisibleHexKeys(state, factionId);

  for (const unit of state.units.values()) {
    // Skip dead units
    if (unit.hp <= 0) continue;

    // Skip friendly units
    if (unit.factionId === factionId) continue;

    // Check if unit is in a visible hex
    const unitKey = hexToKey(unit.position);
    if (visibleKeys.has(unitKey)) {
      if (isUnitEffectivelyStealthed(state, unit) && !isRevealedByStealthAura(state, factionId, unit)) {
        continue;
      }
      const prototype = state.prototypes.get(unit.prototypeId);
      if (prototype) {
        result.push({ unit, prototype });
      }
    }
  }

  return result;
}

/**
 * Can this faction see a specific unit?
 */
export function isUnitVisibleTo(
  state: GameState,
  factionId: FactionId,
  unit: Unit
): boolean {
  // Dead units are not visible
  if (unit.hp <= 0) return false;

  // Friendly units are visible to themselves
  if (unit.factionId === factionId) {
    // Check if the hex is visible (could be hidden or explored)
    const visibility = getHexVisibility(state, factionId, unit.position);
    return visibility === 'visible' || visibility === 'explored';
  }

  if (isUnitEffectivelyStealthed(state, unit)) {
    return isRevealedByStealthAura(state, factionId, unit);
  }

  // Enemy units must be in a currently visible hex
  return isHexVisible(state, factionId, unit.position);
}

/**
 * Get all visible hex keys for a faction (for batch checks)
 */
export function getVisibleHexKeys(state: GameState, factionId: FactionId): Set<string> {
  const fogState = state.fogState?.get(factionId);
  if (!fogState) return new Set();

  const visibleKeys = new Set<string>();
  for (const [key, visibility] of fogState.hexVisibility) {
    if (visibility === 'visible') {
      visibleKeys.add(key);
    }
  }
  return visibleKeys;
}

/**
 * Initialize fog state for a faction if not already present.
 * Useful for tests that call computeFactionStrategy directly without running simulation.
 */
export function initializeFogForFaction(state: GameState, factionId: FactionId): GameState {
  if (!state.fogState?.has(factionId)) {
    return updateFogState(state, factionId);
  }
  return state;
}

/**
 * Update fog state for a faction in game state.
 * Returns new GameState with updated fogState.
 */
export function updateFogState(state: GameState, factionId: FactionId): GameState {
  // Create new fogState Map if it doesn't exist
  const newFogState = new Map(state.fogState ?? new Map());

  // Calculate new visibility for this faction
  const newFactionFogState = calculateVisibility(state, factionId);

  // Store the new state
  newFogState.set(factionId, newFactionFogState);

  // Return new GameState with updated fogState
  return {
    ...state,
    fogState: newFogState,
  };
}
