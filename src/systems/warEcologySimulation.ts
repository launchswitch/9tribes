import { activateUnit } from './unitActivationSystem.js';
import {
  buildActivationQueue,
  nextUnitActivation,
  resetAllUnitsForRound,
} from './turnSystem.js';
import { resetCombatRecordStreaks } from './historySystem.js';
import {
  applyDecay,
} from './warExhaustionSystem.js';
import type { GameState } from '../game/types.js';
import type { FactionId } from '../types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { DifficultyLevel } from './aiDifficulty.js';

// Re-export from submodules for backward compatibility
export type { SimulationTrace, TurnSnapshot, VictoryType, VictoryStatus } from './simulation/traceTypes.js';
export type {
  TraceLogEvent,
  TraceCombatEvent,
  TraceCombatBreakdown,
  TraceCombatUnitBreakdown,
  TraceCombatModifiers,
  TraceCombatMoraleBreakdown,
  TraceCombatOutcomeBreakdown,
  TraceCombatEffect,
  TraceSiegeEvent,
  TraceAiIntentEvent,
  TraceFactionStrategyEvent,
  TraceAbilityLearnedEvent,
  TraceUnitSacrificedEvent,
} from './simulation/traceTypes.js';
export { createSimulationTrace, log, recordCombatEvent, recordAiIntent } from './simulation/traceRecorder.js';
export { getVictoryStatus, isFactionEliminated } from './simulation/victory.js';
export { getAliveFactions } from './simulation/victory.js';
export { processFactionPhases } from './simulation/factionTurnEffects.js';
export { summarizeFaction } from './simulation/summarizeFaction.js';
export { occupiesFriendlySettlement } from './simulation/environmentalEffects.js';
export { getSynergyEngine, calculateSynergyAttackBonus, calculateSynergyDefenseBonus } from './synergyRuntime.js';

import { recordSnapshot, maybeRecordEndSnapshot } from './simulation/traceRecorder.js';
import { getVictoryStatus, getAliveFactions } from './simulation/victory.js';
import { processFactionPhases } from './simulation/factionTurnEffects.js';


export function runWarEcologySimulation(
  initialState: GameState,
  registry: RulesRegistry,
  maxTurns: number,
  trace?: import('./simulation/traceTypes.js').SimulationTrace,
  difficulty?: DifficultyLevel,
): GameState {
  let current = { ...initialState };
  let roundsCompleted = 0;

  while (roundsCompleted < maxTurns && getAliveFactions(current).size > 1) {
    const roundStartVictory = getVictoryStatus(current);
    if (roundStartVictory.victoryType !== 'unresolved') {
      return current;
    }

    if (trace) {
      trace.currentRound = current.round;
    }

    current = resetAllUnitsForRound(current);
    recordSnapshot(current, trace, 'start');

    for (const factionId of current.factions.keys()) {
      if (!getAliveFactions(current).has(factionId)) {
        continue;
      }
      current = processFactionPhases(current, factionId, registry, trace, difficulty);
      const phaseVictory = getVictoryStatus(current);
      if (phaseVictory.victoryType !== 'unresolved') {
        maybeRecordEndSnapshot(current, trace);
        return current;
      }
    }

    if (getVictoryStatus(current).victoryType !== 'unresolved') {
      maybeRecordEndSnapshot(current, trace);
      break;
    }

    const activation = buildActivationQueue(current);
    const fortsBuiltThisRound = new Set<FactionId>();

    while (true) {
      const nextActivation = nextUnitActivation(current, activation);
      if (!nextActivation) {
        break;
      }

      current = activateUnit(
        current,
        nextActivation.unitId,
        registry,
        {
          trace,
          fortsBuiltThisRound,
          combatMode: 'apply',
        },
      ).state;

      if (getVictoryStatus(current).victoryType !== 'unresolved') {
        maybeRecordEndSnapshot(current, trace);
        return current;
      }
    }

    for (const factionId of current.factions.keys()) {
      current = resetCombatRecordStreaks(current, factionId);
      const we = current.warExhaustion.get(factionId);
      if (!we) {
        continue;
      }

      const decayedWE = applyDecay(we, {
        noLossTurns: we.turnsWithoutLoss,
        territoryClear: false,
      });
      const weMap = new Map(current.warExhaustion);
      weMap.set(factionId, decayedWE);
      current = { ...current, warExhaustion: weMap };
    }

    maybeRecordEndSnapshot(current, trace);

    current = {
      ...current,
      round: current.round + 1,
    };
    if (trace) {
      trace.currentRound = current.round;
    }
    roundsCompleted += 1;
  }

  return current;
}
