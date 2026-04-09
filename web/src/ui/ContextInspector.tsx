import { useRef, useState, useCallback, useEffect } from 'react';
import type { ClientState } from '../game/types/clientState';
import { getCombatSummary, getIntentSummary } from '../game/view-model/worldViewModel';
import abilityDomains from '../data/ability-domains.json';

type ContextInspectorProps = {
  state: ClientState;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSetCityProduction: (cityId: string, prototypeId: string) => void;
  onCancelCityProduction: (cityId: string) => void;
  onRemoveFromQueue: (cityId: string, queueIndex: number) => void;
  onSetTargetingMode: (mode: 'move' | 'attack') => void;
  onDeselect: () => void;
  onCloseCityProduction?: () => void;
};

type CityTab = 'overview' | 'production';

function formatDomainName(domainId: string): string {
  return domainId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getDomainDescription(domainId: string): string | undefined {
  const domain = (abilityDomains.domains as Record<string, { baseEffect?: { description?: string } }>)[domainId];
  return domain?.baseEffect?.description;
}

export function ContextInspector({ state, isOpen, onOpen, onClose, onSetCityProduction, onCancelCityProduction, onRemoveFromQueue, onSetTargetingMode, onDeselect, onCloseCityProduction }: ContextInspectorProps) {
  const [cityTab, setCityTab] = useState<CityTab>('overview');
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabsCanScrollLeft, setTabsCanScrollLeft] = useState(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);

  // Auto-open to production tab when city production popup is requested
  useEffect(() => {
    if (state.productionPopupCityId) {
      onOpen();
      setCityTab('production');
    }
  }, [state.productionPopupCityId, onOpen]);

  useEffect(() => {
    if (!state.selected) {
      return;
    }

    onOpen();
    if (state.selected.type === 'city') {
      setCityTab('overview');
    }
  }, [state.inspectorRequestId, onOpen]);

  // Panel only opens on explicit user toggle (clicking the hamburger button)

  const updateScrollState = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setTabsCanScrollLeft(el.scrollLeft > 2);
    setTabsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  const scrollTabsLeft = useCallback(() => {
    tabsRef.current?.scrollBy({ left: -120, behavior: 'smooth' });
  }, []);

  const scrollTabsRight = useCallback(() => {
    tabsRef.current?.scrollBy({ left: 120, behavior: 'smooth' });
  }, []);

  const selection = state.selected;

  // Only render full panel when explicitly open
  if (!isOpen || !selection) {
    return (
      <aside className="ci-root">
        {selection && !isOpen && (
          <button
            type="button"
            className="ci-toggle"
            onClick={() => onOpen()}
            aria-label="Open inspector"
          >
            <span className="ci-toggle__icon">&#9776;</span>
          </button>
        )}
      </aside>
    );
  }

  const selectedUnitId = selection.type === 'unit' ? selection.unitId : null;
  const selectedUnit = selectedUnitId
    ? state.world.units.find((u) => u.id === selectedUnitId)
    : null;
  const selectedCity = state.hud.selectedCity;
  const settlementPreview = state.hud.settlementPreview;
  const hoveredKey = state.hoveredHex ? `${state.hoveredHex.q},${state.hoveredHex.r}` : null;
  const hoveredTile = hoveredKey ? state.world.map.hexes.find((hex) => hex.key === hoveredKey) : null;

  return (
    <aside className="ci-root ci-root--open">
      <div className="ci-scroll">
        {/* ── Header ── */}
        <div className="ci-header">
          <button type="button" className="ci-close" onClick={() => { onClose(); onCloseCityProduction?.(); }} aria-label="Close inspector">
            &times;
          </button>
          <div className="ci-header-text">
            <p className="panel-kicker">
              {selection.type === 'unit' ? 'Unit' : selection.type === 'city' ? 'City' : selection.type === 'village' ? 'Village' : 'Tile'}
            </p>
            <h2>{state.hud.selectedTitle}</h2>
          </div>
        </div>

        {/* ── Unit Inspector ── */}
        {selectedUnit ? (
          <div className="ci-section">
            <p className="ci-desc">{state.hud.selectedDescription}</p>

            {/* Combat Stats */}
            <div className="ci-unit-combat">
              <p className="panel-kicker">Combat Stats</p>
              <div className="ci-stat-grid">
                <div className="ci-stat-cell">
                  <span className="ci-stat-value">{selectedUnit.hp}</span>
                  <span className="ci-stat-label">HP</span>
                  <span className="ci-stat-sub">/ {selectedUnit.maxHp}</span>
                </div>
                <div className="ci-stat-cell">
                  <span className="ci-stat-value ci-stat-value--atk">{selectedUnit.attack}</span>
                  <span className="ci-stat-label">Attack</span>
                </div>
                <div className="ci-stat-cell">
                  <span className="ci-stat-value ci-stat-value--def">{selectedUnit.defense}</span>
                  {selectedUnit.effectiveDefense !== selectedUnit.defense && (
                    <span className="ci-stat-sub">→ {selectedUnit.effectiveDefense}</span>
                  )}
                  <span className="ci-stat-label">Defense</span>
                </div>
                <div className="ci-stat-cell">
                  <span className="ci-stat-value">{selectedUnit.range > 1 ? selectedUnit.range : 'Melee'}</span>
                  <span className="ci-stat-label">Range</span>
                </div>
              </div>
            </div>

            {/* Movement & Status */}
            <div className="ci-unit-details">
              <div className="meta-row">
                <span>Moves</span>
                <strong>{selectedUnit.movesRemaining}/{selectedUnit.movesMax}</strong>
              </div>
              <div className="meta-row">
                <span>Status</span>
                <strong>{selectedUnit.status.charAt(0).toUpperCase() + selectedUnit.status.slice(1)}</strong>
              </div>
              {selectedUnit.veteranLevel ? (
                <div className="meta-row">
                  <span>Veterancy</span>
                  <strong>{selectedUnit.veteranLevel}{selectedUnit.xp != null ? ` (${selectedUnit.xp} XP)` : ''}</strong>
                </div>
              ) : null}
              <div className="meta-row">
                <span>Position</span>
                <strong>{selectedUnit.q}, {selectedUnit.r}</strong>
              </div>
              {state.mode === 'play' ? (
                <>
                  <div className="meta-row">
                    <span>Reachable tiles</span>
                    <strong>{state.actions.legalMoves.length}</strong>
                  </div>
                  <div className="meta-row">
                    <span>Attack targets</span>
                    <strong>{state.actions.attackTargets.length}</strong>
                  </div>
                </>
              ) : null}
            </div>

            {/* Domains */}
            {(selectedUnit.nativeDomain || (selectedUnit.learnedAbilities && selectedUnit.learnedAbilities.length > 0)) ? (
              <div className="ci-domains">
                <p className="panel-kicker">Domains</p>
                {selectedUnit.nativeDomain && (
                  <div className="meta-row">
                    <span>Native Domain</span>
                    <strong className="ci-domain--native">{formatDomainName(selectedUnit.nativeDomain)}</strong>
                  </div>
                )}
                {selectedUnit.learnedAbilities && selectedUnit.learnedAbilities.length > 0 ? (
                  <>
                    <div className="meta-row">
                      <span>Learned Abilities</span>
                    </div>
                    {selectedUnit.learnedAbilities.map((domainId) => (
                      <div key={domainId} className="ci-learned-ability">
                        <span className="ci-knowledge__pip">{formatDomainName(domainId)}</span>
                        {getDomainDescription(domainId) && (
                          <p className="ci-learned-ability__desc">{getDomainDescription(domainId)}</p>
                        )}
                      </div>
                    ))}
                    <p className="ci-knowledge__hint">
                      Return this unit to your Home City and Sacrifice it to codify this domain for your faction.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {/* Special Conditions / Skills */}
            {(selectedUnit.isStealthed || selectedUnit.poisoned || selectedUnit.routed || selectedUnit.preparedAbility) ? (
              <div className="ci-conditions">
                <p className="panel-kicker">Conditions</p>
                {selectedUnit.isStealthed && (
                  <div className="meta-row ci-condition ci-condition--stealth">
                    <span>Stealthed</span>
                    <strong>Hidden from enemy sight</strong>
                  </div>
                )}
                {selectedUnit.poisoned && (
                  <div className="meta-row ci-condition ci-condition--poison">
                    <span>Poisoned</span>
                    <strong>Taking damage over time</strong>
                  </div>
                )}
                {selectedUnit.routed && (
                  <div className="meta-row ci-condition ci-condition--routed">
                    <span>Routed</span>
                    <strong>Broken morale — unable to act</strong>
                  </div>
                )}
                {selectedUnit.preparedAbility && (
                  <div className="meta-row ci-condition ci-condition--prepared">
                    <span>Prepared</span>
                    <strong>{selectedUnit.preparedAbility === 'brace' ? 'Bracing (counter-attack bonus)' : 'Ambush (first-strike bonus)'}</strong>
                  </div>
                )}
              </div>
            ) : null}

            {settlementPreview ? (
              <div className="ci-conditions">
                <p className="panel-kicker">Settlement Site</p>
                <div className="meta-row">
                  <span>Target</span>
                  <strong>{settlementPreview.q}, {settlementPreview.r} · {settlementPreview.terrain}</strong>
                </div>
                <div className="meta-row">
                  <span>Status</span>
                  <strong>
                    {settlementPreview.canFoundNow
                      ? 'Ready to found'
                      : settlementPreview.blockedReason ?? 'Preview only'}
                  </strong>
                </div>
                {settlementPreview.traits.map((trait) => (
                  <div className="meta-row" key={trait.key}>
                    <span>{trait.label}</span>
                    <strong>{trait.active ? `${trait.effect} (${trait.count})` : 'None'}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Action Buttons (play mode only) */}
            {state.mode === 'play' ? (
              <div className="ci-actions">
                <button
                  type="button"
                  className={`ci-action-btn${state.actions.targetingMode === 'move' ? ' ci-action-btn--active' : ''}`}
                  onClick={() => onSetTargetingMode('move')}
                >
                  Move
                </button>
                <button
                  type="button"
                  className={`ci-action-btn${state.actions.targetingMode === 'attack' ? ' ci-action-btn--active' : ''}`}
                  onClick={() => onSetTargetingMode('attack')}
                >
                  Attack
                </button>
              </div>
            ) : null}

            {!selectedUnit.canAct ? (
              <p className="quiet-copy">
                {selectedUnit.isActiveFaction
                  ? 'This unit is spent or has no legal moves remaining.'
                  : 'This unit cannot act until its faction is active.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ── City Inspector ── */}
        {selectedCity ? (
          <div className="ci-section">
            <div className="ci-tabs-wrapper">
              {tabsCanScrollLeft && (
                <button type="button" className="ci-tabs-arrow ci-tabs-arrow--left" aria-label="Scroll tabs left" onClick={scrollTabsLeft}>
                  ‹
                </button>
              )}
              <div className="ci-tabs" ref={tabsRef} role="tablist">
                {(['overview', 'production'] as CityTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    className={`ci-tab${cityTab === tab ? ' ci-tab--active' : ''}`}
                    onClick={() => setCityTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              {tabsCanScrollRight && (
                <button type="button" className="ci-tabs-arrow ci-tabs-arrow--right" aria-label="Scroll tabs right" onClick={scrollTabsRight}>
                  ›
                </button>
              )}
            </div>

            {cityTab === 'overview' ? (
              <div className="ci-tab-content">
                <div className="meta-row">
                  <span>Faction</span>
                  <strong>{selectedCity.factionName}</strong>
                </div>
                <div className="meta-row">
                  <span>Walls</span>
                  <strong>{selectedCity.walls.wallHp}/{selectedCity.walls.maxWallHp}</strong>
                </div>
                <div className="meta-row">
                  <span>Besieged</span>
                  <strong>{selectedCity.walls.besieged ? 'Yes' : 'No'}</strong>
                </div>
                <div className="meta-row">
                  <span>Production Income</span>
                  <strong>{selectedCity.production.perTurnIncome}/turn</strong>
                </div>
                <div className="meta-row">
                  <span>Supply Income</span>
                  <strong>{selectedCity.supply.income}/turn</strong>
                </div>
                <div className="meta-row">
                  <span>Supply Used</span>
                  <strong>{selectedCity.supply.used}/{selectedCity.supply.income}</strong>
                </div>
                <div className="meta-row">
                  <span>Turns until next village</span>
                  <strong>{selectedCity.turnsUntilNextVillage === 0 ? 'Ready' : `${selectedCity.turnsUntilNextVillage}`}</strong>
                </div>
                {selectedCity.siteBonuses.traits.map((trait) => (
                  <div className="meta-row" key={trait.key}>
                    <span>{trait.label}</span>
                    <strong>{trait.active ? `${trait.effect} (${trait.count})` : 'None'}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {cityTab === 'production' ? (
              <div className="ci-tab-content ci-prod-tab">
                {/* ── Current Production ── */}
                {selectedCity.production.current ? (
                  <div className="pq-current">
                    <div className="pq-current__header">
                      <span className="pq-current__label">NOW BUILDING</span>
                      <span className="pq-cost-badge">{selectedCity.production.current.costLabel}</span>
                    </div>
                    <strong className="pq-current__name">{selectedCity.production.current.name}</strong>
                    <div className="pq-progress">
                      <div
                        className="pq-progress__fill"
                        style={{ width: `${Math.min(100, (selectedCity.production.current.progress / selectedCity.production.current.cost) * 100)}%` }}
                      />
                    </div>
                    <div className="pq-current__stats">
                      <span>
                        {selectedCity.production.current.costType === 'villages'
                          ? `${selectedCity.production.current.progress.toFixed(0)}/${selectedCity.production.current.cost} villages`
                          : `${selectedCity.production.current.progress.toFixed(0)}/${selectedCity.production.current.cost}`}
                      </span>
                      <span>
                        {selectedCity.production.current.costType === 'villages'
                          ? 'paid from villages'
                          : `${selectedCity.production.perTurnIncome.toFixed(1)}/turn`}
                      </span>
                      <span>{selectedCity.production.current.turnsRemaining === null ? '--' : `${selectedCity.production.current.turnsRemaining}t`}</span>
                    </div>
                    {selectedCity.canManageProduction && (
                      <button
                        type="button"
                        className="pq-cancel-btn"
                        onClick={() => onCancelCityProduction(selectedCity.cityId)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="pq-idle">
                    <span className="pq-idle__dot" />
                    Idle — select a unit to begin training
                  </div>
                )}

                {/* ── Queue ── */}
                {selectedCity.production.queue.length > 0 && (
                  <div className="pq-queue">
                    <div className="pq-queue__header">
                      <span className="pq-queue__label">QUEUE</span>
                      <span className="pq-queue__count">{selectedCity.production.queue.length}</span>
                    </div>
                    {selectedCity.production.queue.map((item, index) => (
                      <div className="pq-queue-item" key={`${item.type}-${item.id}-${index}`}>
                        <span className="pq-queue-item__index">{index + 1}</span>
                        <span className="pq-queue-item__name">{item.name}</span>
                        <span className="pq-queue-item__cost">{item.costLabel}</span>
                        {selectedCity.canManageProduction && (
                          <button
                            type="button"
                            className="pq-queue-item__remove"
                            onClick={() => onRemoveFromQueue(selectedCity.cityId, index)}
                            aria-label={`Remove ${item.name} from queue`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Available Units ── */}
                <div className="pq-divider">
                  <span>{selectedCity.canManageProduction ? 'TRAIN' : 'AVAILABLE UNITS'}</span>
                </div>

                {!selectedCity.canManageProduction ? (
                  <p className="pq-readonly-hint">
                    {selectedCity.walls.besieged
                      ? 'Besieged — production locked'
                      : selectedCity.isFriendly
                        ? 'Only the active city can manage production'
                        : 'Enemy city — read only'}
                  </p>
                ) : null}

                <div className="pq-unit-list">
                  {selectedCity.productionOptions.map((option) => (
                    <button
                      key={option.prototypeId}
                      type="button"
                      className={`pq-unit-row${option.disabled ? ' pq-unit-row--disabled' : ''}`}
                      disabled={option.disabled}
                      onClick={() => onSetCityProduction(selectedCity.cityId, option.prototypeId)}
                    >
                      <span className="pq-unit-row__name">{option.name}</span>
                      <span className="pq-unit-row__stats">
                        {option.attack}/{option.defense} · {option.hp}hp
                        {option.moves > 1 ? ` · m${option.moves}` : ''}
                        {option.range > 1 ? ` · r${option.range}` : ''}
                      </span>
                      <span className="pq-unit-row__cost">{option.costLabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── Hex Inspector (no entity selected) ── */}
        {selection.type === 'hex' ? (
          <div className="ci-section">
            <p className="ci-desc">{state.hud.selectedDescription}</p>
            {state.hud.selectedMeta.map((entry) => (
              <div className="meta-row" key={entry.label}>
                <span>{entry.label}</span>
                <strong>{entry.value}</strong>
              </div>
            ))}
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
              </>
            ) : null}
          </div>
        ) : null}

        {/* ── Village Inspector ── */}
        {selection.type === 'village' ? (
          <div className="ci-section">
            <p className="ci-desc">{state.hud.selectedDescription}</p>
            {state.hud.selectedMeta.map((entry) => (
              <div className="meta-row" key={entry.label}>
                <span>{entry.label}</span>
                <strong>{entry.value}</strong>
              </div>
            ))}
          </div>
        ) : null}


        {/* ── Replay-mode combat/intent details ── */}
        {state.mode === 'replay' ? (
          <div className="ci-section">
            {state.hud.recentCombat.length > 0 ? (
              <>
                <p className="panel-kicker">Combat</p>
                {state.hud.recentCombat.map((event, index) => (
                  <div className="inspector-entry" key={`${event.attackerUnitId}-${event.defenderUnitId}`}>
                    <strong>{event.summary}</strong>
                    <p>{getCombatSummary(event)}</p>
                  </div>
                ))}
              </>
            ) : null}
            {state.hud.recentIntents.length > 0 ? (
              <>
                <p className="panel-kicker">AI Intents</p>
                {state.hud.recentIntents.map((intent) => (
                  <div className="inspector-entry" key={intent.unitId}>
                    <strong>{intent.intent}</strong>
                    <p>{getIntentSummary(intent, state.replay?.factions ?? [])}</p>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
