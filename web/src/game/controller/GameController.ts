import type { ClientMode, ClientSelection, ClientState, GameAction } from '../types/clientState';
import type { ReplayBundle } from '../types/replay';
import type { AttackTargetView, PathPreviewNodeView, ReachableHexView } from '../types/worldView';
import { GameSession, type SessionSaveSnapshot } from './GameSession';
import type { PendingCombat } from './GameSession';
import { buildDebugViewModel, buildHudViewModel, buildResearchInspectorViewModel, buildWorldViewModel } from '../view-model/worldViewModel';
import { getVictoryStatus } from '../../../../src/systems/warEcologySimulation.js';
import { findPath } from '../../../../src/systems/pathfinder.js';

type Listener = () => void;

type ReplayControllerOptions = {
  mode: 'replay';
  replay: ReplayBundle;
};

type PlayControllerOptions = {
  mode: 'play';
  session: GameSession;
};

type GameControllerOptions = ReplayControllerOptions | PlayControllerOptions;

export class GameController {
  private readonly listeners = new Set<Listener>();
  private readonly mode: ClientMode;
  private readonly replay: ReplayBundle | null;
  private readonly session: GameSession | null;
  private turnIndex = 0;
  private combatPendingListener: ((pending: PendingCombat) => void) | null = null;
  private selected: ClientSelection = null;
  private focusedUnitId: string | null = null;
  private targetingMode: 'move' | 'attack' = 'move';
  private hoveredKey: string | null = null;
  private zoom = 1.1;
  private productionPopupCityId: string | null = null;
  private inspectorRequestId = 0;

  constructor(options: GameControllerOptions) {
    this.mode = options.mode;
    this.replay = options.mode === 'replay' ? options.replay : null;
    this.session = options.mode === 'play' ? options.session : null;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): ClientState {
    if (this.mode === 'play') {
      return this.getPlayState();
    }

    return this.getReplayState();
  }

  dispatch(action: GameAction) {
    switch (action.type) {
      case 'select_hex':
        this.targetingMode = 'move';
        this.focusedUnitId = null;
        this.selected = action.q === -1 && action.r === -1
          ? null
          : { type: 'hex', q: action.q, r: action.r, key: `${action.q},${action.r}` };
        this.productionPopupCityId = null;
        break;
      case 'select_unit':
        this.targetingMode = 'move';
        this.selected = { type: 'unit', unitId: action.unitId };
        this.productionPopupCityId = null;
        this.requestInspectorOpen();
        break;
      case 'focus_unit':
        this.targetingMode = 'move';
        this.focusedUnitId = action.unitId;
        this.selected = null;
        this.productionPopupCityId = null;
        break;
      case 'select_city':
        this.targetingMode = 'move';
        this.selected = { type: 'city', cityId: action.cityId };
        this.productionPopupCityId = null;
        this.requestInspectorOpen();
        break;
      case 'open_city_production':
        this.targetingMode = 'move';
        this.selected = { type: 'city', cityId: action.cityId };
        this.productionPopupCityId = action.cityId;
        this.requestInspectorOpen();
        break;
      case 'close_city_production':
        this.productionPopupCityId = null;
        break;
      case 'select_village':
        this.targetingMode = 'move';
        this.selected = { type: 'village', villageId: action.villageId };
        this.requestInspectorOpen();
        break;
      case 'set_city_production':
        if (this.session) {
          this.session.dispatch(action);
          this.targetingMode = 'move';
          this.selected = { type: 'city', cityId: action.cityId };
        }
        break;
      case 'cancel_city_production':
      case 'remove_from_queue':
        if (this.session) {
          this.session.dispatch(action);
        }
        break;
      case 'set_targeting_mode':
        this.targetingMode = action.mode;
        break;
      case 'move_unit':
        if (this.session) {
          // Clear any existing queue before issuing direct move
          const existingUnit = this.session.getState().units.get(action.unitId as never);
          if (existingUnit?.moveQueueDestination) {
            this.session.dispatch({ type: 'cancel_queue', unitId: action.unitId });
          }
          this.session.dispatch(action);
          this.targetingMode = 'move';
          this.selected = { type: 'unit', unitId: action.unitId };
        }
        break;
      case 'queue_move':
        if (this.session) {
          this.session.dispatch(action);
          this.targetingMode = 'move';
          this.selected = { type: 'unit', unitId: action.unitId };
        }
        break;
      case 'cancel_queue':
        if (this.session) {
          this.session.dispatch(action);
        }
        break;
      case 'prepare_ability':
      case 'board_transport':
      case 'disembark_unit':
      case 'build_fort':
        if (this.session) {
          this.clearQueueIfNeeded(action.unitId);
          this.session.dispatch(action);
          this.targetingMode = 'move';
          this.selected = { type: 'unit', unitId: action.unitId };
        }
        break;
      case 'build_city':
        if (this.session) {
          this.clearQueueIfNeeded(action.unitId);
          const unit = this.session.getState().units.get(action.unitId as never);
          const position = unit ? { ...unit.position } : null;
          this.session.dispatch(action);
          this.targetingMode = 'move';

          if (position) {
            const city = Array.from(this.session.getState().cities.values()).find(
              (entry) => entry.position.q === position.q && entry.position.r === position.r,
            );
            this.selected = city ? { type: 'city', cityId: city.id } : null;
            if (city) {
              this.requestInspectorOpen();
            }
          } else {
            this.selected = null;
          }
        }
        break;
      case 'attack_unit':
        if (this.session) {
          this.clearQueueIfNeeded(action.attackerId);
          this.session.dispatch(action);
          const pending = this.session.getPendingCombat();
          if (pending) {
            // Signal to start animation — don't emit until animation completes
            this.combatPendingListener?.(pending);
          } else {
            // Fallback: should not happen, but emit if no pending
            this.emit();
          }
        }
        break;
      case 'end_turn':
        if (this.session) {
          this.session.dispatch(action);
          this.targetingMode = 'move';
          this.clearSelectionIfInactive();
          // Process any AI combats queued during AI turn processing
          this.startAiCombats();
        } else if (this.replay) {
          this.turnIndex = Math.min(this.replay.turns.length - 1, this.turnIndex + 1);
        }
        break;
      case 'set_replay_turn':
        if (this.replay) {
          this.turnIndex = Math.max(0, Math.min(this.replay.turns.length - 1, action.turnIndex));
        }
        break;
      case 'start_research':
      case 'cancel_research':
        if (this.session) {
          this.session.dispatch(action);
        }
        break;
      case 'sacrifice_unit':
        if (this.session) {
          this.clearQueueIfNeeded(action.unitId);
          this.session.dispatch(action);
        }
        break;
      default:
        return;
    }

    this.emit();
  }

