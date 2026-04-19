// Core resolution engine for ability domain synergies

export interface DomainConfig {
  id: string;
  name: string;
  nativeFaction: string;
  tags: string[];
  baseEffect: unknown;
}

export interface PairSynergyConfig {
  id: string;
  name: string;
  domains: [string, string];
  requiredTags: string[];
  effect: SynergyEffect;
  description: string;
}

export interface EmergentRuleConfig {
  id: string;
  name: string;
  condition: string;
  domainSets?: Record<string, string[]>;
  mobilityDomains?: string[];
  combatDomains?: string[];
  effect: EmergentEffect;
}

export type SynergyEffect =
  | { type: 'poison_aura'; damagePerTurn: number; radius: number }
  | { type: 'charge_shield' }
  | { type: 'dug_in'; defenseBonus: number }
  | { type: 'land_aura'; defenseBonus: number; radius: number }
  | { type: 'extended_healing'; radius: number; selfHeal: number; allyHeal: number }
  | { type: 'stealth_aura'; revealRadius: number }
  | { type: 'terrain_fortress'; terrainTypes: string[]; defenseBonus: number }
  | { type: 'ram_attack'; knockbackDistance: number }
  | { type: 'combat_healing'; healPercent: number }
  | { type: 'sandstorm'; aoeDamage: number; accuracyDebuff: number }
  | { type: 'double_charge' }
  | { type: 'poison_trap'; damagePerTurn: number; slowAmount: number }
  | { type: 'contaminate'; coastalDamage: number }
  | { type: 'withering'; healingReduction: number }
  | { type: 'stealth_healing' }
  | { type: 'terrain_poison'; damagePerTurn: number; terrainTypes: string[] }
  | { type: 'multiplier_stack'; multiplier: number }
  | { type: 'aura_overlap'; stackingBonus: number }
  | { type: 'stealth_recharge' }
  | { type: 'oasis' }
  | { type: 'permanent_stealth_terrain'; terrainTypes: string[] }
  | { type: 'shadow_network' }
  | { type: 'nomad_network' }
  | { type: 'heal_on_retreat'; healAmount: number }
  | { type: 'impassable_retreat' }
  | { type: 'swarm_speed'; speedBonus: number }
  | { type: 'formation_crush'; knockbackDistance: number; stunDuration: number }
  | { type: 'coastal_nomad'; defenseBonus: number; speedBonus: number }
  | { type: 'sandstorm_aura'; auraRadius: number; enemyAccuracyDebuff: number }
  | { type: 'poison_capture'; damagePerTurn: number; slaveDamageBonus: number; slaveHealPenalty: number }
  | { type: 'heavy_poison'; armorPiercing: number }
  | { type: 'prison_fortress'; defenseBonus: number }
  | { type: 'heavy_fortress'; damageReflection: number }
  | { type: 'capture_charge'; knockbackDistance: number }
  | { type: 'heavy_charge'; stunDuration: number }
  | { type: 'capture_retreat'; captureChance: number }
  | { type: 'heavy_retreat'; damageReduction: number }
  | { type: 'naval_capture'; coastalCaptureBonus: number }
  | { type: 'heavy_naval'; ramDamage: number }
  | { type: 'slave_healing'; slaveHeal: number }
  | { type: 'heavy_regen'; regenPercent: number }
  | { type: 'stealth_capture'; captureChance: number }
  | { type: 'armor_shred'; armorPiercing: number; permanent: boolean }
  | { type: 'lethal_ambush'; poisonStacks: number; actionPointCost: number }
  | { type: 'ambush_charge'; damageBonus: number; revealUntilNextTurn: boolean }
  | { type: 'terrain_slave'; speedBonus: number }
  | { type: 'slave_army'; slaveDamageBonus: number; slaveDefensePenalty: number }
  | { type: 'slave_coercion'; damageBonus: number }
  | { type: 'heavy_mass'; knockbackDistance: number };

export type EmergentEffect =
  | { type: 'terrain_charge'; chargeTerrainPenetration: boolean; nativeTerrainDamageBonus: number; description: string }
  | { type: 'sustain'; healPercentOfDamage: number; minHp: number; description: string }
  | { type: 'permanent_stealth'; terrainTypes: string[]; description: string }
  | { type: 'zone_of_control'; radius: number; defenseBonus: number; healPerTurn: number; immovable: boolean; selfRegen: number; description: string }
  | { type: 'mobility_unit'; scope: 'unit_only'; ignoreAllTerrain: boolean; bonusMovement: number; description: string }
  | { type: 'combat_unit'; scope: 'unit_only'; doubleCombatBonuses: boolean; description: string }
  | { type: 'slave_empire'; captureAuraRadius: number; captureChanceBonus: number; slaveProductionBonus: number; description: string }
  | { type: 'desert_raider'; desertCaptureBonus: number; alliedDesertMovement: boolean; description: string }
  | { type: 'poison_shadow'; stealthPoisonStacks: number; retreatPoisonCloud: boolean; poisonCloudDamage: number; description: string }
  | { type: 'iron_turtle'; crushingZoneRadius: number; crushingZoneDamage: number; damageReflection: number; description: string }
  | { type: 'multiplier'; pairSynergyMultiplier: number; description: string };

