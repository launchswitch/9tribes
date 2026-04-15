import { useState, useMemo, useCallback } from 'react';
import type { ClientState } from '../game/types/clientState';
import type { CapabilityPipViewModel } from '../game/types/clientState';
import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';

type PairSynergy = typeof pairSynergiesData.pairSynergies[number];
type EmergentRule = typeof emergentRulesData.rules[number];

// ── Domain palette (ability-domain IDs used by pair-synergies.json) ──

const DOMAIN_COLORS: Record<string, string> = {
  venom: '#4ade80',
  fortress: '#60a5fa',
  charge: '#f59e0b',
  hitrun: '#94a3b8',
  tidal_warfare: '#22d3ee',
  slaving: '#dc2626',
  nature_healing: '#10b981',
  river_stealth: '#a855f7',
  camel_adaptation: '#d97706',
  heavy_hitter: '#64748b',
};

const DOMAIN_ICONS: Record<string, string> = {
  venom: '\u2623',
  fortress: '\u26E8',
  charge: '\u1F418',
  hitrun: '\u276F',
  tidal_warfare: '\u1F30A',
  slaving: '\u2694',
  nature_healing: '\u273E',
  river_stealth: '\u1F30F',
  camel_adaptation: '\u1F42A',
  heavy_hitter: '\u2696',
};

// Display name overrides for ability domains
const DOMAIN_NAMES: Record<string, string> = {
  venom: 'Venomcraft',
  fortress: 'Fortress Discipline',
  charge: 'Charge',
  hitrun: 'Skirmish Pursuit',
  tidal_warfare: 'Tidal Warfare',
  slaving: 'Slaving',
  nature_healing: 'Nature Healing',
  river_stealth: 'River Stealth',
  camel_adaptation: 'Camel Adaptation',
  heavy_hitter: 'Heavy Hitter',
};

export function domainGlyph(domainId: string): string {
  return DOMAIN_ICONS[domainId] ?? domainId.slice(0, 2).toUpperCase();
}

export function domainColor(domainId: string): string {
  return DOMAIN_COLORS[domainId] ?? '#888';
}

