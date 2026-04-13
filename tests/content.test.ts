// Tests for content registry

import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';

const registry = loadRulesRegistry();

describe('loadRulesRegistry', () => {
  it('returns a registry object', () => {
    expect(registry).toBeDefined();
    expect(typeof registry.getTerrain).toBe('function');
    expect(typeof registry.getChassis).toBe('function');
    expect(typeof registry.getComponent).toBe('function');
    expect(typeof registry.getCapabilityDomain).toBe('function');
    expect(typeof registry.getHybridRecipe).toBe('function');
    expect(typeof registry.getFactionAiBaseline).toBe('function');
    expect(typeof registry.getDomainAiDoctrine).toBe('function');
  });
});

describe('Terrain', () => {
  it('getTerrain returns correct terrain definitions', () => {
    const plains = registry.getTerrain('plains');
    expect(plains).toBeDefined();
    expect(plains?.id).toBe('plains');
    expect(plains?.movementCost).toBe(1);
  });

  it('getAllTerrains returns 11 terrains', () => {
    const terrains = registry.getAllTerrains();
    expect(terrains).toHaveLength(11);
    const ids = terrains.map(t => t.id).sort();
    expect(ids).toEqual(['coast', 'desert', 'forest', 'hill', 'jungle', 'ocean', 'plains', 'river', 'savannah', 'swamp', 'tundra']);
  });
});

describe('Chassis', () => {
  it('getChassis returns infantry_frame and ranged_frame', () => {
    const infantry = registry.getChassis('infantry_frame');
    const ranged = registry.getChassis('ranged_frame');
    expect(infantry).toBeDefined();
    expect(ranged).toBeDefined();
    expect(infantry?.id).toBe('infantry_frame');
    expect(ranged?.id).toBe('ranged_frame');
  });

  it('infantry_frame has baseHp 9, baseMoves 2, and keeps weapon/armor slots', () => {
    const infantry = registry.getChassis('infantry_frame');
    expect(infantry?.baseHp).toBe(9);
    expect(infantry?.baseMoves).toBe(2);
    expect(infantry?.slotTypes).toEqual(['weapon', 'armor', 'training']);
  });

  it('ranged_frame has baseRange 1', () => {
    const ranged = registry.getChassis('ranged_frame');
    expect(ranged?.baseRange).toBe(1);
  });

  it('chassis expose explicit supply costs for logistical modeling', () => {
    expect(registry.getChassis('infantry_frame')?.supplyCost).toBe(1);
    expect(registry.getChassis('cavalry_frame')?.supplyCost).toBe(1.5);
    expect(registry.getChassis('elephant_frame')?.supplyCost).toBe(2);
    expect(registry.getChassis('polar_bear_frame')?.supplyCost).toBe(2.5);
  });

  it('getAllChassis returns expanded chassis roster', () => {
    const chassis = registry.getAllChassis();
    expect(chassis.length).toBeGreaterThanOrEqual(6);
  });

  // Note: Chassis gating is now based on domain count (1=base, 2=mid, 3=late)
  // rather than requiredResearchNodes. The researchSystem handles this.
});

describe('Components', () => {
  it('getComponent returns basic_spear, basic_bow, simple_armor', () => {
    const spear = registry.getComponent('basic_spear');
    const bow = registry.getComponent('basic_bow');
    const armor = registry.getComponent('simple_armor');
    expect(spear).toBeDefined();
    expect(bow).toBeDefined();
    expect(armor).toBeDefined();
  });

  it('basic_spear has attackBonus 3, slotType "weapon"', () => {
    const spear = registry.getComponent('basic_spear');
    expect(spear?.attackBonus).toBe(3);
    expect(spear?.slotType).toBe('weapon');
  });

  it('basic_bow has rangeBonus 1', () => {
    const bow = registry.getComponent('basic_bow');
    expect(bow?.rangeBonus).toBe(1);
  });

  it('simple_armor has defenseBonus 2', () => {
    const armor = registry.getComponent('simple_armor');
    expect(armor?.defenseBonus).toBe(2);
  });

  it('getAllComponents returns expanded components', () => {
    const components = registry.getAllComponents();
    expect(components.length).toBeGreaterThanOrEqual(12);
  });
});