export interface ActiveSynergy {
  pairId: string;
  name: string;
  domains: [string, string];
  effect: SynergyEffect;
}

export interface ActiveTripleStack {
  domains: [string, string, string];
  pairs: ActiveSynergy[];
  emergentRule: EmergentRuleConfig;
  name: string;
}

export class SynergyEngine {
  constructor(
    private pairSynergies: PairSynergyConfig[],
    private emergentRules: EmergentRuleConfig[],
    private abilityDomains: DomainConfig[],
  ) {}

  /**
   * Get a synergy score (0-3) indicating how well two domains complement each other.
   * Higher = more strategic to pursue.
   * Based on emergent rules: if two domains appear together in any emergent rule condition,
   * they have synergy potential (score 2+). Score 3 = direct pair in a pair synergy.
   */
  getDomainSynergyScore(domainA: string, domainB: string): number {
    // First check if there's a direct pair synergy between these two domains
    for (const synergy of this.pairSynergies) {
      const [d1, d2] = synergy.domains;
      if ((d1 === domainA && d2 === domainB) || (d1 === domainB && d2 === domainA)) {
        // Check if this pair forms part of an emergent triple (high value)
        for (const rule of this.emergentRules) {
          if (this.ruleMentionsBothDomains(domainA, domainB, rule)) {
            return 3; // Direct pair + emergent potential = highest synergy
          }
        }
        return 2; // Direct pair synergy exists
      }
    }

    // Check if both domains appear together in any emergent rule
    for (const rule of this.emergentRules) {
      if (this.ruleMentionsBothDomains(domainA, domainB, rule)) {
        return 2; // Both appear in same emergent rule
      }
    }

    // Check if they share a category (both combat, both mobility, etc.)
    const categoryA = this.getDomainCategory(domainA);
    const categoryB = this.getDomainCategory(domainB);
    if (categoryA && categoryA === categoryB) {
      return 1; // Same category = minor synergy
    }

    return 0; // No synergy
  }

  /**
   * Get the category of a domain (combat, mobility, healing, terrain, summoning).
   */
  private getDomainCategory(domainId: string): string | null {
    for (const rule of this.emergentRules) {
      if (rule.domainSets) {
        for (const [category, domains] of Object.entries(rule.domainSets)) {
          if (domains.includes(domainId)) {
            return category;
          }
        }
      }
      if (rule.mobilityDomains?.includes(domainId)) return 'mobility';
      if (rule.combatDomains?.includes(domainId)) return 'combat';
    }
    return null;
  }

  /**
   * Check if an emergent rule mentions both domains (in any of its domain sets).
   */
  private ruleMentionsBothDomains(domainA: string, domainB: string, rule: EmergentRuleConfig): boolean {
    if (rule.domainSets) {
      const allRuleDomains = Object.values(rule.domainSets).flat();
      return allRuleDomains.includes(domainA) && allRuleDomains.includes(domainB);
    }
    if (rule.mobilityDomains) {
      return rule.mobilityDomains.includes(domainA) && rule.mobilityDomains.includes(domainB);
    }
    if (rule.combatDomains) {
      return rule.combatDomains.includes(domainA) && rule.combatDomains.includes(domainB);
    }
    return false;
  }

  /**
   * Get all domains that synergize well with a given domain (score >= 2).
   */
  getHighSynergyDomains(domainId: string): string[] {
    const highSynergy: string[] = [];
    for (const abilityDomain of this.abilityDomains) {
      if (abilityDomain.id !== domainId) {
        const score = this.getDomainSynergyScore(domainId, abilityDomain.id);
        if (score >= 2) {
          highSynergy.push(abilityDomain.id);
        }
      }
    }
    return highSynergy;
  }

  // Given a unit's tags, resolve all active pair synergies
  resolveUnitPairs(unitTags: string[]): ActiveSynergy[] {
    const active: ActiveSynergy[] = [];
    const unitTagCounts = new Map<string, number>();
    for (const tag of unitTags) {
      unitTagCounts.set(tag, (unitTagCounts.get(tag) ?? 0) + 1);
    }
    for (const synergy of this.pairSynergies) {
      const requiredTagCounts = new Map<string, number>();
      for (const tag of synergy.requiredTags) {
        requiredTagCounts.set(tag, (requiredTagCounts.get(tag) ?? 0) + 1);
      }
      const hasAllTags = [...requiredTagCounts.entries()].every(
        ([tag, count]) => (unitTagCounts.get(tag) ?? 0) >= count,
      );
      if (hasAllTags) {
        active.push({
          pairId: synergy.id,
          name: synergy.name,
          domains: synergy.domains,
          effect: synergy.effect,
        });
      }
    }
    return active;
  }

