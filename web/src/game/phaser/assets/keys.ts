import Phaser from 'phaser';
import { parseFreecivTagFrameLookup } from './freelandSpec';

export const TILE_WIDTH = 96;
export const TILE_HEIGHT = 48;
export const TILE_HALF_WIDTH = TILE_WIDTH / 2;
export const TILE_HALF_HEIGHT = TILE_HEIGHT / 2;

export const TEXTURES = {
  grassBase: 'terrain-grass-base',
  savannahBase: 'terrain-savannah-base',
  desertBase: 'terrain-desert-base',
  tundraBase: 'terrain-tundra-base',
  forestOverlay: 'terrain-forest-overlay',
  jungleOverlay: 'terrain-jungle-overlay',
  hillOverlay: 'terrain-hill-overlay',
  swampOverlay: 'terrain-swamp-overlay',
  mountainOverlay: 'terrain-mountain-overlay',
  oceanBase: 'terrain-ocean-base',
  riverOverlay: 'terrain-river-overlay',
  oasisOverlay: 'terrain-oasis-overlay',
  cities: 'settlements-cities',
  units: 'units-sheet',
  fog: 'fog-sheet',
  selection: 'selection-sheet',
  druidSpearInfantry: 'unit-druid-spear-infantry',
  druidArcher: 'unit-druid-archer',
  druidHealer: 'unit-druid-healer',
  druidWizard: 'unit-druid-wizard',
  steppeHorseArcher: 'unit-steppe-horse-archer',
  steppeSpearInfantry: 'unit-steppe-spear-infantry',
  steppeRaiders: 'unit-steppe-raiders',
  steppePriestess: 'unit-steppe-priestess',
  steppeWarlord: 'unit-steppe-warlord',
  jungleSpearman: 'unit-jungle-spearman',
  jungleArcher: 'unit-jungle-archer',
  jungleBlowgun: 'unit-jungle-blowgun',
  junglePriest: 'unit-jungle-priest',
  jungleSerpent: 'unit-jungle-serpent',
  hillSpearInfantry: 'unit-hill-spear-infantry',
  hillArcher: 'unit-hill-archer',
  hillFortressArcher: 'unit-hill-fortress-archer',
  hillCatapult: 'unit-hill-catapult',
  hillFortress: 'unit-hill-fortress',
  pirateInfantry: 'unit-pirate-infantry',
  pirateRanged: 'unit-pirate-ranged',
  pirateSlaver: 'unit-pirate-slaver',
  pirateSlaverShip: 'unit-pirate-slaver-ship',
  pirateGalley: 'unit-pirate-galley',
  desertCamel: 'unit-desert-camel',
  desertSpearman: 'unit-desert-spearman',
  desertArcher: 'unit-desert-archer',
  desertCamelLancers: 'unit-desert-camel-lancers',
  desertImmortal: 'unit-desert-immortal',
  savannahSpearman: 'unit-savannah-spearman',
  savannahJavelin: 'unit-savannah-javelin',
  savannahElephant: 'unit-savannah-elephant',
  savannahChariot: 'unit-savannah-chariot',
  riverSpearman: 'unit-river-spearman',
  riverCanoe: 'unit-river-canoe',
  riverRaiders: 'unit-river-raiders',
  riverPriestess: 'unit-river-priestess',
  riverCrocodile: 'unit-river-crocodile',
  frostSpearman: 'unit-frost-spearman',
  frostArcher: 'unit-frost-archer',
  frostIceDefenders: 'unit-frost-ice-defenders',
  frostPriest: 'unit-frost-priest',
  frostPolarBear: 'unit-frost-polar-bear',

  // Rear-facing (flipped) sprites — used when unit faces away from camera
  druidSpearInfantryRear: 'unit-druid-spear-infantry-flipped',
  druidArcherRear: 'unit-druid-archer-flipped',
  druidHealerRear: 'unit-druid-healer-flipped',
  druidWizardRear: 'unit-druid-wizard-flipped',
  steppeHorseArcherRear: 'unit-steppe-horse-archer-flipped',
  steppeSpearInfantryRear: 'unit-steppe-spear-infantry-flipped',
  steppeRaidersRear: 'unit-steppe-raiders-flipped',
  steppePriestessRear: 'unit-steppe-priestess-flipped',
  steppeWarlordRear: 'unit-steppe-warlord-flipped',
  jungleSpearmanRear: 'unit-jungle-spearman-flipped',
  jungleArcherRear: 'unit-jungle-archer-flipped',
  jungleBlowgunRear: 'unit-jungle-blowgun-flipped',
  junglePriestRear: 'unit-jungle-priest-flipped',
  jungleSerpentRear: 'unit-jungle-serpent-flipped',
  hillSpearInfantryRear: 'unit-hill-spear-infantry-flipped',
  hillArcherRear: 'unit-hill-archer-flipped',
  hillFortressArcherRear: 'unit-hill-fortress-archer-flipped',
  hillCatapultRear: 'unit-hill-catapult-flipped',
  hillFortressRear: 'unit-hill-fortress-flipped',
  pirateInfantryRear: 'unit-pirate-infantry-flipped',
  pirateRangedRear: 'unit-pirate-ranged-flipped',
  pirateSlaverRear: 'unit-pirate-slaver-flipped',
  pirateSlaverShipRear: 'unit-pirate-slaver-ship-flipped',
  pirateGalleyRear: 'unit-pirate-galley-flipped',
  desertCamelRear: 'unit-desert-camel-flipped',
  desertSpearmanRear: 'unit-desert-spearman-flipped',
  desertArcherRear: 'unit-desert-archer-flipped',
  desertCamelLancersRear: 'unit-desert-camel-lancers-flipped',
  desertImmortalRear: 'unit-desert-immortal-flipped',
  savannahSpearmanRear: 'unit-savannah-spearman-flipped',
  savannahJavelinRear: 'unit-savannah-javelin-flipped',
  savannahElephantRear: 'unit-savannah-elephant-flipped',
  savannahChariotRear: 'unit-savannah-chariot-flipped',
  riverSpearmanRear: 'unit-river-spearman-flipped',
  riverCanoeRear: 'unit-river-canoe-flipped',
  riverRaidersRear: 'unit-river-raiders-flipped',
  riverPriestessRear: 'unit-river-priestess-flipped',
  riverCrocodileRear: 'unit-river-crocodile-flipped',
  frostSpearmanRear: 'unit-frost-spearman-flipped',
  frostArcherRear: 'unit-frost-archer-flipped',
  frostIceDefendersRear: 'unit-frost-ice-defenders-flipped',
  frostPriestRear: 'unit-frost-priest-flipped',
  frostPolarBearRear: 'unit-frost-polar-bear-flipped',
} as const;

