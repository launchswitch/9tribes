import { useCallback, useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import type { GameController } from '../game/controller/GameController';
import type { ClientState } from '../game/types/clientState';
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
import { TechDiscoveryModalProvider, useTechDiscoveryDetector, useTechDiscoveryModal } from '../ui/TechDiscoveryModal';
import { CombatLogPanel } from '../ui/CombatLogPanel';
import { useCombatBridge } from './hooks/useCombatBridge';
import { useSessionAudio } from './hooks/useSessionAudio';
import { useEscapeHandler } from './hooks/useEscapeHandler';
import { useTutorial } from './hooks/useTutorial';
import { useUndoHandler } from './hooks/useUndoHandler';
import { TutorialOverlay } from '../ui/TutorialOverlay';
import { VictoryOverlay } from '../ui/VictoryOverlay';
import { TerrainPanel } from '../ui/TerrainPanel';

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
  showPlayInstructions: boolean;
  onSetInstructionsDismissed: (v: boolean) => void;
  onSetTurnBanner: (v: string | null) => void;
  onSetResearchOpen: (v: boolean) => void;
  onSetHelpOpen: (v: boolean) => void;
  onSetInitialHelpTab: (v: string | undefined) => void;
  initialHelpTab: string | undefined;
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
  showPlayInstructions,
  onSetInstructionsDismissed,
  onSetTurnBanner,
  onSetResearchOpen,
  onSetHelpOpen,
  onSetInitialHelpTab,
  initialHelpTab,
  onSetInspectorOpen,
  onSetCombatLogOpen,
  onSetDebugVisible,
  onSetActiveOverlay,
  onRestartSession,
  onSaveGame,
}: ShellContentProps) {
  const { showKnowledgeGained } = useKnowledgeModal();
  const { showTechDiscovery } = useTechDiscoveryModal();

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

  useTechDiscoveryDetector(
    state.playFeedback?.lastResearchCompletion ?? null,
    showTechDiscovery,
  );

  const { combatLocked } = useCombatBridge(controller, gameRef);
  useSessionAudio(state, combatLocked);
  useUndoHandler(controller);
  const tutorial = useTutorial(state);
  const [victoryDismissed, setVictoryDismissed] = useState(false);

  const playerWon = state.playFeedback?.victory?.winnerFactionId === state.playFeedback?.playerFactionId
    && state.playFeedback?.victory?.victoryType !== 'unresolved';
  const playerLost = state.playFeedback?.victory?.eliminatedFactionId === state.playFeedback?.playerFactionId
    && state.playFeedback?.victory?.victoryType !== 'unresolved';

  const handleCloseTerrainInspector = useCallback(
    () => controller.dispatch({ type: 'close_terrain_inspector' }),
    [controller],
  );

  useEscapeHandler({
    activeOverlay,
    helpOpen,
    researchOpen,
    inspectorOpen,
    combatLogOpen,
    debugVisible,
    terrainInspectorOpen: state.terrainInspector !== null,
    onSetActiveOverlay,
    onSetHelpOpen,
    onSetResearchOpen,
    onSetInspectorOpen,
    onSetCombatLogOpen,
    onSetDebugVisible,
    onCloseTerrainInspector: handleCloseTerrainInspector,
  });

  const activeFaction = state.world.factions.find((f) => f.id === state.activeFactionId);
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
      case 'undo':
        controller.dispatch({ type: 'undo' });
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
        onOpenHelp={() => { onSetInitialHelpTab(undefined); onSetHelpOpen(true); }}
        onOpenControls={() => { onSetInitialHelpTab('controls'); onSetHelpOpen(true); }}
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
        onReorderQueue={(cityId, fromIndex, toIndex) =>
          controller.dispatch({ type: 'reorder_queue', cityId, fromIndex, toIndex })
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
        onEndTurn={() => controller.dispatch({ type: 'end_turn' })}
        onSetTargetingMode={(mode) =>
          controller.dispatch({ type: 'set_targeting_mode', mode })
        }
        onBuildFort={(unitId) => controller.dispatch({ type: 'build_fort', unitId })}
        onBuildCity={(unitId) => controller.dispatch({ type: 'build_city', unitId })}
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
          reportType={activeOverlay as 'faction_summary' | 'combat_log' | 'supply_report'}
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
          initialTab={initialHelpTab}
        />
      ) : null}

      {tutorial.popupVisible ? (
        <TutorialOverlay step={tutorial.step} onDismiss={tutorial.onDismiss} />
      ) : null}

      <TerrainPanel
        terrain={state.terrainInspector}
        onClose={handleCloseTerrainInspector}
      />

      {playerWon && !victoryDismissed && state.playFeedback?.victory ? (
        <VictoryOverlay
          victoryType={state.playFeedback.victory.victoryType}
          controlledCities={state.playFeedback.victory.controlledCities}
          totalCities={state.playFeedback.victory.totalCities}
          rounds={state.turn}
          maxRounds={state.playFeedback.maxRounds}
          difficulty={state.playFeedback.difficulty}
          onDismiss={() => setVictoryDismissed(true)}
        />
      ) : null}
      {playerLost && !victoryDismissed && state.playFeedback?.victory ? (
        <VictoryOverlay
          victoryType="defeat"
          controlledCities={null}
          totalCities={null}
          rounds={state.turn}
          maxRounds={state.playFeedback.maxRounds}
          difficulty={state.playFeedback.difficulty}
          onDismiss={() => setVictoryDismissed(true)}
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
  const [initialHelpTab, setInitialHelpTab] = useState<string | undefined>(undefined);
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
        <TechDiscoveryModalProvider>
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
          showPlayInstructions={showPlayInstructions}
          onSetInstructionsDismissed={setInstructionsDismissed}
          onSetTurnBanner={setTurnBanner}
          onSetResearchOpen={setResearchOpen}
          onSetHelpOpen={setHelpOpen}
          onSetInitialHelpTab={setInitialHelpTab}
          initialHelpTab={initialHelpTab}
          onSetInspectorOpen={setInspectorOpen}
          onSetCombatLogOpen={setCombatLogOpen}
          onSetDebugVisible={setDebugVisible}
          onSetActiveOverlay={setActiveOverlay}
          onRestartSession={onRestartSession}
          onSaveGame={onSaveGame}
        />
        </TechDiscoveryModalProvider>
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
