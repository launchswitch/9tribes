import { buildMvpScenario } from '../../../../src/game/buildMvpScenario.js';
import type { GameState, Unit, UnitId } from '../../../../src/game/types.js';
import type { HexCoord } from '../../../../src/types.js';
import { createCityId, createImprovementId } from '../../../../src/core/ids.js';
import { hexDistance, hexToKey } from '../../../../src/core/grid.js';
import { getMvpScenarioConfig } from '../../../../src/game/scenarios/mvp.js';
import { loadRulesRegistry } from '../../../../src/data/loader/loadRulesRegistry.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import { applyCombatAction, previewCombatAction, type CombatActionPreview } from '../../../../src/systems/combatActionSystem.js';
import { getValidMoves, moveUnit, previewMove, canMoveTo } from '../../../../src/systems/movementSystem.js';
import { findPath } from '../../../../src/systems/pathfinder.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { canUseAmbush, canUseBrace, getTerrainAt, hasAdjacentEnemy, prepareAbility } from '../../../../src/systems/abilitySystem.js';
import { computeFactionStrategy } from '../../../../src/systems/strategicAi.js';
import {
  canPaySettlerVillageCost,
  canProducePrototype,
  cancelCurrentProduction,
  getPrototypeCostType,
  getPrototypeQueueCost,
  queueUnit,
  removeFromQueue,
} from '../../../../src/systems/productionSystem.js';
import { syncFactionSettlementIds } from '../../../../src/systems/factionOwnershipSystem.js';
import { advanceTurn } from '../../../../src/systems/turnSystem.js';
import { activateAiUnit } from '../../../../src/systems/unitActivationSystem.js';
import {
  startResearch,
} from '../../../../src/systems/researchSystem.js';
import { unlockHybridRecipes } from '../../../../src/systems/hybridSystem.js';
import { calculatePrototypeCost, getDomainIdsByTags, isUnlockPrototype } from '../../../../src/systems/knowledgeSystem.js';
import { getUnitCost } from '../../../../src/systems/productionSystem.js';
import type { CombatResult } from '../../../../src/systems/combatSystem.js';
import type { GameAction } from '../types/clientState';
import type { ReplayCombatEvent } from '../types/replay';
import type { PlayStateSource, SerializedGameState } from '../types/playState';
import type { AttackTargetView, ReachableHexView } from '../types/worldView';
import { deserializeGameState, serializeGameState } from '../types/playState';
import { updateFogState } from '../../../../src/systems/fogSystem.js';
import { isCityEncircled, isEncirclementBroken } from '../../../../src/systems/territorySystem.js';
import { runFactionPhase } from '../../../../src/systems/factionPhaseSystem.js';
import { performSacrifice } from '../../../../src/systems/sacrificeSystem.js';
import { createCitySiteBonuses, getSettlementOccupancyBlocker } from '../../../../src/systems/citySiteSystem.js';
import { boardTransport, canBoardTransport, disembarkUnit, getUnitTransport } from '../../../../src/systems/transportSystem.js';
import type { DifficultyLevel } from '../../../../src/systems/aiDifficulty.js';
import type { MapGenerationMode } from '../../../../src/world/map/types.js';

type SessionEvent = {
  sequence: number;
  round: number;
  kind: 'move' | 'turn' | 'combat';
  message: string;
};