export const FREELAND_SPECS = {
  fog: 'freeland-fog-spec',
  grassTerrain: 'freeland-grass-terrain-spec',
  savannahTerrain: 'freeland-savannah-terrain-spec',
  desertTerrain: 'freeland-desert-terrain-spec',
  tundraTerrain: 'freeland-tundra-terrain-spec',
  swampTerrain: 'freeland-swamp-terrain-spec',
  mountainTerrain: 'freeland-mountain-terrain-spec',
} as const;

export type FogRenderState = 'u' | 'f' | 'k';

const VISIBILITY_TO_FOG_STATE: Record<'hidden' | 'explored' | 'visible', FogRenderState> = {
  // Freeciv fog legend used by fog.spec tags.
  // hidden -> u (unknown), explored -> f (fogged), visible -> k (known/visible).
  hidden: 'u',
  explored: 'f',
  visible: 'k',
};

export function getFogRenderState(visibility: 'hidden' | 'explored' | 'visible'): FogRenderState {
  return VISIBILITY_TO_FOG_STATE[visibility];
}

export function getFogTag(north: FogRenderState, east: FogRenderState, south: FogRenderState, west: FogRenderState): string {
  return `t.fog_${north}_${east}_${south}_${west}`;
}

const frame = (row: number, col: number, columns: number) => row * columns + col;

