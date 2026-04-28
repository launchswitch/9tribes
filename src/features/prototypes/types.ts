// Prototype entity types
import type { PrototypeId, FactionId, ChassisId, ComponentId } from '../../types.js';

export interface UnitStats {
  attack: number;
  defense: number;
  hp: number;
  moves: number;
  range: number;
  role: string;
}

export interface Prototype {
  id: PrototypeId;
  factionId: FactionId;
  chassisId: ChassisId;
  componentIds: ComponentId[];
  version: number;
  name: string;
  derivedStats: UnitStats;
  tags?: string[];
  sourceRecipeId?: string;
  productionCost?: number;
  supplyCost?: number;
  rangeBonus?: number;
}