  setHoveredHex(key: string | null) {
    this.hoveredKey = key;
    this.emit();
  }

  setZoom(zoom: number) {
    this.zoom = zoom;
    this.emit();
  }

  getSaveSnapshot(): SessionSaveSnapshot | null {
    return this.session?.getSaveSnapshot() ?? null;
  }

  private getReplayState(): ClientState {
    const replay = this.replay!;
    const turn = replay.turns[this.turnIndex] ?? replay.turns[0];
    const selectedUnitId = this.selected?.type === 'unit' ? this.selected.unitId : null;
    const activeUnitId = this.focusedUnitId ?? selectedUnitId;
    const reachableHexes: ReachableHexView[] = [];
    const attackHexes: AttackTargetView[] = [];
    const pathPreview: PathPreviewNodeView[] = [];
    const hoveredMove = null;
    const hoveredAttackTarget = null;
    const world = buildWorldViewModel({
      kind: 'replay',
      replay,
      turnIndex: this.turnIndex,
      selectedUnitId,
      reachableHexes,
      attackHexes,
      pathPreview,
      queuedPath: [],
    });

    return {
      mode: this.mode,
      turn: turn.round,
      turnIndex: this.turnIndex,
      maxTurns: replay.maxTurns,
      activeFactionId: world.activeFactionId,
      selected: this.selected,
      hoveredHex: this.hoveredKey ? keyToCoord(this.hoveredKey) : null,
      camera: { zoom: this.zoom },
      world,
      hud: buildHudViewModel(replay, this.turnIndex, this.mode, this.selected, this.hoveredKey, world),
      actions: {
        selectedUnitId: activeUnitId,
        targetingMode: 'move',
        legalMoves: reachableHexes,
        attackTargets: attackHexes,
        pathPreview,
        canEndTurn: this.turnIndex < replay.turns.length - 1,
        interactionHint: 'Scrub the timeline or click entities to inspect the replay.',
        hoveredMove,
        hoveredAttackTarget,
        queuedUnitId: null,
        queuedPath: [],
        estimatedTurnsToArrival: null,
      },
      debug: buildDebugViewModel(turn),
      replay,
      playFeedback: null,
      research: null,
      productionPopupCityId: null,
      inspectorRequestId: this.inspectorRequestId,
    };
  }

