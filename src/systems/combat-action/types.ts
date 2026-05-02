import type { HexCoord } from '../../types.js';
import type { CombatResult } from '../combatSystem.js';
import type { UnitId } from '../../game/types.js';

export type CombatActionEffectCategory = 'positioning' | 'ability' | 'synergy' | 'aftermath';

export interface CombatActionEffect {
  label: string;
  detail: string;
  category: CombatActionEffectCategory;
}

export interface CombatActionPreview {
  attackerId: UnitId;
  defenderId: UnitId;
  result: CombatResult;
  round: number;
  attackerFactionId: string;
  defenderFactionId: string;
  attackerPrototypeName: string;
  defenderPrototypeName: string;
  triggeredEffects: CombatActionEffect[];
  braceTriggered: boolean;
  attackerWasStealthed: boolean;
  details: CombatActionPreviewDetails;
}

export interface CombatActionPreviewDetails {
  attackerTerrainId: string;
  defenderTerrainId: string;
  isChargeAttack: boolean;
  chargeAttackBonus: number;
  synergyAttackModifier: number;
  synergyDefenseModifier: number;
  improvementDefenseBonus: number;
  wallDefenseBonus: number;
  totalKnockbackDistance: number;
  poisonTrapPositions: HexCoord[];
  poisonTrapDamage: number;
  poisonTrapSlow: number;
  healOnRetreatAmount: number;
  sandstormDamage: number;
  contaminateActive: boolean;
  frostbiteColdDoT: number;
  frostbiteSlow: number;
  attackerSynergyEffects: string[];
  defenderSynergyEffects: string[];
  sneakAttackTriggered: boolean;
  stampedeTriggered: boolean;
  // Phase 4: emergent rule fields
  emergentSustainHealPercent: number;
  emergentSustainMinHp: number;
  emergentPermanentStealthTerrains: string[];
  emergentCaptureBonus: number;
  emergentDesertCaptureBonus: number;
  // Phase 3A: direct combat effects
  instantKill: boolean;
  lethalAmbushPoison: number;
  chargeCooldownWaived: boolean;
  formationCrushStacks: number;
  stunDuration: number;
  armorPiercing: number;
  // Phase 3B: capture synergy modifiers
  capturePoisonDamage: number;
  capturePoisonStacks: number;
  slaveDamageBonus: number;
  slaveHealPenalty: number;
  chargeCaptureChance: number;
  retreatCaptureChance: number;
  navalCaptureBonus: number;
  stealthCaptureBonus: number;
  // Phase 3C: buff/aura/retreat effects
  captureEscapePrevented: boolean;
  heavyRetreatDamageReduction: number;
  coastalNomadDefense: number;
  coastalNomadSpeed: number;
  heavyNavalRamDamage: number;
  slaveHealAmount: number;
  heavyRegenPercent: number;
  terrainSlaveSpeed: number;
  sandstormAuraRadius: number;
  sandstormAuraDebuff: number;
  slaveArmyDamageBonus: number;
  slaveArmyDefensePenalty: number;
  slaveCoercionDamageBonus: number;
  heavyMassStacks: number;
  // Top-level synergy modifiers
  synergyDamageBonus: number;
  synergyDefenseBonus: number;
  poisonStacks: number;
  damageReflection: number;
  aoeDamage: number;
  witheringReduction: number;
}

export interface CombatActionFeedback {
  lastLearnedDomain: { unitId: string; domainId: string } | null;
  hitAndRunRetreat: { unitId: string; to: { q: number; r: number } } | null;
  absorbedDomains: string[];
  resolution: CombatActionResolution;
}

export interface CombatActionResolution {
  triggeredEffects: CombatActionEffect[];
  capturedOnKill: boolean;
  retreatCaptured: boolean;
  poisonApplied: boolean;
  reStealthTriggered: boolean;
  reflectionDamageApplied: number;
  combatHealingApplied: number;
  sandstormTargetsHit: number;
  contaminatedHexApplied: boolean;
  frostbiteApplied: boolean;
  hitAndRunTriggered: boolean;
  healOnRetreatApplied: number;
  totalKnockbackDistance: number;
  pursuitDamageApplied: number;
  // Phase 4: emergent rule resolution
  emergentSustainHealApplied: number;
  emergentSustainMinHpSaved: boolean;
  // Phase 3A/3B/3C: synergy effect resolution
  instantKillTriggered: boolean;
  stunApplied: number;
  formationCrushApplied: number;
  synergyReflectionDamage: number;
  aoeTargetsHit: number;
  heavyRegenApplied: number;
  slaveHealApplied: number;
  captureEscapePrevented: boolean;
  synergyCaptureBonus: number;
}

export interface CombatActionApplyResult {
  state: import('../../game/types.js').GameState;
  feedback: CombatActionFeedback;
}
