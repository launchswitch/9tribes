import type { ChassisDef, ComponentDef } from '../data/registry/types.js';
import economyData from '../content/base/economy.json';
import civsData from '../content/base/civilizations.json';
import chassisData from '../content/base/chassis.json';
import componentsData from '../content/base/components.json';

export interface TerrainYieldOverride {
  productionYield?: number;
}

export interface ChassisOverride extends Partial<
  Pick<ChassisDef, 'baseHp' | 'baseMoves' | 'baseAttack' | 'baseDefense' | 'baseRange' | 'supplyCost'>
> {}

export interface ComponentOverride extends Partial<
  Pick<ComponentDef, 'attackBonus' | 'defenseBonus' | 'rangeBonus' | 'hpBonus' | 'movesBonus'>
> {}

export interface FactionOverride {
  capabilitySeeds?: Record<string, number>;
}

export interface ScenarioOverride {
  roundsToWin?: number;
  mapWidth?: number;
  mapHeight?: number;
}

export interface SignatureAbilityOverride {
  endlessStride?: boolean;
  stampedeBonus?: number;
  summon?: {
    chassisId?: string;
    terrainTypes?: string[];
    hp?: number;
    attack?: number;
    defense?: number;
    moves?: number;
    tags?: string[];
    name?: string;
  };
  summonDuration?: number;
  cooldownDuration?: number;
  venomDamagePerTurn?: number;
  tidalAssaultBonus?: number;
  hitAndRun?: boolean;
  sneakAttackBonus?: number;
  desertSwarmThreshold?: number;
  desertSwarmAttackBonus?: number;
  desertSwarmDefenseMultiplier?: number;
  wallDefenseMultiplier?: number;
}

export interface BalanceOverrides {
  terrainYields?: Record<string, TerrainYieldOverride>;
  chassis?: Record<string, ChassisOverride>;
  components?: Record<string, ComponentOverride>;
  factions?: Record<string, FactionOverride>;
  scenario?: ScenarioOverride;
  signatureAbilities?: Record<string, SignatureAbilityOverride>;
}

const KNOWN_TERRAIN_IDS = new Set(Object.keys(economyData));
const KNOWN_FACTION_IDS = new Set(Object.keys(civsData));
const KNOWN_CHASSIS_IDS = new Set(Object.keys(chassisData));
const KNOWN_COMPONENT_IDS = new Set(Object.keys(componentsData));

const TOP_LEVEL_KEYS = new Set(['terrainYields', 'chassis', 'components', 'factions', 'scenario', 'signatureAbilities']);
const TERRAIN_OVERRIDE_KEYS = new Set(['productionYield']);
const CHASSIS_OVERRIDE_KEYS = new Set(['baseHp', 'baseMoves', 'baseAttack', 'baseDefense', 'baseRange', 'supplyCost']);
const COMPONENT_OVERRIDE_KEYS = new Set(['attackBonus', 'defenseBonus', 'rangeBonus', 'hpBonus', 'movesBonus']);
const FACTION_OVERRIDE_KEYS = new Set(['capabilitySeeds']);
const SCENARIO_OVERRIDE_KEYS = new Set(['roundsToWin', 'mapWidth', 'mapHeight']);
const SIGNATURE_ABILITY_OVERRIDE_KEYS = new Set([
  'endlessStride', 'stampedeBonus', 'summon',
  'summonDuration', 'cooldownDuration', 'venomDamagePerTurn',
  'hitAndRun', 'sneakAttackBonus',
  'desertSwarmThreshold', 'desertSwarmAttackBonus', 'desertSwarmDefenseMultiplier',
  'wallDefenseMultiplier', 'tidalAssaultBonus',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNoUnknownKeys(scope: string, value: Record<string, unknown>, allowedKeys: Set<string>): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown ${scope} key "${key}"`);
    }
  }
}

function assertFiniteNumber(scope: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${scope} must be a finite number`);
  }
}

