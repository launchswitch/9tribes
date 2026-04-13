import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Phaser from 'phaser';
import type { GameController } from '../game/controller/GameController';
import type { ClientState } from '../game/types/clientState';
import type { PendingCombat } from '../game/controller/GameSession';
import type { UnitView } from '../game/types/worldView';
import type { SaveGameSummary } from './savegames';
import { createGame } from '../game/phaser/createGame';

// Legacy components
import { BottomCommandBar } from '../ui/BottomCommandBar';
import { ResearchWindow } from '../ui/ResearchWindow';
import { HelpPanel } from '../ui/HelpPanel';
import { RightInspector } from '../ui/RightInspector';
import { TopHud } from '../ui/TopHud';

// V2 components
import { GameMenuBar } from '../ui/GameMenuBar';
import { ContextInspector } from '../ui/ContextInspector';
import { CommandTray } from '../ui/CommandTray';
import { TurnBanner } from '../ui/TurnBanner';
import { DebugOverlay } from '../ui/DebugOverlay';
import { ReportsOverlay } from '../ui/ReportsOverlay';
import { KnowledgeGainedModalProvider, useLearnDetector, useKnowledgeModal } from '../ui/KnowledgeGainedModal';
import { CombatLogPanel } from '../ui/CombatLogPanel';
import { getDestroyedPlayerVillages, playCombatSoundForPendingCombat, playSessionDeltaSounds } from './audio/sfxManager';

const params = new URLSearchParams(window.location.search);
const USE_V2_LAYOUT = params.get('layout') !== 'legacy';

type ShellContentProps = {
  controller: GameController;
  state: ClientState;
  hostRef: React.RefCallback<HTMLDivElement> | React.RefObject<HTMLDivElement> | null;
  gameRef: React.RefObject<Phaser.Game | null>;
  turnBanner: string | null;
  instructionsDismissed: boolean;
  researchOpen: boolean;
  helpOpen: boolean;
  inspectorOpen: boolean;
  combatLogOpen: boolean;
  debugVisible: boolean;
  activeOverlay: string | null;
  timelineMax: number;
  showPlayInstructions: boolean;
  onSetInstructionsDismissed: (v: boolean) => void;
  onSetTurnBanner: (v: string | null) => void;
  onSetResearchOpen: (v: boolean) => void;
  onSetHelpOpen: (v: boolean) => void;
  onSetInspectorOpen: (v: boolean) => void;
  onSetCombatLogOpen: (v: boolean) => void;
  onSetDebugVisible: (v: boolean) => void;
  onSetActiveOverlay: (v: string | null) => void;
  onRestartSession?: () => void;
  onSaveGame?: () => SaveGameSummary | null;
};

