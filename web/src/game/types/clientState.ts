import type { ReplayCombatEvent } from './replay';
import type { AttackTargetView, HexCoord, PathPreviewNodeView, ReachableHexView, WorldViewModel } from './worldView';
import type { DifficultyLevel } from '../../../../src/systems/aiDifficulty.js';
import type { VictoryType } from '../../../../src/systems/warEcologySimulation.js';

export type ClientMode = 'play';

export type ClientSelection =
  | { type: 'hex'; q: number; r: number; key: string }
  | { type: 'unit'; unitId: string }
  | { type: 'city'; cityId: string }
  | { type: 'village'; villageId: string }
  | null;

export type CameraState = {
  zoom: number;
};

export type HudViewModel = {
  title: string;
  subtitle: string;
  victoryLabel: string;
  activeFactionName: string;
  phaseLabel: string;
  selectedTitle: string;
  selectedDescription: string;
  selectedMeta: Array<{ label: string; value: string }>;
  selectedCity: CityInspectorViewModel | null;
  factionSummaries: Array<{
    id: string;
    name: string;
    color: string;
    livingUnits: number;
    cities: number;
    villages: number;
    signatureUnit: string;
  }>;
  recentCombat: ReplayCombatEvent[];
  researchChip: {
    activeNodeName: string | null;
    progress: number | null;
    totalCompleted: number;
  } | null;
  settlementPreview: SettlementPreviewViewModel | null;
  supply: {
    income: number;
    used: number;
    deficit: number;
  } | null;
  exhaustion: {
    points: number;
    productionPenalty: number;
    moralePenalty: number;
  } | null;
};

export type SettlementSiteTraitViewModel = {
  key: string;
  label: string;
  effect: string;
  active: boolean;
  count: number;
};

export type SettlementBonusSummaryViewModel = {
  productionBonus: number;
  supplyBonus: number;
  villageCooldownReduction: number;
  researchBonus: number;
  traits: SettlementSiteTraitViewModel[];
};

export type SettlementPreviewViewModel = SettlementBonusSummaryViewModel & {
  q: number;
  r: number;
  terrain: string;
  canFoundNow: boolean;
  requiresMove: boolean;
  blockedReason?: string;
};

export type CityInspectorViewModel = {
  cityId: string;
  cityName: string;
  factionId: string;
  factionName: string;
  isFriendly: boolean;
  isActiveFaction: boolean;
  canManageProduction: boolean;
  production: {
    status: 'idle' | 'producing';
    current: {
      id: string;
      name: string;
      type: string;
      cost: number;
      costType: 'production' | 'villages';
      costLabel: string;
      baseCost?: number;
      costModifier?: number;
      costModifierReason?: string;
      progress: number;
      remaining: number;
      turnsRemaining: number | null;
    } | null;
    queue: Array<{
      id: string;
      name: string;
      type: string;
      cost: number;
      costType: 'production' | 'villages';
      costLabel: string;
      baseCost?: number;
      costModifier?: number;
      costModifierReason?: string;
    }>;
    perTurnIncome: number;
  };
  productionOptions: Array<{
    prototypeId: string;
    name: string;
    cost: number;
    costType: 'production' | 'villages';
    costLabel: string;
    baseCost?: number;
    costModifier?: number;
    costModifierReason?: string;
    chassisId: string;
    supplyCost: number;
    isPrototype: boolean;
    attack: number;
    defense: number;
    hp: number;
    moves: number;
    range: number;
    disabled: boolean;
    disabledReason?: string;
  }>;
  supply: {
    income: number;
    used: number;
    demand: number;
    balance: number;
    deficit: number;
  };
  turnsUntilNextVillage: number;
  exhaustion: {
    points: number;
    productionPenalty: number;
    moralePenalty: number;
  };
  villageReadiness: {
    eligible: boolean;
    latestVillageRound: number;
    checklist: Array<{
      key: string;
      label: string;
      met: boolean;
      detail?: string;
    }>;
  };
  siteBonuses: SettlementBonusSummaryViewModel;
  walls: {
    wallHp: number;
    maxWallHp: number;
    besieged: boolean;
  };
  captureRamp?: {
    turnsSinceCapture: number;
    rampMultiplier: number;
    turnsUntilOutput: number;
    turnsUntilFull: number;
  };
};

export type DebugViewModel = {
  turnEvents: { sequence?: number; round: number; kind?: 'move' | 'turn'; message: string }[];
};

export type ClientActionState = {
  selectedUnitId: string | null;
  targetingMode: 'move' | 'attack';
  legalMoves: ReachableHexView[];
  attackTargets: AttackTargetView[];
  pathPreview: PathPreviewNodeView[];
  canEndTurn: boolean;
  interactionHint: string | null;
  hoveredMove: ReachableHexView | null;
  hoveredAttackTarget: AttackTargetView | null;
  queuedUnitId: string | null;
  queuedPath: PathPreviewNodeView[];
  estimatedTurnsToArrival: number | null;
  canUndo: boolean;
};

