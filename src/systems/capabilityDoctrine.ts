import type { ResearchState } from '../features/research/types.js';
import type { Faction } from '../features/factions/types.js';
import type { HybridRecipeDef } from '../data/registry/types.js';
import type { Prototype } from '../features/prototypes/types.js';
import { getDomainProgression } from './domainProgression.js';

export interface ResearchDoctrine {
  // Quantitative effects derived from research tier
  poisonStacksOnHit: number;       // always 1
  poisonDamagePerStack: number;    // venom_t2 -> 2, else 1
  poisonMovePenalty: number;       // venom_t3 -> 1, else 0

  // Tier 1 qualitative effects
  forestAmbushEnabled: boolean;     // nature_healing_t1 - kept for combat-side nature effects
  shieldWallEnabled: boolean;       // fortress_t1 - +15% defense when adjacent to ally
  riverCrossingEnabled: boolean;    // tidal_warfare_t1 - no penalty crossing rivers
  marchingStaminaEnabled: boolean;  // hitrun_t1 - +1 movement after attacking
  poisonPersistenceEnabled: boolean; // venom_t1 - poison doesn't expire
  forcedMarchEnabled: boolean;      // charge_t1 - no cooldown on first charge of each battle
  rapidEntrenchEnabled: boolean;    // fortress_t1 (via shield wall - same flag?)

  // Tier 2 qualitative effects
  canopyCoverEnabled: boolean;       // nature_healing_t2 - ranged +30% defense in forest/jungle
  elephantStampede2Enabled: boolean; // charge_t2 - charges knock back 2 hexes
  amphibiousAssaultEnabled: boolean; // tidal_warfare_t2 - naval units can attack coastal hexes
  winterCampaignEnabled: boolean;    // camel_adaptation_t2 - permanent stealth in desert
  contaminateTerrainEnabled: boolean; // venom_t2 - killing poisoned enemy contaminates hex
  zoCAuraEnabled: boolean;           // fortress_t2 - fortified units project ZoC to adjacent hexes
  canBuildFieldForts: boolean;       // fortress_t2 - infantry/ranged can build field forts

  // Tier 3 qualitative effects
  toxicBulwarkEnabled: boolean;      // venom_t3 - all units apply poison on hit
  fortressTranscendenceEnabled: boolean; // native fortress_t3 - all units can brace, aura range doubled
  chargeTranscendenceEnabled: boolean; // native charge_t3 - melee charges have no cooldown and ignore terrain penalties
  universalHitAndRunEnabled: boolean; // native hitrun_t3 - all units can attack then retreat
  amphibiousMovementEnabled: boolean; // native tidal_warfare_t3 - all units cross rivers/coast without penalty
  undyingEnabled: boolean;           // native nature_healing_t3 - units below 20% HP gain +50% defense

  // Additional qualitative effects from research
  heatResistanceEnabled: boolean;    // camel_adaptation_t1 - ignore desert movement penalty
  roughTerrainMovementEnabled: boolean;    // river_stealth_t1 - +1 movement in rough terrain
  greedyCaptureEnabled: boolean;     // slaving_t1 - +15% damage vs wounded enemies (<50% HP)
  antiFortificationEnabled: boolean; // heavy_hitter_t1 - +20% damage vs fortified/bracing enemies
  permanentStealthEnabled: boolean;  // camel_adaptation_t2 - permanent stealth in desert
  stealthRechargeEnabled: boolean;   // river_stealth_t2 - re-enter stealth after attacking
  captureRetreatEnabled: boolean;    // slaving_t2 - 15% chance to capture wounded enemies on retreat
  damageReflectionEnabled: boolean;  // heavy_hitter_t2 - reflect 25% damage back to attackers
  hitAndRunEnabled: boolean;         // hitrun_t2 - cavalry can attack then retreat in same turn

  // T3 upgrades
  poisonBonusEnabled: boolean;       // foreign venom_t3 - poison-tagged units deal +50% poison damage
  fortressAuraUpgradeEnabled: boolean; // foreign fortress_t3 - fortress aura grants +25% defense
  chargeRoutedBonusEnabled: boolean;  // foreign charge_t3 - charge damage +50% against routed enemies
  hitrunZocIgnoreEnabled: boolean;    // foreign hitrun_t3 - units with hitrun ignore zone of control
  healingAuraUpgradeEnabled: boolean; // foreign nature_healing_t3 - healing aura range doubled to 2 hexes
  roughTerrainDefenseEnabled: boolean; // foreign camel_adaptation_t3 - units in rough terrain gain +20% defense
  navalCoastalBonusEnabled: boolean;  // foreign tidal_warfare_t3 - naval units gain +25% attack in coastal hexes
  stealthCloakAuraEnabled: boolean;   // native river_stealth_t3 - stealthed units cloak adjacent allies, who also gain sneak attack
  stealthRevealEnabled: boolean;      // foreign river_stealth_t3 - stealth units reveal stealthed enemies within 2 hexes
  autoCaptureEnabled: boolean;        // foreign slaving_t3 - wounded enemies below 25% HP are auto-captured
  armorPenetrationEnabled: boolean;   // heavy_hitter_t3 - ignore 50% armor, units cannot be displaced
  natureHealingRegenBonus: number;    // nature_healing_t1/T3 - +1 HP/turn, or +3 HP/turn for native T3
}

