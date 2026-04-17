import { useEffect } from 'react';

/**
 * Hook that registers a global Escape key handler to close
 * open panels/overlays in priority order.
 */
export function useEscapeHandler(deps: {
  activeOverlay: string | null;
  helpOpen: boolean;
  researchOpen: boolean;
  inspectorOpen: boolean;
  combatLogOpen: boolean;
  debugVisible: boolean;
  onSetActiveOverlay: (v: string | null) => void;
  onSetHelpOpen: (v: boolean) => void;
  onSetResearchOpen: (v: boolean) => void;
  onSetInspectorOpen: (v: boolean) => void;
  onSetCombatLogOpen: (v: boolean) => void;
  onSetDebugVisible: (v: boolean) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deps.activeOverlay) { deps.onSetActiveOverlay(null); return; }
      if (deps.helpOpen) { deps.onSetHelpOpen(false); return; }
      if (deps.researchOpen) { deps.onSetResearchOpen(false); return; }
      if (deps.inspectorOpen) { deps.onSetInspectorOpen(false); return; }
      if (deps.combatLogOpen) { deps.onSetCombatLogOpen(false); return; }
      if (deps.debugVisible) { deps.onSetDebugVisible(false); return; }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deps.activeOverlay, deps.helpOpen, deps.researchOpen, deps.inspectorOpen, deps.combatLogOpen, deps.debugVisible, deps.onSetActiveOverlay, deps.onSetHelpOpen, deps.onSetResearchOpen, deps.onSetInspectorOpen, deps.onSetCombatLogOpen, deps.onSetDebugVisible]);
}
