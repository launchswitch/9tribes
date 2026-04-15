import type { CSSProperties } from 'react';
import type { ClientState } from '../game/types/clientState';
import { DropdownMenu } from './DropdownMenu';
import { SynergyChip } from './SynergyChip';
import type { MenuEntry } from './DropdownMenu';

type GameMenuBarProps = {
  state: ClientState;
  onOpenResearch: () => void;
  onOpenHelp?: () => void;
  onOpenControls?: () => void;
  onRestartSession?: () => void;
  onMenuAction: (action: string) => void;
};

const gameMenu: MenuEntry[] = [
  { label: 'New Game', action: 'new_game' },
  { label: 'Save', action: 'save' },
  { label: 'Load', action: 'load' },
  { label: 'Preferences', action: 'preferences', disabled: true },
  { divider: true, id: 'game-divider-1' },
  { label: 'Restart Session', action: 'restart_session' },
];

const reportsMenu: MenuEntry[] = [
  { label: 'Faction Summary', action: 'open_faction_summary' },
  { label: 'Supply & Logistics', action: 'open_supply_report' },
  { label: 'Combat Log', action: 'open_combat_log' },
  { label: 'Research Tree', action: 'open_research' },
  { divider: true, id: 'reports-divider-1' },
  { label: 'AI Intents', action: 'open_ai_intents' },
];

const viewMenu: MenuEntry[] = [
  { label: 'Toggle Grid', action: 'toggle_grid', disabled: true },
  { label: 'Toggle Borders', action: 'toggle_borders', disabled: true },
  { label: 'Toggle Fog of War', action: 'toggle_fog', disabled: true },
  { divider: true, id: 'view-divider-1' },
  { label: 'Zoom to Capital', action: 'zoom_to_capital', disabled: true },
  { label: 'Zoom to Selection', action: 'zoom_to_selection', disabled: true },
  { divider: true, id: 'view-divider-2' },
  { label: 'Debug Overlay', action: 'toggle_debug_overlay' },
];

const helpMenu: MenuEntry[] = [
  { label: 'How to Play', action: 'open_how_to_play' },
  { label: 'Controls', action: 'open_controls' },
  { label: 'About', action: 'open_about', disabled: true },
];

export function GameMenuBar({ state, onOpenResearch, onOpenHelp, onOpenControls, onRestartSession, onMenuAction }: GameMenuBarProps) {
  const activeFaction = state.world.factions.find((f) => f.id === state.activeFactionId);
  const factionColor = activeFaction?.color ?? '#d6a34b';

  const handleMenuAction = (action: string) => {
    if (action === 'open_research') {
      onOpenResearch();
      return;
    }
    if (action === 'open_how_to_play') {
      onOpenHelp?.();
      return;
    }
    if (action === 'open_controls') {
      onOpenControls?.();
      return;
    }
    if (action === 'restart_session') {
      onRestartSession?.();
      return;
    }
    onMenuAction(action);
  };

  const researchChip = state.hud.researchChip;

  return (
    <nav className="gmb-root" style={{ '--gmb-faction-color': factionColor } as CSSProperties}>
      <div className="gmb-menus">
        <DropdownMenu label="Game" items={gameMenu} onAction={handleMenuAction} />
        <DropdownMenu label="Reports" items={reportsMenu} onAction={handleMenuAction} />
        <DropdownMenu label="View" items={viewMenu} onAction={handleMenuAction} />
        <DropdownMenu label="Help" items={helpMenu} onAction={handleMenuAction} />
      </div>

      <div className="gmb-status">
        <div className="gmb-chip gmb-chip--faction">
          <span className="gmb-swatch" style={{ background: factionColor }} />
          <span>{state.hud.activeFactionName}</span>
        </div>

        <div className="gmb-chip gmb-chip--round">
          <span className="gmb-chip-label">R</span>
          <span>{state.turn}{state.mode === 'replay' ? `/${state.maxTurns}` : ''}</span>
        </div>

        {researchChip ? (
          <button
            type="button"
            className="gmb-chip gmb-chip--research"
            onClick={onOpenResearch}
          >
            <span className="gmb-chip-label">Research</span>
            <span>{researchChip.activeNodeName ?? 'Idle'}</span>
          </button>
        ) : null}

        {state.hud.supply ? (
          <div
            className={`gmb-chip gmb-chip--supply${state.hud.supply.deficit > 0 ? ' gmb-chip--deficit' : ''}`}
            title={state.hud.supply.deficit > 0
              ? `DEFICIT: -${state.hud.supply.deficit.toFixed(1)} supply/turn\nMorale drain: ~${state.hud.supply.deficit.toFixed(1)} per unit/turn\nExhaustion: ${state.hud.exhaustion?.points?.toFixed(1) ?? 0} pts (+${(state.hud.supply.deficit * 2).toFixed(1)}/turn)\nProduction output reduced by ${Math.round((state.hud.exhaustion?.productionPenalty ?? 0) * 100)}%\nMorale penalty: ${state.hud.exhaustion?.moralePenalty ?? 0} per unit`
              : 'Supply is balanced. No penalties in effect.'}
          >
            <span className="gmb-chip-label">Supply</span>
            <span>{state.hud.supply.used}/{Math.floor(state.hud.supply.income)}</span>
          </div>
        ) : null}

        <SynergyChip state={state} />

      </div>
    </nav>
  );
}
