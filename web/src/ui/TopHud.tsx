import type { CSSProperties } from 'react';
import type { ClientState } from '../game/types/clientState';
import { useState, useMemo } from 'react';

type TopHudProps = {
  state: ClientState;
  turnBanner?: string | null;
  onOpenResearch?: () => void;
};

interface FactionInfo {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  homeBiome: string;
  intro: string;
  strengths: string[];
  weaknesses: string[];
  tip: string;
  uniqueMechanic: string;
  passiveTrait: string;
  signatureUnit: string;
}

const FACTION_INFO_MAP: Record<string, Omit<FactionInfo, 'id'>> = {
  jungle_clan: {
    name: 'Jungle Clans',
    color: '#2f7d4a',
    nativeDomain: 'Venomcraft',
    homeBiome: 'Jungle',
    intro: 'The Jungle Clans thrive where others fear to tread — deep in the canopy, where poison drips from every leaf and visibility ends at arm\'s reach.',
    strengths: ['Jungle interiors are your kingdom', 'Poison warfare means attrition advantage', 'Enemies fight blind while you strike from concealment'],
    weaknesses: ['Long-range armies outside the jungle are your nightmare', 'Struggle badly on open ground'],
    tip: 'Lure enemies into the jungle by retreating, then spring your real force on them.',
    uniqueMechanic: 'jungle_poison',
    passiveTrait: 'jungle_stalkers',
    signatureUnit: 'Serpent God',
  },
  druid_circle: {
    name: 'Druid Circle',
    color: '#5d8f57',
    nativeDomain: 'Nature Healing',
    homeBiome: 'Forest',
    intro: 'The Druid Circle believes the forest itself fights on their side — and honestly, it kind of does.',
    strengths: ['Healing Druids passive means faster recovery', 'Forest terrain amplifies everything good', 'Patient defensive play is incredibly strong'],
    weaknesses: ['Fast shock cavalry can run circles around you', 'Offensive punch is modest'],
    tip: 'Plant your forces just inside a forest edge and let enemies commit.',
    uniqueMechanic: 'healing_druids',
    passiveTrait: 'forest_regeneration',
    signatureUnit: 'Druid Wizard',
  },
  hill_clan: {
    name: 'Hill Engineers',
    color: '#8b7355',
    nativeDomain: 'Fortress Discipline',
    homeBiome: 'Hill',
    intro: 'The Hill Engineers are the masters of high ground. They turn elevated terrain into impregnable positions.',
    strengths: ['Hill terrain gives massive defense bonus', 'Fortress structures are incredibly strong', 'Shock resistance is innate'],
    weaknesses: ['Need hills to be effective', 'Slow movement on flat ground'],
    tip: 'Secure high ground early and fortify. Let enemies come to you.',
    uniqueMechanic: 'fortressDefense',
    passiveTrait: 'hill_defenders',
    signatureUnit: 'War Tower',
  },
  savannah_lions: {
    name: 'Savannah Lions',
    color: '#c9a227',
    nativeDomain: 'Charge',
    homeBiome: 'Savannah',
    intro: 'The Savannah Lions are all about momentum. Their Charge Momentum passive means their units hit harder after moving.',
    strengths: ['First-contact power is unmatched', 'War Elephants are devastating', 'Charge bonuses are massive'],
    weaknesses: ['Terrain that slows approach nullifies charge', 'Light infantry gets crushed'],
    tip: 'Angle your approach so War Elephants hit the flank — the bonus is just as devastating.',
    uniqueMechanic: 'charge_momentum',
    passiveTrait: 'elephant_charge',
    signatureUnit: 'War Elephant',
  },
  steppe_clan: {
    name: 'Steppe Riders',
    color: '#b98a2f',
    nativeDomain: 'Skirmish Pursuit',
    homeBiome: 'Plains',
    intro: 'Speed is life for the Steppe Riders. These horse lords race across open plains, striking and vanishing.',
    strengths: ['You dictate when and where fights happen', 'Supply isn\'t your problem with Foraging', 'Slow armies are free food'],
    weaknesses: ['Camel riders hard-counter horses', 'Fortified spear walls on hills stop you'],
    tip: 'Use a fast unit as bait, then hit their exposed flank.',
    uniqueMechanic: 'foraging_riders',
    passiveTrait: 'skirmish_pursuit',
    signatureUnit: 'Warlord',
  },
  desert_nomads: {
    name: 'Desert Nomads',
    color: '#d4a574',
    nativeDomain: 'Camel Adaptation',
    homeBiome: 'Desert',
    intro: 'The Desert Nomads are forged in the harshest terrain. They turn desert disadvantages into advantages.',
    strengths: ['Ignore desert terrain penalties', 'Camel cavalry is unmatched', 'Desert survival is innate'],
    weaknesses: ['Need desert to be effective', 'Water maps are challenging'],
    tip: 'Use the desert as your highway. Enemies struggle where you thrive.',
    uniqueMechanic: 'desert_adaptation',
    passiveTrait: 'camel_mobility',
    signatureUnit: 'Camel Rider',
  },
  coral_people: {
    name: 'Pirate Lords',
    color: '#2a9d8f',
    nativeDomain: 'Slaving',
    homeBiome: 'Coast',
    intro: 'The Pirate Lords are the masters of coastal raiding. They capture enemy units and turn them into assets.',
    strengths: ['Can capture enemy units', 'Coastal mobility is unmatched', 'Naval superiority'],
    weaknesses: ['Weak deep inland', 'Need coastal access'],
    tip: 'Raid coastal settlements and capture valuable units.',
    uniqueMechanic: 'greedy',
    passiveTrait: 'capturer',
    signatureUnit: 'Galley',
  },
  river_people: {
    name: 'River People',
    color: '#4f86c6',
    nativeDomain: 'River Stealth',
    homeBiome: 'River',
    intro: 'The River People treat waterways like roads. They appear anywhere along the bank without warning.',
    strengths: ['River corridors give unmatched mobility', 'River Stealth is powerful', 'Amphibious assault is devastating'],
    weaknesses: ['Getting dragged into dry fights strips advantages', 'Opponents can bait you'],
    tip: 'Map out river networks early — they\'re your highway system.',
    uniqueMechanic: 'amphibious_assault',
    passiveTrait: 'river_assault',
    signatureUnit: 'Ancient Alligator',
  },
  frost_wardens: {
    name: 'Arctic Wardens',
    color: '#a8dadc',
    nativeDomain: 'Heavy Hitter',
    homeBiome: 'Tundra',
    intro: 'The Arctic Wardens turn the game\'s worst terrain into the best neighborhood. They thrive in cold.',
    strengths: ['Poor terrain is your advantage', 'Cold-Hardened Growth means better economics', 'Polar Bear is devastating'],
    weaknesses: ['Need cold terrain to be effective', 'Warm terrain penalties'],
    tip: 'Own the frozen positions. Let opponents fight over "good" land.',
    uniqueMechanic: 'cold_hardened',
    passiveTrait: 'heavy_defense',
    signatureUnit: 'Polar Bear',
  },
};

