import type { GameState } from '../../game/types.js';
import type { CombatActionPreview } from '../combat-action/types.js';
import type { FactionId } from '../../types.js';
import type { SimulationTrace, TraceAiIntentEvent, TraceCombatEffect } from '../warEcologySimulation.js';

export type UnitActivationCombatMode = 'apply' | 'preview';

export interface UnitActivationOptions {
  trace?: SimulationTrace;
  fortsBuiltThisRound?: Set<FactionId>;
  combatMode?: UnitActivationCombatMode;
}

export interface UnitActivationResult {
  state: GameState;
  pendingCombat: CombatActionPreview | null;
}

export type { SimulationTrace, TraceAiIntentEvent, TraceCombatEffect };
