import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { createResearchState } from '../src/systems/researchSystem';

describe('capability doctrine thresholds', () => {
  it('scales poison based on venom research tier', () => {
    // No research completed - base poison stacks
    const noResearch = resolveResearchDoctrine(undefined);
    expect(noResearch.poisonStacksOnHit).toBe(1);

    // venom_t1 completed - increased poison stacks
    const venomT1Research = createResearchState('jungle_clan' as never);
    venomT1Research.completedNodes.push('venom_t1' as never);
    const venomT1 = resolveResearchDoctrine(venomT1Research);
    expect(venomT1.poisonStacksOnHit).toBe(2);

    // venom_t2 completed - increased damage per stack
    const venomT2Research = createResearchState('jungle_clan' as never);
    venomT2Research.completedNodes.push('venom_t1' as never, 'venom_t2' as never);
    const venomT2 = resolveResearchDoctrine(venomT2Research);
    expect(venomT2.poisonDamagePerStack).toBe(4);

    // venom_t3 completed - poison move penalty
    const venomT3Research = createResearchState('jungle_clan' as never);
    venomT3Research.completedNodes.push('venom_t1' as never, 'venom_t2' as never, 'venom_t3' as never);
    const venomT3 = resolveResearchDoctrine(venomT3Research);
    expect(venomT3.poisonMovePenalty).toBe(1);
  });

  it('enables fortress and nature_healing doctrine at correct tiers', () => {
    // fortress_t1 enables shield wall and rapid entrench
    const fortressT1 = resolveResearchDoctrine(createResearchState('hill_clan' as never, 'fortress'));
    expect(fortressT1.shieldWallEnabled).toBe(true);
    expect(fortressT1.rapidEntrenchEnabled).toBe(true);

    // fortress_t2 enables ZoC aura and field forts
    const fortressT2Research = createResearchState('hill_clan' as never, 'fortress');
    fortressT2Research.completedNodes.push('fortress_t2' as never);
    const fortressT2 = resolveResearchDoctrine(fortressT2Research);
    expect(fortressT2.zoCAuraEnabled).toBe(true);
    expect(fortressT2.canBuildFieldForts).toBe(true);

    // nature_healing_t1 enables forest ambush
    const natureT1 = resolveResearchDoctrine(createResearchState('frost_wardens' as never, 'nature_healing'));
    expect(natureT1.forestAmbushEnabled).toBe(true);
    expect(natureT1.natureHealingRegenBonus).toBe(1);

    // nature_healing_t2 enables canopy cover
    const natureT2Research = createResearchState('frost_wardens' as never, 'nature_healing');
    natureT2Research.completedNodes.push('nature_healing_t2' as never);
    const natureT2 = resolveResearchDoctrine(natureT2Research);
    expect(natureT2.canopyCoverEnabled).toBe(true);
  });

  it('distinguishes native T3 from foreign T3 effects', () => {
    const nativeVenomResearch = createResearchState('jungle_clan' as never, 'venom');
    nativeVenomResearch.completedNodes.push('venom_t2' as never, 'venom_t3' as never);
    const nativeVenom = resolveResearchDoctrine(nativeVenomResearch, {
      nativeDomain: 'venom',
      learnedDomains: ['venom'],
    } as never);
    expect(nativeVenom.toxicBulwarkEnabled).toBe(true);
    expect(nativeVenom.poisonBonusEnabled).toBe(false);

    const foreignVenomResearch = createResearchState('hill_clan' as never, 'fortress');
    foreignVenomResearch.completedNodes.push('venom_t1' as never, 'venom_t2' as never, 'venom_t3' as never);
    const foreignVenom = resolveResearchDoctrine(foreignVenomResearch, {
      nativeDomain: 'fortress',
      learnedDomains: ['fortress', 'venom'],
    } as never);
    expect(foreignVenom.toxicBulwarkEnabled).toBe(false);
    expect(foreignVenom.poisonBonusEnabled).toBe(true);
  });

  it('maps native nature_healing T3 to regeneration and low-hp defense, not heavy_hitter', () => {
    const nativeNatureResearch = createResearchState('frost_wardens' as never, 'nature_healing');
    nativeNatureResearch.completedNodes.push('nature_healing_t2' as never, 'nature_healing_t3' as never);
    const nativeNature = resolveResearchDoctrine(nativeNatureResearch, {
      nativeDomain: 'nature_healing',
      learnedDomains: ['nature_healing'],
    } as never);
    expect(nativeNature.undyingEnabled).toBe(true);
    expect(nativeNature.natureHealingRegenBonus).toBe(3);

    const nativeHeavyResearch = createResearchState('hill_clan' as never, 'fortress');
    nativeHeavyResearch.completedNodes.push('heavy_hitter_t1' as never, 'heavy_hitter_t2' as never, 'heavy_hitter_t3' as never);
    const nativeHeavy = resolveResearchDoctrine(nativeHeavyResearch, {
      nativeDomain: 'heavy_hitter',
      learnedDomains: ['heavy_hitter'],
    } as never);
    expect(nativeHeavy.undyingEnabled).toBe(false);
    expect(nativeHeavy.armorPenetrationEnabled).toBe(true);
  });
});