function KnowledgeGainedShellContent({
  controller,
  state,
  hostRef,
  gameRef,
  turnBanner,
  instructionsDismissed,
  researchOpen,
  helpOpen,
  inspectorOpen,
  combatLogOpen,
  debugVisible,
  activeOverlay,
  timelineMax,
  showPlayInstructions,
  onSetInstructionsDismissed,
  onSetTurnBanner,
  onSetResearchOpen,
  onSetHelpOpen,
  onSetInspectorOpen,
  onSetCombatLogOpen,
  onSetDebugVisible,
  onSetActiveOverlay,
  onRestartSession,
  onSaveGame,
}: ShellContentProps) {
  const { showKnowledgeGained } = useKnowledgeModal();
  const [combatLocked, setCombatLocked] = useState(false);
  const [pendingVillageDestroyedAlert, setPendingVillageDestroyedAlert] = useState<string[] | null>(null);
  const previousStateRef = useRef<ClientState | null>(null);

  // Stable callbacks for panel open/close (avoid re-triggering auto-open effects)
  const handleInspectorOpen = useCallback(() => onSetInspectorOpen(true), [onSetInspectorOpen]);
  const handleInspectorClose = useCallback(() => onSetInspectorOpen(false), [onSetInspectorOpen]);
  const handleCombatLogToggle = useCallback(() => onSetCombatLogOpen(!combatLogOpen), [onSetCombatLogOpen, combatLogOpen]);

  useLearnDetector(
    state.world.units,
    state.world.factions,
    state.playFeedback?.playerFactionId ?? null,
    showKnowledgeGained,
  );

  useEffect(() => {
    const destroyedVillages = getDestroyedPlayerVillages(previousStateRef.current, state);
    if (destroyedVillages.length > 0) {
      setPendingVillageDestroyedAlert(destroyedVillages);
    }
    playSessionDeltaSounds(previousStateRef.current, state);
    previousStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (combatLocked || !pendingVillageDestroyedAlert || pendingVillageDestroyedAlert.length === 0) {
      return;
    }

    const villageSummary = pendingVillageDestroyedAlert.join(', ');
    const message = pendingVillageDestroyedAlert.length === 1
      ? `A village has been destroyed: ${villageSummary}.`
      : `Villages have been destroyed: ${villageSummary}.`;
    window.alert(message);
    setPendingVillageDestroyedAlert(null);
  }, [combatLocked, pendingVillageDestroyedAlert]);

  // Register combat-pending callback to bridge React -> Phaser animation
  useEffect(() => {
    if (!gameRef.current) return;

    const game = gameRef.current;
    const scene = game.scene.getScene('MapScene') as import('../game/phaser/scenes/MapScene').MapScene | undefined;
    if (!scene) return;

    controller.onCombatPending((pending: PendingCombat) => {
      const currentState = controller.getState();
      const attacker = currentState.world.units.find((u: UnitView) => u.id === pending.attackerId);
      const defender = currentState.world.units.find((u: UnitView) => u.id === pending.defenderId);
      if (!attacker || !defender) {
        // Fallback: apply immediately if we can't find the units
        controller.applyPendingCombat();
        return;
      }

      // AI-vs-AI combats get instant mode; anything involving a human gets full animation
      const isInstant = !controller.isCombatInvolvesHuman(attacker.factionId, defender.factionId);
      if (!isInstant) {
        playCombatSoundForPendingCombat(pending, attacker);
      }

      // Pan camera to show AI-initiated combat (player isn't already looking at it)
      const aiInitiated = !isInstant && !attacker.isActiveFaction;

      setCombatLocked(true);
      scene.startCombatAnimation(
        {
          attackerDamage: pending.result.attackerDamage,
          defenderDamage: pending.result.defenderDamage,
          attackerDestroyed: pending.result.attackerDestroyed,
          defenderDestroyed: pending.result.defenderDestroyed,
          attackerRouted: pending.result.attackerRouted,
          defenderRouted: pending.result.defenderRouted,
          attackerFled: pending.result.attackerFled,
          defenderFled: pending.result.defenderFled,
        },
        attacker,
        defender,
        () => {
          controller.applyPendingCombat();
          setCombatLocked(false);
        },
        isInstant, // instant mode for AI-vs-AI, full animation otherwise
        aiInitiated, // pan camera to show AI-initiated combat
      );
    });

    return () => {
      // Cleanup: cancel any in-progress animation
      scene?.cancelCombatAnimation();
      if (controller.isCombatInProgress()) {
        controller.applyPendingCombat();
        setCombatLocked(false);
      }
    };
  }, [controller, gameRef.current]);

  const activeFaction = state.world.factions.find((f) => f.id === state.activeFactionId);

  // Global Escape handler: close any open side panel / overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (activeOverlay) { onSetActiveOverlay(null); return; }
      if (helpOpen) { onSetHelpOpen(false); return; }
      if (researchOpen) { onSetResearchOpen(false); return; }
      if (inspectorOpen) { onSetInspectorOpen(false); return; }
      if (combatLogOpen) { onSetCombatLogOpen(false); return; }
      if (debugVisible) { onSetDebugVisible(false); return; }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeOverlay, helpOpen, researchOpen, inspectorOpen, combatLogOpen, debugVisible, onSetActiveOverlay, onSetHelpOpen, onSetResearchOpen, onSetInspectorOpen, onSetCombatLogOpen, onSetDebugVisible]);
  const turnBannerData = state.playFeedback?.lastTurnChange;

  const handleMenuAction = (action: string) => {
    switch (action) {
      case 'open_faction_summary':
        onSetActiveOverlay('faction_summary');
        break;
      case 'open_combat_log':
        onSetActiveOverlay('combat_log');
        break;
      case 'open_supply_report':
        onSetActiveOverlay('supply_report');
        break;
      case 'open_ai_intents':
        onSetActiveOverlay('ai_intents');
        break;
      case 'toggle_debug_overlay':
        onSetDebugVisible(!debugVisible);
        break;
      case 'new_game':
        window.location.search = '';
        break;
      case 'save': {
        const summary = onSaveGame?.();
        if (summary) {
          onSetTurnBanner(`Saved: ${summary.label}`);
        }
        break;
      }
      case 'load':
        window.location.search = 'screen=load';
        break;
      default:
        break;
    }
  };

  const handleDeselect = () => {
    controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
  };

  return (
    <div className="game-shell--v2">
      <div className="game-shell__canvas-host" ref={hostRef} />
      {combatLocked && <div className="combat-overlay-lock" />}
      {state.playFeedback?.aiProcessing && (
        <div className="ai-processing-overlay">
          <span className="ai-processing-spinner" />
          <span>AI thinking…</span>
        </div>
      )}

      <CombatLogPanel events={state.hud.recentCombat} isOpen={combatLogOpen} onToggle={handleCombatLogToggle} />

      <GameMenuBar
        state={state}
        onOpenResearch={() => onSetResearchOpen(true)}
        onOpenHelp={() => onSetHelpOpen(true)}
        onRestartSession={onRestartSession}
        onMenuAction={handleMenuAction}
      />

      <ContextInspector
        state={state}
        isOpen={inspectorOpen}
        onOpen={handleInspectorOpen}
        onClose={handleInspectorClose}
        onSetCityProduction={(cityId, prototypeId) =>
          controller.dispatch({ type: 'set_city_production', cityId, prototypeId })
        }
        onCancelCityProduction={(cityId) =>
          controller.dispatch({ type: 'cancel_city_production', cityId })
        }
        onRemoveFromQueue={(cityId, queueIndex) =>
          controller.dispatch({ type: 'remove_from_queue', cityId, queueIndex })
        }
        onSetTargetingMode={(mode) =>
          controller.dispatch({ type: 'set_targeting_mode', mode })
        }
        onPrepareAbility={(unitId, ability) =>
          controller.dispatch({ type: 'prepare_ability', unitId, ability })
        }
        onBoardTransport={(unitId, transportId) =>
          controller.dispatch({ type: 'board_transport', unitId, transportId })
        }
        onDisembarkUnit={(unitId, transportId, destination) =>
          controller.dispatch({ type: 'disembark_unit', unitId, transportId, destination })
        }
        onDeselect={handleDeselect}
        onCloseCityProduction={() => controller.dispatch({ type: 'close_city_production' })}
      />

      <CommandTray
        state={state}
        timelineMax={timelineMax}
        onSetTurn={(turnIndex) => controller.dispatch({ type: 'set_replay_turn', turnIndex })}
        onEndTurn={() => controller.dispatch({ type: 'end_turn' })}
        onSetTargetingMode={(mode) =>
          controller.dispatch({ type: 'set_targeting_mode', mode })
        }
        onBuildFort={(unitId) => controller.dispatch({ type: 'build_fort', unitId })}
        onBuildCity={(unitId) => controller.dispatch({ type: 'build_city', unitId })}
        onSacrifice={(unitId) => controller.dispatch({ type: 'sacrifice_unit', unitId })}
      />

      {turnBannerData ? (
        <TurnBanner
          factionName={turnBannerData.factionName}
          factionColor={activeFaction?.color ?? '#d6a34b'}
          round={state.turn}
        />
      ) : null}

      {debugVisible ? <DebugOverlay events={state.debug.turnEvents} /> : null}

      {activeOverlay ? (
        <ReportsOverlay
          reportType={activeOverlay as 'faction_summary' | 'combat_log' | 'supply_report' | 'ai_intents'}
          state={state}
          onClose={() => onSetActiveOverlay(null)}
        />
      ) : null}

      {researchOpen && state.research ? (
        <ResearchWindow
          state={state}
          onStartResearch={(nodeId) => controller.dispatch({ type: 'start_research', nodeId })}
          onCancelResearch={() => controller.dispatch({ type: 'cancel_research' })}
          onClose={() => onSetResearchOpen(false)}
        />
      ) : null}

      {helpOpen ? (
        <HelpPanel
          state={state}
          onClose={() => onSetHelpOpen(false)}
        />
      ) : null}
    </div>
  );
}