export function domainDisplayName(domainId: string): string {
  return DOMAIN_NAMES[domainId] ?? domainId.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

// ── Resolution logic ──

interface ResolvedSynergy {
  pair: PairSynergy;
  domains: [string, string];
}

interface ResolvedEmergentProgress {
  rule: EmergentRule;
  satisfiedCategories: string[];
  totalCategories: number;
  satisfiedDomains: string[];
  missingDomains: string[];
  isComplete: boolean;
  progress: number;
}

function resolveSynergies(
  allDomains: string[],
  pairEligibleDomains: string[],
  emergentEligibleDomains: string[],
  nativeDomain: string,
): {
  allDomains: string[];
  nativeDomain: string;
  foreignDomains: string[];
  activePairs: ResolvedSynergy[];
  emergentProgress: ResolvedEmergentProgress[];
  activeTriple: EmergentRule | null;
} {
  const pairs: PairSynergy[] = pairSynergiesData.pairSynergies;
  const rules: EmergentRule[] = emergentRulesData.rules;

  const resolvedDomains = allDomains.length > 0 ? allDomains : [nativeDomain];
  const foreignDomains = resolvedDomains.filter((d) => d !== nativeDomain);

  // Resolve active pairs
  const activePairs: ResolvedSynergy[] = [];
  for (const synergy of pairs) {
    const [d1, d2] = synergy.domains;
    if (pairEligibleDomains.includes(d1) && pairEligibleDomains.includes(d2)) {
      activePairs.push({ pair: synergy, domains: [d1, d2] });
    }
  }

  // Resolve emergent rule progress
  const emergentProgress: ResolvedEmergentProgress[] = [];
  let activeTriple: EmergentRule | null = null;

  for (const rule of rules) {
    if (rule.condition === 'default') continue;

    const result = computeRuleProgress(rule, emergentEligibleDomains);
    emergentProgress.push(result);
    if (result.isComplete && emergentEligibleDomains.length >= 3) {
      activeTriple = rule;
    }
  }

  return { allDomains: resolvedDomains, nativeDomain, foreignDomains, activePairs, emergentProgress, activeTriple };
}

function computeRuleProgress(rule: EmergentRule, learnedDomains: string[]): ResolvedEmergentProgress {
  const satisfiedCategories: string[] = [];
  const satisfiedDomains: string[] = [];
  const missingDomains: string[] = [];

  if (rule.domainSets) {
    const alreadyCredited = new Set<string>();
    for (const [category, domainList] of Object.entries(rule.domainSets)) {
      const matched = domainList.find(
        (d: string) => learnedDomains.includes(d) && !alreadyCredited.has(d),
      );
      if (matched) {
        satisfiedCategories.push(category);
        satisfiedDomains.push(matched);
        alreadyCredited.add(matched);
      } else {
        missingDomains.push(...domainList.slice(0, 1));
      }
    }
  }

  if (rule.mobilityDomains) {
    const count = learnedDomains.filter((d) => rule.mobilityDomains!.includes(d)).length;
    if (count >= 3) satisfiedCategories.push('mobility');
    for (const d of rule.mobilityDomains) {
      if (learnedDomains.includes(d)) satisfiedDomains.push(d);
      else missingDomains.push(d);
    }
  }

  if (rule.combatDomains) {
    const count = learnedDomains.filter((d) => rule.combatDomains!.includes(d)).length;
    if (count >= 3) satisfiedCategories.push('combat');
    for (const d of rule.combatDomains) {
      if (learnedDomains.includes(d)) satisfiedDomains.push(d);
      else missingDomains.push(d);
    }
  }

  const totalCategories = rule.domainSets
    ? Object.keys(rule.domainSets).length
    : rule.mobilityDomains ? 1 : rule.combatDomains ? 1 : 0;

  const isComplete =
    (totalCategories > 0 && satisfiedCategories.length >= totalCategories) ||
    (rule.condition === 'contains_3_mobility' &&
      learnedDomains.filter((d) => rule.mobilityDomains!.includes(d)).length >= 3) ||
    (rule.condition === 'contains_3_combat' &&
      learnedDomains.filter((d) => rule.combatDomains!.includes(d)).length >= 3);

  return {
    rule,
    satisfiedCategories,
    totalCategories: Math.max(totalCategories, 1),
    satisfiedDomains,
    missingDomains: [...new Set(missingDomains)],
    isComplete,
    progress: totalCategories > 0 ? satisfiedCategories.length / totalCategories : 0,
  };
}

// ── Sub-components ──

function DomainDot({
  domainId,
  size = 16,
  isNative = false,
}: {
  domainId: string;
  size?: number;
  isNative?: boolean;
}) {
  const color = domainColor(domainId);
  const glyph = domainGlyph(domainId);

  return (
    <span
      className="syn-dot"
      style={{
        '--syn-dot-color': color,
        '--syn-dot-size': `${size}px`,
      } as React.CSSProperties}
      title={domainDisplayName(domainId)}
      data-native={isNative || undefined}
    >
      <span className="syn-dot__glyph">{glyph}</span>
    </span>
  );
}

function PairConnection({
  pair,
  domainIndexMap,
}: {
  pair: ResolvedSynergy;
  domainIndexMap: Record<string, number>;
}) {
  const idxA = domainIndexMap[pair.domains[0]];
  const idxB = domainIndexMap[pair.domains[1]];
  if (idxA === undefined || idxB === undefined) return null;

  const dotSize = 28;
  const gap = 6;
  const xA = idxA * (dotSize + gap) + dotSize / 2;
  const xB = idxB * (dotSize + gap) + dotSize / 2;
  const y = dotSize / 2;

  return (
    <line
      x1={xA} y1={y} x2={xB} y2={y}
      className="syn-pair-line"
      style={{ stroke: domainColor(pair.domains[0]) }}
    />
  );
}

// ── Main Component ──

type SynergyChipProps = {
  state: ClientState;
};

export function SynergyChip({ state }: SynergyChipProps) {
  const [expanded, setExpanded] = useState(false);

  const capabilities = state.research?.capabilities ?? [];
  const activeFaction = state.world.factions.find((f) => f.id === state.activeFactionId);
  const nativeDomain = activeFaction?.nativeDomain ?? '';
  const factionLearnedDomains = activeFaction?.learnedDomains ?? [];
  const factionColor = activeFaction?.color ?? '#d6a34b';

  // Use faction's learnedDomains (ability-domain IDs) as the source of truth.
  // These are the IDs that pair-synergies.json and emergent-rules.json understand.
  const learnedDomains = useMemo(() => {
    if (factionLearnedDomains.length > 0) return factionLearnedDomains;
    // Fallback to native-only when nothing else learned yet
    return [nativeDomain];
  }, [factionLearnedDomains, nativeDomain]);

  const pairEligibleDomains = useMemo(
    () => capabilities.filter((cap) => cap.level >= 3).map((cap) => cap.domainId),
    [capabilities],
  );

  const emergentEligibleDomains = useMemo(
    () => capabilities.filter((cap) => cap.level >= 2).map((cap) => cap.domainId),
    [capabilities],
  );

  const resolved = useMemo(
    () => resolveSynergies(learnedDomains, pairEligibleDomains, emergentEligibleDomains, nativeDomain),
    [learnedDomains, pairEligibleDomains, emergentEligibleDomains, nativeDomain],
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  const handleClose = useCallback(() => setExpanded(false), []);
  const handlePanelClick = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const hasContent = resolved.foreignDomains.length > 0 || resolved.activePairs.length > 0;

  return (
    <div className="syn-chip-wrap" onClick={handleClick}>
      {/* ── Compact Chip ── */}
      <button
        type="button"
        className={`syn-chip ${hasContent ? 'syn-chip--active' : ''} ${expanded ? 'syn-chip--open' : ''}`}
        style={{ '--syn-accent': factionColor } as React.CSSProperties}
        title="Ability Synergies — click to expand"
      >
        <span className="syn-chip__domains">
          <DomainDot domainId={nativeDomain} size={14} isNative />
          {resolved.foreignDomains.slice(0, 3).map((d) => (
            <DomainDot key={d} domainId={d} size={14} />
          ))}
          {resolved.foreignDomains.length > 3 && (
            <span className="syn-chip__more">+{resolved.foreignDomains.length - 3}</span>
          )}
        </span>

        {resolved.activePairs.length > 0 && (
          <span className="syn-chip__pairs">
            <svg width="12" height="12" viewBox="0 0 12 12" className="syn-icon-link">
              <circle cx="3" cy="6" r="2" fill="currentColor" opacity="0.5" />
              <circle cx="9" cy="6" r="2" fill="currentColor" />
              <line x1="5" y1="6" x2="7" y2="6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {resolved.activePairs.length}
          </span>
        )}

        {resolved.emergentProgress.some((ep) => ep.progress > 0 && !ep.isComplete) && (() => {
          const best = resolved.emergentProgress
            .filter((ep) => ep.progress > 0 && !ep.isComplete)
            .sort((a, b) => b.progress - a.progress)[0];
          return best ? (
            <span className="syn-chip__emergent" title={`${best.rule.name}: ${best.satisfiedCategories.length}/${best.totalCategories}`}>
              <span className="syn-chip__emergent-bar">
                <span className="syn-chip__emergent-fill" style={{ width: `${best.progress * 100}%` }} />
              </span>
              <span className="syn-chip__emergent-text">{best.satisfiedCategories.length}/{best.totalCategories}</span>
            </span>
          ) : null;
        })()}

        {resolved.activeTriple && (
          <span className="syn-chip__triple" style={{ color: factionColor }}>
            &#9733; {resolved.activeTriple.name}
          </span>
        )}
      </button>

      {/* ── Expanded Panel ── */}
      {expanded && (
        <>
          <div className="syn-backdrop" onClick={handleClose} />
          <div className="syn-panel" onClick={handlePanelClick}>
            {/* Header */}
            <div className="syn-panel__header">
              <h3 className="syn-panel__title">Ability Synergies</h3>
              <button type="button" className="syn-panel__close" onClick={handleClose}>
                &#x2715;
              </button>
            </div>

            {/* Domain Constellation */}
            <section className="syn-section">
              <h4 className="syn-section__label">Domains</h4>
              <div className="syn-constellation">
                <svg className="syn-constellation__svg" width="100%" height="36" preserveAspectRatio="xMinYMid meet">
                  {resolved.activePairs.map((pair) => (
                    <PairConnection
                      key={pair.pair.id}
                      pair={pair}
                      domainIndexMap={Object.fromEntries(resolved.allDomains.map((d, i) => [d, i]))}
                    />
                  ))}
                </svg>
                <div className="syn-constellation__dots">
                  {resolved.allDomains.map((d) => (
                    <DomainDot key={d} domainId={d} size={24} isNative={d === nativeDomain} />
                  ))}
                </div>
              </div>
              <div className="syn-domain-list">
                {resolved.allDomains.map((d) => {
                  const isNative = d === nativeDomain;
                  return (
                    <div key={d} className="syn-domain-item" data-native={isNative || undefined}>
                      <DomainDot domainId={d} size={18} isNative={isNative} />
                      <span className="syn-domain-item__name">{domainDisplayName(d)}</span>
                      {isNative && (
                        <span className="syn-domain-item__tag syn-domain-item__tag--native">Native</span>
                      )}
                      {!isNative && (
                        <span className="syn-domain-item__tag syn-domain-item__tag--codified">Acquired</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {resolved.allDomains.length <= 1 && (
                <p className="syn-empty">No foreign domains unlocked yet. Defeat enemies, then sacrifice carriers at your capital.</p>
              )}
            </section>

            {/* Active Pair Synergies */}
            <section className="syn-section">
              <h4 className="syn-section__label">
                Active Pairs
                {resolved.activePairs.length > 0 && (
                  <span className="syn-section__count">{resolved.activePairs.length}</span>
                )}
              </h4>
              {resolved.activePairs.length > 0 ? (
                <ul className="syn-pair-list">
                  {resolved.activePairs.map(({ pair, domains }) => (
                    <li key={pair.id} className="syn-pair-item">
                      <span className="syn-pair-item__domains">
                        <DomainDot domainId={domains[0]} size={14} />
                        <span className="syn-pair-item__plus">+</span>
                        <DomainDot domainId={domains[1]} size={14} />
                      </span>
                      <div className="syn-pair-item__info">
                        <span className="syn-pair-item__name">{pair.name}</span>
                        <span className="syn-pair-item__desc">{pair.description}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="syn-empty">
                  {resolved.allDomains.length < 2
                    ? 'Learn a second domain to build toward pair synergies.'
                    : 'Finish Tier 3 research in eligible domains to activate their pair synergies.'}
                </p>
              )}
            </section>

            {/* Emergent Rules Progress */}
            <section className="syn-section">
              <h4 className="syn-section__label">Emergent Rules</h4>
              {resolved.activeTriple ? (
                <div className="syn-triple-active">
                  <div className="syn-triple-active__icon">&#9733;</div>
                  <div className="syn-triple-active__info">
                    <span className="syn-triple-active__name" style={{ color: factionColor }}>
                      {resolved.activeTriple.name}
                    </span>
                    <span className="syn-triple-active__effect">
                      {resolved.activeTriple.effect.description}
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="syn-rule-list">
                {resolved.emergentProgress
                  .filter((ep) => ep.rule.condition !== 'default')
                  .map((ep) => (
                    <div key={ep.rule.id} className={`syn-rule-item ${ep.isComplete ? 'syn-rule-item--done' : ''}`}>
                      <div className="syn-rule-item__header">
                        <span className="syn-rule-item__name">{ep.rule.name}</span>
                        <span className="syn-rule-item__progress-text">
                          {ep.satisfiedCategories.length}/{ep.totalCategories}
                        </span>
                      </div>
                      <div className="syn-rule-item__bar">
                        <span
                          className="syn-rule-item__fill"
                          style={{
                            width: `${ep.progress * 100}%`,
                            '--syn-rule-color': ep.isComplete ? factionColor : domainColor(ep.satisfiedDomains[0] ?? ''),
                          } as React.CSSProperties}
                        />
                      </div>
                      <div className="syn-rule-item__detail">
                        {ep.isComplete ? (
                          <span className="syn-rule-item__effect">{ep.rule.effect.description}</span>
                        ) : (
                          <>
                            <span>Have: </span>
                            {ep.satisfiedDomains.map((d) => (
                              <span key={d} className="syn-rule-item__domain" style={{ color: domainColor(d) }}>
                                {domainGlyph(d)} {domainDisplayName(d)}
                              </span>
                            ))}
                            {ep.missingDomains.length > 0 && (
                              <>
                                <span> &middot; Need: </span>
                                {ep.missingDomains.slice(0, 2).map((d) => (
                                  <span key={d} className="syn-rule-item__domain syn-rule-item__domain--missing">
                                    {domainGlyph(d)} {domainDisplayName(d)}
                                  </span>
                                ))}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            {/* Footer hint */}
            <div className="syn-panel__footer">
              <span>Domains are learned through sacrifice, then upgraded through research: T2 feeds emergent rules and T3 activates pair synergies.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
