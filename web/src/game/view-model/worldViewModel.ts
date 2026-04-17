import civilizationsData from '../../../../src/content/base/civilizations.json';
import { hexDistance, hexToKey } from '../../../../src/core/grid.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import type { FactionId, GameState, Unit } from '../../../../src/game/types.js';
import { canUseAmbush, canUseBrace, getTerrainAt, hasAdjacentEnemy } from '../../../../src/systems/abilitySystem.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { deriveResourceIncome, getSupplyDeficit } from '../../../../src/systems/economySystem.js';
import { getValidMoves } from '../../../../src/systems/movementSystem.js';
import { getHexOwner } from '../../../../src/systems/territorySystem.js';
import { canBoardTransport, getUnitTransport, getValidDisembarkHexes } from '../../../../src/systems/transportSystem.js';
import { calculateProductionPenalty, calculateMoralePenalty } from '../../../../src/systems/warExhaustionSystem.js';
import { getSpriteKeyForUnit, getSpriteKeyForImprovement, inferChassisId } from './spriteKeys.js';
import { buildCityInspectorViewModel, buildSettlementPreview } from './inspectors/cityInspectorViewModel.js';
import { buildResearchInspectorViewModel } from './inspectors/researchInspectorViewModel.js';
import type {
  CityInspectorViewModel,
  ClientMode,
  ClientSelection,
  DebugViewModel,
  HudViewModel,
  ResearchInspectorViewModel,
} from '../types/clientState';
import type { ReplayAiIntentEvent, ReplayBundle, ReplayCombatEvent, ReplayFactionSummary, ReplayTurn } from '../types/replay';
import type {
  AttackTargetView,
  BorderEdgeView,
  BorderSide,
  FactionView,
  HexCoord,
  PathPreviewNodeView,
  ReachableHexView,
  WorldViewModel,
} from '../types/worldView';

type ReplayWorldSource = {
  kind: 'replay';
  replay: ReplayBundle;
  turnIndex: number;
  selectedUnitId: string | null;
  reachableHexes: ReachableHexView[];
  attackHexes: AttackTargetView[];
  pathPreview: PathPreviewNodeView[];
  queuedPath: PathPreviewNodeView[];
};

type PlayWorldSource = {
  kind: 'play';
  state: GameState;
  registry: RulesRegistry;
  playerFactionId: string | null;
  reachableHexes: ReachableHexView[];
  attackHexes: AttackTargetView[];
  pathPreview: PathPreviewNodeView[];
  queuedPath: PathPreviewNodeView[];
  lastMove: { unitId: string; destination: HexCoord } | null;
};

type WorldViewSource = ReplayWorldSource | PlayWorldSource;

type CivilizationPalette = Record<string, {
  color?: string;
}>;

const CIVILIZATIONS = civilizationsData as CivilizationPalette;
const BORDER_DIRECTIONS: Array<{ side: BorderSide; dq: number; dr: number }> = [
  { side: 'north', dq: 0, dr: -1 },
  { side: 'east', dq: 1, dr: 0 },
  { side: 'south', dq: 0, dr: 1 },
  { side: 'west', dq: -1, dr: 0 },
];

type SelectionInfo = {
  title: string;
  description: string;
  meta: Array<{ label: string; value: string }>;
  city: CityInspectorViewModel | null;
};

// ---------------------------------------------------------------------------
// Public entry points (thin dispatchers)
// ---------------------------------------------------------------------------

export function buildWorldViewModel(source: WorldViewSource): WorldViewModel {
  return source.kind === 'replay'
    ? buildReplayWorldViewModel(source)
    : buildPlayWorldViewModel(source);
}

export function buildHudViewModel(
  source: ReplayBundle | GameState,
  turnIndex: number,
  mode: ClientMode,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
  registry?: RulesRegistry,
  liveCombatEvents?: ReplayCombatEvent[],
): HudViewModel {
  return mode === 'replay'
    ? buildReplayHudViewModel(source as ReplayBundle, turnIndex, selected, hoveredKey, world)
    : buildPlayHudViewModel(source as GameState, selected, hoveredKey, world, registry, liveCombatEvents);
}

