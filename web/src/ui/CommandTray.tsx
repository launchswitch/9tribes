import type { ClientState } from '../game/types/clientState';

type CommandTrayProps = {
  state: ClientState;
  onEndTurn: () => void;
  onSetTargetingMode: (mode: 'move' | 'attack') => void;
  onBuildFort?: (unitId: string) => void;
  onBuildCity?: (unitId: string) => void;
};

function formatDomainName(domainId: string): string {
  return domainId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function CommandTray({ state, onEndTurn, onSetTargetingMode, onBuildFort, onBuildCity }: CommandTrayProps) {
  const selectedUnitId = state.selected?.type === 'unit' ? state.selected.unitId : state.actions.selectedUnitId;
  const selectedUnit = selectedUnitId
    ? state.world.units.find((u) => u.id === selectedUnitId)
    : null;
  const selectedCity = state.hud.selectedCity;
  const settlementPreview = state.hud.settlementPreview;

  const canBuildFort = (() => {
    if (!selectedUnit) return false;
    if (!selectedUnit.isActiveFaction) return false;
    if (selectedUnit.movesRemaining !== selectedUnit.movesMax) return false;

    const faction = state.world.factions.find((f) => f.id === selectedUnit.factionId);
    if (!faction || faction.id !== 'hill_clan' || faction.nativeDomain !== 'fortress') return false;

    const canBuildFieldForts = state.research?.nodes.some(
      (node) => node.nodeId === 'fortress_t2' && node.state === 'completed',
    ) ?? false;
    if (!canBuildFieldForts) return false;

    const hasFort = state.world.improvements.some(
      (improvement) => improvement.q === selectedUnit.q && improvement.r === selectedUnit.r,
    );
    if (hasFort) return false;

    return selectedUnit.movementClass === 'infantry' || selectedUnit.role === 'ranged';
  })();

  const canBuildCity = (() => {
    if (!selectedUnit) return false;
    if (!selectedUnit.isActiveFaction || !selectedUnit.isSettler) return false;
    if (selectedUnit.movesRemaining !== selectedUnit.movesMax) return false;

    const hasCity = state.world.cities.some((city) => city.q === selectedUnit.q && city.r === selectedUnit.r);
    const hasVillage = state.world.villages.some((village) => village.q === selectedUnit.q && village.r === selectedUnit.r);
    const hasImprovement = state.world.improvements.some((improvement) => improvement.q === selectedUnit.q && improvement.r === selectedUnit.r);
    return !hasCity && !hasVillage && !hasImprovement;
  })();

  return (
    <section className="ct-root">
      <div className="ct-segment ct-segment--info">
        {selectedUnit ? (
          <>
            <strong className="ct-unit-name">{selectedUnit.prototypeName}</strong>
            <span className="ct-detail">
              {selectedUnit.hp}/{selectedUnit.maxHp} HP · {selectedUnit.range > 1 ? `RNG ${selectedUnit.range}` : 'Melee'} · {selectedUnit.movesRemaining}/{selectedUnit.movesMax} moves · {selectedUnit.q},{selectedUnit.r}
            </span>
            {selectedUnit.learnedAbilities && selectedUnit.learnedAbilities.length > 0 ? (
              <span className="ct-knowledge-hint">
                Carries: {selectedUnit.learnedAbilities.map((d) => formatDomainName(d)).join(', ')}
              </span>
            ) : null}
            {selectedUnit.isSettler && !settlementPreview ? (
              <span className="ct-knowledge-hint">Press 'b' to build a city</span>
            ) : null}
            {settlementPreview ? (
              <span className="ct-knowledge-hint">
                Site {settlementPreview.q},{settlementPreview.r} · {settlementPreview.terrain}
                {settlementPreview.productionBonus > 0 ? ` · +${settlementPreview.productionBonus} prod` : ''}
                {settlementPreview.supplyBonus > 0 ? ` · +${settlementPreview.supplyBonus} supply` : ''}
                {settlementPreview.villageCooldownReduction > 0 ? ` · faster villages (1/3 turns)` : ''}
                {settlementPreview.blockedReason ? ` · ${settlementPreview.blockedReason}` : ''}
              </span>
            ) : null}
          </>
        ) : selectedCity ? (
          <>
            <strong className="ct-unit-name">{selectedCity.cityName}</strong>
            <span className="ct-detail">
              {selectedCity.production.status === 'producing' && selectedCity.production.current
                ? selectedCity.production.current.costType === 'villages'
                  ? `Building: ${selectedCity.production.current.name} (${selectedCity.production.current.progress}/${selectedCity.production.current.cost} villages)`
                  : `Building: ${selectedCity.production.current.name} (${selectedCity.production.current.progress}/${selectedCity.production.current.cost})`
                : 'Idle'}
            </span>
          </>
        ) : (
          <span className="ct-detail">Select a unit to give orders</span>
        )}
      </div>

      <div className="ct-segment ct-segment--actions">
        {selectedUnit ? (
          <>
            <button
              type="button"
              className={`ct-mode-btn${state.actions.targetingMode === 'move' ? ' ct-mode-btn--active' : ''}`}
              onClick={() => onSetTargetingMode('move')}
            >
              Move
            </button>
            <button
              type="button"
              className={`ct-mode-btn${state.actions.targetingMode === 'attack' ? ' ct-mode-btn--active' : ''}`}
              onClick={() => onSetTargetingMode('attack')}
            >
              Attack
            </button>
            {canBuildFort ? (
              <button
                type="button"
                className="ct-mode-btn"
                onClick={() => onBuildFort?.(selectedUnitId!)}
              >
                Build Fort
              </button>
            ) : null}
            {canBuildCity ? (
              <button
                type="button"
                className="ct-mode-btn"
                onClick={() => onBuildCity?.(selectedUnitId!)}
              >
                Build City
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="ct-segment ct-segment--end">
        <button
          type="button"
          className="ct-btn-end-turn"
          disabled={!state.actions.canEndTurn}
          onClick={onEndTurn}
        >
          End Turn [Enter]
        </button>
      </div>
    </section>
  );
}