export const TERRAIN_FRAMES = {
  grassBase: frame(7, 1, 6),
  savannahBase: frame(14, 2, 6),
  desertBase: frame(21, 3, 6),
  tundraBase: frame(28, 4, 6),
  overlayDefault: 0,
  oceanBase: 0,
  riverStraight: 0,
};

const TERRAIN_SPEC_COLUMNS = 6;
const TERRAIN_OVERLAY_SPEC_COLUMNS = 4;

const TERRAIN_BASE_TAGS = {
  grassBase: 't.l0.grassland1',
  savannahBase: 't.l0.plains1',
  desertBase: 't.l0.desert1',
  tundraBase: 't.l0.tundra1',
} as const;

const TERRAIN_FRAME_SPEC_KEYS = {
  grassBase: FREELAND_SPECS.grassTerrain,
  savannahBase: FREELAND_SPECS.savannahTerrain,
  desertBase: FREELAND_SPECS.desertTerrain,
  tundraBase: FREELAND_SPECS.tundraTerrain,
} as const;

const TERRAIN_OVERLAY_FRAME_SPEC_KEYS = {
  swamp: FREELAND_SPECS.swampTerrain,
  mountain: FREELAND_SPECS.mountainTerrain,
} as const;

const TERRAIN_OVERLAY_TAG_PREFIXES = {
  swamp: 't.l1.swamp',
  mountain: 't.l1.mountains',
} as const;

type TerrainOverlayKind = keyof typeof TERRAIN_OVERLAY_FRAME_SPEC_KEYS;

let resolvedTerrainFrames = { ...TERRAIN_FRAMES };
let resolvedTerrainOverlayFrames: Record<TerrainOverlayKind, Map<string, number>> = {
  swamp: new Map(),
  mountain: new Map(),
};

function getRequiredSpecText(scene: Phaser.Scene, key: string): string {
  const specText = scene.cache.text.get(key);
  if (typeof specText !== 'string' || specText.length === 0) {
    throw new Error(`Missing or empty Freeland terrain spec "${key}" in Phaser text cache.`);
  }
  return specText;
}

export function initializeFreelandTerrainFrames(scene: Phaser.Scene) {
  const nextFrames = { ...TERRAIN_FRAMES };
  const nextOverlayFrames: Record<TerrainOverlayKind, Map<string, number>> = {
    swamp: new Map(),
    mountain: new Map(),
  };

  for (const [terrainKey, specKey] of Object.entries(TERRAIN_FRAME_SPEC_KEYS) as Array<[keyof typeof TERRAIN_FRAME_SPEC_KEYS, string]>) {
    const tagLookup = parseFreecivTagFrameLookup(getRequiredSpecText(scene, specKey), TERRAIN_SPEC_COLUMNS);
    const tag = TERRAIN_BASE_TAGS[terrainKey];
    const frameIndex = tagLookup.get(tag);
    if (frameIndex === undefined) {
      throw new Error(`Freeland terrain tag "${tag}" not found in spec "${specKey}".`);
    }
    nextFrames[terrainKey] = frameIndex;
  }

  for (const [terrainKey, specKey] of Object.entries(TERRAIN_OVERLAY_FRAME_SPEC_KEYS) as Array<[TerrainOverlayKind, string]>) {
    nextOverlayFrames[terrainKey] = parseFreecivTagFrameLookup(
      getRequiredSpecText(scene, specKey),
      TERRAIN_OVERLAY_SPEC_COLUMNS,
    );
  }

  resolvedTerrainFrames = nextFrames;
  resolvedTerrainOverlayFrames = nextOverlayFrames;
}

const SETTLEMENT_FRAME_COLUMNS = 12;
const VILLAGE_COLUMN = 0;
const CITY_COLUMN = 3;

