import type { CSSProperties } from 'react';
import type { ClientState } from '../game/types/clientState';

type TopHudProps = {
  state: ClientState;
  turnBanner?: string | null;
  onOpenResearch?: () => void;
};

export function TopHud({ state, turnBanner, onOpenResearch }: TopHudProps) {
  const activeFactionColor = state.world.factions.find((faction) => faction.id === state.activeFactionId)?.color ?? '#d6a34b';
  const recoveringCityCount = state.world.cities.filter(
    (city) => city.factionId === state.activeFactionId && city.turnsSinceCapture !== undefined,
  ).length;

  return (
    <header className="top-hud">
      <div>
        <p className="eyebrow">War-Civ 2</p>
        <h1>{state.hud.title}</h1>
        <p className="subtitle">{state.hud.subtitle}</p>
        {turnBanner ? <p className="turn-banner">{turnBanner}</p> : null}
      </div>

      <div className="top-hud__stats">
        <div className="status-chip">
          <span className="chip-label">Mode</span>
          <strong>{state.mode}</strong>
        </div>
        <div className="status-chip status-chip--active-faction" style={{ '--chip-color': activeFactionColor } as CSSProperties}>
          <span className="chip-label">Faction</span>
          <strong>{state.hud.activeFactionName}</strong>
        </div>
        <div className="status-chip">
          <span className="chip-label">Phase</span>
          <strong>{state.hud.phaseLabel}</strong>
        </div>
        <div className="status-chip">
          <span className="chip-label">Round</span>
          <strong>{state.turn}</strong>
        </div>
        {state.hud.researchChip ? (
          <div className="status-chip status-chip--research" role="button" tabIndex={0} onClick={onOpenResearch} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenResearch?.(); }}>
            <span className="chip-label">Research</span>
            <strong>{state.hud.researchChip.activeNodeName ?? 'Idle'}</strong>
          </div>
        ) : null}
        {state.hud.supply ? (
          <div
            className={`status-chip${state.hud.supply.deficit > 0 ? ' status-chip--deficit' : ''}`}
            title={(() => {
              const base = state.hud.supply.deficit > 0
                ? `DEFICIT: -${state.hud.supply.deficit.toFixed(1)} supply/turn\nMorale drain: ~${state.hud.supply.deficit.toFixed(1)} per unit/turn\nExhaustion: ${state.hud.exhaustion?.points?.toFixed(1) ?? 0} pts (+${(state.hud.supply.deficit * 2).toFixed(1)}/turn)\nProduction output reduced by ${Math.round((state.hud.exhaustion?.productionPenalty ?? 0) * 100)}%\nMorale penalty: ${state.hud.exhaustion?.moralePenalty ?? 0} per unit`
                : 'Supply is balanced. No penalties in effect.';
              return recoveringCityCount > 0
                ? `${base}\n\n⚠ ${recoveringCityCount} city${recoveringCityCount !== 1 ? 'ies' : 'y'} recovering from capture`
                : base;
            })()}
          >
            <span className="chip-label">Supply</span>
            <strong>{state.hud.supply.used}/{Math.floor(state.hud.supply.income)}</strong>
          </div>
        ) : null}
        {state.hud.villages ? (
          <div className="status-chip">
            <span className="chip-label">Villages</span>
            <strong>{state.hud.villages.count}</strong>
          </div>
        ) : null}
      </div>
    </header>
  );
}
