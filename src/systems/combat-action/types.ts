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
}

export interface CombatActionApplyResult {
  state: import('../../game/types.js').GameState;
  feedback: CombatActionFeedback;
}
