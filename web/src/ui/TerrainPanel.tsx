import type { TerrainInspectorViewModel } from '../game/types/clientState';
import { useState } from 'react';

type TerrainPanelProps = {
  terrain: TerrainInspectorViewModel | null;
  onClose: () => void;
};

const CAPABILITY_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
  formation_warfare: {
    name: 'Formation Warfare',
    description: 'Units fighting in formation get bonuses. Works best in open terrain with adjacent allies.',
  },
  horsemanship: {
    name: 'Horsemanship',
    description: 'Proficiency with mounted units. Better for cavalry and horse-based tactics.',
  },
  charge: {
    name: 'Charge',
    description: 'Units deal extra damage when charging. The longer the approach, the harder the hit.',
  },
  shock_resistance: {
    name: 'Shock Resistance',
    description: 'Defensive bonus against charge attacks. Reduces damage from high-momentum impacts.',
  },
  hill_fighting: {
    name: 'Hill Fighting',
    description: 'Combat advantage on elevated terrain. Grants bonus when defending from hills.',
  },
  fortification: {
    name: 'Fortification',
    description: 'Ability to build and benefit from defensive structures. Works with forts and walls.',
  },
  stealth: {
    name: 'Stealth',
    description: 'Hidden from enemy view when not moving. Better in dense terrain with cover.',
  },
  woodcraft: {
    name: 'Woodcraft',
    description: 'Forest and jungle proficiency. Bonus movement and combat in wooded hexes.',
  },
  endurance: {
    name: 'Endurance',
    description: 'Resist attrition and terrain penalties. Sustains units over long campaigns.',
  },
  mobility: {
    name: 'Mobility',
    description: 'Faster movement across all terrain. Reduces movement point costs.',
  },
  desert_survival: {
    name: 'Desert Survival',
    description: 'Operate effectively in desert conditions. Reduces desert movement penalties.',
  },
  seafaring: {
    name: 'Seafaring',
    description: 'Naval unit proficiency. Required for water-based operations.',
  },
  navigation: {
    name: 'Navigation',
    description: 'Sea travel and coastal operations. Better movement on water hexes.',
  },
  poisoncraft: {
    name: 'Poisoncraft',
    description: 'Apply poison effects on attacks. Works best in jungle and swamp terrain.',
  },
};

const ECOLOGY_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
  steppe: { name: 'Steppe', description: 'Open grasslands. Good for cavalry movement and charge approaches.' },
  open_ground: { name: 'Open Ground', description: 'No obstacles. Best for formation warfare and cavalry charges.' },
  horse_range: { name: 'Horse Range', description: 'Excellent terrain for mounted units. Reduces mounted movement costs.' },
  forest: { name: 'Forest', description: 'Wooded terrain with trees. Provides cover and defense bonus.' },
  jungle: { name: 'Jungle', description: 'Dense vegetation. Provides stealth and poisoncraft opportunities.' },
  canopy: { name: 'Canopy', description: 'Overhead cover. Provides additional defense and stealth.' },
  poison: { name: 'Poison', description: 'Toxic environment. Boosts poison effects and poisoncraft domain.' },
  underbrush: { name: 'Underbrush', description: 'Dense ground cover. Slows movement but provides defense.' },
  hill: { name: 'Hill', description: 'Elevated terrain. Provides defense bonus and hill fighting opportunity.' },
  ridge: { name: 'Ridge', description: 'High ground. Excellent defensive position with wide sight lines.' },
  stone: { name: 'Stone', description: 'Rocky terrain. Good for fortifications and defensive structures.' },
  desert: { name: 'Desert', description: 'Arid terrain. Requires desert survival. Fast for adapted units.' },
  dunes: { name: 'Dunes', description: 'Sandy hills. Slows movement but provides defensive cover.' },
  oasis: { name: 'Oasis', description: 'Water source in desert. Provides supply bonus for nearby cities.' },
  tundra: { name: 'Tundra', description: 'Frozen ground. Slows most units but provides cold resistance.' },
  savannah: { name: 'Savannah', description: 'Grassy plains with trees. Good for light infantry and cavalry.' },
  coast: { name: 'Coast', description: 'Land-water boundary. Enables naval units to attack land.' },
  river: { name: 'River', description: 'Fresh water. Provides movement barriers and defensive chokepoints.' },
  swamp: { name: 'Swamp', description: 'Marshy ground. Slows movement but provides stealth to adapted units.' },
  mountain: { name: 'Mountain', description: 'High peaks. Impassable to most, excellent for fortifications.' },
  ocean: { name: 'Ocean', description: 'Deep water. Requires seafaring. Naval unit territory.' },
  shallow: { name: 'Shallow Water', description: 'Nearshore water. Accessible to both naval and land units.' },
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
  const [selectedInfo, setSelectedInfo] = useState<{ title: string; description: string } | null>(null);

  return (
    <aside className={`ti-root${isOpen ? ' ti-root--open' : ''}`}>
      {selectedInfo && (
        <div className="ti-info-popup-overlay" onClick={() => setSelectedInfo(null)}>
          <div className="ti-info-popup" onClick={(e) => e.stopPropagation()}>
            <button className="ti-info-popup__close" onClick={() => setSelectedInfo(null)}>×</button>
            <h3 className="ti-info-popup__title">{selectedInfo.title}</h3>
            <p className="ti-info-popup__desc">{selectedInfo.description}</p>
          </div>
        </div>
      )}
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
            <p className="panel-kicker">Movement/Combat Modifiers</p>
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
              <p className="panel-kicker">Terrain XP</p>
              <p className="ti-sub">Units operating here gain these domains over time.</p>
              <ul className="ti-domain-list">
                {terrain.domainPressure.map((entry) => {
                  const maxPressure = Math.max(...terrain.domainPressure.map((d) => d.pressure));
                  const info = CAPABILITY_DESCRIPTIONS[entry.domainId];
                  return (
                    <li
                      key={entry.domainId}
                      className={`ti-domain-row${entry.isSynergy ? ' ti-domain-row--synergy' : ''}${info ? ' ti-domain-row--clickable' : ''}`}
                      onClick={() => info && setSelectedInfo({ title: info.name, description: info.description })}
                    >
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

          {terrain.ecologyTags.length > 0 && (
            <div className="ti-section">
              <p className="panel-kicker">Ecology</p>
              <div className="ti-tag-row">
                {terrain.ecologyTags.map((tag) => {
                  const info = ECOLOGY_DESCRIPTIONS[tag];
                  return (
                    <span
                      key={tag}
                      className={`ti-tag${info ? ' ti-tag--clickable' : ''}`}
                      onClick={() => info && setSelectedInfo({ title: info.name, description: info.description })}
                    >
                      {tag.replace(/_/g, ' ')}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