  private getPlayState(): ClientState {
    const session = this.session!;
    const sessionState = session.getState();
    const selectedUnitId = this.selected?.type === 'unit' ? this.selected.unitId : null;
    const activeUnitId = this.focusedUnitId ?? selectedUnitId;
    const legalMoves = activeUnitId ? session.getLegalMoves(activeUnitId) : [];
    const attackTargets = activeUnitId ? session.getAttackTargets(activeUnitId) : [];
    const hoveredMove = this.hoveredKey && this.targetingMode === 'move'
      ? legalMoves.find((entry) => entry.key === this.hoveredKey) ?? null
      : null;
    const hoveredAttackTarget = this.hoveredKey && this.targetingMode === 'attack'
      ? attackTargets.find((entry) => entry.key === this.hoveredKey) ?? null
      : null;
    const pathPreview = this.targetingMode === 'move' ? buildPathPreview(this.hoveredKey, legalMoves) : [];
    const feedback = session.getFeedback();
    const victory = getVictoryStatus(sessionState);
    const playerFactionId = session.getPrimaryHumanFactionId();

    // Compute queued path for display
    let queuedUnitIdDisplay: string | null = null;
    let queuedPathDisplay: PathPreviewNodeView[] = [];
    let estimatedTurnsToArrival: number | null = null;
    if (activeUnitId && sessionState.map) {
      const queueUnit = sessionState.units.get(activeUnitId as never);
      if (queueUnit?.moveQueueDestination) {
        queuedUnitIdDisplay = activeUnitId;
        const queueResult = findPath(
          sessionState, activeUnitId as never, queueUnit.moveQueueDestination,
          sessionState.map, session.getRegistry(),
        );
        if (queueResult) {
          queuedPathDisplay = queueResult.path.map((node, index) => ({
            key: `${node.q},${node.r}`,
            q: node.q,
            r: node.r,
            step: index,
          }));
          estimatedTurnsToArrival = queueResult.estimatedTurns;
        }
      }
    }

    const world = buildWorldViewModel({
      kind: 'play',
      state: sessionState,
      registry: session.getRegistry(),
      reachableHexes: this.targetingMode === 'move' ? legalMoves : [],
      attackHexes: this.targetingMode === 'attack' ? attackTargets : [],
      pathPreview,
      queuedPath: queuedPathDisplay,
      lastMove: feedback.lastMove,
    });

    return {
      mode: this.mode,
      turn: sessionState.round,
      turnIndex: Math.max(0, sessionState.round - 1),
      maxTurns: session.getMaxTurns(),
      activeFactionId: sessionState.activeFactionId,
      selected: this.selected,
      hoveredHex: this.hoveredKey ? keyToCoord(this.hoveredKey) : null,
      camera: { zoom: this.zoom },
      world,
      hud: buildHudViewModel(sessionState, 0, this.mode, this.selected, this.hoveredKey, world, session.getRegistry(), feedback.liveCombatEvents),
      actions: {
        selectedUnitId: activeUnitId,
        targetingMode: this.targetingMode,
        legalMoves,
        attackTargets,
        pathPreview,
        canEndTurn: Boolean(sessionState.activeFactionId),
        interactionHint: describePlayHint(world, activeUnitId, this.targetingMode, legalMoves.length, attackTargets.length),
        hoveredMove,
        hoveredAttackTarget,
        queuedUnitId: queuedUnitIdDisplay,
        queuedPath: queuedPathDisplay,
        estimatedTurnsToArrival,
      },
      debug: buildDebugViewModel(null, session.getEvents()),
      replay: null,
      playFeedback: {
        eventSequence: feedback.eventSequence,
        moveCount: feedback.moveCount,
        endTurnCount: feedback.endTurnCount,
        isDirty: feedback.moveCount > 0 || feedback.endTurnCount > 0,
        playerFactionId,
        lastMove: feedback.lastMove ? {
          unitId: feedback.lastMove.unitId,
          destination: feedback.lastMove.destination,
        } : null,
        lastTurnChange: feedback.lastTurnChange?.factionId
          ? {
              factionId: feedback.lastTurnChange.factionId,
              factionName: sessionState.factions.get(feedback.lastTurnChange.factionId as never)?.name ?? feedback.lastTurnChange.factionId,
            }
          : null,
        lastSacrifice: feedback.lastSacrifice ? { ...feedback.lastSacrifice } : null,
        lastLearnedDomain: feedback.lastLearnedDomain ? { ...feedback.lastLearnedDomain } : null,
        lastResearchCompletion: feedback.lastResearchCompletion ? { ...feedback.lastResearchCompletion } : null,
        hitAndRunRetreat: feedback.hitAndRunRetreat ? { ...feedback.hitAndRunRetreat } : null,
        lastSettlerVillageSpend: feedback.lastSettlerVillageSpend
          ? {
              factionId: feedback.lastSettlerVillageSpend.factionId,
              villageIds: [...feedback.lastSettlerVillageSpend.villageIds],
            }
          : null,
        victory: {
          winnerFactionId: victory.winnerFactionId,
          victoryType: victory.victoryType,
        },
        absorbedDomains: [...feedback.absorbedDomains],
        aiProcessing: feedback.aiProcessing,
      },
      research: buildResearchInspectorViewModel(sessionState, session.getRegistry()),
      productionPopupCityId: this.productionPopupCityId,
      inspectorRequestId: this.inspectorRequestId,
    };
  }