export type PlayFeedbackState = {
  eventSequence: number;
  moveCount: number;
  endTurnCount: number;
  isDirty: boolean;
  playerFactionId: string | null;
  lastMove:
    | {
        unitId: string;
        destination: HexCoord;
      }
    | null;
  lastTurnChange:
    | {
        factionId: string;
        factionName: string;
      }
    | null;
  lastSacrifice:
    | {
        unitId: string;
        unitName: string;
        domains: string[];
      }
    | null;
  lastLearnedDomain:
    | {
        unitId: string;
        domainId: string;
      }
    | null;
  lastResearchCompletion:
    | {
        nodeId: string;
        nodeName: string;
        tier: number;
      }
    | null;
  hitAndRunRetreat:
    | {
        unitId: string;
        to: { q: number; r: number };
      }
    | null;
  lastSettlerVillageSpend:
    | {
        factionId: string;
        villageIds: string[];
      }
    | null;
  victory:
    | {
        winnerFactionId: string | null;
        eliminatedFactionId: string | null;
        victoryType: VictoryType;
        controlledCities: number | null;
        totalCities: number | null;
      }
    | null;
  difficulty: DifficultyLevel;
  maxRounds: number;
  absorbedDomains: string[];
  aiProcessing: boolean;
};

// ── Research Inspector View Model ──

export type ResearchNodeViewState =
  | 'completed'
  | 'active'
  | 'available'
  | 'locked'
  | 'insufficient';

export type ResearchNodeViewModel = {
  nodeId: string;
  name: string;
  tier: number;
  xpCost: number;
  discountedXpCost: number | null;
  currentProgress: number;
  state: ResearchNodeViewState;
  prerequisites: string[];
  prerequisiteNames: string[];
  unlocks: Array<{
    type: 'component' | 'chassis' | 'improvement' | 'recipe';
    id: string;
    name: string;
  }>;
  qualitativeEffect: string | null;
  estimatedTurns: number | null;
  domain: string;
  isNative: boolean;
  isLocked: boolean;
};

export type CapabilityPipViewModel = {
  domainId: string;
  domainName: string;
  description: string;
  level: number;
  hasResearchTrack: boolean;
  codified: boolean;
  t1Ready: boolean;
  t2Ready: boolean;
};

export type ResearchRateBreakdown = {
  base: number;
  detail: string;
  total: number;
};

export type ResearchInspectorViewModel = {
  factionId: string;
  activeNodeId: string | null;
  activeNodeName: string | null;
  activeNodeProgress: number | null;
  activeNodeXpCost: number | null;
  completedCount: number;
  totalNodes: number;
  nodes: ResearchNodeViewModel[];
  capabilities: CapabilityPipViewModel[];
  rateBreakdown: ResearchRateBreakdown;
  hasKnowledgeDiscount: boolean;
};

export type TerrainDomainPressureEntry = {
  domainId: string;
  label: string;
  pressure: number;
  playerSeed: number;
  isSynergy: boolean;
};

export type TerrainInspectorViewModel = {
  q: number;
  r: number;
  terrainId: string;
  terrainName: string;
  flavor: string;
  movementCost: number;
  defenseModifier: number;
  passable: boolean;
  navalOnly: boolean;
  isHomeTerrain: boolean;
  ecologyTags: string[];
  domainPressure: TerrainDomainPressureEntry[];
  synergyScore: number;
  cityBonus: {
    productionBonus: number;
    supplyBonus: number;
    traits: Array<{ key: string; label: string; effect: string; active: boolean }>;
  } | null;
  ownerFactionName: string | null;
  improvement: string | null;
  playerFactionName: string | null;
};

export type ClientState = {
  mode: ClientMode;
  turn: number;
  activeFactionId: string | null;
  selected: ClientSelection;
  inspectedTerrain: HexCoord | null;
  hoveredHex: HexCoord | null;
  camera: CameraState;
  world: WorldViewModel;
  hud: HudViewModel;
  actions: ClientActionState;
  debug: DebugViewModel;
  playFeedback: PlayFeedbackState | null;
  research: ResearchInspectorViewModel | null;
  productionPopupCityId: string | null;
  inspectorRequestId: number;
  terrainInspector: TerrainInspectorViewModel | null;
};

export type GameAction =
  | { type: 'select_hex'; q: number; r: number }
  | { type: 'select_unit'; unitId: string }
  | { type: 'focus_unit'; unitId: string }
  | { type: 'select_city'; cityId: string }
  | { type: 'select_village'; villageId: string }
  | { type: 'set_city_production'; cityId: string; prototypeId: string }
  | { type: 'cancel_city_production'; cityId: string }
  | { type: 'remove_from_queue'; cityId: string; queueIndex: number }
  | { type: 'set_targeting_mode'; mode: 'move' | 'attack' }
  | { type: 'move_unit'; unitId: string; destination: HexCoord }
  | { type: 'attack_unit'; attackerId: string; defenderId: string }
  | { type: 'prepare_ability'; unitId: string; ability: 'brace' | 'ambush' }
  | { type: 'board_transport'; unitId: string; transportId: string }
  | { type: 'disembark_unit'; unitId: string; transportId: string; destination: HexCoord }
  | { type: 'build_fort'; unitId: string }
  | { type: 'build_city'; unitId: string }
  | { type: 'end_turn' }
  | { type: 'start_research'; nodeId: string }
  | { type: 'cancel_research' }
  | { type: 'sacrifice_unit'; unitId: string }
  | { type: 'open_city_production'; cityId: string }
  | { type: 'close_city_production' }
  | { type: 'queue_move'; unitId: string; destination: HexCoord }
  | { type: 'cancel_queue'; unitId: string }
  | { type: 'undo' }
  | { type: 'inspect_terrain'; q: number; r: number }
  | { type: 'close_terrain_inspector' };
