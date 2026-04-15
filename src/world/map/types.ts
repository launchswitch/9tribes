// Map and terrain type definitions

import type { HexCoord, TileCoord } from '../../types.js';

export type MapGenerationMode = 'fixed' | 'randomClimateBands';

// Terrain types available on the map
export type TerrainType =
  | 'plains'
  | 'forest'
  | 'jungle'
  | 'hill'
  | 'desert'
  | 'tundra'
  | 'savannah'
  | 'coast'
  | 'river'
  | 'swamp'
  | 'mountain'
  | 'ocean';

// Terrain definition with game mechanics
export interface TerrainDef {
  id: TerrainType;
  name: string;
  movementCost: number;  // Movement points required to enter
  defenseBonus: number;  // Defense multiplier bonus
  passable?: boolean;    // If false, non-naval units cannot enter
}

// Individual map tile
export interface Tile {
  position: TileCoord;
  terrain: TerrainType;
  improvementId?: string;  // Optional improvement built on tile
  unitId?: string;         // Optional unit currently on tile
}

export interface ClimateProfile {
  arcticRowCount: number;
  tundraBandEndRow: number;
  temperateBandEndRow: number;
  warmBandStartRow: number;
  desertBandStartRow: number;
}

export interface StartPlacementValidation {
  factionId: string;
  position: HexCoord;
  nearbyBiomeShare: number;
  checks: Record<string, boolean>;
  repaired: boolean;
  repairActions: string[];
}

export interface MapGenerationMetadata {
  mode: MapGenerationMode;
  climateProfile?: ClimateProfile;
  startPlacements?: StartPlacementValidation[];
  repairsApplied?: number;
  rerollsUsed?: number;
}

// The complete game map
export interface GameMap {
  width: number;
  height: number;
  tiles: Map<string, Tile>;  // Key format: "q,r" (tileToKey)
  metadata?: MapGenerationMetadata;
}
