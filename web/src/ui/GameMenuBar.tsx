import type { CSSProperties } from 'react';
import { useState, useEffect } from 'react';
import type { ClientState } from '../game/types/clientState';
import { getFactionInfo } from '../data/faction-info';
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

function buildGameMenu(canUndo: boolean): MenuEntry[] {
  return [
    { label: 'New Game', action: 'new_game' },
    { label: 'Save', action: 'save' },
    { label: 'Load', action: 'load' },
    { label: 'Preferences', action: 'preferences', disabled: true },
    { divider: true, id: 'game-divider-1' },
    { label: 'Undo', action: 'undo', disabled: !canUndo },
    { divider: true, id: 'game-divider-2' },
    { label: 'Restart Session', action: 'restart_session' },
  ];
}

const reportsMenu: MenuEntry[] = [
  { label: 'Faction Summary', action: 'open_faction_summary' },
  { label: 'Supply & Logistics', action: 'open_supply_report' },
  { label: 'Combat Log', action: 'open_combat_log' },
  { label: 'Research Tree', action: 'open_research' },
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
  const [factionPopupOpen, setFactionPopupOpen] = useState(false);
  const [unitPopupOpen, setUnitPopupOpen] = useState(false);
  const [summonPopupOpen, setSummonPopupOpen] = useState(false);
  const activeFaction = state.world.factions.find((f) => f.id === state.activeFactionId);
  const activeFactionSummary = state.hud.factionSummaries.find((summary) => summary.id === state.activeFactionId);
  const factionColor = activeFaction?.color ?? '#d6a34b';
  const factionInfo = state.activeFactionId ? getFactionInfo(state.activeFactionId) : null;
  const unitStats = factionInfo?.unitStats;

  useEffect(() => {
    window.openFactionPopup = () => {
      setFactionPopupOpen(true);
    };
    return () => { window.openFactionPopup = undefined; };
  }, []);

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
      {factionPopupOpen && factionInfo && (
        <div className="faction-info-panel" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '50px', left: '200px', zIndex: 999 }}>
          <button className="faction-popup__close" onClick={() => setFactionPopupOpen(false)}>×</button>
          <h3 className="faction-popup__name" style={{ color: factionInfo.color }}>{factionInfo.id}: {factionInfo.name}</h3>
          <div className="faction-popup__section">
            <span className="faction-popup__label">Native Ability</span>
            <span>{factionInfo.nativeDomain}</span>
          </div>
          <div className="faction-popup__section">
            <span className="faction-popup__label">Home Biome</span>
            <span>{factionInfo.homeBiome}</span>
          </div>
          <div className="faction-popup__section">
            <span className="faction-popup__label">Special Trait</span>
            <span className="faction-popup__trait">{factionInfo.passiveTrait.replace(/_/g, ' ')}</span>
          </div>
<div className="faction-popup__section">
              <span className="faction-popup__label">Signature Unit</span>
              <span className="signature-unit-click" onClick={() => setUnitPopupOpen(true)}>{factionInfo.signatureUnit}</span>
            </div>
          <div className="faction-popup__section">
            <span className="faction-popup__label">Special Ability</span>
            <span>{factionInfo.specialAbility}</span>
          </div>
          <p className="faction-popup__intro">{factionInfo.intro}</p>
          <div className="faction-popup__section">
            <span className="faction-popup__label">Strengths</span>
            <ul className="faction-popup__list">
              {factionInfo.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div className="faction-popup__section">
            <span className="faction-popup__label">Weaknesses</span>
            <ul className="faction-popup__list">
              {factionInfo.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
          <div className="faction-popup__section">
            <span className="faction-popup__label">Tip</span>
            <p className="faction-popup__tip">{factionInfo.tip}</p>
          </div>
        </div>
      )}
      {unitPopupOpen && unitStats && (
        <div className="unit-stats-panel" onClick={(e) => e.stopPropagation()}>
          <button className="unit-stats-panel__close" onClick={() => setUnitPopupOpen(false)}>×</button>
          <h3 className="unit-stats-panel__name" style={{ color: factionColor }}>{unitStats.attack} / {unitStats.defense} / {unitStats.health}</h3>
          <div className="unit-stats-panel__stats">
            <div><span>Attack</span><strong>{unitStats.attack}</strong></div>
            <div><span>Defense</span><strong>{unitStats.defense}</strong></div>
            <div><span>Health</span><strong>{unitStats.health}</strong></div>
            <div><span>Moves</span><strong>{unitStats.moves}</strong></div>
            <div><span>Range</span><strong>{unitStats.range}</strong></div>
          </div>
          <div className="unit-stats-panel__tags">
            {unitStats.tags.map((tag, i) => <span key={i} className="unit-tag">{tag}</span>)}
          </div>
          <div className="unit-stats-panel__ability">
            <strong>Ability:</strong> {unitStats.ability}
          </div>
          <p className="unit-stats-panel__desc">{unitStats.description}</p>
        </div>
      )}
      {summonPopupOpen && unitStats && (
        <div className="unit-stats-panel" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '60px', right: '20px', left: 'auto', width: '320px', bottom: 'auto', zIndex: 9999 }}>
          <button className="unit-stats-panel__close" onClick={() => setSummonPopupOpen(false)}>×</button>
          <h3 className="unit-stats-panel__name" style={{ color: '#fff', display: 'block', textAlign: 'center' }}>{factionInfo?.signatureUnit ?? unitStats.name}</h3>
          <div className="unit-stats-panel__stats">
            <div><span>Attack</span><strong>{unitStats.attack}</strong></div>
            <div><span>Defense</span><strong>{unitStats.defense}</strong></div>
            <div><span>Health</span><strong>{unitStats.health}</strong></div>
            <div><span>Moves</span><strong>{unitStats.moves}</strong></div>
            <div><span>Range</span><strong>{unitStats.range}</strong></div>
          </div>
          <div className="unit-stats-panel__tags">
            {unitStats.tags.map((tag, i) => <span key={i} className="unit-tag">{tag}</span>)}
          </div>
          <div className="unit-stats-panel__ability">
            <strong>Ability:</strong> {unitStats.ability}
          </div>
          <p className="unit-stats-panel__desc">{unitStats.description}</p>
          {factionInfo?.summonCondition && (
            <div className="unit-stats-panel__condition" style={{ marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '13px', color: '#fff', fontWeight: 600, textAlign: 'center' }}>
              {factionInfo.summonCondition}
            </div>
          )}
        </div>
      )}
      <div className="gmb-menus">
        <DropdownMenu label="Game" items={buildGameMenu(state.actions.canUndo)} onAction={handleMenuAction} />
        <DropdownMenu label="Reports" items={reportsMenu} onAction={handleMenuAction} />
        <DropdownMenu label="View" items={viewMenu} onAction={handleMenuAction} />
        <DropdownMenu label="Help" items={helpMenu} onAction={handleMenuAction} />
      </div>

      <div className="gmb-status">
        <div className="gmb-chip gmb-chip--faction" onClick={() => setFactionPopupOpen(true)}>
          <span className="gmb-swatch" style={{ background: factionColor }} />
          <span>{state.hud.activeFactionName}</span>
        </div>

        <div className="gmb-chip gmb-chip--round">
          <span className="gmb-chip-label">Round</span>
          <span>{state.turn}</span>
        </div>

        <div
          className={`gmb-chip gmb-chip--villages${(activeFactionSummary?.villages ?? 0) > 5 ? ' gmb-chip--villages-surplus' : ''}`}
          title={`${state.hud.activeFactionName} controls ${activeFactionSummary?.villages ?? 0} villages.`}
        >
          <span className="gmb-chip-label">Villages</span>
          <span>{(activeFactionSummary?.villages ?? 0)}</span>
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

        {state.hud.summonTimer ? (
          state.hud.summonTimer.isActive ? (
            <button type="button" className="gmb-chip gmb-chip--summon-active" onClick={() => setSummonPopupOpen(true)}>
              <span className="gmb-chip-label">Summon</span>
              <span>Active ({state.hud.summonTimer.turnsRemaining})</span>
            </button>
          ) : (
            <button type="button" className="gmb-chip gmb-chip--summon-cooldown" title={`${state.hud.summonTimer.cooldownRemaining} turns until ${factionInfo?.signatureUnit ?? 'signature'} unit is summoned`} onClick={() => setSummonPopupOpen(true)}>
              <span className="gmb-chip-label">Summon</span>
              <span>{state.hud.summonTimer.cooldownRemaining}</span>
            </button>
          )
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
