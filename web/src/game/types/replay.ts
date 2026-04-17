export type {
  ReplayBundle,
  ReplayMap,
  ReplayMapHex,
  ReplayFactionSummary,
  ReplayTurn,
  ReplayTurnSnapshot,
  ReplayTurnFactionState,
  ReplayTurnUnit,
  ReplayTurnCity,
  ReplayTurnVillage,
  ReplayTripleStack,
  ReplayEvent,
  ReplayCombatEvent,
  ReplayCombatBreakdown,
  ReplayCombatUnitBreakdown,
  ReplayCombatModifiers,
  ReplayCombatMoraleBreakdown,
  ReplayCombatOutcomeBreakdown,
  ReplayCombatEffect,
  ReplaySiegeEvent,
  ReplayAiIntentEvent,
  ReplayFactionStrategyEvent,
  ReplayVictory,
} from '../../../../src/replay/types.js';

// Backward-compatible aliases for legacy web-side names.
export type ReplayHex = import('../../../../src/replay/types.js').ReplayMapHex;
export type ReplaySnapshot = import('../../../../src/replay/types.js').ReplayTurnSnapshot;
export type ReplayFactionState = import('../../../../src/replay/types.js').ReplayTurnFactionState;
export type ReplayUnit = import('../../../../src/replay/types.js').ReplayTurnUnit;
export type ReplayCity = import('../../../../src/replay/types.js').ReplayTurnCity;
export type ReplayVillage = import('../../../../src/replay/types.js').ReplayTurnVillage;
