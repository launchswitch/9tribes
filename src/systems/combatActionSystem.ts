// Combat action system — thin re-export entrypoint
// Logic has been decomposed into ./combat-action/ submodules:
//   types.ts          — interface and type definitions
//   labeling.ts       — effect humanization and combat effect helpers
//   helpers.ts        — pure state-manipulation utilities
//   factionAbsorption.ts — faction absorption after elimination
//   preview.ts        — previewCombatAction (situational modifier resolution)
//   apply.ts          — applyCombatAction (aftermath resolution + side effects)

export type {
  CombatActionEffectCategory,
  CombatActionEffect,
  CombatActionPreview,
  CombatActionPreviewDetails,
  CombatActionFeedback,
  CombatActionResolution,
  CombatActionApplyResult,
} from './combat-action/types.js';

export { previewCombatAction } from './combat-action/preview.js';
export { applyCombatAction } from './combat-action/apply.js';

// Also re-export helpers that are used externally (e.g. by unitActivationSystem)
export { canAttackTarget, getImprovementBonus, removeDeadUnitsFromFactions, writeUnitToState } from './combat-action/helpers.js';