export function buildDebugViewModel(
  turn: ReplayTurn | null,
  events: Array<{ round: number; message: string }> = [],
): DebugViewModel {
  return {
    turnEvents: turn ? turn.events.slice(0, 10) : events.slice(0, 10),
  };
}

export function getCombatSummary(event: ReplayCombatEvent) {
  const effects = event.breakdown.triggeredEffects.map((effect) => effect.label).join(', ');
  return `${event.attackerPrototypeName} vs ${event.defenderPrototypeName} · ${effects || 'no triggers'}`;
}

export function getIntentSummary(intent: ReplayAiIntentEvent, factions: ReplayFactionSummary[]) {
  const faction = factions.find((entry) => entry.id === intent.factionId);
  return `${faction?.name ?? intent.factionId}: ${intent.intent} · ${intent.reason}`;
}

export { buildResearchInspectorViewModel };

// ---------------------------------------------------------------------------
// Replay world view
// ---------------------------------------------------------------------------

function buildReplayWorldViewModel(source: ReplayWorldSource): WorldViewModel {
  const turn = source.replay.turns[source.turnIndex] ?? source.replay.turns[0];
  const board = turn.snapshotEnd;
  const factions = buildReplayFactions(source.replay);
  const ownership = new Map<string, string>();

  for (const city of board.cities) {
    ownership.set(`${city.q},${city.r}`, city.factionId);
  }
  for (const village of board.villages) {
    ownership.set(`${village.q},${village.r}`, village.factionId);
  }

  const hexes = source.replay.map.hexes.map((hex) => ({
    key: hex.key,
    q: hex.q,
    r: hex.r,
    terrain: hex.terrain,
    visibility: 'visible' as const,
    ownerFactionId: ownership.get(hex.key) ?? null,
  }));

  return {
    activeFactionId: board.factions[0]?.id ?? null,
    map: {
      width: source.replay.map.width,
      height: source.replay.map.height,
      hexes,
    },
    factions,
    units: board.units.map((unit) => {
      const chassisId = inferChassisId(unit.prototypeName);
      return {
        id: unit.id,
        factionId: unit.factionId,
        q: unit.q,
        r: unit.r,
        hp: unit.hp,
        maxHp: unit.maxHp,
        attack: 0,
        defense: 0,
        effectiveDefense: 0,
        range: 1,
        movesRemaining: 0,
        movesMax: 0,
        acted: false,
        canAct: unit.id === source.selectedUnitId && source.reachableHexes.length > 0,
        isActiveFaction: unit.factionId === (board.factions[0]?.id ?? null),
        status: 'inactive' as const,
        prototypeId: unit.prototypeId,
        prototypeName: unit.prototypeName,
        chassisId,
        role: chassisId,
        spriteKey: getSpriteKeyForUnit(unit.factionId, unit.prototypeName, chassisId, undefined),
        facing: unit.facing ?? 0,
        visible: true,
      };
    }),
    cities: board.cities.map((city) => ({
      id: city.id,
      name: city.name,
      factionId: city.factionId,
      q: city.q,
      r: city.r,
      visible: true,
      remembered: true,
      besieged: city.besieged,
      wallHp: city.wallHp,
      maxWallHp: city.maxWallHp,
      turnsSinceCapture: 0,
    })),
    villages: board.villages.map((village) => ({
      id: village.id,
      name: village.name,
      factionId: village.factionId,
      q: village.q,
      r: village.r,
      visible: true,
      remembered: true,
    })),
    improvements: [],
    overlays: {
      borders: buildBorderEdges(hexes, factions),
      reachableHexes: source.reachableHexes,
      attackHexes: source.attackHexes,
      pathPreview: source.pathPreview,
      queuedPath: source.queuedPath,
      lastMove: null,
    },
    visibility: {
      mode: 'full',
      activeFactionId: board.factions[0]?.id ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Play world view
// ---------------------------------------------------------------------------

function buildPlayWorldViewModel(source: PlayWorldSource): WorldViewModel {
  const { state } = source;
  if (!state.map) {
    throw new Error('Cannot build play-mode world view without a map.');
  }

  const factions = buildPlayFactions(state);
  const hexVisibility = buildHexVisibilityMap(state, source.playerFactionId);
  const hexes = Array.from(state.map.tiles.values()).map((tile) => {
    const key = hexToKey(tile.position);
    return {
      key,
      q: tile.position.q,
      r: tile.position.r,
      terrain: tile.terrain,
      visibility: hexVisibility.get(key) ?? 'hidden' as const,
      ownerFactionId: getHexOwner(tile.position, state) ?? null,
    };
  });

  const moveCounts = new Map<string, number>();
  const attackCounts = new Map<string, number>();
  for (const unit of state.units.values()) {
    moveCounts.set(
      unit.id,
      unit.factionId === state.activeFactionId && unit.status === 'ready'
        ? getPlayableMoves(state, unit, source.registry).length
        : 0,
    );
    attackCounts.set(
      unit.id,
      unit.factionId === state.activeFactionId && unit.status === 'ready'
        ? getAttackableEnemies(state, unit).length
        : 0,
    );
  }

  return {
    activeFactionId: state.activeFactionId,
    map: {
      width: state.map.width,
      height: state.map.height,
      hexes,
    },
    factions,
    units: Array.from(state.units.values()).map((unit) => {
      const prototype = state.prototypes.get(unit.prototypeId as never);
      const chassisId = prototype?.chassisId ?? inferChassisId(prototype?.name ?? unit.prototypeId);
      const canAct = unit.factionId === state.activeFactionId
        && unit.status === 'ready'
        && unit.hp > 0
        && ((moveCounts.get(unit.id) ?? 0) > 0 || (attackCounts.get(unit.id) ?? 0) > 0);
      const faction = state.factions.get(unit.factionId);
      const factionDoctrine = faction
        ? resolveCapabilityDoctrine(state.research.get(unit.factionId as never), faction)
        : undefined;
      const unitTransport = getUnitTransport(unit.id, state.transportMap);
      const boardableTransportIds = unit.factionId === state.activeFactionId && unit.hp > 0
        ? Array.from(state.units.values())
          .filter((candidate) => candidate.factionId === unit.factionId && candidate.id !== unit.id)
          .filter((candidate) => canBoardTransport(state, unit.id, candidate.id, source.registry, state.transportMap))
          .map((candidate) => candidate.id)
        : [];
      const validDisembarkHexes = unitTransport
        ? getValidDisembarkHexes(state, unitTransport.transportId, source.registry, state.transportMap)
        : [];
      const canBrace = !!prototype
        && canAct
        && (canUseBrace(prototype) || factionDoctrine?.fortressTranscendenceEnabled === true)
        && hasAdjacentEnemy(state, unit);
      const canAmbush = !!prototype
        && canAct
        && canUseAmbush(prototype, getTerrainAt(state, unit.position))
        && !hasAdjacentEnemy(state, unit);
      const baseDefense = prototype?.derivedStats.defense ?? 0;
      // Compute effective defense including terrain, improvements, cities, villages
      const tile = state.map?.tiles.get(`${unit.position.q},${unit.position.r}`);
      const terrainDef = tile ? source.registry.getTerrain(tile.terrain) : undefined;
      const terrainMod = terrainDef?.defenseModifier ?? 0;
      let improvementBonus = 0;
      for (const [, improvement] of state.improvements) {
        if (improvement.position.q === unit.position.q && improvement.position.r === unit.position.r) {
          improvementBonus = improvement.defenseBonus ?? 0;
          break;
        }
      }
      if (improvementBonus === 0) {
        for (const [, city] of state.cities) {
          if (city.position.q === unit.position.q && city.position.r === unit.position.r) {
            improvementBonus = 1; // +100% in cities
            break;
          }
        }
      }
      if (improvementBonus === 0) {
        for (const [, village] of state.villages) {
          if (village.position.q === unit.position.q && village.position.r === unit.position.r) {
            improvementBonus = 0.5; // +50% in villages
            break;
          }
        }
      }
      const effectiveDefense = Math.max(1, Math.round(baseDefense * (1 + terrainMod + improvementBonus)));
      return {
        id: unit.id,
        factionId: unit.factionId,
        q: unit.position.q,
        r: unit.position.r,
        hp: unit.hp,
        maxHp: unit.maxHp,
        attack: prototype?.derivedStats.attack ?? 0,
        defense: baseDefense,
        effectiveDefense,
        range: prototype?.derivedStats.range ?? 1,
        movesRemaining: unit.movesRemaining,
        movesMax: unit.maxMoves,
        acted: unit.factionId === state.activeFactionId ? !canAct : false,
        canAct,
        isActiveFaction: unit.factionId === state.activeFactionId,
        status: unit.factionId === state.activeFactionId
          ? (unit.status === 'fortified' ? 'fortified' as const : canAct ? 'ready' as const : 'spent' as const)
          : 'inactive' as const,
        prototypeId: unit.prototypeId,
        prototypeName: prototype?.name ?? unit.prototypeId,
        chassisId,
        movementClass: thisChassisMovementClass(prototype?.chassisId, source.registry),
        role: prototype?.derivedStats.role,
        spriteKey: getSpriteKeyForUnit(unit.factionId, prototype?.name ?? unit.prototypeId, chassisId, prototype?.sourceRecipeId),
        facing: unit.facing ?? 0,
        visible: unit.factionId === source.playerFactionId
          ? (hexVisibility.get(hexToKey(unit.position)) ?? 'hidden') !== 'hidden'
          : (hexVisibility.get(hexToKey(unit.position)) ?? 'hidden') === 'visible',
        veteranLevel: unit.veteranLevel,
        xp: unit.xp,
        nativeDomain: faction?.nativeDomain,
        learnedAbilities: unit.learnedAbilities?.map((a) => a.domainId),
        isStealthed: unit.isStealthed,
        poisoned: (unit.poisoned || (unit.poisonStacks ?? 0) > 0) || undefined,
        routed: unit.routed || undefined,
        preparedAbility: unit.preparedAbility,
        isSettler: prototype?.tags?.includes('settler') || undefined,
        canBrace: canBrace || undefined,
        canAmbush: canAmbush || undefined,
        isEmbarked: unitTransport !== undefined || undefined,
        transportId: unitTransport?.transportId ?? null,
        boardableTransportIds: boardableTransportIds.length > 0 ? boardableTransportIds : undefined,
        validDisembarkHexes: validDisembarkHexes.length > 0 ? validDisembarkHexes : undefined,
      };
    }),
    cities: Array.from(state.cities.values()).map((city) => ({
      id: city.id,
      name: city.name,
      factionId: city.factionId,
      q: city.position.q,
      r: city.position.r,
      visible: city.factionId === source.playerFactionId
        ? (hexVisibility.get(hexToKey(city.position)) ?? 'hidden') !== 'hidden'
        : (hexVisibility.get(hexToKey(city.position)) ?? 'hidden') === 'visible',
      remembered: true,
      besieged: city.besieged,
      wallHp: city.wallHP,
      maxWallHp: city.maxWallHP,
      turnsSinceCapture: city.turnsSinceCapture,
    })),
    villages: Array.from(state.villages.values()).map((village) => ({
      id: village.id,
      name: village.name,
      factionId: village.factionId,
      q: village.position.q,
      r: village.position.r,
      visible: village.factionId === source.playerFactionId
        ? (hexVisibility.get(hexToKey(village.position)) ?? 'hidden') !== 'hidden'
        : (hexVisibility.get(hexToKey(village.position)) ?? 'hidden') === 'visible',
      remembered: true,
    })),
    improvements: Array.from(state.improvements.values()).map((improvement) => ({
      id: improvement.id,
      type: improvement.type,
      q: improvement.position.q,
      r: improvement.position.r,
      ownerFactionId: improvement.ownerFactionId,
      spriteKey: getSpriteKeyForImprovement(improvement.ownerFactionId, improvement.type),
      visible: improvement.ownerFactionId === source.playerFactionId
        ? (hexVisibility.get(hexToKey(improvement.position)) ?? 'hidden') !== 'hidden'
        : (hexVisibility.get(hexToKey(improvement.position)) ?? 'hidden') === 'visible',
    })),
    overlays: {
      borders: buildBorderEdges(hexes, factions),
      reachableHexes: source.reachableHexes,
      attackHexes: source.attackHexes,
      pathPreview: source.pathPreview,
      queuedPath: source.queuedPath,
      lastMove: source.lastMove,
    },
    visibility: {
      mode: 'fogged',
      activeFactionId: state.activeFactionId,
    },
  };
}

function thisChassisMovementClass(chassisId: string | undefined, registry: RulesRegistry): string | undefined {
  return chassisId ? registry.getChassis(chassisId)?.movementClass : undefined;
}

// ---------------------------------------------------------------------------
// HUD builders
// ---------------------------------------------------------------------------

function buildReplayHudViewModel(
  replay: ReplayBundle,
  turnIndex: number,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
): HudViewModel {
  const turn = replay.turns[turnIndex] ?? replay.turns[0];
  const board = turn.snapshotEnd;
  const selectionInfo = describeReplaySelection(replay, turnIndex, selected, world);
  const hoverTerrain = hoveredKey
    ? replay.map.hexes.find((hex) => hex.key === hoveredKey)?.terrain ?? 'map'
    : 'map';

  return {
    title: 'Replay Renderer',
    subtitle: `Seed ${replay.seed} · round ${turn.round} of ${replay.maxTurns} · hover ${hoverTerrain}`,
    victoryLabel: describeVictory(replay),
    activeFactionName: world.factions.find((faction) => faction.id === world.activeFactionId)?.name ?? 'All factions',
    phaseLabel: 'Replay',
    selectedTitle: selectionInfo.title,
    selectedDescription: selectionInfo.description,
    selectedMeta: selectionInfo.meta,
    selectedCity: null,
    factionSummaries: board.factions.map((factionState) => {
      const faction = replay.factions.find((entry) => entry.id === factionState.id);
      return {
        id: factionState.id,
        name: faction?.name ?? factionState.id,
        color: faction?.color ?? '#c8b68e',
        livingUnits: factionState.livingUnits,
        cities: factionState.cities,
        villages: factionState.villages,
        signatureUnit: faction?.signatureUnit ?? 'Unknown signature',
      };
    }),
    recentCombat: turn.combatEvents.slice(0, 4),
    recentSieges: turn.siegeEvents.slice(0, 4),
    recentIntents: turn.aiIntentEvents.slice(0, 6),
    researchChip: null,
    settlementPreview: null,
    supply: null,
    exhaustion: null,
  };
}

function buildPlayHudViewModel(
  state: GameState,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
  registry?: RulesRegistry,
  liveCombatEvents?: ReplayCombatEvent[],
): HudViewModel {
  const activeFaction = state.activeFactionId ? state.factions.get(state.activeFactionId) : null;
  const selectionInfo = describePlaySelection(state, selected, hoveredKey, world, registry);

  return {
    title: 'Live Session',
    subtitle: `Seed ${state.seed} · round ${state.round} · turn ${state.turnNumber}`,
    victoryLabel: 'In progress',
    activeFactionName: activeFaction?.name ?? 'No active faction',
    phaseLabel: 'Command',
    selectedTitle: selectionInfo.title,
    selectedDescription: selectionInfo.description,
    selectedMeta: selectionInfo.meta,
    selectedCity: selectionInfo.city,
    factionSummaries: Array.from(state.factions.values()).map((faction) => ({
      id: faction.id,
      name: faction.name,
      color: CIVILIZATIONS[faction.id]?.color ?? '#c8b68e',
      livingUnits: Array.from(state.units.values()).filter((unit) => unit.factionId === faction.id && unit.hp > 0).length,
      cities: Array.from(state.cities.values()).filter((city) => city.factionId === faction.id).length,
      villages: Array.from(state.villages.values()).filter((village) => village.factionId === faction.id).length,
      signatureUnit: faction.identityProfile.signatureUnit,
    })),
    recentCombat: (liveCombatEvents ?? []).filter(
      (e) => e.attackerFactionId === state.activeFactionId || e.defenderFactionId === state.activeFactionId,
    ),
    recentSieges: [],
    recentIntents: [],
    researchChip: registry
      ? buildResearchChip(state, registry)
      : null,
    settlementPreview: buildSettlementPreview(state, selected, hoveredKey, world),
    supply: registry && state.activeFactionId
      ? (() => {
          const economy = deriveResourceIncome(state, state.activeFactionId, registry);
          return {
            income: economy.supplyIncome,
            used: economy.supplyDemand,
            deficit: getSupplyDeficit(economy),
          };
        })()
      : null,
    exhaustion: state.activeFactionId
      ? (() => {
          const ex = state.warExhaustion.get(state.activeFactionId);
          return ex
            ? {
                points: ex.exhaustionPoints,
                productionPenalty: calculateProductionPenalty(ex.exhaustionPoints),
                moralePenalty: calculateMoralePenalty(ex.exhaustionPoints),
              }
            : { points: 0, productionPenalty: 0, moralePenalty: 0 };
        })()
      : null,
  };
}

function buildResearchChip(
  state: GameState,
  registry: RulesRegistry,
): { activeNodeName: string | null; progress: number | null; totalCompleted: number } | null {
  const factionId = state.activeFactionId;
  if (!factionId) return null;
  const research = state.research.get(factionId as never);
  const faction = state.factions.get(factionId as never);
  if (!research || !faction) return null;

  let activeNodeName: string | null = null;
  let activeNodeCost = 0;
  const activeProgress = research.activeNodeId
    ? (research.progressByNodeId[research.activeNodeId as never] ?? 0)
    : null;

  if (research.activeNodeId) {
    const domainId = research.activeNodeId.split('_t')[0];
    const domain = registry.getResearchDomain(domainId);
    if (domain) {
      activeNodeName = domain.nodes[research.activeNodeId]?.name ?? research.activeNodeId;
      activeNodeCost = domain.nodes[research.activeNodeId]?.xpCost ?? 0;
    }
  }

  return {
    activeNodeName,
    progress: activeProgress !== null && activeNodeCost > 0 ? activeProgress / activeNodeCost : null,
    totalCompleted: research.completedNodes.length,
  };
}

// ---------------------------------------------------------------------------
// Selection description
// ---------------------------------------------------------------------------

function describeReplaySelection(
  replay: ReplayBundle,
  turnIndex: number,
  selected: ClientSelection,
  world: WorldViewModel,
) {
  const turn = replay.turns[turnIndex] ?? replay.turns[0];
  if (!selected) {
    return {
      title: 'No selection',
      description: 'Click a tile, unit, city, or village to inspect the replay snapshot.',
      meta: [
        { label: 'Units', value: String(turn.snapshotEnd.units.length) },
        { label: 'Cities', value: String(turn.snapshotEnd.cities.length) },
      ],
    };
  }

  return describeSelectionFromWorld(selected, world, {
    emptyTitle: 'No selection',
    emptyDescription: 'Click a tile, unit, city, or village to inspect the replay snapshot.',
  });
}

function describePlaySelection(
  state: GameState,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
  registry?: RulesRegistry,
) {
  if (!selected && hoveredKey) {
    const hoveredHex = world.map.hexes.find((hex) => hex.key === hoveredKey);
    return {
      title: hoveredHex ? `Tile ${hoveredHex.key}` : 'No selection',
      description: hoveredHex ? `Terrain: ${hoveredHex.terrain}.` : 'Select a unit or tile to issue movement orders.',
      meta: hoveredHex ? [
        { label: 'Owner', value: hoveredHex.ownerFactionId ?? 'Neutral' },
        { label: 'Visibility', value: hoveredHex.visibility },
      ] : [],
      city: null,
    };
  }

  const activeFactionName = state.activeFactionId
    ? state.factions.get(state.activeFactionId)?.name ?? 'Unknown'
    : 'Unknown';

  return describeSelectionFromWorld(selected, world, {
    emptyTitle: 'No selection',
    emptyDescription: `Active faction: ${activeFactionName}. Select a friendly unit to show legal moves.`,
    state,
    registry,
  });
}

function describeSelectionFromWorld(
  selected: ClientSelection,
  world: WorldViewModel,
  empty: { emptyTitle: string; emptyDescription: string; state?: GameState; registry?: RulesRegistry },
): SelectionInfo {
  if (!selected) {
    return {
      title: empty.emptyTitle,
      description: empty.emptyDescription,
      meta: [] as Array<{ label: string; value: string }>,
      city: null,
    };
  }

  if (selected.type === 'hex') {
    const hex = world.map.hexes.find((entry) => entry.key === selected.key);
    return {
      title: `Tile ${selected.key}`,
      description: `Terrain: ${hex?.terrain ?? 'unknown'}.`,
      meta: [
        { label: 'Coordinate', value: `${selected.q}, ${selected.r}` },
        { label: 'Owner', value: hex?.ownerFactionId ?? 'Neutral' },
        { label: 'Visibility', value: hex?.visibility ?? 'unknown' },
      ],
      city: null,
    };
  }

  if (selected.type === 'unit') {
    const unit = world.units.find((entry) => entry.id === selected.unitId);
    const faction = unit ? world.factions.find((entry) => entry.id === unit.factionId) : null;
    return {
      title: unit?.prototypeName ?? 'Unit',
      description: `${faction?.name ?? 'Unknown faction'} field unit.`,
      meta: [
        { label: 'Position', value: unit ? `${unit.q}, ${unit.r}` : 'n/a' },
        { label: 'Health', value: unit ? `${unit.hp}/${unit.maxHp}` : 'n/a' },
        { label: 'Moves', value: unit ? `${unit.movesRemaining}/${unit.movesMax}` : 'n/a' },
        { label: 'Acted', value: unit?.acted ? 'Yes' : 'No' },
        ...(unit?.veteranLevel
          ? [{ label: 'Veterancy', value: `${unit.veteranLevel}${unit.xp != null ? ` (${unit.xp} XP)` : ''}` }]
          : []),
      ],
      city: null,
    };
  }

  if (selected.type === 'city') {
    const city = world.cities.find((entry) => entry.id === selected.cityId);
    const faction = city ? world.factions.find((entry) => entry.id === city.factionId) : null;
    const cityInspector = empty.state && empty.registry
      ? buildCityInspectorViewModel(empty.state, selected.cityId, empty.registry)
      : null;
    return {
      title: city?.name ?? 'City',
      description: `${faction?.name ?? 'Unknown faction'} settlement.`,
      meta: [
        { label: 'Position', value: city ? `${city.q}, ${city.r}` : 'n/a' },
        { label: 'Walls', value: city ? `${city.wallHp ?? 0}/${city.maxWallHp ?? 0}` : 'n/a' },
        { label: 'Besieged', value: city?.besieged ? 'Yes' : 'No' },
      ],
      city: cityInspector,
    };
  }

  const village = world.villages.find((entry) => entry.id === selected.villageId);
  const faction = village ? world.factions.find((entry) => entry.id === village.factionId) : null;
  return {
    title: village?.name ?? 'Village',
    description: `${faction?.name ?? 'Unknown faction'} village outpost.`,
    meta: [
      { label: 'Position', value: village ? `${village.q}, ${village.r}` : 'n/a' },
    ],
    city: null,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function describeVictory(replay: ReplayBundle) {
  const winner = replay.victory.winnerFactionId
    ? replay.factions.find((faction) => faction.id === replay.victory.winnerFactionId)?.name ?? replay.victory.winnerFactionId
    : 'Unresolved';

  if (
    replay.victory.victoryType === 'domination'
    && replay.victory.controlledCities !== null
    && replay.victory.dominationThreshold !== null
  ) {
    return `${winner} ${replay.victory.controlledCities}/${replay.victory.dominationThreshold}`;
  }

  return `${winner} · ${replay.victory.victoryType}`;
}

function buildReplayFactions(replay: ReplayBundle): FactionView[] {
  return replay.factions.map((faction) => ({
    id: faction.id,
    name: faction.name,
    color: faction.color,
    nativeDomain: faction.nativeDomain,
    signatureUnit: faction.signatureUnit,
    economyAngle: faction.economyAngle,
  }));
}

function buildPlayFactions(state: GameState): FactionView[] {
  return Array.from(state.factions.values()).map((faction) => ({
    id: faction.id,
    name: faction.name,
    color: CIVILIZATIONS[faction.id]?.color ?? '#c8b68e',
    nativeDomain: faction.nativeDomain,
    signatureUnit: faction.identityProfile.signatureUnit,
    economyAngle: faction.identityProfile.economyAngle,
    homeCityId: faction.homeCityId,
    learnedDomains: faction.learnedDomains ?? [],
  }));
}

function buildHexVisibilityMap(state: GameState, playerFactionId: string | null): Map<string, 'visible' | 'explored' | 'hidden'> {
  const map = new Map<string, 'visible' | 'explored' | 'hidden'>();
  if (!playerFactionId || !state.fogState) {
    return map;
  }

  const fog = state.fogState.get(playerFactionId as FactionId);
  if (!fog) {
    return map;
  }

  for (const [key, level] of fog.hexVisibility) {
    map.set(key, level);
  }

  return map;
}

function buildBorderEdges(
  hexes: Array<{ key: string; q: number; r: number; ownerFactionId: string | null; visibility: 'visible' | 'explored' | 'hidden' }>,
  factions: FactionView[],
): BorderEdgeView[] {
  const factionColors = new Map(factions.map((faction) => [faction.id, faction.color]));
  const hexMap = new Map(hexes.map((hex) => [hex.key, hex]));
  const edges: BorderEdgeView[] = [];

  for (const hex of hexes) {
    if (!hex.ownerFactionId || hex.visibility === 'hidden') {
      continue;
    }

    for (const direction of BORDER_DIRECTIONS) {
      const neighbor = hexMap.get(`${hex.q + direction.dq},${hex.r + direction.dr}`);
      if (neighbor?.ownerFactionId === hex.ownerFactionId) {
        continue;
      }

      edges.push({
        id: `${hex.key}:${direction.side}`,
        q: hex.q,
        r: hex.r,
        side: direction.side,
        factionId: hex.ownerFactionId,
        color: factionColors.get(hex.ownerFactionId) ?? '#f7e7bf',
      });
    }
  }

  return edges;
}

function getPlayableMoves(state: GameState, unit: Unit, registry: RulesRegistry) {
  if (!state.map) {
    return [];
  }

  return getValidMoves(state, unit.id, state.map, registry);
}

function getAttackableEnemies(state: GameState, unit: Unit) {
  if (unit.attacksRemaining <= 0) {
    return [];
  }

  const prototype = state.prototypes.get(unit.prototypeId as never);
  const attackRange = prototype?.derivedStats.range ?? 1;
  return Array.from(state.units.values()).filter((candidate) =>
    candidate.hp > 0
    && candidate.factionId !== unit.factionId
    && hexDistance(unit.position, candidate.position) <= attackRange
  );
}
