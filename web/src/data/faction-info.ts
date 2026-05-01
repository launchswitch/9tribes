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
  unitStats?: {
    attack: number;
    defense: number;
    health: number;
    moves: number;
    range: number;
    tags: string[];
    ability: string;
    description: string;
  };
  summonCondition?: string;
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
    summonCondition: 'Your unit must be standing in Jungle terrain.',
    unitStats: {
      attack: 16, defense: 8, health: 90, moves: 4, range: 1,
      tags: ['beast', 'jungle', 'poison', 'melee'],
      ability: 'Poison Venom: Attacks apply poison dealing 5 damage/turn for 3 turns. Immune to jungle attrition.',
      description: 'The colossal Serpent God coils through the jungle, its venomous bite capable of felling the toughest warriors.',
    },
  },
  druid_circle: {
    id: 'druid_circle', name: 'Druid Circle', color: '#5d8f57', nativeDomain: 'Nature Healing', homeBiome: 'Forest',
    intro: 'The Druid Circle believes the forest itself fights on their side — and honestly, it kind of does.',
    strengths: ['Healing Druids passive means faster recovery', 'Forest terrain amplifies everything good', 'Patient defensive play is incredibly strong'],
    weaknesses: ['Fast shock cavalry can run circles around you', 'Offensive punch is modest'],
    tip: 'Plant your forces just inside a forest edge and let enemies commit.',
    signatureUnit: 'Druid Wizard', specialTrait: 'Healing Aura', specialAbility: 'Aura boosts nearby units defense',
    uniqueMechanic: 'healing_druids', passiveTrait: 'forest_regeneration',
    unitStats: {
      attack: 10, defense: 12, health: 60, moves: 4, range: 3,
      tags: ['magic', 'ranged', 'healing'],
      ability: 'Nature\'s Grace: Healing aura restores 10 health to all nearby friendly units each turn.',
      description: 'The Druid Wizard channels the forest\'s power, weaving spells that mend wounds and strengthen resolve.'
    },
  },
  hill_clan: {
    id: 'hill_clan', name: 'Hill Engineers', color: '#8b7355', nativeDomain: 'Fortress Discipline', homeBiome: 'Hill',
    intro: 'The Hill Engineers are the masters of high ground. They turn elevated terrain into impregnable positions.',
    strengths: ['Hill terrain gives massive defense bonus', 'Fortress structures are incredibly strong', 'Shock resistance is innate'],
    weaknesses: ['Need hills to be effective', 'Slow movement on flat ground'],
    tip: 'Secure high ground early and fortify. Let enemies come to you.',
    signatureUnit: 'War Tower', specialTrait: 'Hill Defenders', specialAbility: 'City garrison morale boost',
    uniqueMechanic: 'fortressDefense', passiveTrait: 'hill_defenders',
    summonCondition: 'Your unit must be standing in Hill or City terrain.',
    unitStats: {
      attack: 8, defense: 18, health: 120, moves: 2, range: 3,
      tags: ['defensive', 'siege', 'structure'],
      ability: 'Fortress Garrison: +30% defense when garrisoning a city. Cannot move voluntarily.',
      description: 'The imposing War Tower stands as a bastion of hill defense, its elevated position commanding the battlefield.',
    },
  },
  savannah_lions: {
    id: 'savannah_lions', name: 'Savannah Lions', color: '#c9a227', nativeDomain: 'Charge', homeBiome: 'Savannah',
    intro: 'The Savannah Lions are all about momentum. Their Charge Momentum passive means their units hit harder after moving.',
    strengths: ['First-contact power is unmatched', 'War Elephants are devastating', 'Charge bonuses are massive'],
    weaknesses: ['Terrain that slows approach nullifies charge', 'Light infantry gets crushed'],
    tip: 'Angle your approach so War Elephants hit the flank — the bonus is just as devastating.',
    signatureUnit: 'War Elephant', specialTrait: 'Charge Momentum', specialAbility: 'Elephant tramples enemies',
    uniqueMechanic: 'charge_momentum', passiveTrait: 'elephant_charge',
    unitStats: {
      attack: 18, defense: 12, health: 150, moves: 4, range: 1,
      tags: ['beast', 'charge', 'trample'],
      ability: 'Trample: Deal 10 damage to any unit in the target tile before combat. +50% attack when charging.',
      description: 'The massive War Elephant crashes into enemy lines with terrifying force, trampling all who stand in its path.'
    },
  },
  desert_nomads: {
    id: 'desert_nomads', name: 'Desert Nomads', color: '#d4a574', nativeDomain: 'Camel Adaptation', homeBiome: 'Desert',
    intro: 'The Desert Nomads are forged in the harshest terrain. They turn desert disadvantages into advantages.',
    strengths: ['Ignore desert terrain penalties', 'Camel cavalry is unmatched', 'Desert survival is innate'],
    weaknesses: ['Need desert to be effective', 'Water maps are challenging'],
    tip: 'Use the desert as your highway. Enemies struggle where you thrive.',
    signatureUnit: 'Desert Immortals', specialTrait: 'Desert Adaptation', specialAbility: 'Full HP regen each turn',
    uniqueMechanic: 'desert_adaptation', passiveTrait: 'camel_mobility',
    unitStats: {
      attack: 5, defense: 11, health: 18, moves: 2, range: 1,
      tags: ['camel', 'mounted', 'self_heal'],
      ability: 'Self-Heal: Fully regenerates HP at the end of each turn.',
      description: 'The legendary Desert Immortals are unstoppable — they heal from any wound and march forever. Limited to 1 on map.'
    },
  },
  steppe_clan: {
    id: 'steppe_clan', name: 'Steppe Riders', color: '#b98a2f', nativeDomain: 'Mobility', homeBiome: 'Plains',
    intro: 'The Steppe Riders are masters of mobility. Their Horse Archers can move and shoot without penalty.',
    strengths: ['Hit and run tactics', 'Open terrain advantage', 'Fast movement'],
    weaknesses: ['Forest disadvantage', 'Siege weakness'],
    tip: 'Use your speed to flank enemies and retreat before they can respond.',
    signatureUnit: 'Warlord', specialTrait: 'Foraging Riders', specialAbility: 'Forage from any terrain',
    uniqueMechanic: 'horse_archers', passiveTrait: 'foraging_riders',
    summonCondition: 'Your unit must be standing in Plains or Savannah terrain.',
    unitStats: {
      attack: 12, defense: 8, health: 80, moves: 5, range: 1,
      tags: ['cavalry', 'mounted', 'ranged'],
      ability: 'Hit & Run: Deal bonus damage when moving before attacking.',
      description: 'The mighty Warlord leads the Steppe Riders with unmatched mobility and tactical flexibility.',
    },
  },
  coral_people: {
    id: 'coral_people', name: 'Pirate Lords', color: '#2a9d8f', nativeDomain: 'Slaving', homeBiome: 'Coast',
    intro: 'The Pirate Lords are the masters of coastal raiding. They capture enemy units and turn them into assets.',
    strengths: ['Can capture enemy units', 'Coastal mobility is unmatched', 'Naval superiority'],
    weaknesses: ['Weak deep inland', 'Need coastal access'],
    tip: 'Raid coastal settlements and capture valuable units.',
    signatureUnit: 'Galley', specialTrait: 'Capturer', specialAbility: 'Loot increases faction income',
    uniqueMechanic: 'greedy', passiveTrait: 'capturer',
    unitStats: {
      attack: 10, defense: 10, health: 80, moves: 5, range: 1,
      tags: ['naval', 'transport', 'capture'],
      ability: 'Capture: Defeated enemy units have 50% chance to join your faction instead of being destroyed.',
      description: 'The versatile Galley carries raiders across shallow waters, perfect for coastal raids and capturing enemies.'
    },
  },
  river_people: {
    id: 'river_people', name: 'River People', color: '#4f86c6', nativeDomain: 'River Stealth', homeBiome: 'River',
    intro: 'The River People treat waterways like roads. They appear anywhere along the bank without warning.',
    strengths: ['River corridors give unmatched mobility', 'River Stealth is powerful', 'Amphibious assault is devastating'],
    weaknesses: ['Getting dragged into dry fights strips advantages', 'Opponents can bait you'],
    tip: 'Map out river networks early — they\'re your highway system.',
    signatureUnit: 'Ancient Alligator', specialTrait: 'River Assault', specialAbility: 'Ambushes from rivers',
    uniqueMechanic: 'amphibious_assault', passiveTrait: 'river_assault',
    summonCondition: 'Your unit must be standing in River, Jungle, or Swamp terrain.',
    unitStats: {
      attack: 16, defense: 8, health: 100, moves: 5, range: 1,
      tags: ['beast', 'river', 'ambush', 'amphibious'],
ability: 'River Ambush: +50% attack when attacking from river tiles. Can emerge from any river hex.',
      description: 'The Ancient Alligator lurks beneath river surfaces, emerging to drag unlucky foes into the depths.',
    },
  },
  frost_wardens: {
    id: 'frost_wardens', name: 'Arctic Wardens', color: '#a8dadc', nativeDomain: 'Heavy Hitter', homeBiome: 'Tundra',
    intro: 'The Arctic Wardens turn the game\'s worst terrain into the best neighborhood. They thrive in cold.',
    strengths: ['Poor terrain is your advantage', 'Cold-Hardened Growth means better economics', 'Polar Bear is devastating'],
    weaknesses: ['Need cold terrain to be effective', 'Warm terrain penalties'],
    tip: 'Own the frozen positions. Let opponents fight over "good" land.',
    signatureUnit: 'Polar Bear', specialTrait: 'Cold-Hardened', specialAbility: 'Attacks chill nearby enemies',
    uniqueMechanic: 'cold_hardened', passiveTrait: 'heavy_defense',
    summonCondition: 'Your unit must be standing in Tundra terrain.',
    unitStats: {
      attack: 18, defense: 14, health: 120, moves: 4, range: 1,
      tags: ['beast', 'frost', 'cold'],
ability: 'Chilling Presence: Attacks apply Cold (-5 defense) for 2 turns. +50% attack in cold terrain.',
      description: 'The mighty Polar Bear is the apex predator of the frozen north, its icy roar freezing all who oppose the Wardens.',
    },
  },
};

export function getFactionInfo(factionId: string): FactionInfo | undefined {
  return FACTION_INFO_MAP[factionId];
}