export function TopHud({ state, turnBanner, onOpenResearch }: TopHudProps) {
  const [factionPopup, setFactionPopup] = useState<boolean>(false);
  const [supplyPopup, setSupplyPopup] = useState<boolean>(false);
  const activeFactionColor = state.world.factions.find((faction) => faction.id === state.activeFactionId)?.color ?? '#d6a34b';
  const recoveringCityCount = state.world.cities.filter(
    (city) => city.factionId === state.activeFactionId && city.turnsSinceCapture !== undefined,
  ).length;

  const factionInfo = useMemo(() => {
    const id = state.activeFactionId;
    if (!id) return null;
    return FACTION_INFO_MAP[id] ?? null;
  }, [state.activeFactionId]);

  return (
    <header className="top-hud">
      {factionPopup && factionInfo && (
        <div className="faction-popup-overlay" onClick={() => setFactionPopup(false)}>
          <div className="faction-popup" onClick={(e) => e.stopPropagation()}>
            <button className="faction-popup__close" onClick={() => setFactionPopup(false)}>×</button>
            <h3 className="faction-popup__name" style={{ color: factionInfo.color }}>{factionInfo.name}</h3>
            <div className="faction-popup__section">
              <span className="faction-popup__label">Native Domain</span>
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
              <span>{factionInfo.signatureUnit}</span>
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
        </div>
      )}
      {supplyPopup && state.hud.supply && (
        <div className="supply-popup-overlay" onClick={() => setSupplyPopup(false)}>
          <div className="supply-popup" onClick={(e) => e.stopPropagation()}>
            <button className="supply-popup__close" onClick={() => setSupplyPopup(false)}>×</button>
            <h3 className="supply-popup__title">Supply Breakdown</h3>
            <div className="supply-popup__stat">
              <span>Income</span>
              <strong>{Math.floor(state.hud.supply.income)}</strong>
            </div>
            <div className="supply-popup__stat">
              <span>Used</span>
              <strong>{state.hud.supply.used}</strong>
            </div>
            <div className="supply-popup__stat">
              <span>Balance</span>
              <strong className={state.hud.supply.deficit > 0 ? 'supply-popup--deficit' : 'supply-popup--surplus'}>
                {state.hud.supply.deficit > 0 ? `-${state.hud.supply.deficit.toFixed(1)}` : `+${(state.hud.supply.income - state.hud.supply.used).toFixed(1)}`} per turn
              </strong>
            </div>
            {state.hud.exhaustion && state.hud.exhaustion.points > 0 && (
              <>
                <div className="supply-popup__divider">Penalties</div>
                <div className="supply-popup__stat supply-popup__stat--penalty">
                  <span>Exhaustion</span>
                  <span>{state.hud.exhaustion.points.toFixed(1)} pts</span>
                </div>
                <div className="supply-popup__stat supply-popup__stat--penalty">
                  <span>Production</span>
                  <span>-{Math.round(state.hud.exhaustion.productionPenalty * 100)}%</span>
                </div>
                <div className="supply-popup__stat supply-popup__stat--penalty">
                  <span>Morale</span>
                  <span>-{state.hud.exhaustion.moralePenalty} per unit</span>
                </div>
              </>
            )}
            {recoveringCityCount > 0 && (
              <div className="supply-popup__note">
                ⚠ {recoveringCityCount} city{recoveringCityCount !== 1 ? 'ies' : 'y'} recovering from capture
              </div>
            )}
          </div>
        </div>
      )}
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
        <div
          className="status-chip status-chip--active-faction"
          style={{ '--chip-color': activeFactionColor } as CSSProperties}
          role="button"
          tabIndex={0}
          onClick={() => { setFactionPopup(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') factionInfo && setFactionPopup(true); }}
        >
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
            className={`status-chip${state.hud.supply.deficit > 0 ? ' status-chip--deficit status-chip--over-capacity' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => { setSupplyPopup(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSupplyPopup(true); }}
          >
            <span className="chip-label">Supply</span>
            <strong>{state.hud.supply.used}/{Math.floor(state.hud.supply.income)}</strong>
          </div>
        ) : null}
      </div>
    </header>
  );
}