const SETTLEMENT_ROW_BY_FACTION: Record<string, number> = {
  steppe_clan: 0,
  jungle_clan: 1,
  plains_riders: 1,
  savannah_lions: 1,
  druid_circle: 2,
  frost_wardens: 2,
  hill_clan: 3,
  desert_nomads: 4,
  coral_people: 6,
};

export type SettlementRenderKind = 'village' | 'city';

export function getSettlementFrame(factionId: string, kind: SettlementRenderKind): number {
  const row = SETTLEMENT_ROW_BY_FACTION[factionId] ?? 0;
  const col = kind === 'village' ? VILLAGE_COLUMN : CITY_COLUMN;
  return frame(row, col, SETTLEMENT_FRAME_COLUMNS);
}

export const UNIT_FRAMES: Record<string, number> = {
  infantry: 18,    // row 0 col 18 → u.warriors
  ranged: 28,      // row 1 col 8  → u.archers
  cavalry: 8,      // row 0 col 8  → u.horsemen
  camel: 8,        // (no camel in sheet; reuse horsemen)
  elephant: 50,    // row 2 col 10 → u.elephants
  naval: 27,       // row 1 col 7  → u.trireme
  settler: 24,     // row 1 col 4  â†’ u.settlers
};

export type UnitTextureSpec =
  | { kind: 'sheet'; texture: string; frame: number; displayWidth: number; displayHeight: number; yOffset: number }
  | { kind: 'image'; texture: string; displayWidth: number; displayHeight: number; yOffset: number };

const PLAYTEST_SPRITE_KEYS: Record<string, string> = {
  druid_spear_infantry: 'druidSpearInfantry',
  druid_archer: 'druidArcher',
  druid_healer: 'druidHealer',
  druid_wizard: 'druidWizard',
  steppe_horse_archer: 'steppeHorseArcher',
  steppe_spear_infantry: 'steppeSpearInfantry',
  steppe_raiders: 'steppeRaiders',
  steppe_priestess: 'steppePriestess',
  steppe_warlord: 'steppeWarlord',
  jungle_spearman: 'jungleSpearman',
  jungle_archer: 'jungleArcher',
  jungle_blowgun: 'jungleBlowgun',
  jungle_priest: 'junglePriest',
  jungle_serpent: 'jungleSerpent',
  hill_spear_infantry: 'hillSpearInfantry',
  hill_archer: 'hillArcher',
  hill_fortress_archer: 'hillFortressArcher',
  hill_catapult: 'hillCatapult',
  hill_fortress: 'hillFortress',
  pirate_infantry: 'pirateInfantry',
  pirate_ranged: 'pirateRanged',
  pirate_slaver: 'pirateSlaver',
  pirate_slaver_ship: 'pirateSlaverShip',
  pirate_galley: 'pirateGalley',
  desert_camel: 'desertCamel',
  desert_spearman: 'desertSpearman',
  desert_archer: 'desertArcher',
  desert_camel_lancers: 'desertCamelLancers',
  desert_immortal: 'desertImmortal',
  savannah_spearman: 'savannahSpearman',
  savannah_javelin: 'savannahJavelin',
  savannah_elephant: 'savannahElephant',
  savannah_chariot: 'savannahChariot',
  river_spearman: 'riverSpearman',
  river_canoe: 'riverCanoe',
  river_raiders: 'riverRaiders',
  river_priestess: 'riverPriestess',
  river_crocodile: 'riverCrocodile',
  frost_spearman: 'frostSpearman',
  frost_archer: 'frostArcher',
  frost_ice_defenders: 'frostIceDefenders',
  frost_priest: 'frostPriest',
  frost_polar_bear: 'frostPolarBear',
};