export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function assertValidBalanceOverrides(overrides: BalanceOverrides | undefined): void {
  if (!overrides) {
    return;
  }
  if (!isRecord(overrides)) {
    throw new Error('Balance overrides must be an object');
  }

  assertNoUnknownKeys('balance override', overrides, TOP_LEVEL_KEYS);

  if (overrides.terrainYields !== undefined) {
    if (!isRecord(overrides.terrainYields)) {
      throw new Error('terrainYields must be an object');
    }
    for (const [terrainId, override] of Object.entries(overrides.terrainYields)) {
      if (!KNOWN_TERRAIN_IDS.has(terrainId)) {
        throw new Error(`Unknown terrain yield override "${terrainId}"`);
      }
      if (!isRecord(override)) {
        throw new Error(`terrainYields.${terrainId} must be an object`);
      }
      assertNoUnknownKeys(`terrainYields.${terrainId}`, override, TERRAIN_OVERRIDE_KEYS);
      for (const [key, value] of Object.entries(override)) {
        assertFiniteNumber(`terrainYields.${terrainId}.${key}`, value);
      }
    }
  }

  if (overrides.chassis !== undefined) {
    if (!isRecord(overrides.chassis)) {
      throw new Error('chassis overrides must be an object');
    }
    for (const [chassisId, override] of Object.entries(overrides.chassis)) {
      if (!KNOWN_CHASSIS_IDS.has(chassisId)) {
        throw new Error(`Unknown chassis override "${chassisId}"`);
      }
      if (!isRecord(override)) {
        throw new Error(`chassis.${chassisId} must be an object`);
      }
      assertNoUnknownKeys(`chassis.${chassisId}`, override, CHASSIS_OVERRIDE_KEYS);
      for (const [key, value] of Object.entries(override)) {
        assertFiniteNumber(`chassis.${chassisId}.${key}`, value);
      }
    }
  }

  if (overrides.components !== undefined) {
    if (!isRecord(overrides.components)) {
      throw new Error('component overrides must be an object');
    }
    for (const [componentId, override] of Object.entries(overrides.components)) {
      if (!KNOWN_COMPONENT_IDS.has(componentId)) {
        throw new Error(`Unknown component override "${componentId}"`);
      }
      if (!isRecord(override)) {
        throw new Error(`components.${componentId} must be an object`);
      }
      assertNoUnknownKeys(`components.${componentId}`, override, COMPONENT_OVERRIDE_KEYS);
      for (const [key, value] of Object.entries(override)) {
        assertFiniteNumber(`components.${componentId}.${key}`, value);
      }
    }
  }

  if (overrides.factions !== undefined) {
    if (!isRecord(overrides.factions)) {
      throw new Error('faction overrides must be an object');
    }
    for (const [factionId, override] of Object.entries(overrides.factions)) {
      if (!KNOWN_FACTION_IDS.has(factionId)) {
        throw new Error(`Unknown faction override "${factionId}"`);
      }
      if (!isRecord(override)) {
        throw new Error(`factions.${factionId} must be an object`);
      }
      assertNoUnknownKeys(`factions.${factionId}`, override, FACTION_OVERRIDE_KEYS);

      if (override.capabilitySeeds !== undefined) {
        if (!isRecord(override.capabilitySeeds)) {
          throw new Error(`factions.${factionId}.capabilitySeeds must be an object`);
        }
        for (const [capabilityId, value] of Object.entries(override.capabilitySeeds)) {
          assertFiniteNumber(`factions.${factionId}.capabilitySeeds.${capabilityId}`, value);
        }
      }
    }
  }

  if (overrides.scenario !== undefined) {
    if (!isRecord(overrides.scenario)) {
      throw new Error('scenario overrides must be an object');
    }
    assertNoUnknownKeys('scenario', overrides.scenario, SCENARIO_OVERRIDE_KEYS);
    for (const [key, value] of Object.entries(overrides.scenario)) {
      assertFiniteNumber(`scenario.${key}`, value);
    }
  }

  if (overrides.signatureAbilities !== undefined) {
    if (!isRecord(overrides.signatureAbilities)) {
      throw new Error('signatureAbilities must be an object');
    }
    for (const [factionId, override] of Object.entries(overrides.signatureAbilities)) {
      if (!KNOWN_FACTION_IDS.has(factionId)) {
        throw new Error(`Unknown signature ability faction override "${factionId}"`);
      }
      if (!isRecord(override)) {
        throw new Error(`signatureAbilities.${factionId} must be an object`);
      }
      assertNoUnknownKeys(`signatureAbilities.${factionId}`, override, SIGNATURE_ABILITY_OVERRIDE_KEYS);
      for (const [key, value] of Object.entries(override)) {
        if (key === 'endlessStride' || key === 'hitAndRun') {
          // boolean values are valid
          continue;
        }
        if (key === 'summon') {
          if (!isRecord(value)) {
            throw new Error(`signatureAbilities.${factionId}.summon must be an object`);
          }
          for (const [sk, sv] of Object.entries(value)) {
            if (sk === 'tags' || sk === 'terrainTypes') {
              if (!Array.isArray(sv)) {
                throw new Error(`signatureAbilities.${factionId}.summon.${sk} must be an array`);
              }
              continue;
            }
            if (sk === 'chassisId' || sk === 'name') {
              if (typeof sv !== 'string') {
                throw new Error(`signatureAbilities.${factionId}.summon.${sk} must be a string`);
              }
              continue;
            }
            assertFiniteNumber(`signatureAbilities.${factionId}.summon.${sk}`, sv);
          }
          continue;
        }
        assertFiniteNumber(`signatureAbilities.${factionId}.${key}`, value);
      }
    }
  }
}
