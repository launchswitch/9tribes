// Unit activation system — thin re-export entrypoint
// Logic has been decomposed into ./unit-activation/ submodules:
//   types.ts          — interface and type definitions
//   helpers.ts        — pure state-manipulation and formatting utilities
//   fieldFort.ts      — field fort construction, brace, hill-dug-in logic
//   targeting.ts      — melee and ranged target selection (findBestTargetChoice, findBestRangedTarget)
//   transport.ts      — transport movement and auto-disembark AI
//   movement.ts       — strategic movement, fallback intent, waypoint resolution
//   activateUnit.ts   — activateUnit, activateAiUnit, maybeExpirePreparedAbility

export type {
  UnitActivationCombatMode,
  UnitActivationOptions,
  UnitActivationResult,
} from './unit-activation/types.js';

export { activateUnit, activateAiUnit, maybeExpirePreparedAbility } from './unit-activation/activateUnit.js';
