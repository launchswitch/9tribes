export interface FactionInfo {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  homeBiome: string;
  intro: string;
  strengths: string[];
  weaknesses: string[];
  tip: string;
  signatureUnit: string;
  specialTrait: string;
  specialAbility: string;
  uniqueMechanic: string;
  passiveTrait: string;
}

const FACTION_INFO_MAP: Record<string, FactionInfo> = {
  jungle_clan: {
    id: 'jungle_clan', name: 'Jungle Clans', color: '#2f7d4a', nativeDomain: 'Venomcraft', homeBiome: 'Jungle',
    intro: 'The Jungle Clans thrive where others fear to tread — deep in the canopy, where poison drips from every leaf and visibility ends at arm\'s reach.',
    strengths: ['Jungle interiors are your kingdom', 'Poison warfare means attrition advantage', 'Enemies fight blind while you strike from concealment'],
    weaknesses: ['Long-range armies outside the jungle are your nightmare', 'Struggle badly on open ground'],
    tip: 'Lure enemies into the jungle by retreating, then spring your real force on them.',
    signatureUnit: 'Serpent God', specialTrait: 'Jungle Stalkers', specialAbility: 'Poison on attacks + stealth in jungle',
    uniqueMechanic: 'jungle_poison', passiveTrait: 'jungle_stalkers',
  },
  druid_circle: {
    id: 'druid_circle', name: 'Druid Circle', color: '#5d8f57', nativeDomain: 'Nature Healing', homeBiome: 'Forest',
    intro: 'The Druid Circle believes the forest itself fights on their side — and honestly, it kind of does.',
    strengths: ['Healing Druids passive means faster recovery', 'Forest terrain amplifies everything good', 'Patient defensive play is incredibly strong'],
    weaknesses: ['Fast shock cavalry can run circles around you', 'Offensive punch is modest'],
    tip: 'Plant your forces just inside a forest edge and let enemies commit.',
    signatureUnit: 'Druid Wizard', specialTrait: 'Healing Aura', specialAbility: 'Aura boosts nearby units defense',
    uniqueMechanic: 'healing_druids', passiveTrait: 'forest_regeneration',
  },
  hill_clan: {
    id: 'hill_clan', name: 'Hill Engineers', color: '#8b7355', nativeDomain: 'Fortress Discipline', homeBiome: 'Hill',
    intro: 'The Hill Engineers are the masters of high ground. They turn elevated terrain into impregnable positions.',
    strengths: ['Hill terrain gives massive defense bonus', 'Fortress structures are incredibly strong', 'Shock resistance is innate'],
    weaknesses: ['Need hills to be effective', 'Slow movement on flat ground'],
    tip: 'Secure high ground early and fortify. Let enemies come to you.',
    signatureUnit: 'War Tower', specialTrait: 'Hill Defenders', specialAbility: 'City garrison morale boost',
    uniqueMechanic: 'fortressDefense', passiveTrait: 'hill_defenders',
  },
  savannah_lions: {
    id: 'savannah_lions', name: 'Savannah Lions', color: '#c9a227', nativeDomain: 'Charge', homeBiome: 'Savannah',
    intro: 'The Savannah Lions are all about momentum. Their Charge Momentum passive means their units hit harder after moving.',
    strengths: ['First-contact power is unmatched', 'War Elephants are devastating', 'Charge bonuses are massive'],
    weaknesses: ['Terrain that slows approach nullifies charge', 'Light infantry gets crushed'],
    tip: 'Angle your approach so War Elephants hit the flank — the bonus is just as devastating.',
    signatureUnit: 'War Elephant', specialTrait: 'Charge Momentum', specialAbility: 'Elephant tramples enemies',
    uniqueMechanic: 'charge_momentum', passiveTrait: 'elephant_charge',
  },
  steppe_clan: {
    id: 'steppe_clan', name: 'Steppe Riders', color: '#b98a2f', nativeDomain: 'Skirmish Pursuit', homeBiome: 'Plains',
    intro: 'Speed is life for the Steppe Riders - strike fast and vanish before response.',
    strengths: ['Dictate when/where fights happen', 'Foraging Riders = +15% atk, +20% def on plains', 'Slow armies are free food'],
    weaknesses: ['Camel riders counter horses', 'Fortified spear walls stop you'],
    tip: 'Use fast unit as bait, hit exposed flank with cavalry.',
    signatureUnit: 'Warlord', specialTrait: 'Foraging Riders', specialAbility: 'Aura boosts nearby cavalry attack/defense',
    uniqueMechanic: 'foraging_riders', passiveTrait: 'foraging_riders',
  },
  desert_nomads: {
    id: 'desert_nomads', name: 'Desert Nomads', color: '#d4a574', nativeDomain: 'Camel Adaptation', homeBiome: 'Desert',
    intro: 'The Desert Nomads are forged in the harshest terrain. They turn desert disadvantages into advantages.',
    strengths: ['Ignore desert terrain penalties', 'Camel cavalry is unmatched', 'Desert survival is innate'],
    weaknesses: ['Need desert to be effective', 'Water maps are challenging'],
    tip: 'Use the desert as your highway. Enemies struggle where you thrive.',
    signatureUnit: 'Camel Rider', specialTrait: 'Desert Adaptation', specialAbility: 'Camel tramples, immune to heat',
    uniqueMechanic: 'desert_adaptation', passiveTrait: 'camel_mobility',
  },
  coral_people: {
    id: 'coral_people', name: 'Pirate Lords', color: '#2a9d8f', nativeDomain: 'Slaving', homeBiome: 'Coast',
    intro: 'The Pirate Lords are the masters of coastal raiding. They capture enemy units and turn them into assets.',
    strengths: ['Can capture enemy units', 'Coastal mobility is unmatched', 'Naval superiority'],
    weaknesses: ['Weak deep inland', 'Need coastal access'],
    tip: 'Raid coastal settlements and capture valuable units.',
    signatureUnit: 'Galley', specialTrait: 'Capturer', specialAbility: 'Loot increases faction income',
    uniqueMechanic: 'greedy', passiveTrait: 'capturer',
  },
  river_people: {
    id: 'river_people', name: 'River People', color: '#4f86c6', nativeDomain: 'River Stealth', homeBiome: 'River',
    intro: 'The River People treat waterways like roads. They appear anywhere along the bank without warning.',
    strengths: ['River corridors give unmatched mobility', 'River Stealth is powerful', 'Amphibious assault is devastating'],
    weaknesses: ['Getting dragged into dry fights strips advantages', 'Opponents can bait you'],
    tip: 'Map out river networks early — they\'re your highway system.',
    signatureUnit: 'Ancient Alligator', specialTrait: 'River Assault', specialAbility: 'Amphibious units deal bonus damage',
    uniqueMechanic: 'amphibious_assault', passiveTrait: 'river_assault',
  },
  frost_wardens: {
    id: 'frost_wardens', name: 'Arctic Wardens', color: '#a8dadc', nativeDomain: 'Heavy Hitter', homeBiome: 'Tundra',
    intro: 'The Arctic Wardens turn the game\'s worst terrain into the best neighborhood. They thrive in cold.',
    strengths: ['Poor terrain is your advantage', 'Cold-Hardened Growth means better economics', 'Polar Bear is devastating'],
    weaknesses: ['Need cold terrain to be effective', 'Warm terrain penalties'],
    tip: 'Own the frozen positions. Let opponents fight over "good" land.',
    signatureUnit: 'Polar Bear', specialTrait: 'Cold-Hardened', specialAbility: 'Attacks chill nearby enemies',
    uniqueMechanic: 'cold_hardened', passiveTrait: 'heavy_defense',
  },
};

export function getFactionInfo(factionId: string): FactionInfo | undefined {
  return FACTION_INFO_MAP[factionId];
}
