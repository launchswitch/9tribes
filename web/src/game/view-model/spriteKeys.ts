/**
 * Sprite key resolution extracted from worldViewModel.
 */

const DEFAULT_IMPROVEMENT_SPRITE_KEYS: Record<string, string> = {
  fortification: 'hill_fortress',
};

const FACTION_IMPROVEMENT_SPRITE_KEYS: Record<string, Record<string, string>> = {
  hill_clan: {
    fortification: 'hill_fortress',
  },
};

export function getSpriteKeyForImprovement(ownerFactionId: string | null, type: string): string {
  return (ownerFactionId ? FACTION_IMPROVEMENT_SPRITE_KEYS[ownerFactionId]?.[type] : undefined)
    ?? DEFAULT_IMPROVEMENT_SPRITE_KEYS[type]
    ?? 'hill_fortress';
}

export function getSpriteKeyForUnit(factionId: string, prototypeName: string, chassisId: string, sourceRecipeId?: string): string {
  if (sourceRecipeId === 'settler' || prototypeName.toLowerCase() === 'settler') {
    return 'settler';
  }

  // Hybrid units (identified by sourceRecipeId from hybrid-recipes.json)
  if (sourceRecipeId) {
    const map: Record<string, string> = {
      // Jungle
      'blowgun_skirmishers': 'jungle_blowgun',
      'serpent_priest': 'jungle_priest',
      // Druid
      'healing_druids': 'druid_healer',
      'druid_wizard': 'druid_wizard',
      // Steppe
      'steppe_raiders': 'steppe_raiders',
      'steppe_priest': 'steppe_priestess',
      // Hill
      'fortress_archer': 'hill_fortress_archer',
      'hill_priest': 'hill_fortress',
      'hill_engineer': 'hill_engineer',
      'catapult': 'hill_catapult',
      // Pirate
      'slaver': 'pirate_slaver',
      'slave_galley': 'pirate_slaver_ship',
      // Desert
      'camel_lancers': 'desert_camel_lancers',
      'desert_immortals': 'desert_immortal',
      // Savannah
      'war_elephants': 'savannah_elephant',
      'war_chariot': 'savannah_chariot',
      // River
      'river_raiders': 'river_raiders',
      'river_priest': 'river_priestess',
      // Frost
      'ice_defenders': 'frost_ice_defenders',
      'polar_priest': 'frost_priest',
    };
    if (map[sourceRecipeId]) return map[sourceRecipeId];
  }

  // Summon/signature units (identified by special chassis IDs)
  if (chassisId === 'serpent_frame') return 'jungle_serpent';
  if (chassisId === 'warlord_frame') return 'steppe_warlord';
  if (chassisId === 'galley_frame') return 'pirate_galley';
  if (chassisId === 'polar_bear_frame') return 'frost_polar_bear';
  if (chassisId === 'alligator_frame') return 'river_crocodile';
  if (chassisId === 'siege_golem_frame') return 'hill_siege_golem';

  // Starting units by faction
  const startingMap: Record<string, Record<string, string>> = {
    jungle_clan: {
      infantry_frame: 'jungle_spearman',
      ranged_frame: 'jungle_archer',
    },
    druid_circle: {
      infantry_frame: 'druid_spear_infantry',
      ranged_frame: 'druid_archer',
    },
    steppe_clan: {
      infantry_frame: 'steppe_spear_infantry',
      ranged_frame: 'steppe_raiders',
      cavalry_frame: 'steppe_horse_archer',
    },
    hill_clan: {
      infantry_frame: 'hill_spear_infantry',
      ranged_frame: 'hill_archer',
    },
    coral_people: {
      infantry_frame: 'pirate_infantry',
      ranged_frame: 'pirate_ranged',
    },
    desert_nomads: {
      camel_frame: 'desert_camel',
      ranged_frame: 'desert_archer',
    },
    savannah_lions: {
      infantry_frame: 'savannah_spearman',
      ranged_frame: 'savannah_javelin',
    },
    river_people: {
      infantry_frame: 'river_spearman',
      naval_frame: 'river_canoe',
    },
    frost_wardens: {
      infantry_frame: 'frost_spearman',
      ranged_frame: 'frost_archer',
    },
  };

  const factionUnits = startingMap[factionId];
  if (factionUnits) {
    const sprite = factionUnits[chassisId];
    if (sprite) return sprite;
  }

  // Ultimate fallback (should never hit if all units are mapped)
  return normalizeSpriteKey(chassisId);
}

export function inferChassisId(name: string): string {
  const lowered = name.toLowerCase();
  if (lowered.includes('camel')) return 'camel';
  if (lowered.includes('elephant')) return 'elephant';
  if (lowered.includes('naval') || lowered.includes('marine') || lowered.includes('river')) return 'naval';
  if (lowered.includes('cavalry') || lowered.includes('horse')) return 'cavalry';
  if (lowered.includes('ranged') || lowered.includes('archer') || lowered.includes('bow')) return 'ranged';
  return 'infantry';
}

function normalizeSpriteKey(chassisId: string): string {
  if (chassisId.includes('camel')) return 'camel';
  if (chassisId.includes('elephant')) return 'elephant';
  if (chassisId.includes('naval')) return 'naval';
  if (chassisId.includes('cavalry')) return 'cavalry';
  if (chassisId.includes('ranged')) return 'ranged';
  return 'infantry';
}
