import { useState, useMemo } from 'react';
import { helpContent } from '../data/help-content';
import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';

// ── Domain palette (duplicated from SynergyChip — not exported) ──

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
  charge: '\uD83D\uDC18',
  hitrun: '\u276F',
  tidal_warfare: '\uD83C\uDF0A',
  slaving: '\u2694',
  nature_healing: '\u273E',
  river_stealth: '\uD83C\uDF0F',
  camel_adaptation: '\uD83D\uDC2A',
  heavy_hitter: '\u2696',
};

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

function domainGlyph(domainId: string): string {
  return DOMAIN_ICONS[domainId] ?? domainId.slice(0, 2).toUpperCase();
}

function domainColor(domainId: string): string {
  return DOMAIN_COLORS[domainId] ?? '#888';
}

function domainDisplayName(domainId: string): string {
  return DOMAIN_NAMES[domainId] ?? domainId.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

type PairSynergy = (typeof pairSynergiesData.pairSynergies)[number];
type EmergentRule = (typeof emergentRulesData.rules)[number];

const ALL_DOMAIN_IDS = Object.keys(DOMAIN_COLORS);

// Map emergent condition strings to human-readable descriptions
function emergentConditionLabel(rule: EmergentRule): string {
  switch (rule.condition) {
    case 'contains_terrain AND contains_combat AND contains_mobility':
      return 'Requires: one terrain + one combat + one mobility domain';
    case 'contains_healing AND contains_defensive AND contains_offensive':
      return 'Requires: one healing + one defensive + one offensive domain';
    case 'contains_stealth AND contains_combat AND contains_terrain':
      return 'Requires: one stealth + one combat + one terrain domain';
    case 'contains_fortress AND contains_healing AND contains_defensive':
      return 'Requires: fortress + one healing + one defensive domain';
    case 'contains_3_mobility':
      return 'Requires: three mobility domains (charge, skirmish, camel, or stealth)';
    case 'contains_3_combat':
      return 'Requires: three combat domains (any combat-oriented)';
    case 'contains_slaving AND contains_heavy AND contains_fortress':
      return 'Requires: slaving + heavy_hitter + fortress domains';
    case 'contains_camels AND contains_slaving AND contains_mobility':
      return 'Requires: camel + slaving + one mobility domain';
    case 'contains_venom AND contains_stealth AND contains_combat':
      return 'Requires: venom + stealth + one combat domain';
    case 'contains_fortress AND contains_heavy AND contains_terrain':
      return 'Requires: fortress + heavy_hitter + one terrain domain';
    default:
      return rule.condition;
  }
}

export function SynergyEncyclopediaTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const toggleFilter = (domainId: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) {
        next.delete(domainId);
      } else {
        next.add(domainId);
      }
      return next;
    });
  };

  const clearFilters = () => setActiveFilters(new Set());

  const guideMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of helpContent.synergyGuide) {
      map.set(entry.pairId, entry.playerDescription);
    }
    return map;
  }, []);

  const filteredSynergies = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();
    return pairSynergiesData.pairSynergies.filter((pair: PairSynergy) => {
      // Domain filter
      if (activeFilters.size > 0) {
        const domains = pair.domains as string[];
        for (const f of activeFilters) {
          if (!domains.includes(f)) return false;
        }
      }
      // Search filter
      if (search) {
        const nameMatch = pair.name.toLowerCase().includes(search);
        const descMatch = (guideMap.get(pair.id) ?? pair.description ?? '').toLowerCase().includes(search);
        const tagMatch = (pair.requiredTags as string[]).some((t) => t.toLowerCase().includes(search));
        if (!nameMatch && !descMatch && !tagMatch) return false;
      }
      return true;
    });
  }, [searchTerm, activeFilters, guideMap]);

  const emergentRules = useMemo(
    () => emergentRulesData.rules.filter((r: EmergentRule) => r.condition !== 'default'),
    [],
  );

  return (
    <div className="syn-enc">
      {/* Search */}
      <input
        type="text"
        className="syn-enc__search"
        placeholder="Search synergies by name, tag, or description…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Domain filter row */}
      <div className="syn-enc__filters">
        {activeFilters.size > 0 && (
          <button
            type="button"
            className="syn-enc__filter-clear"
            onClick={clearFilters}
          >
            All
          </button>
        )}
        {ALL_DOMAIN_IDS.map((domainId) => {
          const isActive = activeFilters.has(domainId);
          return (
            <button
              key={domainId}
              type="button"
              className={`syn-enc__filter-dot${isActive ? ' syn-enc__filter-dot--active' : ''}`}
              style={{ '--dot-color': domainColor(domainId) } as React.CSSProperties}
              onClick={() => toggleFilter(domainId)}
              title={domainDisplayName(domainId)}
            >
              <span className="syn-enc__filter-dot__glyph">{domainGlyph(domainId)}</span>
            </button>
          );
        })}
      </div>

      {/* Count */}
      <div className="syn-enc__count">
        Showing {filteredSynergies.length} of {pairSynergiesData.pairSynergies.length} synergies
      </div>

      {/* Synergy list */}
      {filteredSynergies.length > 0 ? (
        <div className="syn-enc__list">
          {filteredSynergies.map((pair: PairSynergy) => {
            const domains = pair.domains as [string, string];
            const description = guideMap.get(pair.id) ?? pair.description;
            const tags = (pair.requiredTags as string[]).filter(
              (t, i, arr) => arr.indexOf(t) === i,
            );
            return (
              <div key={pair.id} className="syn-enc__item">
                <div className="syn-enc__item__domains">
                  <span
                    className="syn-enc__item__dot"
                    style={{ backgroundColor: domainColor(domains[0]) }}
                    title={domainDisplayName(domains[0])}
                  >
                    {domainGlyph(domains[0])}
                  </span>
                  <span className="syn-enc__item__plus">+</span>
                  <span
                    className="syn-enc__item__dot"
                    style={{ backgroundColor: domainColor(domains[1]) }}
                    title={domainDisplayName(domains[1])}
                  >
                    {domainGlyph(domains[1])}
                  </span>
                </div>
                <div className="syn-enc__item__name">{pair.name}</div>
                <div className="syn-enc__item__desc">{description}</div>
                {tags.length > 0 && (
                  <div className="syn-enc__item__tags">
                    {tags.map((tag) => (
                      <span key={tag} className="syn-enc__item__tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="syn-enc__empty">No synergies match your filters.</div>
      )}

      {/* Emergent Triple Stacks */}
      <div className="syn-enc__section">Emergent Triple Stacks</div>
      <div className="syn-enc__list">
        {emergentRules.map((rule: EmergentRule) => (
          <div key={rule.id} className="syn-enc__emergent">
            <div className="syn-enc__emergent__name">{rule.name}</div>
            <div className="syn-enc__emergent__condition">{emergentConditionLabel(rule)}</div>
            <div className="syn-enc__emergent__effect">{rule.effect.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