const REAR_SPRITE_KEYS: Record<string, string> = {
  druid_spear_infantry: 'druidSpearInfantryRear',
  druid_archer: 'druidArcherRear',
  druid_healer: 'druidHealerRear',
  druid_wizard: 'druidWizardRear',
  steppe_horse_archer: 'steppeHorseArcherRear',
  steppe_spear_infantry: 'steppeSpearInfantryRear',
  steppe_raiders: 'steppeRaidersRear',
  steppe_priestess: 'steppePriestessRear',
  steppe_warlord: 'steppeWarlordRear',
  jungle_spearman: 'jungleSpearmanRear',
  jungle_archer: 'jungleArcherRear',
  jungle_blowgun: 'jungleBlowgunRear',
  jungle_priest: 'junglePriestRear',
  jungle_serpent: 'jungleSerpentRear',
  hill_spear_infantry: 'hillSpearInfantryRear',
  hill_archer: 'hillArcherRear',
  hill_fortress_archer: 'hillFortressArcherRear',
  hill_catapult: 'hillCatapultRear',
  hill_fortress: 'hillFortressRear',
  pirate_infantry: 'pirateInfantryRear',
  pirate_ranged: 'pirateRangedRear',
  pirate_slaver: 'pirateSlaverRear',
  pirate_slaver_ship: 'pirateSlaverShipRear',
  pirate_galley: 'pirateGalleyRear',
  desert_camel: 'desertCamelRear',
  desert_spearman: 'desertSpearmanRear',
  desert_archer: 'desertArcherRear',
  desert_camel_lancers: 'desertCamelLancersRear',
  desert_immortal: 'desertImmortalRear',
  savannah_spearman: 'savannahSpearmanRear',
  savannah_javelin: 'savannahJavelinRear',
  savannah_elephant: 'savannahElephantRear',
  savannah_chariot: 'savannahChariotRear',
  river_spearman: 'riverSpearmanRear',
  river_canoe: 'riverCanoeRear',
  river_raiders: 'riverRaidersRear',
  river_priestess: 'riverPriestessRear',
  river_crocodile: 'riverCrocodileRear',
  frost_spearman: 'frostSpearmanRear',
  frost_archer: 'frostArcherRear',
  frost_ice_defenders: 'frostIceDefendersRear',
  frost_priest: 'frostPriestRear',
  frost_polar_bear: 'frostPolarBearRear',
};

export function getUnitTextureSpec(spriteKey: string): UnitTextureSpec {
  const textureConst = PLAYTEST_SPRITE_KEYS[spriteKey];
  if (textureConst) {
    return {
      kind: 'image',
      texture: (TEXTURES as Record<string, string>)[textureConst],
      displayWidth: 48,
      displayHeight: 64,
      yOffset: 8,
    };
  }
  return {
    kind: 'sheet',
    texture: TEXTURES.units,
    frame: UNIT_FRAMES[spriteKey] ?? UNIT_FRAMES.infantry,
    displayWidth: 64,
    displayHeight: 48,
    yOffset: 10,
  };
}

export function getUnitRearTextureSpec(spriteKey: string): UnitTextureSpec | null {
  const textureConst = REAR_SPRITE_KEYS[spriteKey];
  if (textureConst) {
    return {
      kind: 'image',
      texture: (TEXTURES as Record<string, string>)[textureConst],
      displayWidth: 48,
      displayHeight: 64,
      yOffset: 8,
    };
  }
  // No rear sprite available — fall back to front sprite
  return null;
}

export type TerrainRenderSpec = {
  baseTexture?: string;
  baseFrame?: number;
  baseTint?: number;
  baseAlpha?: number;
  overlayTexture?: string;
  overlayFrame?: number;
  overlayTint?: number;
  overlayAlpha?: number;
  fallbackColor: number;
};

type RiverConnectionFlags = {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
};

function encodeRiverConnectionFlags(flags: RiverConnectionFlags): number {
  return (flags.north ? 8 : 0)
    + (flags.east ? 4 : 0)
    + (flags.south ? 2 : 0)
    + (flags.west ? 1 : 0);
}

