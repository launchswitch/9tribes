import type { ClientState } from '../game/types/clientState';
import { getCombatSummary } from '../game/view-model/worldViewModel';

type RightInspectorProps = {
  state: ClientState;
  onSetCityProduction?: (cityId: string, prototypeId: string) => void;
};

export function RightInspector({ state, onSetCityProduction }: RightInspectorProps) {
  const hoveredKey = state.hoveredHex ? `${state.hoveredHex.q},${state.hoveredHex.r}` : null;
  const hoveredTile = hoveredKey ? state.world.map.hexes.find((hex) => hex.key === hoveredKey) : null;
  const selectedUnitId = state.selected?.type === 'unit' ? state.selected.unitId : null;
  const selectedUnit = selectedUnitId
    ? state.world.units.find((unit) => unit.id === selectedUnitId)
    : null;
  const hoveredMove = hoveredKey ? state.actions.legalMoves.find((entry) => entry.key === hoveredKey) ?? null : null;
  const selectedCity = state.hud.selectedCity;
  const settlementPreview = state.hud.settlementPreview;

  return (
    <aside className="right-inspector">
      <section className="panel">
        <div className="panel-heading compact">
          <p className="panel-kicker">Selection</p>
          <h2>{state.hud.selectedTitle}</h2>
        </div>
        <p>{state.hud.selectedDescription}</p>
        {state.hud.selectedMeta.map((entry) => (
          <div className="meta-row" key={entry.label}>
            <span>{entry.label}</span>
            <strong>{entry.value}</strong>
          </div>
        ))}
      </section>

      {selectedCity ? (
        <>
          <section className="panel city-panel">
            <div className="panel-heading compact">
              <p className="panel-kicker">Site Bonuses</p>
              <h2>Settlement Ecology</h2>
            </div>
            {selectedCity.siteBonuses.traits.map((trait) => (
              <div className="meta-row" key={trait.key}>
                <span>{trait.label}</span>
                <strong>{trait.active ? trait.effect : 'None'}</strong>
              </div>
            ))}
          </section>

          <section className="panel city-panel">
            <div className="panel-heading compact">
              <p className="panel-kicker">Production</p>
              <h2>{selectedCity.production.status === 'producing' ? 'Current Build' : 'Idle City'}</h2>
            </div>
            {selectedCity.production.current ? (
              <div className="city-card">
                <strong>{selectedCity.production.current.name}</strong>
                <div className="meta-row">
                  <span>{selectedCity.production.current.costType === 'villages' ? 'Village Payment' : 'Progress'}</span>
                  <strong>
                    {selectedCity.production.current.costType === 'villages'
                      ? `${selectedCity.production.current.progress}/${selectedCity.production.current.cost} villages`
                      : `${selectedCity.production.current.progress}/${selectedCity.production.current.cost}`}
                  </strong>
                </div>
                <div className="meta-row">
                  <span>Remaining</span>
                  <strong>
                    {selectedCity.production.current.costType === 'villages'
                      ? `${selectedCity.production.current.remaining} villages`
                      : selectedCity.production.current.remaining}
                  </strong>
                </div>
                <div className="meta-row">
                  <span>{selectedCity.production.current.costType === 'villages' ? 'Funding' : 'City output'}</span>
                  <strong>
                    {selectedCity.production.current.costType === 'villages'
                      ? selectedCity.production.current.costLabel
                      : `${selectedCity.production.perTurnIncome}/turn`}
                  </strong>
                </div>
                <div className="meta-row">
                  <span>ETA</span>
                  <strong>{selectedCity.production.current.turnsRemaining === null ? 'n/a' : `${selectedCity.production.current.turnsRemaining} turn(s)`}</strong>
                </div>
              </div>
            ) : (
              <p className="quiet-copy">No production is active in this city.</p>
            )}
            {selectedCity.production.queue.length > 0 ? (
              <div className="city-stack">
                {selectedCity.production.queue.map((item) => (
                  <div className="city-list-row" key={`${item.type}-${item.id}`}>
                    <span>{item.name}</span>
                    <strong>{item.costLabel}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="quiet-copy">No queued items.</p>
            )}
          </section>

          <section className="panel city-panel">
            <div className="panel-heading compact">
              <p className="panel-kicker">Select Production</p>
              <h2>{selectedCity.canManageProduction ? 'Available Units' : 'Read Only'}</h2>
            </div>
            {!selectedCity.canManageProduction ? (
              <p className="quiet-copy">
                {selectedCity.walls.besieged
                  ? 'Production cannot be changed while this city is besieged.'
                  : selectedCity.isFriendly
                    ? 'Only the active friendly city can change production.'
                    : 'Enemy cities can be inspected, but not managed.'}
              </p>
            ) : null}
            <div className="city-stack">
              {selectedCity.productionOptions.map((option) => (
                <button
                  key={option.prototypeId}
                  type="button"
                  className="city-option"
                  disabled={option.disabled}
                  onClick={() => onSetCityProduction?.(selectedCity.cityId, option.prototypeId)}
                >
                  <div className="city-option__header">
                    <strong>{option.name}</strong>
                    <span>{option.costLabel}</span>
                  </div>
                  <p>
                    {option.chassisId.replace('_frame', '')} · atk {option.attack} · def {option.defense} · hp {option.hp} · mov {option.moves} · rng {option.range}
                  </p>
                  {option.disabledReason ? <span className="city-option__hint">{option.disabledReason}</span> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="panel city-panel">
            <div className="panel-heading compact">
              <p className="panel-kicker">Supply</p>
              <h2>Faction Logistics</h2>
            </div>
            <div className="meta-row">
              <span>Supply income</span>
              <strong>{selectedCity.supply.income}</strong>
            </div>
            <div className="meta-row">
              <span>Supply used</span>
              <strong>{selectedCity.supply.used}</strong>
            </div>
            <div className="meta-row">
              <span>Balance</span>
              <strong>{selectedCity.supply.balance}</strong>
            </div>
            <div className="meta-row">
              <span>Deficit</span>
              <strong>{selectedCity.supply.deficit}</strong>
            </div>
            {selectedCity.captureRamp && selectedCity.captureRamp.rampMultiplier < 1 ? (
              <p className="quiet-copy" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                {selectedCity.captureRamp.turnsUntilOutput > 0
                  ? `Captured city — 0% output (${selectedCity.captureRamp.turnsUntilOutput} turn${selectedCity.captureRamp.turnsUntilOutput !== 1 ? 's' : ''} until production resumes)`
                  : `Ramping up — ${Math.round(selectedCity.captureRamp.rampMultiplier * 100)}% output (${selectedCity.captureRamp.turnsUntilFull} turn${selectedCity.captureRamp.turnsUntilFull !== 1 ? 's' : ''} until full)`}
              </p>
            ) : null}
          </section>

          <section className="panel city-panel">
            <div className="panel-heading compact">
              <p className="panel-kicker">Exhaustion</p>
              <h2>Morale Pressure</h2>
            </div>
            <div className="meta-row">
              <span>Exhaustion</span>
              <strong>{selectedCity.exhaustion.points}</strong>
            </div>
            <div className="meta-row">
              <span>Production penalty</span>
              <strong>{Math.round(selectedCity.exhaustion.productionPenalty * 100)}%</strong>
            </div>
            <div className="meta-row">
              <span>Morale penalty</span>
              <strong>{selectedCity.exhaustion.moralePenalty}</strong>
            </div>
          </section>

          <section className="panel city-panel">
            <div className="panel-heading compact">
              <p className="panel-kicker">Village Readiness</p>
              <h2>{selectedCity.villageReadiness.eligible ? 'Eligible' : 'Blocked'}</h2>
            </div>
            <div className="city-stack">
              {selectedCity.villageReadiness.checklist.map((item) => (
                <div className="city-list-row" key={item.key}>
                  <span>{item.met ? 'Ready' : 'Blocked'} · {item.label}</span>
                  <strong>{item.detail ?? (item.met ? 'Yes' : 'No')}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {settlementPreview ? (
        <section className="panel">
          <div className="panel-heading compact">
            <p className="panel-kicker">Site Preview</p>
            <h2>{settlementPreview.q}, {settlementPreview.r}</h2>
          </div>
          <p>{settlementPreview.terrain}</p>
          {settlementPreview.traits.map((trait) => (
            <div className="meta-row" key={trait.key}>
              <span>{trait.label}</span>
              <strong>{trait.active ? `${trait.effect} (${trait.count})` : 'None'}</strong>
            </div>
          ))}
          {settlementPreview.blockedReason ? (
            <p className="quiet-copy">{settlementPreview.blockedReason}</p>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading compact">
          <p className="panel-kicker">Turn State</p>
          <h2>Current Orders</h2>
        </div>
        <div className="meta-row">
          <span>Active faction</span>
          <strong>{state.hud.activeFactionName}</strong>
        </div>
        <div className="meta-row">
          <span>Hint</span>
          <strong>{state.actions.interactionHint ?? 'None'}</strong>
        </div>
        {selectedUnit ? (
          <>
            <div className="meta-row">
              <span>Veterancy</span>
              <strong>{selectedUnit.veteranLevel ?? 'green'}</strong>
            </div>
            {selectedUnit.xp != null ? (
              <div className="meta-row">
                <span>XP</span>
                <strong>{selectedUnit.xp}</strong>
              </div>
            ) : null}
            <div className="meta-row">
              <span>Moves</span>
              <strong>{selectedUnit.movesRemaining}/{selectedUnit.movesMax}</strong>
            </div>
            <div className="meta-row">
              <span>Status</span>
              <strong>
                {selectedUnit.canAct
                  ? 'Ready'
                  : selectedUnit.isActiveFaction
                    ? 'Spent'
                    : 'Inactive faction'}
              </strong>
            </div>
            <div className="meta-row">
              <span>Reachable tiles</span>
              <strong>{state.actions.legalMoves.length}</strong>
            </div>
            {!selectedUnit.canAct ? (
              <p className="quiet-copy">
                {selectedUnit.isActiveFaction
                  ? 'This unit is spent or has no legal moves remaining.'
                  : 'This unit cannot act until its faction is active.'}
              </p>
            ) : null}
          </>
        ) : (
          <p className="quiet-copy">Select a unit to inspect its movement state.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <p className="panel-kicker">Target Tile</p>
          <h2>{hoveredTile ? hoveredTile.key : 'No hover target'}</h2>
        </div>
        {hoveredTile ? (
          <>
            <div className="meta-row">
              <span>Terrain</span>
              <strong>{hoveredTile.terrain}</strong>
            </div>
            <div className="meta-row">
              <span>Owner</span>
              <strong>{hoveredTile.ownerFactionId ?? 'Neutral'}</strong>
            </div>
            <div className="meta-row">
              <span>Visibility</span>
              <strong>{hoveredTile.visibility}</strong>
            </div>
            {hoveredMove ? (
              <>
                <div className="meta-row">
                  <span>Move cost</span>
                  <strong>{hoveredMove.cost}</strong>
                </div>
                <div className="meta-row">
                  <span>Moves after</span>
                  <strong>{hoveredMove.movesRemainingAfterMove}</strong>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <p className="quiet-copy">Hover a tile to inspect terrain and ownership.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading compact">
          <p className="panel-kicker">Factions</p>
          <h2>Board Summary</h2>
        </div>
        <div className="faction-stack">
          {state.hud.factionSummaries.map((faction) => (
            <div className="faction-row" key={faction.id}>
              <div className="faction-row__title">
                <span className="faction-swatch" style={{ background: faction.color }} />
                <strong>{faction.name}</strong>
              </div>
              <span>{faction.livingUnits} units · {faction.cities} cities</span>
            </div>
          ))}
        </div>
      </section>

      {state.hud.recentCombat.length > 0 ? (
        <section className="panel">
          <div className="panel-heading compact">
            <p className="panel-kicker">Combat</p>
            <h2>Recent Exchanges</h2>
          </div>
          {state.hud.recentCombat.map((event, index) => (
            <div className="inspector-entry" key={`${event.attackerUnitId}-${event.defenderUnitId}-${index}`}>
              <strong>{event.summary}</strong>
              <p>{getCombatSummary(event)}</p>
            </div>
          ))}
        </section>
      ) : null}
    </aside>
  );
}