type SessionFeedback = {
  eventSequence: number;
  moveCount: number;
  endTurnCount: number;
  lastActiveFactionId: string | null;
  liveCombatEvents: ReplayCombatEvent[];
  lastMove:
    | {
        unitId: string;
        destination: { q: number; r: number };
      }
    | null;
  lastTurnChange:
    | {
        factionId: string;
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
  absorbedDomains: string[];
  /** True while runAiUntilHumanTurn is actively processing AI factions (yielded to event loop) */
  aiProcessing: boolean;
};

type AiTurnContext = {
  factionId: string;
  unitIds: string[];
  index: number;
  fortsBuiltThisTurn: Set<string>;
};

/** Pre-resolved combat data returned by resolveAttack() before state is mutated */
export interface PendingCombat {
  attackerId: UnitId;
  defenderId: UnitId;
  preview: CombatActionPreview;
  result: CombatResult;
  combatEvent: ReplayCombatEvent;
}

interface GameSessionOptions {
  humanControlledFactionIds?: string[];
  difficulty?: DifficultyLevel;
  mapMode?: MapGenerationMode;
  mapSize?: 'small' | 'medium' | 'large';
  selectedFactions?: string[];
}

export type SessionSaveSnapshot = {
  payload: SerializedGameState;
  preview: {
    round: number;
    turnNumber: number;
    activeFactionId: string | null;
    activeFactionName: string;
    playerFactionId: string | null;
    playerFactionName: string | null;
  };
};

export class GameSession {
  private state: GameState;
  private readonly registry: RulesRegistry;
  private readonly maxTurns: number;
  private readonly humanControlledFactionIds: Set<string>;
  private readonly difficulty: DifficultyLevel;
  private readonly mapMode?: MapGenerationMode;
  private readonly mapSize?: 'small' | 'medium' | 'large';
  private readonly selectedFactions?: string[];
  private readonly events: SessionEvent[] = [];
  private readonly feedback: SessionFeedback = {
    eventSequence: 0,
    moveCount: 0,
    endTurnCount: 0,
    lastActiveFactionId: null,
    lastMove: null,
    lastTurnChange: null,
    lastSacrifice: null,
    lastLearnedDomain: null,
    lastResearchCompletion: null,
    hitAndRunRetreat: null,
    lastSettlerVillageSpend: null,
    absorbedDomains: [],
    liveCombatEvents: [],
    aiProcessing: false,
  };

  /** Holds a pre-resolved combat waiting for animation to complete before applying */
  private _pendingCombat: PendingCombat | null = null;

  /** Queue of AI-vs-AI (or AI-vs-player) combats resolved during AI turn processing */
  private _aiCombatQueue: PendingCombat[] = [];
  private _aiTurnContext: AiTurnContext | null = null;

  constructor(
    source: PlayStateSource = { type: 'fresh' },
    registry = loadRulesRegistry(),
    options: GameSessionOptions = {},
  ) {
    this.registry = registry;
    this.maxTurns = getMvpScenarioConfig().roundsToWin;
    this.difficulty = options.difficulty ?? 'easy';
    this.mapMode = options.mapMode;
    this.mapSize = options.mapSize;
    this.selectedFactions = options.selectedFactions;
    this.humanControlledFactionIds = new Set(options.humanControlledFactionIds ?? []);
    this.state = this.bootstrap(source);
    if (this.humanControlledFactionIds.size === 0) {
      this.state.factions.forEach((_faction, factionId) => this.humanControlledFactionIds.add(factionId));
    }
    this.feedback.lastActiveFactionId = this.state.activeFactionId;
    this.continueAiUntilHumanTurn();
  }

  getState() {
    return this.state;
  }

  getRegistry() {
    return this.registry;
  }

  getMaxTurns() {
    return this.maxTurns;
  }

  getEvents() {
    return [...this.events];
  }

  getFeedback() {
    return {
      ...this.feedback,
      lastMove: this.feedback.lastMove ? {
        ...this.feedback.lastMove,
        destination: { ...this.feedback.lastMove.destination },
      } : null,
      lastTurnChange: this.feedback.lastTurnChange ? { ...this.feedback.lastTurnChange } : null,
      lastSacrifice: this.feedback.lastSacrifice ? { ...this.feedback.lastSacrifice } : null,
      lastLearnedDomain: this.feedback.lastLearnedDomain ? { ...this.feedback.lastLearnedDomain } : null,
      lastResearchCompletion: this.feedback.lastResearchCompletion ? { ...this.feedback.lastResearchCompletion } : null,
      hitAndRunRetreat: this.feedback.hitAndRunRetreat ? { ...this.feedback.hitAndRunRetreat } : null,
      lastSettlerVillageSpend: this.feedback.lastSettlerVillageSpend
        ? {
            factionId: this.feedback.lastSettlerVillageSpend.factionId,
            villageIds: [...this.feedback.lastSettlerVillageSpend.villageIds],
          }
        : null,
      absorbedDomains: [...this.feedback.absorbedDomains],
      aiProcessing: this.feedback.aiProcessing,
    };
  }

  getPrimaryHumanFactionId(): string | null {
    return Array.from(this.humanControlledFactionIds)[0] ?? null;
  }

  getSaveSnapshot(): SessionSaveSnapshot {
    const playerFactionId = Array.from(this.humanControlledFactionIds)[0] ?? null;
    const playerFaction = playerFactionId ? this.state.factions.get(playerFactionId as never) : null;
    const activeFaction = this.state.activeFactionId
      ? this.state.factions.get(this.state.activeFactionId as never)
      : null;

    return {
      payload: serializeGameState(this.state),
      preview: {
        round: this.state.round,
        turnNumber: this.state.turnNumber,
        activeFactionId: this.state.activeFactionId,
        activeFactionName: activeFaction?.name ?? 'No active faction',
        playerFactionId,
        playerFactionName: playerFaction?.name ?? null,
      },
    };
  }

  dispatch(action: GameAction) {
    switch (action.type) {
      case 'move_unit':
        this.applyMove(action.unitId as UnitId, action.destination);
        return;
      case 'queue_move':
        this.applyQueueMove(action.unitId, action.destination);
        return;
      case 'cancel_queue':
        this.applyCancelQueue(action.unitId);
        return;
      case 'attack_unit':
        this._pendingCombat = this.resolveAttack(action.attackerId as UnitId, action.defenderId as UnitId);
        return;
      case 'prepare_ability':
        this.applyPrepareAbility(action.unitId, action.ability);
        return;
      case 'board_transport':
        this.applyBoardTransport(action.unitId, action.transportId);
        return;
      case 'disembark_unit':
        this.applyDisembarkUnit(action.unitId, action.transportId, action.destination);
        return;
      case 'end_turn':
        // Execute pending move queues at end of turn (before MP refresh) so units
        // arrive at their destination but start the next turn with full MP.
        this.state = this.executeMoveQueues(this.state);
        if (this.state.activeFactionId) {
          const activeFactionId = this.state.activeFactionId;
          this.state = runFactionPhase(this.state, activeFactionId as never, this.registry, {
            difficulty: this.difficulty,
          });
        }
        this.feedback.lastMove = null;
        this.state = this.refreshFogForAllFactions(advanceTurn(this.state));
        this.feedback.endTurnCount += 1;
        this.feedback.lastActiveFactionId = this.state.activeFactionId;
        this.feedback.lastTurnChange = this.state.activeFactionId
          ? { factionId: this.state.activeFactionId }
          : null;
        this.record('turn', `Turn passed to ${this.getActiveFactionName()}.`);
        this.continueAiUntilHumanTurn();
        return;
      case 'set_city_production':
        this.setCityProduction(action.cityId, action.prototypeId);
        return;
      case 'cancel_city_production':
        this.cancelCityProduction(action.cityId);
        return;
      case 'remove_from_queue':
        this.removeFromQueue(action.cityId, action.queueIndex);
        return;
      case 'start_research':
        this.applyStartResearch(action.nodeId);
        return;
      case 'cancel_research':
        this.applyCancelResearch();
        return;
      case 'sacrifice_unit':
        this.applySacrifice(action.unitId);
        return;
      case 'build_fort':
        this.applyBuildFort(action.unitId);
        return;
      case 'build_city':
        this.applyBuildCity(action.unitId);
        return;
      default:
        return;
    }
  }

  getLegalMoves(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || unit.hp <= 0 || unit.factionId !== this.state.activeFactionId || !this.state.map) {
      return [];
    }

    return this.buildReachableMoves(unit.id);
  }

  getAttackTargets(unitId: string): AttackTargetView[] {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || unit.hp <= 0 || unit.factionId !== this.state.activeFactionId || unit.attacksRemaining <= 0 || unit.movesRemaining <= 0) {
      return [];
    }

    const prototype = this.state.prototypes.get(unit.prototypeId as never);
    const attackRange = prototype?.derivedStats.range ?? 1;
    const chassis = prototype ? this.registry.getChassis(prototype.chassisId) : null;
    const isNavalUnit = chassis?.movementClass === 'naval';

    // Check amphibious assault doctrine
    const faction = this.state.factions.get(unit.factionId);
    const research = this.state.research.get(unit.factionId);
    const doctrine = research
      ? resolveCapabilityDoctrine(research, faction)
      : undefined;
    const canAmphibiousAssault = isNavalUnit && doctrine?.amphibiousAssaultEnabled === true;

    return Array.from(this.state.units.values())
      .filter((candidate) => candidate.hp > 0 && candidate.factionId !== unit.factionId)
      .filter((candidate) => hexDistance(unit.position, candidate.position) <= attackRange)
      .filter((candidate) => {
        // Naval units can normally only attack targets on water
        // With amphibious assault, they can attack land units adjacent to water
        if (isNavalUnit && !canAmphibiousAssault) {
          const candidateTile = this.state.map?.tiles.get(hexToKey(candidate.position));
          const candidateTerrain = candidateTile?.terrain ?? '';
          return candidateTerrain === 'coast' || candidateTerrain === 'river';
        }
        return true;
      })
      .map((candidate) => ({
        key: `${candidate.position.q},${candidate.position.r}`,
        q: candidate.position.q,
        r: candidate.position.r,
        unitId: candidate.id,
        distance: hexDistance(unit.position, candidate.position),
      }))
      .sort((left, right) => left.distance - right.distance || left.q - right.q || left.r - right.r);
  }

  private bootstrap(source: PlayStateSource) {
    let state = source.type === 'serialized'
      ? deserializeGameState(source.payload)
      : buildMvpScenario(source.seed ?? 42, {
          registry: this.registry,
          mapMode: source.mapMode ?? this.mapMode,
          mapSize: source.mapSize ?? this.mapSize,
          selectedFactionIds: source.selectedFactionIds ?? this.selectedFactions,
          settlerStartFactionIds: Array.from(this.humanControlledFactionIds),
        });

    state = state.activeFactionId ? state : advanceTurn(state);

    return this.refreshFogForAllFactions(state);
  }

  private applyMove(unitId: UnitId, destination: { q: number; r: number }) {
    const unit = this.state.units.get(unitId);
    if (!unit || !this.state.map) {
      return;
    }

    if (unit.factionId !== this.state.activeFactionId) {
      return;
    }

    // Direct move overrides any existing queue
    if (unit.moveQueueDestination) {
      this.state = this.clearMoveQueueOnUnit(this.state, unitId);
    }

    const plan = this.buildReachableMoves(unitId).find((entry) => entry.key === `${destination.q},${destination.r}`);
    if (!plan) {
      return;
    }

    let nextState = this.state;
    for (const step of plan.path.slice(1)) {
      nextState = moveUnit(nextState, unitId, step, nextState.map!, this.registry);
    }

    this.state = this.refreshFogForAllFactions(nextState);
    const movedUnit = this.state.units.get(unitId);
    if (movedUnit) {
      this.feedback.moveCount += 1;
      this.feedback.lastMove = {
        unitId,
        destination,
      };
      this.feedback.lastTurnChange = null;
      this.record('move', `${this.getPrototypeName(movedUnit.prototypeId)} moved to ${destination.q},${destination.r}.`);
    }
  }

  // ---------------------------------------------------------------------------
  // Move Queue: multi-turn pathing
  // ---------------------------------------------------------------------------

  private applyQueueMove(unitId: string, destination: { q: number; r: number }) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.map) return;
    if (unit.factionId !== this.state.activeFactionId) return;
    if (unit.hp <= 0 || unit.status !== 'ready') return;

    const pathResult = findPath(this.state, unitId as UnitId, destination, this.state.map, this.registry);
    if (!pathResult) return; // Unreachable

    const newUnits = new Map(this.state.units);
    newUnits.set(unitId as UnitId, {
      ...unit,
      moveQueueDestination: { q: destination.q, r: destination.r },
    });
    this.state = { ...this.state, units: newUnits };
    this.record('turn', `${this.getPrototypeName(unit.prototypeId)} queued movement to ${destination.q},${destination.r}.`);
  }

  private applyCancelQueue(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit?.moveQueueDestination) return;

    const newUnits = new Map(this.state.units);
    newUnits.set(unitId as UnitId, { ...unit, moveQueueDestination: undefined });
    this.state = { ...this.state, units: newUnits };
    this.record('turn', `${this.getPrototypeName(unit.prototypeId)} move queue cancelled.`);
  }

  /** Execute move queues for all units of the active (human) faction. */
  private executeMoveQueues(state: GameState): GameState {
    if (!state.activeFactionId || !state.map) return state;
    if (!this.isHumanControlledFaction(state.activeFactionId)) return state;

    const factionId = state.activeFactionId;
    let currentState = state;

    const queuedUnitIds: UnitId[] = [];
    for (const [uid, unit] of currentState.units) {
      if (unit.factionId === factionId && unit.moveQueueDestination && unit.hp > 0 && unit.status === 'ready') {
        queuedUnitIds.push(uid as UnitId);
      }
    }

    for (const uid of queuedUnitIds) {
      const unit = currentState.units.get(uid);
      if (!unit?.moveQueueDestination) continue;

      const result = this.executeQueuedMovesForUnit(currentState, uid, unit.moveQueueDestination);
      currentState = result.state;
      currentState = this.refreshFogForAllFactions(currentState);
    }

    return currentState;
  }

  private executeQueuedMovesForUnit(
    state: GameState,
    unitId: UnitId,
    destination: HexCoord,
  ): { state: GameState; arrived: boolean; blocked: boolean; stoppedByZoC: boolean } {
    if (!state.map) return { state, arrived: false, blocked: false, stoppedByZoC: false };

    const unit = state.units.get(unitId);
    if (!unit || unit.movesRemaining <= 0) {
      return { state, arrived: false, blocked: false, stoppedByZoC: false };
    }

    const pathResult = findPath(state, unitId, destination, state.map, this.registry);
    if (!pathResult || pathResult.path.length < 2) {
      return this.clearQueueAndReturn(state, unitId, !!pathResult);
    }

    let currentState = state;
    const fullPath = pathResult.path;

    for (let i = 1; i < fullPath.length; i++) {
      const step = fullPath[i];
      const unitBeforeMove = currentState.units.get(unitId);
      if (!unitBeforeMove || unitBeforeMove.movesRemaining <= 0) break;

      if (!canMoveTo(currentState, unitId, step, currentState.map!, this.registry)) {
        return this.clearQueueAndReturn(currentState, unitId, false);
      }

      currentState = moveUnit(currentState, unitId, step, currentState.map!, this.registry);

      const movedUnit = currentState.units.get(unitId);
      if (!movedUnit) {
        return { state: currentState, arrived: false, blocked: true, stoppedByZoC: false };
      }

      if (movedUnit.enteredZoCThisActivation || movedUnit.movesRemaining <= 0) {
        const atDest = movedUnit.position.q === destination.q && movedUnit.position.r === destination.r;
        if (atDest) {
          return this.clearQueueAndReturn(currentState, unitId, true);
        }
        return { state: currentState, arrived: false, blocked: false, stoppedByZoC: true };
      }
    }

    const finalUnit = currentState.units.get(unitId);
    if (finalUnit && finalUnit.position.q === destination.q && finalUnit.position.r === destination.r) {
      return this.clearQueueAndReturn(currentState, unitId, true);
    }

    return { state: currentState, arrived: false, blocked: false, stoppedByZoC: false };
  }

  private clearQueueAndReturn(
    state: GameState,
    unitId: UnitId,
    arrived: boolean,
  ): { state: GameState; arrived: boolean; blocked: boolean; stoppedByZoC: boolean } {
    const unit = state.units.get(unitId);
    if (!unit?.moveQueueDestination) {
      return { state, arrived, blocked: !arrived, stoppedByZoC: false };
    }
    const newUnits = new Map(state.units);
    newUnits.set(unitId, { ...unit, moveQueueDestination: undefined });
    return { state: { ...state, units: newUnits }, arrived, blocked: !arrived, stoppedByZoC: false };
  }

  // ---------------------------------------------------------------------------

  /** Clear move queue on a specific unit if one exists. Returns updated state. */
  private clearMoveQueueOnUnit(state: GameState, unitId: UnitId): GameState {
    const unit = state.units.get(unitId);
    if (!unit?.moveQueueDestination) return state;
    const newUnits = new Map(state.units);
    newUnits.set(unitId, { ...unit, moveQueueDestination: undefined });
    return { ...state, units: newUnits };
  }

  // ---------------------------------------------------------------------------

  private buildReachableMoves(unitId: UnitId): ReachableHexView[] {
    const unit = this.state.units.get(unitId);
    const map = this.state.map;
    if (!unit || !map) {
      return [];
    }

    type FrontierNode = {
      state: GameState;
      path: Array<{ q: number; r: number }>;
    };

    const start = { q: unit.position.q, r: unit.position.r };
    const frontier: FrontierNode[] = [{ state: this.state, path: [start] }];
    const bestRemainingByKey = new Map<string, number>([[`${start.q},${start.r}`, unit.movesRemaining]]);
    const movesByKey = new Map<string, ReachableHexView>();

    while (frontier.length > 0) {
      frontier.sort((left, right) => {
        const leftUnit = left.state.units.get(unitId)!;
        const rightUnit = right.state.units.get(unitId)!;
        return rightUnit.movesRemaining - leftUnit.movesRemaining;
      });

      const current = frontier.shift()!;
      for (const hex of getValidMoves(current.state, unitId, map, this.registry)) {
        if (current.path.some((step) => step.q === hex.q && step.r === hex.r)) {
          continue;
        }

        const preview = previewMove(current.state, unitId, hex, map, this.registry);
        if (!preview) {
          continue;
        }

        const nextState = moveUnit(current.state, unitId, hex, map, this.registry);
        const movedUnit = nextState.units.get(unitId);
        if (!movedUnit) {
          continue;
        }

        const key = `${hex.q},${hex.r}`;
        const path = [...current.path, { q: hex.q, r: hex.r }];
        const candidate: ReachableHexView = {
          key,
          q: hex.q,
          r: hex.r,
          cost: unit.movesRemaining - movedUnit.movesRemaining,
          movesRemainingAfterMove: movedUnit.movesRemaining,
          path,
        };

        const previous = movesByKey.get(key);
        if (
          !previous
          || candidate.movesRemainingAfterMove > previous.movesRemainingAfterMove
          || (
            candidate.movesRemainingAfterMove === previous.movesRemainingAfterMove
            && candidate.path.length < previous.path.length
          )
        ) {
          movesByKey.set(key, candidate);
        }

        const bestRemaining = bestRemainingByKey.get(key) ?? -1;
        if (movedUnit.movesRemaining <= bestRemaining) {
          continue;
        }

        bestRemainingByKey.set(key, movedUnit.movesRemaining);
        frontier.push({ state: nextState, path });
      }
    }

    movesByKey.delete(`${start.q},${start.r}`);
    return [...movesByKey.values()].sort((left, right) => left.cost - right.cost || left.path.length - right.path.length);
  }

  /**
   * Phase 1: Resolve combat mathematically but do NOT mutate game state.
   * Returns PendingCombat data for the animator to use, or null if illegal.
   */
  resolveAttack(attackerId: UnitId, defenderId: UnitId): PendingCombat | null {
    const preview = previewCombatAction(this.state, this.registry, attackerId, defenderId);
    if (!preview) {
      return null;
    }

    return this.buildPendingCombat(preview);
  }

  private buildPendingCombat(preview: CombatActionPreview): PendingCombat {
    const combatEvent: ReplayCombatEvent = {
      round: preview.round,
      attackerUnitId: preview.attackerId,
      defenderUnitId: preview.defenderId,
      attackerFactionId: preview.attackerFactionId,
      defenderFactionId: preview.defenderFactionId,
      attackerPrototypeName: preview.attackerPrototypeName,
      defenderPrototypeName: preview.defenderPrototypeName,
      attackerDamage: preview.result.attackerDamage,
      defenderDamage: preview.result.defenderDamage,
      attackerDestroyed: preview.result.attackerDestroyed,
      defenderDestroyed: preview.result.defenderDestroyed,
      attackerRouted: preview.result.attackerRouted,
      defenderRouted: preview.result.defenderRouted,
      attackerFled: preview.result.attackerFled,
      defenderFled: preview.result.defenderFled,
      summary: `${preview.attackerPrototypeName} attacked ${preview.defenderPrototypeName}`,
      breakdown: {
        modifiers: {
          flankingBonus: preview.result.flankingBonus,
          stealthAmbushBonus: preview.attackerWasStealthed ? 0.5 : 0,
          rearAttackBonus: preview.result.rearAttackBonus,
          finalAttackStrength: preview.result.attackStrength,
          finalDefenseStrength: preview.result.defenseStrength,
        },
        outcome: {
          attackerDamage: preview.result.attackerDamage,
          defenderDamage: preview.result.defenderDamage,
        },
        triggeredEffects: preview.triggeredEffects,
      },
    };

    return {
      attackerId: preview.attackerId,
      defenderId: preview.defenderId,
      preview,
      result: preview.result,
      combatEvent,
    };
  }

  /**
   * Phase 2: Actually apply a pre-resolved combat result to game state.
   * Called after animation completes (human) or immediately (AI).
   */
  applyResolvedCombat(pending: PendingCombat): void {
    const { preview, combatEvent } = pending;
    const applied = applyCombatAction(this.state, this.registry, preview);
    this.state = this.refreshFogForAllFactions(applied.state);
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.feedback.hitAndRunRetreat = applied.feedback.hitAndRunRetreat;
    if (applied.feedback.lastLearnedDomain) {
      this.feedback.lastLearnedDomain = applied.feedback.lastLearnedDomain;
      this.record('turn', `${applied.feedback.lastLearnedDomain.domainId} ability learned from ${preview.defenderFactionId}!`);
    }
    if (applied.feedback.absorbedDomains.length > 0) {
      this.feedback.absorbedDomains = applied.feedback.absorbedDomains;
      this.record('turn', `Absorbed domains from fallen tribe: ${applied.feedback.absorbedDomains.join(', ')}`);
    }

    const finalCombatEvent: ReplayCombatEvent = {
      ...combatEvent,
      breakdown: {
        ...combatEvent.breakdown,
        triggeredEffects: applied.feedback.resolution.triggeredEffects,
      },
    };

    // Keep last 20 events, newest first
    this.feedback.liveCombatEvents = [finalCombatEvent, ...this.feedback.liveCombatEvents].slice(0, 20);

    this.record(
      'combat',
      `${finalCombatEvent.attackerPrototypeName} attacked ${finalCombatEvent.defenderPrototypeName}: dealt ${preview.result.defenderDamage}, took ${preview.result.attackerDamage}.`,
    );
  }

  getPendingCombat(): PendingCombat | null {
    return this._pendingCombat;
  }

  clearPendingCombat(): void {
    this._pendingCombat = null;
  }

  dequeueAiCombat(): PendingCombat | null {
    const next = this._aiCombatQueue.shift() ?? null;
    if (next) {
      this._pendingCombat = next;
    }
    return next;
  }

  getAiCombatQueueLength(): number {
    return this._aiCombatQueue.length;
  }

  private refreshFogForAllFactions(state: GameState) {
    let nextState = state;
    for (const fid of nextState.factions.keys()) {
      nextState = updateFogState(nextState, fid);
    }
    return nextState;
  }

  private getPrototypeName(prototypeId: string) {
    return this.state.prototypes.get(prototypeId as never)?.name ?? prototypeId;
  }

  private getActiveFactionName() {
    const activeFactionId = this.state.activeFactionId;
    if (!activeFactionId) {
      return 'no faction';
    }

    return this.state.factions.get(activeFactionId)?.name ?? activeFactionId;
  }

  private isHumanControlledFaction(factionId: string | null) {
    return factionId !== null && this.humanControlledFactionIds.has(factionId);
  }

  /** Check if a combat involves any human-controlled faction */
  isCombatInvolvesHuman(attackerFactionId: string, defenderFactionId: string): boolean {
    return this.isHumanControlledFaction(attackerFactionId) || this.isHumanControlledFaction(defenderFactionId);
  }

  /**
   * Drives AI turn processing asynchronously, yielding to the event loop between
   * units and factions so the browser can repaint and remain responsive.
   * Resumes via setTimeout until a human faction is active or safety is hit.
   */
  private continueAiUntilHumanTurn(): void {
    this.feedback.aiProcessing = true;
    const result = this.runAiChunk();
    if (!result.done) {
      setTimeout(() => this.continueAiUntilHumanTurn(), 0);
    } else {
      this.feedback.aiProcessing = false;
    }
  }

  private runAiChunk(): { done: boolean } {
    let safety = 0;
    while (this.state.activeFactionId && !this.isHumanControlledFaction(this.state.activeFactionId)) {
      if (safety >= 32) {
        this.record('turn', 'AI turn loop stopped early due to safety guard.');
        this.feedback.aiProcessing = false;
        return { done: true };
      }

      if (!this.processAiTurnChunk(this.state.activeFactionId)) {
        return { done: false }; // combat pending, will resume via setTimeout
      }
      safety += 1;
    }
    this.feedback.aiProcessing = false;
    return { done: true };
  }

  private processAiTurnChunk(factionId: string) {
    if (this.state.activeFactionId !== factionId) {
      return false;
    }

    if (!this._aiTurnContext || this._aiTurnContext.factionId !== factionId) {
      const strategy = computeFactionStrategy(this.state, factionId as never, this.registry, this.difficulty);
      this.state = {
        ...this.state,
        factionStrategies: new Map(this.state.factionStrategies).set(factionId as never, strategy),
      };
      this._aiTurnContext = {
        factionId,
        unitIds: this.getAiUnitIds(factionId),
        index: 0,
        fortsBuiltThisTurn: new Set<string>(),
      };
    }

    while (this._aiTurnContext && this._aiTurnContext.index < this._aiTurnContext.unitIds.length) {
      const unitId = this._aiTurnContext.unitIds[this._aiTurnContext.index] as UnitId;
      this._aiTurnContext.index += 1;

      const unit = this.state.units.get(unitId as never);
      if (!unit || unit.hp <= 0 || unit.factionId !== factionId || unit.status !== 'ready') {
        continue;
      }

      const activation = activateAiUnit(this.state, unitId, this.registry, {
        combatMode: 'preview',
        fortsBuiltThisRound: this._aiTurnContext.fortsBuiltThisTurn as Set<never>,
      });
      this.state = activation.state;

      if (activation.pendingCombat) {
        this._aiCombatQueue.push(this.buildPendingCombat(activation.pendingCombat));
        return false;
      }
    }

    this._aiTurnContext = null;
    this.feedback.lastMove = null;
    this.state = runFactionPhase(this.state, factionId as never, this.registry, {
      difficulty: this.difficulty,
    });
    this.state = this.refreshFogForAllFactions(advanceTurn(this.state));
    // Update siege state for all cities after turn advance
    this.state = this.updateSiegeState(this.state);
    // Queued moves execute at end of human turn (via end_turn handler), not here.
    this.feedback.lastActiveFactionId = this.state.activeFactionId;
    this.feedback.lastTurnChange = this.state.activeFactionId
      ? { factionId: this.state.activeFactionId }
      : null;
    this.record('turn', `Turn passed to ${this.getActiveFactionName()}.`);
    return true;
  }

  private setCityProduction(cityId: string, prototypeId: string) {
    const city = this.state.cities.get(cityId as never);
    if (!city || city.factionId !== this.state.activeFactionId || !this.isHumanControlledFaction(city.factionId) || city.besieged) {
      return;
    }

    this.state = unlockHybridRecipes(this.state, city.factionId, this.registry);

    const prototype = this.state.prototypes.get(prototypeId as never);
    if (!prototype || !canProducePrototype(this.state, city.factionId, prototype.id, this.registry)) {
      return;
    }

    const costType = getPrototypeCostType(prototype);
    if (costType === 'villages' && !canPaySettlerVillageCost(this.state, city.factionId)) {
      return;
    }
    const updatedCity = queueUnit(
      city,
      prototype.id,
      prototype.chassisId,
      costType === 'villages' ? getPrototypeQueueCost(prototype) : this.getPrototypeCost(prototype.id),
      costType,
    );
    const nextCities = new Map(this.state.cities);
    nextCities.set(city.id, updatedCity);
    this.state = { ...this.state, cities: nextCities };
    this.record('turn', `${city.name} began training ${prototype.name}.`);
  }

  private cancelCityProduction(cityId: string) {
    const city = this.state.cities.get(cityId as never);
    if (!city || city.factionId !== this.state.activeFactionId || !this.isHumanControlledFaction(city.factionId) || city.besieged) return;
    if (!city.currentProduction) return;

    const { city: updatedCity } = cancelCurrentProduction(city);
    const nextCities = new Map(this.state.cities);
    nextCities.set(city.id, updatedCity);
    this.state = { ...this.state, cities: nextCities };
    this.record('turn', `${city.name} cancelled production.`);
  }

  private removeFromQueue(cityId: string, queueIndex: number) {
    const city = this.state.cities.get(cityId as never);
    if (!city || city.factionId !== this.state.activeFactionId || !this.isHumanControlledFaction(city.factionId)) return;

    const updatedCity = removeFromQueue(city, queueIndex);
    const nextCities = new Map(this.state.cities);
    nextCities.set(city.id, updatedCity);
    this.state = { ...this.state, cities: nextCities };
  }

  private applyStartResearch(nodeId: string) {
    const factionId = this.state.activeFactionId;
    if (!factionId || !this.isHumanControlledFaction(factionId)) return;

    const research = this.state.research.get(factionId as never);
    const faction = this.state.factions.get(factionId as never);
    if (!research || !faction) return;

    // Extract domain from nodeId (e.g. "charge_t2" -> "charge")
    const domainId = nodeId.split('_t')[0];
    const nodeDef = this.registry.getResearchNode(domainId, nodeId);
    if (!nodeDef) return;

    if (!faction.learnedDomains?.includes(domainId)) return;

    const updated = startResearch(
      research,
      nodeId as never,
      nodeDef.prerequisites,
      faction.learnedDomains,
    );
    const nextResearch = new Map(this.state.research);
    nextResearch.set(factionId as never, updated);
    this.state = { ...this.state, research: nextResearch };
    this.record('turn', `Research started: ${nodeDef.name}.`);
  }

  private applyCancelResearch() {
    const factionId = this.state.activeFactionId;
    if (!factionId || !this.isHumanControlledFaction(factionId)) return;

    const research = this.state.research.get(factionId as never);
    if (!research || !research.activeNodeId) return;

    const domainId = research.activeNodeId.split('_t')[0];
    const nodeDef = this.registry.getResearchNode(domainId, research.activeNodeId);
    const nodeName = nodeDef?.name ?? research.activeNodeId;

    const updated = { ...research, activeNodeId: null };
    const nextResearch = new Map(this.state.research);
    nextResearch.set(factionId as never, updated);
    this.state = { ...this.state, research: nextResearch };
    this.record('turn', `Research cancelled: ${nodeName}.`);
  }

  private applySacrifice(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.activeFactionId) return;

    const faction = this.state.factions.get(unit.factionId);
    if (!faction || unit.factionId !== this.state.activeFactionId) return;

    const learnedAbilities = unit.learnedAbilities ?? [];
    if (learnedAbilities.length === 0) return;

    const unitName = this.getPrototypeName(unit.prototypeId);
    const domains = learnedAbilities.map((a) => a.domainId);

    this.state = performSacrifice(unitId as UnitId, unit.factionId, this.state, this.registry);
    this.state = unlockHybridRecipes(this.state, unit.factionId, this.registry);
    this.feedback.lastSacrifice = { unitId, unitName, domains };
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record(
      'turn',
      `${unitName} sacrificed - unlocked domains: ${domains.join(', ')}.`,
    );
  }

  private applyBuildFort(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.activeFactionId || unit.factionId !== this.state.activeFactionId) {
      return;
    }

    const faction = this.state.factions.get(unit.factionId);
    if (!faction || faction.id !== 'hill_clan') {
      return;
    }

    const fortEligibility = this.getFortBuildEligibility(unit);
    if (!fortEligibility.canBuild) {
      return;
    }

    this.state = this.buildFortAtUnit(unit, fortEligibility.defenseBonus);
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record('turn', `${this.getPrototypeName(unit.prototypeId)} built a field fort at ${unit.position.q},${unit.position.r}.`);
  }

  private applyBuildCity(unitId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.activeFactionId || unit.factionId !== this.state.activeFactionId || !this.state.map) {
      return;
    }

    const faction = this.state.factions.get(unit.factionId);
    const prototype = this.state.prototypes.get(unit.prototypeId as never);
    if (!faction || !prototype || !this.isHumanControlledFaction(unit.factionId)) {
      return;
    }
    if (!prototype.tags?.includes('settler') || unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
      return;
    }

    if (getSettlementOccupancyBlocker(this.state, unit.position)) {
      return;
    }

    const cityId = createCityId();
    const cityName = faction.homeCityId ? `${faction.name} Settlement` : `${faction.name} Capital`;
    const cities = new Map(this.state.cities);
    cities.set(cityId, {
      id: cityId,
      factionId: unit.factionId,
      position: { ...unit.position },
      name: cityName,
      productionQueue: [],
      productionProgress: 0,
      territoryRadius: 2,
      wallHP: 100,
      maxWallHP: 100,
      besieged: false,
      turnsUnderSiege: 0,
      isCapital: !faction.homeCityId,
      siteBonuses: createCitySiteBonuses(this.state.map, unit.position, 2),
    });

    const units = new Map(this.state.units);
    units.delete(unitId as UnitId);
    const factions = new Map(this.state.factions);
    factions.set(unit.factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((id) => id !== unitId),
      cityIds: [...new Set([...faction.cityIds, cityId])],
      homeCityId: faction.homeCityId ?? cityId,
    });

    this.state = syncFactionSettlementIds({
      ...this.state,
      cities,
      units,
      factions,
    }, unit.factionId);
    this.state = this.refreshFogForAllFactions(this.state);
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record('turn', `${faction.name} founded ${cityName} at ${unit.position.q},${unit.position.r}.`);
  }

  private applyPrepareAbility(unitId: string, ability: 'brace' | 'ambush') {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.activeFactionId || unit.factionId !== this.state.activeFactionId) {
      return;
    }

    const faction = this.state.factions.get(unit.factionId);
    const prototype = this.state.prototypes.get(unit.prototypeId as never);
    if (!faction || !prototype || !this.isHumanControlledFaction(unit.factionId) || unit.status !== 'ready' || unit.hp <= 0) {
      return;
    }

    const doctrine = resolveCapabilityDoctrine(this.state.research.get(unit.factionId), faction);
    const canPrepare = ability === 'brace'
      ? (canUseBrace(prototype) || doctrine.fortressTranscendenceEnabled) && hasAdjacentEnemy(this.state, unit)
      : canUseAmbush(prototype, getTerrainAt(this.state, unit.position)) && !hasAdjacentEnemy(this.state, unit);
    if (!canPrepare) {
      return;
    }

    const units = new Map(this.state.units);
    units.set(unit.id, prepareAbility(unit, ability, this.state.round));
    this.state = { ...this.state, units };
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record('turn', `${this.getPrototypeName(unit.prototypeId)} prepared ${ability}.`);
  }

  private applyBoardTransport(unitId: string, transportId: string) {
    const unit = this.state.units.get(unitId as UnitId);
    const transport = this.state.units.get(transportId as UnitId);
    if (!unit || !transport || !this.state.activeFactionId || unit.factionId !== this.state.activeFactionId || transport.factionId !== this.state.activeFactionId) {
      return;
    }

    if (!canBoardTransport(this.state, unit.id, transport.id, this.registry, this.state.transportMap)) {
      return;
    }

    const result = boardTransport(this.state, unit.id, transport.id, this.state.transportMap);
    this.state = {
      ...result.state,
      transportMap: result.transportMap,
    };
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record('turn', `${this.getPrototypeName(unit.prototypeId)} boarded ${this.getPrototypeName(transport.prototypeId)}.`);
  }

  private applyDisembarkUnit(unitId: string, transportId: string, destination: { q: number; r: number }) {
    const unit = this.state.units.get(unitId as UnitId);
    if (!unit || !this.state.activeFactionId || unit.factionId !== this.state.activeFactionId) {
      return;
    }

    const transportState = getUnitTransport(unit.id, this.state.transportMap);
    if (!transportState || transportState.transportId !== transportId) {
      return;
    }

    const result = disembarkUnit(
      this.state,
      transportId as UnitId,
      unit.id,
      destination,
      this.registry,
      this.state.transportMap,
    );
    this.state = {
      ...result.state,
      transportMap: result.transportMap,
    };
    this.feedback.lastMove = null;
    this.feedback.lastTurnChange = null;
    this.record('turn', `${this.getPrototypeName(unit.prototypeId)} disembarked to ${destination.q},${destination.r}.`);
  }

  private getPrototypeCost(prototypeId: string) {
    const prototype = this.state.prototypes.get(prototypeId as never);
    if (!prototype) {
      return 10;
    }

    // Prototype-level cost override (faction-specific starting units)
    if (prototype.productionCost != null) {
      return prototype.productionCost;
    }

    // Unlock prototypes (hybrid recipes) use the mastery cost modifier
    if (isUnlockPrototype(prototype)) {
      const faction = this.state.factions.get(prototype.factionId as never);
      if (faction) {
        return calculatePrototypeCost(
          getUnitCost(prototype.chassisId),
          faction,
          getDomainIdsByTags(prototype.tags ?? []),
          prototype,
        );
      }
    }

    // Starting prototypes use hardcoded balance-tuned costs
    switch (prototype.chassisId) {
      case 'infantry_frame':
        return 8;
      case 'heavy_infantry_frame':
        return 11;
      case 'ranged_frame':
        return 10;
      case 'cavalry_frame':
        return 14;
      case 'naval_frame':
        return 12;
      case 'camel_frame':
        return 10;
      case 'elephant_frame':
        return 14;
      default:
        return 10;
    }
  }

  private getAiUnitIds(factionId: string) {
    return Array.from(this.state.units.values())
      .filter((unit) => unit.factionId === factionId && unit.hp > 0)
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'ready' ? -1 : 1;
        }

        return left.id.localeCompare(right.id);
      })
      .map((unit) => unit.id);
  }

  private getImprovementAtHex(position: { q: number; r: number }) {
    for (const improvement of this.state.improvements.values()) {
      if (improvement.position.q === position.q && improvement.position.r === position.r) {
        return improvement;
      }
    }

    return null;
  }

  private updateSiegeState(state: GameState): GameState {
    const cities = new Map(state.cities);
    let changed = false;
    for (const [cityId, city] of cities) {
      const encircled = isCityEncircled(city, state);
      if (encircled && !city.besieged) {
        cities.set(cityId, { ...city, besieged: true, turnsUnderSiege: 0 });
        changed = true;
      } else if (!encircled && city.besieged) {
        cities.set(cityId, { ...city, besieged: false, turnsUnderSiege: 0 });
        changed = true;
      } else if (city.besieged) {
        cities.set(cityId, { ...city, turnsUnderSiege: (city.turnsUnderSiege ?? 0) + 1 });
        changed = true;
      }
    }
    return changed ? { ...state, cities } : state;
  }

  private isFortificationHex(position: { q: number; r: number }) {
    return this.getImprovementAtHex(position)?.type === 'fortification';
  }

  private getFortBuildEligibility(unit: Unit) {
    const faction = this.state.factions.get(unit.factionId);
    const research = this.state.research.get(unit.factionId as never);
    const doctrine = faction ? resolveCapabilityDoctrine(research, faction) : undefined;
    if (!faction || faction.id !== 'hill_clan' || !doctrine?.canBuildFieldForts) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    if (unit.hp <= 0 || unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    const prototype = this.state.prototypes.get(unit.prototypeId as never);
    if (!prototype) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    const movementClass = this.registry.getChassis(prototype.chassisId)?.movementClass;
    const role = prototype.derivedStats.role;
    if (!(movementClass === 'infantry' || role === 'ranged')) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    if (this.getImprovementAtHex(unit.position)) {
      return { canBuild: false as const, defenseBonus: 0 };
    }

    const fieldFort = this.registry.getImprovement('field_fort');
    return {
      canBuild: true as const,
      defenseBonus: fieldFort?.defenseBonus ?? 1,
    };
  }

  private buildFortAtUnit(unit: Unit, defenseBonus: number) {
    const fortId = createImprovementId();
    const improvements = new Map(this.state.improvements);
    improvements.set(fortId, {
      id: fortId,
      type: 'fortification',
      position: { ...unit.position },
      ownerFactionId: unit.factionId,
      defenseBonus,
    });

    const units = new Map(this.state.units);
    units.set(unit.id, {
      ...unit,
      movesRemaining: 0,
      attacksRemaining: 0,
      status: 'fortified' as const,
    });

    return {
      ...this.state,
      improvements,
      units,
    };
  }

  private record(kind: SessionEvent['kind'], message: string) {
    this.feedback.eventSequence += 1;
    this.events.unshift({
      sequence: this.feedback.eventSequence,
      round: this.state.round,
      kind,
      message,
    });
    if (this.events.length > 16) {
      this.events.length = 16;
    }
  }
}
