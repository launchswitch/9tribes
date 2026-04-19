import type { RNGState } from '../../../../src/core/rng.js';
import type { Faction, FactionResearch, FactionEconomy, Improvement, Prototype, ResearchState, Unit, Village, WarExhaustion } from '../../../../src/game/types.js';
import type { City, GameState } from '../../../../src/game/types.js';
import type { FactionStrategy } from '../../../../src/systems/factionStrategy.js';
import type { TransportMap } from '../../../../src/systems/transportSystem.js';
import type { VillageCaptureCooldownMap } from '../../../../src/systems/villageCaptureSystem.js';
import type { FactionFogState } from '../../../../src/systems/fogSystem.js';
import type { FactionId } from '../../../../src/types.js';
import type { GameMap, MapGenerationMode, Tile } from '../../../../src/world/map/types.js';

type SerializedEntries<T> = Array<[string, T]>;

type SerializedFactionFogState = {
  hexVisibility: SerializedEntries<FactionFogState extends { hexVisibility: Map<string, infer V> } ? V : never>;
  lastSeen: SerializedEntries<FactionFogState extends { lastSeen: Map<string, infer V> } ? V : never>;
};

export type SerializedGameMap = Omit<GameMap, 'tiles'> & {
  tiles: SerializedEntries<Tile>;
};

export type SerializedGameState = Omit<
  GameState,
  | 'factions'
  | 'factionResearch'
  | 'units'
  | 'cities'
  | 'villages'
  | 'prototypes'
  | 'improvements'
  | 'research'
  | 'economy'
  | 'warExhaustion'
  | 'factionStrategies'
  | 'poisonTraps'
  | 'contaminatedHexes'
  | 'transportMap'
  | 'villageCaptureCooldowns'
  | 'map'
  | 'fogState'
> & {
  map?: SerializedGameMap;
  factions: SerializedEntries<Faction>;
  factionResearch: SerializedEntries<FactionResearch>;
  units: SerializedEntries<Unit>;
  cities: SerializedEntries<City>;
  villages: SerializedEntries<Village>;
  prototypes: SerializedEntries<Prototype>;
  improvements: SerializedEntries<Improvement>;
  research: SerializedEntries<ResearchState>;
  economy: SerializedEntries<FactionEconomy>;
  warExhaustion: SerializedEntries<WarExhaustion>;
  factionStrategies: SerializedEntries<FactionStrategy>;
  poisonTraps: SerializedEntries<{ damage: number; slow: number; ownerFactionId: FactionId }>;
  contaminatedHexes: string[];
  transportMap: SerializedEntries<{ transportId: string; embarkedUnitIds: string[] }>;
  villageCaptureCooldowns: SerializedEntries<{ position: string; capturedByFactionId: FactionId; capturedRound: number }>;
  fogState: SerializedEntries<SerializedFactionFogState>;
  rngState: RNGState;
};

export type PlayStateSource =
  | {
      type: 'fresh';
      seed?: number;
      mapMode?: MapGenerationMode;
      mapSize?: 'small' | 'medium' | 'large';
      selectedFactionIds?: string[];
    }
  | { type: 'serialized'; payload: SerializedGameState };

export function serializeGameState(state: GameState): SerializedGameState {
  return {
    ...state,
    map: state.map
      ? {
          ...state.map,
          tiles: Array.from(state.map.tiles.entries()),
        }
      : undefined,
    factions: Array.from(state.factions.entries()),
    factionResearch: Array.from(state.factionResearch.entries()),
    units: Array.from(state.units.entries()),
    cities: Array.from(state.cities.entries()),
    villages: Array.from(state.villages.entries()),
    prototypes: Array.from(state.prototypes.entries()),
    improvements: Array.from(state.improvements.entries()),
    research: Array.from(state.research.entries()),
    economy: Array.from(state.economy.entries()),
    warExhaustion: Array.from(state.warExhaustion.entries()),
    factionStrategies: Array.from(state.factionStrategies.entries()),
    poisonTraps: Array.from(state.poisonTraps.entries()),
    contaminatedHexes: Array.from(state.contaminatedHexes.values()),
    transportMap: Array.from(state.transportMap.entries()),
    villageCaptureCooldowns: Array.from(state.villageCaptureCooldowns.entries()),
    fogState: Array.from(state.fogState.entries()).map(([fid, fs]) => [
      fid,
      {
        hexVisibility: Array.from(fs.hexVisibility.entries()),
        lastSeen: Array.from(fs.lastSeen.entries()),
      },
    ]),
  };
}

export function deserializeGameState(payload: SerializedGameState): GameState {
  const toTypedMap = <K extends string, V>(entries: Array<[string, V]>) => new Map(entries as Array<[K, V]>);

  return {
    ...payload,
    map: payload.map
      ? {
          ...payload.map,
          tiles: new Map(payload.map.tiles),
        }
      : undefined,
    factions: toTypedMap(payload.factions),
    factionResearch: toTypedMap(payload.factionResearch),
    units: toTypedMap(payload.units),
    cities: toTypedMap(payload.cities),
    villages: toTypedMap(payload.villages),
    prototypes: toTypedMap(payload.prototypes),
    improvements: toTypedMap(payload.improvements),
    research: toTypedMap(payload.research),
    economy: toTypedMap(payload.economy),
    warExhaustion: toTypedMap(payload.warExhaustion),
    factionStrategies: toTypedMap(payload.factionStrategies),
    poisonTraps: toTypedMap(payload.poisonTraps),
    contaminatedHexes: new Set(payload.contaminatedHexes),
    transportMap: toTypedMap(payload.transportMap as any),
    villageCaptureCooldowns: toTypedMap(payload.villageCaptureCooldowns as any),
    fogState: Array.isArray(payload.fogState)
      ? new Map(
          payload.fogState.map(([fid, fs]) => [
            fid,
            {
              hexVisibility: Array.isArray(fs?.hexVisibility) ? new Map(fs.hexVisibility) : new Map(),
              lastSeen: Array.isArray(fs?.lastSeen) ? new Map(fs.lastSeen) : new Map(),
            },
          ]),
        )
      : new Map(),
  };
}