describe('Veteran Levels', () => {
  it('getVeteranLevel returns green and veteran', () => {
    const green = registry.getVeteranLevel('green');
    const veteran = registry.getVeteranLevel('veteran');
    expect(green).toBeDefined();
    expect(veteran).toBeDefined();
    expect(green?.id).toBe('green');
    expect(veteran?.id).toBe('veteran');
  });

  it('seasoned has xpThreshold 30, attackBonus 0.1, defenseBonus 0.1', () => {
    const veteran = registry.getVeteranLevel('seasoned');
    expect(veteran?.xpThreshold).toBe(30);
    expect(veteran?.attackBonus).toBe(0.1);
    expect(veteran?.defenseBonus).toBe(0.1);
  });

  it('veteran has xpThreshold 60, attackBonus 0.2, defenseBonus 0.2', () => {
    const veteran = registry.getVeteranLevel('veteran');
    expect(veteran?.xpThreshold).toBe(60);
    expect(veteran?.attackBonus).toBe(0.2);
    expect(veteran?.defenseBonus).toBe(0.2);
  });

  it('getAllVeteranLevels returns 4 levels', () => {
    const levels = registry.getAllVeteranLevels();
    expect(levels).toHaveLength(4);
  });
});

describe('Improvements', () => {
  it('getImprovement returns field_fort', () => {
    const fort = registry.getImprovement('field_fort');
    expect(fort).toBeDefined();
    expect(fort?.id).toBe('field_fort');
  });

  it('field_fort has defenseBonus 1, category "fortification"', () => {
    const fort = registry.getImprovement('field_fort');
    expect(fort).toBeDefined();
    expect(fort?.id).toBe('field_fort');
    expect(fort?.defenseBonus).toBe(1);
    expect(fort?.category).toBe('fortification');
  });

  it('getAllImprovements returns 1 improvement', () => {
    const improvements = registry.getAllImprovements();
    expect(improvements).toHaveLength(1);
  });
});

describe('Research', () => {
  it('getResearchDomain returns venom (one of 10 domains)', () => {
    const domain = registry.getResearchDomain('venom');
    expect(domain).toBeDefined();
    expect(domain?.id).toBe('venom');
  });

  it('getResearchNode returns the charge_t2 node for steppe clan native domain', () => {
    // steppe_clan has native domain 'charge'
    const node = registry.getResearchNode('charge', 'charge_t2');
    expect(node).toBeDefined();
    expect(node?.id).toBe('charge_t2');
    expect(node?.domain).toBe('charge');
    expect(node?.tier).toBe(2);
  });

  it('charge_t2 has correct prerequisites and unlocks', () => {
    const node = registry.getResearchNode('charge', 'charge_t2');
    expect(node?.prerequisites).toEqual(['charge_t1']);
    // Tier 2 nodes unlocks are qualitative effects, not component/chassis unlocks
  });

  it('getAllResearchDomains returns 10 domains', () => {
    const domains = registry.getAllResearchDomains();
    expect(domains).toHaveLength(10);
    const ids = domains.map(d => d.id).sort();
    expect(ids).toEqual([
      'camel_adaptation',
      'charge',
      'fortress',
      'heavy_hitter',
      'hitrun',
      'nature_healing',
      'river_stealth',
      'slaving',
      'tidal_warfare',
      'venom',
    ]);
  });
});

describe('Capabilities and Recipes', () => {
  it('exposes core capability domains', () => {
    const domain = registry.getCapabilityDomain('woodcraft');
    expect(domain?.name).toBe('Woodcraft');
  });

  // Hybrid recipes now expose visible domain-count progression gates.
  it('includes ice_defenders hybrid recipe with mid-tier domain progression metadata', () => {
    const recipe = registry.getHybridRecipe('ice_defenders');
    expect(recipe?.tier).toBe('mid');
    expect(recipe?.minLearnedDomains).toBe(2);
    expect(recipe?.nativeFaction).toBe('frost_wardens');
  });

  it('includes blowgun_skirmishers hybrid recipe', () => {
    const recipe = registry.getHybridRecipe('blowgun_skirmishers');
    expect(recipe?.tier).toBe('mid');
    expect(recipe?.minLearnedDomains).toBe(2);
    expect(recipe?.nativeFaction).toBe('jungle_clan');
  });
});

describe('AI profiles', () => {
  it('loads faction AI baselines from content', () => {
    const pirateBaseline = registry.getFactionAiBaseline('coral_people');
    expect(pirateBaseline?.factionId).toBe('coral_people');
    expect(pirateBaseline?.raidBias).toBeGreaterThan(0.9);
    expect(pirateBaseline?.captureBias).toBeGreaterThan(0.9);
    expect(pirateBaseline?.preferredTerrains).toEqual(expect.arrayContaining(['coast', 'river', 'ocean']));
  });

  it('loads the doctrine catalog used by personality snapshots', () => {
    const doctrine = registry.getDomainAiDoctrine('river_stealth');
    expect(doctrine?.domainId).toBe('river_stealth');
    expect(doctrine?.scalarMods?.stealthBias).toBeGreaterThan(0);
    expect(doctrine?.terrainBiasMods?.prefer).toEqual(expect.arrayContaining(['river', 'swamp']));
    expect(doctrine?.moveRules?.ambush).toBeGreaterThan(0);
  });
});