  // Resolve the faction triple stack using tier-qualified domain sets.
  resolveFactionTriple(
    pairEligibleDomains: string[],
    emergentEligibleDomains: string[],
  ): ActiveTripleStack | null {
    if (emergentEligibleDomains.length < 2) {
      return null;
    }

    const pairIds = this.resolveFactionPairIds(pairEligibleDomains);
    const pairs = pairIds.map(id => this.pairSynergies.find(s => s.id === id)!).filter(Boolean).map(s => ({
      pairId: s.id,
      name: s.name,
      domains: s.domains,
      effect: s.effect,
    }));
    
    const emergent = this.resolveEmergentRule(emergentEligibleDomains);
    if (!emergent) {
      return null;
    }

    const tripleName = this.generateTripleName(emergentEligibleDomains, pairIds);

    const domainTriple: [string, string, string] = emergentEligibleDomains.length >= 3
      ? [emergentEligibleDomains[0], emergentEligibleDomains[1], emergentEligibleDomains[2]]
      : [emergentEligibleDomains[0], emergentEligibleDomains[1], emergentEligibleDomains[0]];

    return {
      domains: domainTriple,
      pairs,
      emergentRule: emergent,
      name: tripleName,
    };
  }

  // Given a faction's learned domains, resolve ALL active pair IDs
  // (pairs activate when a unit has BOTH domain tags)
  resolveFactionPairIds(learnedDomains: string[]): string[] {
    const activePairIds: string[] = [];
    for (const synergy of this.pairSynergies) {
      const [domain1, domain2] = synergy.domains;
      if (learnedDomains.includes(domain1) && learnedDomains.includes(domain2)) {
        activePairIds.push(synergy.id);
      }
    }
    return activePairIds;
  }

  private resolveEmergentRule(domains: string[]): EmergentRuleConfig | null {
    for (const rule of this.emergentRules) {
      if (this.ruleMatches(domains, rule)) {
        return rule;
      }
    }
    return null;
  }

  private ruleMatches(domains: string[], rule: EmergentRuleConfig): boolean {
    switch (rule.condition) {
      case 'contains_terrain AND contains_combat AND contains_mobility': {
        if (!rule.domainSets) return false;
        const hasTerrain = domains.some(d => rule.domainSets!['terrain'].includes(d));
        const hasCombat = domains.some(d => rule.domainSets!['combat'].includes(d));
        const hasMobility = domains.some(d => rule.domainSets!['mobility'].includes(d));
        return hasTerrain && hasCombat && hasMobility;
      }
      case 'contains_healing AND contains_defensive AND contains_offensive': {
        if (!rule.domainSets) return false;
        const hasHealing = domains.some(d => rule.domainSets!['healing'].includes(d));
        const hasDefensive = domains.some(d => rule.domainSets!['defensive'].includes(d));
        const hasOffensive = domains.some(d => rule.domainSets!['offensive'].includes(d));
        return hasHealing && hasDefensive && hasOffensive;
      }
      case 'contains_stealth AND contains_combat AND contains_terrain': {
        if (!rule.domainSets) return false;
        const hasStealth = domains.some(d => rule.domainSets!['stealth'].includes(d));
        const hasCombat = domains.some(d => rule.domainSets!['combat'].includes(d));
        const hasTerrain = domains.some(d => rule.domainSets!['terrain'].includes(d));
        return hasStealth && hasCombat && hasTerrain;
      }
      case 'contains_fortress AND contains_healing AND contains_defensive': {
        if (!rule.domainSets) return false;
        const hasFortress = domains.some(d => rule.domainSets!['fortress'].includes(d));
        const hasHealing = domains.some(d => rule.domainSets!['healing'].includes(d));
        const hasDefensive = domains.some(d => rule.domainSets!['defensive'].includes(d));
        return hasFortress && hasHealing && hasDefensive;
      }
      case 'contains_slaving AND contains_heavy AND contains_fortress': {
        if (!rule.domainSets) return false;
        const hasSlaving = domains.some(d => rule.domainSets!['slaving'].includes(d));
        const hasHeavy = domains.some(d => rule.domainSets!['heavy'].includes(d));
        const hasFortress = domains.some(d => rule.domainSets!['fortress'].includes(d));
        return hasSlaving && hasHeavy && hasFortress;
      }
      case 'contains_camels AND contains_slaving AND contains_mobility': {
        if (!rule.domainSets) return false;
        const hasCamels = domains.some(d => rule.domainSets!['camels'].includes(d));
        const hasSlaving = domains.some(d => rule.domainSets!['slaving'].includes(d));
        const hasMobility = domains.some(d => rule.domainSets!['mobility'].includes(d));
        return hasCamels && hasSlaving && hasMobility;
      }
      case 'contains_venom AND contains_stealth AND contains_combat': {
        if (!rule.domainSets) return false;
        const hasVenom = domains.some(d => rule.domainSets!['venom'].includes(d));
        const hasStealth = domains.some(d => rule.domainSets!['stealth'].includes(d));
        const hasCombat = domains.some(d => rule.domainSets!['combat'].includes(d));
        return hasVenom && hasStealth && hasCombat;
      }
      case 'contains_fortress AND contains_heavy AND contains_terrain': {
        if (!rule.domainSets) return false;
        const hasFortress = domains.some(d => rule.domainSets!['fortress'].includes(d));
        const hasHeavy = domains.some(d => rule.domainSets!['heavy'].includes(d));
        const hasTerrain = domains.some(d => rule.domainSets!['terrain'].includes(d));
        return hasFortress && hasHeavy && hasTerrain;
      }
      case 'contains_3_mobility': {
        if (!rule.mobilityDomains) return false;
        const mobilityCount = domains.filter(d => rule.mobilityDomains!.includes(d)).length;
        return mobilityCount >= 3;
      }
      case 'contains_3_combat': {
        if (!rule.combatDomains) return false;
        const combatCount = domains.filter(d => rule.combatDomains!.includes(d)).length;
        return combatCount >= 3;
      }
      case 'default':
        return true;
      default:
        return false;
    }
  }

