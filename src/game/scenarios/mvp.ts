/**
 * War Ecology Scenario Configuration
 * 
 * Civilizations are loaded from civilizations.json (the template system).
 * This file provides scenario-level config and helper functions.
 */

import type { TerrainType } from '../../world/map/types.js';
import type { MapGenerationMode } from '../../world/map/types.js';
import civsData from '../../content/base/civilizations.json';
import { assertValidBalanceOverrides, cloneData, type BalanceOverrides } from '../../balance/types.js';

export const MVP_SCENARIO_CONFIG = {
  name: 'War Ecology Scenario',
  description: 'Nine tribal factions diverging through ecology and war pressure',
  mapMode: 'randomClimateBands' as MapGenerationMode,
  mapWidth: 40,
  mapHeight: 30,
  terrainDistribution: {
    plains: 0.25,
    forest: 0.15,
    jungle: 0.10,
    hill: 0.10,
    desert: 0.10,
    tundra: 0.10,
    savannah: 0.10,
    coast: 0.09,
    river: 0.08,
  },
  roundsToWin: 150,
};

export interface MvpFactionConfig {
  id: string;
  name: string;
  color: string;
  startHex: { q: number; r: number };
  terrainBias: TerrainType;
  capabilitySeeds: Record<string, number>;
  startingUnits: MvpUnitConfig[];
  uniqueMechanic: string;
  homeBiome: string;
  signatureUnit: string;
  passiveTrait: string;
  earlyResearchBias: string;
  naturalPrey: string;
  naturalCounter: string;
  economyAngle: string;
  terrainDependence: string;
  lateGameHybridPotential: string;
  nativeDomain: string;
  startingLearnedDomains?: string[];
  startingCompletedResearchNodes?: string[];
  researchRate?: number;
}

export interface MvpUnitConfig {
  chassisId: string;
  componentIds: string[];
  positionOffset: { q: number; r: number };
}

// Load civilizations from JSON template system
export const MVP_FACTION_CONFIGS: MvpFactionConfig[] = Object.values(civsData) as MvpFactionConfig[];

export function getMvpScenarioConfig(overrides?: BalanceOverrides) {
  assertValidBalanceOverrides(overrides);

  return {
    ...MVP_SCENARIO_CONFIG,
    roundsToWin: overrides?.scenario?.roundsToWin ?? MVP_SCENARIO_CONFIG.roundsToWin,
    mapWidth: overrides?.scenario?.mapWidth ?? MVP_SCENARIO_CONFIG.mapWidth,
    mapHeight: overrides?.scenario?.mapHeight ?? MVP_SCENARIO_CONFIG.mapHeight,
  };
}

export function getMvpFactionConfigs(overrides?: BalanceOverrides): MvpFactionConfig[] {
  assertValidBalanceOverrides(overrides);

  return MVP_FACTION_CONFIGS.map((config) => {
    const factionOverride = overrides?.factions?.[config.id];
    if (!factionOverride) {
      return cloneData(config);
    }

    return {
      ...cloneData(config),
      capabilitySeeds: {
        ...config.capabilitySeeds,
        ...(factionOverride.capabilitySeeds ?? {}),
      },
      ...(factionOverride.researchRate !== undefined && { researchRate: factionOverride.researchRate }),
    };
  });
}

export function getStartingUnits(factionIndex: number, overrides?: BalanceOverrides): MvpUnitConfig[] {
  const config = getMvpFactionConfigs(overrides)[factionIndex];
  return config?.startingUnits ?? [
    {
      chassisId: 'infantry_frame',
      componentIds: ['basic_spear', 'simple_armor'],
      positionOffset: { q: 0, r: -1 },
    },
  ];
}

export const MVP_IMPROVEMENTS: Array<{ hex: { q: number; r: number }; type: string }> = [];

export const MVP_RESEARCH_CONFIG = {
  domainId: 'river_stealth',
  initialNode: 'river_stealth_t2',
  initialProgress: 0,
};
