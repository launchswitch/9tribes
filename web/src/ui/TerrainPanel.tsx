import type { TerrainInspectorViewModel } from '../game/types/clientState';

type TerrainPanelProps = {
  terrain: TerrainInspectorViewModel | null;
  onClose: () => void;
};

const TERRAIN_ICONS: Record<string, string> = {
  plains: '🌾',
  forest: '🌲',
  jungle: '🌿',
  hill: '⛰',
  desert: '🏜',
  tundra: '❄',
  savannah: '🦁',
  coast: '🌊',
  river: '🏞',
  swamp: '🌫',
  mountain: '🗻',
  ocean: '🌊',
};

const IMPROVEMENT_LABELS: Record<string, string> = {
  fort: 'Fort',
  city: 'City',
};

function formatDefense(modifier: number): string {
  if (modifier === 0) return 'None';
  const pct = Math.round(modifier * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function formatMoveCost(cost: number, passable: boolean, navalOnly: boolean): string {
  if (!passable) return 'Impassable';
  if (navalOnly) return 'Naval only';
  if (cost === 1) return '1 AP (fast)';
  return `${cost} AP`;
}

function PressureBar({ pressure, maxPressure }: { pressure: number; maxPressure: number }) {
  const pct = Math.min(100, (pressure / maxPressure) * 100);
  return (
    <div className="ti-pressure-bar">
      <div className="ti-pressure-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SynergyBadge({ score, isHome }: { score: number; isHome: boolean }) {
  if (isHome) {
    return <span className="ti-badge ti-badge--home">Home Terrain</span>;
  }
  if (score >= 2) {
    return <span className="ti-badge ti-badge--aligned">Aligned</span>;
  }
  if (score === 1) {
    return <span className="ti-badge ti-badge--partial">Partial Fit</span>;
  }
  return <span className="ti-badge ti-badge--none">Foreign Ground</span>;
}

export function TerrainPanel({ terrain, onClose }: TerrainPanelProps) {
  const isOpen = terrain !== null;

  return (
    <aside className={`ti-root${isOpen ? ' ti-root--open' : ''}`}>
      {isOpen && terrain && (
        <div className="ti-scroll">
          <div className="ti-header">
            <span className="ti-icon">{TERRAIN_ICONS[terrain.terrainId] ?? '◆'}</span>
            <div className="ti-header-text">
              <p className="panel-kicker">Terrain</p>
              <h2>{terrain.terrainName}</h2>
              {terrain.ownerFactionName && (
                <p className="ti-owner">Controlled by {terrain.ownerFactionName}</p>
              )}
              {terrain.improvement && (
                <p className="ti-improvement">{IMPROVEMENT_LABELS[terrain.improvement] ?? terrain.improvement}</p>
              )}
            </div>
            <button className="ti-close" onClick={onClose} title="Close (Esc)">×</button>
          </div>

          {terrain.playerFactionName && (
            <div className="ti-synergy-row">
              <SynergyBadge score={terrain.synergyScore} isHome={terrain.isHomeTerrain} />
              <span className="ti-synergy-label">for {terrain.playerFactionName}</span>
            </div>
          )}

          {terrain.flavor && (
            <div className="ti-section ti-section--flavor">
              <p className="ti-flavor">{terrain.flavor}</p>
            </div>
          )}

          <div className="ti-section">
            <p className="panel-kicker">Combat Stats</p>
            <div className="ti-stat-grid">
              <div className="ti-stat-cell">
                <span className={`ti-stat-value${!terrain.passable ? ' ti-stat-value--bad' : ''}`}>
                  {formatMoveCost(terrain.movementCost, terrain.passable, terrain.navalOnly)}
                </span>
                <span className="ti-stat-label">Movement</span>
              </div>
              <div className="ti-stat-cell">
                <span className={`ti-stat-value${terrain.defenseModifier < 0 ? ' ti-stat-value--bad' : terrain.defenseModifier > 0 ? ' ti-stat-value--good' : ''}`}>
                  {formatDefense(terrain.defenseModifier)}
                </span>
                <span className="ti-stat-label">Defense</span>
              </div>
            </div>
          </div>

          {terrain.domainPressure.length > 0 && (
            <div className="ti-section">
              <p className="panel-kicker">Domain Pressure</p>
              <p className="ti-sub">Units operating here gain these domains over time.</p>
              <ul className="ti-domain-list">
                {terrain.domainPressure.map((entry) => {
                  const maxPressure = Math.max(...terrain.domainPressure.map((d) => d.pressure));
                  return (
                    <li key={entry.domainId} className={`ti-domain-row${entry.isSynergy ? ' ti-domain-row--synergy' : ''}`}>
                      <div className="ti-domain-info">
                        <span className="ti-domain-label">{entry.label}</span>
                        {entry.isSynergy && (
                          <span className="ti-synergy-star" title={`Your faction has ${entry.playerSeed} seeds here`}>★</span>
                        )}
                      </div>
                      <div className="ti-domain-bar-row">
                        <PressureBar pressure={entry.pressure} maxPressure={maxPressure} />
                        <span className="ti-domain-rate">×{entry.pressure.toFixed(2).replace(/\.?0+$/, '')}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {terrain.cityBonus && (
            <div className="ti-section">
              <p className="panel-kicker">Settlement Bonus</p>
              <div className="ti-city-stats">
                {terrain.cityBonus.productionBonus > 0 && (
                  <div className="ti-city-stat">
                    <span className="ti-city-value ti-stat-value--good">+{Math.round(terrain.cityBonus.productionBonus * 100)}%</span>
                    <span className="ti-stat-label">Production</span>
                  </div>
                )}
                {terrain.cityBonus.supplyBonus > 0 && (
                  <div className="ti-city-stat">
                    <span className="ti-city-value ti-stat-value--good">+{terrain.cityBonus.supplyBonus}</span>
                    <span className="ti-stat-label">Supply</span>
                  </div>
                )}
              </div>
              {terrain.cityBonus.traits.filter((t) => t.active).length > 0 && (
                <ul className="ti-trait-list">
                  {terrain.cityBonus.traits
                    .filter((t) => t.active)
                    .map((t) => (
                      <li key={t.key} className="ti-trait-row">
                        <span className="ti-trait-label">{t.label}</span>
                        <span className="ti-trait-effect">{t.effect}</span>
                      </li>
                    ))}
                </ul>
              )}
              {terrain.cityBonus.productionBonus === 0 && terrain.cityBonus.supplyBonus === 0 && terrain.cityBonus.traits.filter((t) => t.active).length === 0 && (
                <p className="ti-sub ti-sub--muted">No site bonuses at this location.</p>
              )}
            </div>
          )}

        </div>
      )}
    </aside>
  );
}
