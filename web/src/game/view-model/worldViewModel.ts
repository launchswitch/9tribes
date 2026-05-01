import civilizationsData from '../../../../src/content/base/civilizations.json';
import { hexDistance, hexToKey } from '../../../../src/core/grid.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import type { FactionId, GameState, Unit } from '../../../../src/game/types.js';
import { canUseAmbush, canUseBrace, getTerrainAt, hasAdjacentEnemy } from '../../../../src/systems/abilitySystem.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { deriveResourceIncome, getSupplyDeficit } from '../../../../src/systems/economySystem.js';
import { isUnitEffectivelyStealthed } from '../../../../src/systems/fogSystem.js';
import { isUnlockPrototype } from '../../../../src/systems/knowledgeSystem.js';
import { getUnitSupplyCost } from '../../../../src/systems/productionSystem.js';
import { getValidMoves } from '../../../../src/systems/movementSystem.js';
import { SIEGE_CONFIG } from '../../../../src/systems/siegeSystem.js';
import { getVictoryStatus } from '../../../../src/systems/warEcologySimulation.js';
import { getHexOwner } from '../../../../src/systems/territorySystem.js';
import { canBoardTransport, getUnitTransport, getValidDisembarkHexes } from '../../../../src/systems/transportSystem.js';
import { calculateProductionPenalty, calculateMoralePenalty } from '../../../../src/systems/warExhaustionSystem.js';
import { getSpriteKeyForUnit, getSpriteKeyForImprovement, inferChassisId } from './spriteKeys.js';
import { buildCityInspectorViewModel, buildSettlementPreview } from './inspectors/cityInspectorViewModel.js';
import { buildResearchInspectorViewModel } from './inspectors/researchInspectorViewModel.js';
import type {
  CityInspectorViewModel,
  ClientSelection,
  DebugViewModel,
  HudViewModel,
  ResearchInspectorViewModel,
} from '../types/clientState';
import type { ReplayCombatEvent } from '../types/replay';
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

export function buildWorldViewModel(source: PlayWorldSource): WorldViewModel {
  return buildPlayWorldViewModel(source);
}

export function buildHudViewModel(
  source: GameState,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
  registry?: RulesRegistry,
  liveCombatEvents?: ReplayCombatEvent[],
): HudViewModel {
  return buildPlayHudViewModel(source, selected, hoveredKey, world, registry, liveCombatEvents);
}

export function buildDebugViewModel(
  events: Array<{ round: number; message: string }> = [],
): DebugViewModel {
  return {
    turnEvents: events.slice(0, 10),
  };
}

export function getCombatSummary(event: ReplayCombatEvent) {
  const effects = event.breakdown.triggeredEffects.map((effect) => effect.label).join(', ');
  return `${event.attackerPrototypeName} vs ${event.defenderPrototypeName} · ${effects || 'no triggers'}`;
}

export { buildResearchInspectorViewModel };

function buildPlayWorldViewModel(source: PlayWorldSource): WorldViewModel {
  const { state } = source;
  if (!state.map) {
    throw new Error('Cannot build play-mode world view without a map.');
  }

  const factions = buildPlayFactions(state);
  const hexVisibility = buildHexVisibilityMap(state, source.playerFactionId);
  const hexes = Array.from(state.map.tiles.values()).map((tile) => {
    const key = hexToKey(tile.position);
    const ownerFactionId = getHexOwner(tile.position, state) ?? null;
    const ownerFaction = ownerFactionId ? state.factions.get(ownerFactionId) : null;
    const visibility = hexVisibility.get(key) ?? 'hidden';
    // Oasis only shows as oasis when currently spotted by camel unit
    // Once spotted, stays visible forever (visible or explored)
    const effectiveTerrain = tile.terrain === 'oasis' && visibility !== 'visible' && visibility !== 'explored'
      ? 'desert'
      : tile.terrain;
    return {
      key,
      q: tile.position.q,
      r: tile.position.r,
      terrain: effectiveTerrain,
      visibility,
      ownerFactionId,
      ownerFactionName: ownerFaction?.name ?? ownerFactionId,
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
    units: Array.from(state.units.values()).filter((unit) => unit.hp > 0).map((unit) => {
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
            improvementBonus = 1;
            break;
          }
        }
      }
      if (improvementBonus === 0) {
        for (const [, village] of state.villages) {
          if (village.position.q === unit.position.q && village.position.r === unit.position.r) {
            improvementBonus = 0.5;
            break;
          }
        }
      }
      const effectiveDefense = Math.max(1, Math.round(baseDefense * (1 + terrainMod + improvementBonus)));
      return {
        id: unit.id,
        factionId: unit.factionId,
        factionName: faction?.name ?? unit.factionId,
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
          ? (hexVisibility.get(hexToKey(unit.position)) ?? 'hidden') !== 'hidden' ||
            tile?.terrain === 'oasis' // Friendly units on hidden oasis are still visible
          : (hexVisibility.get(hexToKey(unit.position)) ?? 'hidden') === 'visible',
        veteranLevel: unit.veteranLevel,
        xp: unit.xp,
        nativeDomain: faction?.nativeDomain,
        learnedAbilities: unit.learnedAbilities?.map((a) => a.domainId),
        isStealthed: isUnitEffectivelyStealthed(state, unit),
        poisoned: (unit.poisoned || (unit.poisonStacks ?? 0) > 0) || undefined,
        morale: unit.morale,
        routed: unit.routed || undefined,
        preparedAbility: unit.preparedAbility,
        isSettler: prototype?.tags?.includes('settler') || undefined,
        canBrace: canBrace || undefined,
        canAmbush: canAmbush || undefined,
        isEmbarked: unitTransport !== undefined || undefined,
        transportId: unitTransport?.transportId ?? null,
        boardableTransportIds: boardableTransportIds.length > 0 ? boardableTransportIds : undefined,
        validDisembarkHexes: validDisembarkHexes.length > 0 ? validDisembarkHexes : undefined,
        supplyCost: prototype ? getUnitSupplyCost(prototype, source.registry) : 1,
        isPrototype: prototype ? isUnlockPrototype(prototype) : false,
        summonTurnsRemaining: (() => {
          const fs = unit.factionId ? state.factions.get(unit.factionId)?.summonState : undefined;
          return fs?.summoned && fs.unitId === unit.id ? fs.turnsRemaining : undefined;
        })(),
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
      siegeTurnsUntilCapture: city.besieged
        ? Math.ceil(city.wallHP / SIEGE_CONFIG.WALL_DAMAGE_PER_TURN)
        : undefined,
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
    victoryLabel: describeVictoryLabel(state),
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
      meta: [],
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
      description: unit?.prototypeName ?? `${faction?.name ?? 'Unknown'} unit.`,
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

function describeVictoryLabel(state: GameState): string {
  const victory = getVictoryStatus(state);
  if (victory.victoryType === 'unresolved') return 'In progress';
  if (victory.victoryType === 'elimination') return `${state.factions.get(victory.winnerFactionId!)?.name ?? 'Unknown'} — Elimination`;
  if (victory.victoryType === 'domination') return `${state.factions.get(victory.winnerFactionId!)?.name ?? 'Unknown'} — Domination`;
  return 'In progress';
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