  private generateTripleName(domains: string[], pairs: string[]): string {
    const domainSet = new Set(domains);

    // Withering Citadel: V+F+N
    if (domainSet.has('venom') && domainSet.has('fortress') && domainSet.has('nature_healing')) {
      return 'Withering Citadel';
    }

    // Ghost Army: 3 mobility domains
    const mobilityCount = domains.filter(d =>
      ['charge', 'hitrun', 'camel_adaptation', 'river_stealth'].includes(d)
    ).length;
    if (mobilityCount >= 3) {
      return 'Ghost Army';
    }

    // Terrain Rider: terrain + combat + mobility
    const hasTerrain = ['camel_adaptation', 'tidal_warfare', 'heavy_hitter'].some(d => domainSet.has(d));
    const hasCombat = ['venom', 'fortress', 'charge', 'hitrun', 'slaving', 'heavy_hitter'].some(d => domainSet.has(d));
    const hasMobility = ['camel_adaptation', 'charge', 'hitrun', 'river_stealth'].some(d => domainSet.has(d));
    if (hasTerrain && hasCombat && hasMobility) {
      return 'Terrain Rider';
    }

    // Slave Empire: slaving + heavy_hitter + fortress
    if (domainSet.has('slaving') && domainSet.has('heavy_hitter') && domainSet.has('fortress')) {
      return 'Slave Empire';
    }

    // Desert Raider: camel_adaptation + slaving + (charge | hitrun)
    if (domainSet.has('camel_adaptation') && domainSet.has('slaving') &&
        (domainSet.has('charge') || domainSet.has('hitrun'))) {
      return 'Desert Raider';
    }

    // Poison Shadow: venom + river_stealth + (charge | hitrun)
    if (domainSet.has('venom') && domainSet.has('river_stealth') &&
        (domainSet.has('charge') || domainSet.has('hitrun'))) {
      return 'Poison Shadow';
    }

    // Iron Turtle: fortress + heavy_hitter + (tidal_warfare | camel_adaptation)
    if (domainSet.has('fortress') && domainSet.has('heavy_hitter') &&
        (domainSet.has('tidal_warfare') || domainSet.has('camel_adaptation'))) {
      return 'Iron Turtle';
    }

    // Paladin: nature_healing + (fortress|tidal_warfare|heavy_hitter) + (venom|charge|hitrun|slaving)
    if (domainSet.has('nature_healing')) {
      const hasDefensive = ['fortress', 'tidal_warfare', 'heavy_hitter'].some(d => domainSet.has(d));
      const hasOffensive = ['venom', 'charge', 'hitrun', 'slaving'].some(d => domainSet.has(d));
      if (hasDefensive && hasOffensive) {
        return 'Paladin';
      }
    }

    // Generate name from pair names
    const pairNames = pairs.slice(0, 3).map(id => {
      const synergy = this.pairSynergies.find(s => s.id === id);
      return synergy ? synergy.name.split(' ')[0] : '';
    }).filter(Boolean);

    return pairNames.length > 0 ? pairNames.join(' ') + ' Force' : 'Unknown';
  }
}