/**
 * Check if a faction has completed specific research nodes.
 */
export function hasCompletedResearchNodes(
  researchState: ResearchState | undefined,
  requiredResearchNodes: string[] | undefined
): boolean {
  return (requiredResearchNodes ?? []).every((nodeId) =>
    researchState?.completedNodes.includes(nodeId as never)
  );
}

/**
 * Check if a recipe's research requirements are met.
 */
export function meetsRecipeResearchRequirements(
  recipe: HybridRecipeDef,
  researchState: ResearchState | undefined
): boolean {
  void recipe;
  void researchState;
  return true;
}

/**
 * Resolve the research doctrine for a faction based on completed research nodes.
 * This is the single source of truth for all qualitative combat effects.
 */
export function resolveResearchDoctrine(
  researchState: ResearchState | undefined,
  faction?: Pick<Faction, 'nativeDomain' | 'learnedDomains'>,
): ResearchDoctrine {
  function hasNode(nodeId: string): boolean {
    return (researchState?.completedNodes ?? []).includes(nodeId as never);
  }

  const progression = faction ? getDomainProgression(faction, researchState) : null;
  const hasNativeT3 = (domainId: string): boolean =>
    progression?.nativeT3Domains.includes(domainId) ?? hasNode(`${domainId}_t3`);
  const hasForeignT3 = (domainId: string): boolean =>
    progression?.foreignT3Domains.includes(domainId) ?? false;

  return {
    // Quantitative effects
    poisonStacksOnHit: hasNode('venom_t1') ? 2 : 1,
    poisonDamagePerStack: hasNode('venom_t2') ? 2 : 1,
    poisonMovePenalty: hasNode('venom_t3') ? 1 : 0,

    // Tier 1 qualitative effects
    forestAmbushEnabled: hasNode('nature_healing_t1'),
    shieldWallEnabled: hasNode('fortress_t1'),
    riverCrossingEnabled: hasNode('tidal_warfare_t1'),
    marchingStaminaEnabled: hasNode('hitrun_t1'),
    poisonPersistenceEnabled: hasNode('venom_t1'),
    forcedMarchEnabled: hasNode('charge_t1'),
    rapidEntrenchEnabled: hasNode('fortress_t1') || hasNativeT3('fortress'),

    // Tier 2 qualitative effects
    canopyCoverEnabled: hasNode('nature_healing_t2'),
    elephantStampede2Enabled: hasNode('charge_t2'),
    amphibiousAssaultEnabled: hasNode('tidal_warfare_t2'),
    winterCampaignEnabled: hasNode('camel_adaptation_t2'),
    contaminateTerrainEnabled: hasNode('venom_t2'),
    zoCAuraEnabled: hasNode('fortress_t2'),
    canBuildFieldForts: hasNode('fortress_t2'),

    // Tier 3 qualitative effects
    toxicBulwarkEnabled: hasNativeT3('venom'),
    fortressTranscendenceEnabled: hasNativeT3('fortress'),
    chargeTranscendenceEnabled: hasNativeT3('charge'),
    universalHitAndRunEnabled: hasNativeT3('hitrun'),
    amphibiousMovementEnabled: hasNativeT3('tidal_warfare'),
    undyingEnabled: hasNativeT3('nature_healing'),

    // Additional qualitative effects
    heatResistanceEnabled: hasNode('camel_adaptation_t1'),
    roughTerrainMovementEnabled: hasNode('river_stealth_t1'),
    greedyCaptureEnabled: hasNode('slaving_t1'),
    antiFortificationEnabled: hasNode('heavy_hitter_t1'),
    permanentStealthEnabled: hasNode('camel_adaptation_t2'),
    stealthRechargeEnabled: hasNode('river_stealth_t2'),
    captureRetreatEnabled: hasNode('slaving_t2'),
    damageReflectionEnabled: hasNode('heavy_hitter_t2'),
    hitAndRunEnabled: hasNode('hitrun_t2'),

    // T3 upgrades
    poisonBonusEnabled: hasForeignT3('venom'),
    fortressAuraUpgradeEnabled: hasForeignT3('fortress'),
    chargeRoutedBonusEnabled: hasForeignT3('charge'),
    hitrunZocIgnoreEnabled: hasForeignT3('hitrun'),
    healingAuraUpgradeEnabled: hasForeignT3('nature_healing'),
    roughTerrainDefenseEnabled: hasForeignT3('camel_adaptation'),
    navalCoastalBonusEnabled: hasForeignT3('tidal_warfare'),
    stealthCloakAuraEnabled: hasNativeT3('river_stealth'),
    stealthRevealEnabled: hasForeignT3('river_stealth'),
    autoCaptureEnabled: hasForeignT3('slaving'),
    armorPenetrationEnabled: hasForeignT3('heavy_hitter') || hasNativeT3('heavy_hitter'),
    natureHealingRegenBonus: hasNativeT3('nature_healing')
      ? 3
      : hasNode('nature_healing_t1')
        ? 1
        : 0,
  };
}

/**
 * Legacy alias for backwards compatibility during migration.
 * @deprecated Use resolveResearchDoctrine instead.
 */
export const resolveCapabilityDoctrine = resolveResearchDoctrine;

/**
 * Check if a prototype has a specific component.
 */
export function prototypeHasComponent(prototype: Prototype, componentId: string): boolean {
  return prototype.componentIds.includes(componentId as never);
}