function getConnectionFlags(
  q: number,
  r: number,
  getTerrainAt: (q: number, r: number) => string | null | undefined,
  isConnectedTerrain: (terrain: string | null | undefined) => boolean,
): RiverConnectionFlags {
  const isConnection = (dq: number, dr: number) => isConnectedTerrain(getTerrainAt(q + dq, r + dr));

  return {
    north: isConnection(0, -1) || isConnection(-1, -1) || isConnection(1, -1),
    east: isConnection(1, 0),
    south: isConnection(0, 1) || isConnection(-1, 1) || isConnection(1, 1),
    west: isConnection(-1, 0),
  };
}

export function getRiverOverlayFrameForTile(
  q: number,
  r: number,
  getTerrainAt: (q: number, r: number) => string | null | undefined,
): number {
  return encodeRiverConnectionFlags(
    getConnectionFlags(
      q,
      r,
      getTerrainAt,
      (terrain) => terrain === 'river' || terrain === 'coast',
    ),
  );
}

export function getTerrainOverlayTagForTile(
  terrain: TerrainOverlayKind,
  q: number,
  r: number,
  getTerrainAt: (q: number, r: number) => string | null | undefined,
): string {
  const flags = getConnectionFlags(q, r, getTerrainAt, (candidate) => candidate === terrain);
  const prefix = TERRAIN_OVERLAY_TAG_PREFIXES[terrain];
  return `${prefix}_n${flags.north ? 1 : 0}e${flags.east ? 1 : 0}s${flags.south ? 1 : 0}w${flags.west ? 1 : 0}`;
}

export function getTerrainOverlayFrameForTile(
  terrain: TerrainOverlayKind,
  q: number,
  r: number,
  getTerrainAt: (q: number, r: number) => string | null | undefined,
): number {
  const tag = getTerrainOverlayTagForTile(terrain, q, r, getTerrainAt);
  return resolvedTerrainOverlayFrames[terrain].get(tag) ?? TERRAIN_FRAMES.overlayDefault;
}

export function getTerrainRenderSpec(terrain: string): TerrainRenderSpec {
  switch (terrain) {
    case 'forest':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.forestOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x4c7247,
      };
    case 'jungle':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.jungleOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x35583a,
      };
    case 'hill':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.hillOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x8b6a4c,
      };
    case 'swamp':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.swampOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x58654d,
      };
    case 'mountain':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.mountainOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x7a7a7a,
      };
    case 'savannah':
      return {
        baseTexture: TEXTURES.savannahBase,
        baseFrame: resolvedTerrainFrames.savannahBase,
        fallbackColor: 0xa18a4a,
      };
    case 'desert':
      return {
        baseTexture: TEXTURES.desertBase,
        baseFrame: resolvedTerrainFrames.desertBase,
        fallbackColor: 0xd8c07a,
      };
    case 'tundra':
      return {
        baseTexture: TEXTURES.tundraBase,
        baseFrame: resolvedTerrainFrames.tundraBase,
        fallbackColor: 0x99a9b0,
      };
    case 'coast':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.oceanBase,
        overlayFrame: TERRAIN_FRAMES.oceanBase,
        overlayTint: 0x8ecae6,
        overlayAlpha: 0.72,
        fallbackColor: 0x79adc7,
      };
    case 'river':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.riverOverlay,
        overlayFrame: TERRAIN_FRAMES.riverStraight,
        fallbackColor: 0x6b9863,
      };
    case 'ocean':
      return {
        baseTexture: TEXTURES.oceanBase,
        baseFrame: TERRAIN_FRAMES.oceanBase,
        fallbackColor: 0x1a4a6e,
      };
    case 'oasis':
      return {
        baseTexture: TEXTURES.desertBase,
        baseFrame: resolvedTerrainFrames.desertBase,
        overlayTexture: TEXTURES.oasisOverlay,
        fallbackColor: 0xd8c07a,
      };
    default:
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        fallbackColor: 0x7b9b5e,
      };
  }
}
