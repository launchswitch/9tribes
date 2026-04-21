// City entity types
import type { CityId, FactionId } from '../../types.js';
import type { HexCoord } from '../../types.js';

export type ProductionCostType = 'production' | 'villages';

export interface ProductionItem {
  type: 'unit' | 'improvement' | 'prototype';
  id: string;
  cost: number;
  costType?: ProductionCostType;
}

export interface CurrentProduction {
  item: ProductionItem;
  progress: number;
  cost: number;
  costType?: ProductionCostType;
}

export type CitySiteTraitKey = 'fresh_water' | 'woodland' | 'open_land';

export interface CitySiteTrait {
  key: CitySiteTraitKey;
  label: string;
  effect: string;
  active: boolean;
  count: number;
}

export interface CitySiteBonuses {
  productionBonus: number;
  supplyBonus: number;
  villageCooldownReduction: number;
  researchBonus: number;
  traits: CitySiteTrait[];
}

export interface City {
  id: CityId;
  factionId: FactionId;
  position: HexCoord;
  name: string;
  productionQueue: ProductionItem[];
  productionProgress: number;
  currentProduction?: CurrentProduction;
  // Territory control
  territoryRadius: number;
  // Siege
  wallHP: number;
  maxWallHP: number;
  besieged: boolean;
  turnsUnderSiege: number;
  // True for the faction's original starting city
  isCapital?: boolean;
  // Captured city ramp-up: 0 = just captured, ramps to max over CAPTURE_RAMP_TURNS
  turnsSinceCapture?: number;
  // Last round this city spawned a village in its territory.
  lastVillageSpawnRound?: number;
  // Site traits derived from the surrounding territory when the city was founded.
  siteBonuses?: CitySiteBonuses;
  // The game round when this city was founded. Set at creation time.
  foundedRound?: number;
}