  private requestInspectorOpen() {
    this.inspectorRequestId += 1;
  }

  private clearSelectionIfInactive() {
    if (!this.session || this.selected?.type !== 'unit') {
      return;
    }

      const unit = this.session.getState().units.get(this.selected.unitId as never);
      if (!unit || unit.factionId !== this.session.getState().activeFactionId) {
        this.targetingMode = 'move';
        this.selected = null;
      }
  }

  /** Clear move queue on a unit if one exists (before issuing a conflicting command). */
  private clearQueueIfNeeded(unitId: string) {
    if (!this.session) return;
    const unit = this.session.getState().units.get(unitId as never);
    if (unit?.moveQueueDestination) {
      this.session.dispatch({ type: 'cancel_queue', unitId });
    }
  }

  /** Register a listener for when combat is pending animation */
  onCombatPending(listener: (pending: PendingCombat) => void): void {
    this.combatPendingListener = listener;
  }

  /** Called by MapScene/animation system when combat animation completes */
  applyPendingCombat(): void {
    const pending = this.session?.getPendingCombat();
    if (!pending) return;

    this.session!.applyResolvedCombat(pending);
    this.session!.clearPendingCombat();

    // Update selection state
    this.targetingMode = 'move';
    this.selected = this.session!.getState().units.has(pending.attackerId as never)
      ? { type: 'unit', unitId: pending.attackerId }
      : null;

    // NOW trigger re-render with final state
    this.emit();

    // Chain: if more AI combats are queued, start the next one
    this.continueAiCombats();
  }

  /** Dequeue and fire the next AI combat from the queue */
  private continueAiCombats(): void {
    const next = this.session?.dequeueAiCombat();
    if (!next) return;

    this.combatPendingListener?.(next);
  }

  /** Check if a combat involves any human-controlled faction */
  isCombatInvolvesHuman(attackerFactionId: string, defenderFactionId: string): boolean {
    return this.session?.isCombatInvolvesHuman(attackerFactionId, defenderFactionId) ?? false;
  }

  /** Kick off processing of any AI combats queued during end_turn */
  private startAiCombats(): void {
    const first = this.session?.dequeueAiCombat();
    if (!first) return;

    this.combatPendingListener?.(first);
  }

  isCombatInProgress(): boolean {
    return this.session?.getPendingCombat() !== null;
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function buildPathPreview(
  hoveredKey: string | null,
  legalMoves: ReachableHexView[],
): PathPreviewNodeView[] {
  if (!hoveredKey) {
    return [];
  }

  const hoveredMove = legalMoves.find((entry) => entry.key === hoveredKey);
  if (!hoveredMove) {
    return [];
  }

  return hoveredMove.path.map((node, index) => ({
    key: `${node.q},${node.r}`,
    q: node.q,
    r: node.r,
    step: index,
  }));
}

function describePlayHint(
  world: ClientState['world'],
  selectedUnitId: string | null,
  targetingMode: 'move' | 'attack',
  legalMoveCount: number,
  attackTargetCount: number,
) {
  if (!selectedUnitId) {
    return 'Select a friendly unit to move, or press A after selecting one to target an attack.';
  }

  const unit = world.units.find((entry) => entry.id === selectedUnitId);
  if (!unit) {
    return 'Select a friendly unit to move, or press A after selecting one to target an attack.';
  }

  if (!unit.isActiveFaction) {
    return 'Only the active faction can receive movement orders.';
  }

  if (targetingMode === 'attack') {
    if (attackTargetCount === 0) {
      return 'No enemies are currently in attack range. Press Esc to exit attack mode.';
    }

    return 'Attack mode is active. Click a highlighted enemy to attack, or press Esc to cancel.';
  }

  if (legalMoveCount === 0 && attackTargetCount === 0) {
    return 'This unit has no legal moves or attack targets left this turn.';
  }

  if (legalMoveCount === 0) {
    return 'No legal moves remain. Press A to attack if an enemy is in range.';
  }

  return 'Drag the unit to a highlighted tile to move. Press A to switch into attack mode.';
}

function keyToCoord(key: string) {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}