type GameShellProps = {
  controller: GameController;
  onRestartSession?: () => void;
  onSaveGame?: () => SaveGameSummary | null;
};

export function GameShell({ controller, onRestartSession, onSaveGame }: GameShellProps) {
  const [state, setState] = useState<ClientState>(() => controller.getState());
  const [turnBanner, setTurnBanner] = useState<string | null>(null);
  const [instructionsDismissed, setInstructionsDismissed] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [combatLogOpen, setCombatLogOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => controller.subscribe(() => setState(controller.getState())), [controller]);

  useEffect(() => {
    setState(controller.getState());
    setTurnBanner(null);
    setInstructionsDismissed(false);
  }, [controller]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    gameRef.current = createGame(hostRef.current, controller);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [controller]);

  useEffect(() => {
    const factionName = state.playFeedback?.lastTurnChange?.factionName;
    if (!factionName) {
      return;
    }

    setTurnBanner(`Now Acting: ${factionName}`);
    const timeout = window.setTimeout(() => setTurnBanner(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [state.playFeedback?.lastTurnChange?.factionId, state.playFeedback?.endTurnCount]);

  useEffect(() => {
    if ((state.playFeedback?.moveCount ?? 0) > 0) {
      setInstructionsDismissed(true);
    }
  }, [state.playFeedback?.moveCount]);

  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);

  const timelineMax = useMemo(() => Math.max(0, (state.replay?.turns.length ?? 1) - 1), [state.replay?.turns.length]);
  const showPlayInstructions = state.mode === 'play' && !instructionsDismissed;

  const handleMenuAction = (action: string) => {
    switch (action) {
      case 'open_faction_summary':
        setActiveOverlay('faction_summary');
        break;
      case 'open_combat_log':
        setActiveOverlay('combat_log');
        break;
      case 'open_supply_report':
        setActiveOverlay('supply_report');
        break;
      case 'open_ai_intents':
        setActiveOverlay('ai_intents');
        break;
      case 'toggle_debug_overlay':
        setDebugVisible((v) => !v);
        break;
      default:
        break;
    }
  };

  const handleDeselect = () => {
    controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
  };

  // ── V2 Layout ──
  if (USE_V2_LAYOUT) {
    return (
      <KnowledgeGainedModalProvider>
        <KnowledgeGainedShellContent
          controller={controller}
          state={state}
          hostRef={hostRef}
          gameRef={gameRef}
          turnBanner={turnBanner}
          instructionsDismissed={instructionsDismissed}
          researchOpen={researchOpen}
          helpOpen={helpOpen}
          inspectorOpen={inspectorOpen}
          combatLogOpen={combatLogOpen}
          debugVisible={debugVisible}
          activeOverlay={activeOverlay}
          timelineMax={timelineMax}
          showPlayInstructions={showPlayInstructions}
          onSetInstructionsDismissed={setInstructionsDismissed}
          onSetTurnBanner={setTurnBanner}
          onSetResearchOpen={setResearchOpen}
          onSetHelpOpen={setHelpOpen}
          onSetInspectorOpen={setInspectorOpen}
          onSetCombatLogOpen={setCombatLogOpen}
          onSetDebugVisible={setDebugVisible}
          onSetActiveOverlay={setActiveOverlay}
          onRestartSession={onRestartSession}
          onSaveGame={onSaveGame}
        />
      </KnowledgeGainedModalProvider>
    );
  }

  // ── Legacy Layout ──
  return (
    <div className="game-shell">
      <TopHud state={state} turnBanner={turnBanner} onOpenResearch={() => setResearchOpen(true)} />

      <main className="game-layout">
        <section className="game-stage">
          {showPlayInstructions ? (
            <div className="play-instructions panel">
              <div className="panel-heading compact">
                <p className="panel-kicker">Playtest</p>
                <h2>First Turn</h2>
              </div>
              <p>Select a friendly unit, drag it to a highlighted tile, then End Turn.</p>
            </div>
          ) : null}
          <div className="game-stage__frame" ref={hostRef} />
        </section>

        <RightInspector
          state={state}
          onSetCityProduction={(cityId, prototypeId) => controller.dispatch({ type: 'set_city_production', cityId, prototypeId })}
        />
      </main>

      <BottomCommandBar
        state={state}
        timelineMax={timelineMax}
        onSetTurn={(turnIndex) => controller.dispatch({ type: 'set_replay_turn', turnIndex })}
        onEndTurn={() => controller.dispatch({ type: 'end_turn' })}
        onRestartSession={onRestartSession}
      />

      {researchOpen && state.research ? (
        <ResearchWindow
          state={state}
          onStartResearch={(nodeId) => controller.dispatch({ type: 'start_research', nodeId })}
          onCancelResearch={() => controller.dispatch({ type: 'cancel_research' })}
          onClose={() => setResearchOpen(false)}
        />
      ) : null}
    </div>
  );
}
