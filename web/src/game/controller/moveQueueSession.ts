/**
 * Move queue helpers extracted from GameSession.
 * These handle multi-turn pathing and queued movement execution.
 */

import type { GameState, UnitId } from '../../../../src/game/types.js';
import type { HexCoord } from '../../../../src/types.js';
import { findPath } from '../../../../src/systems/pathfinder.js';
import { moveUnit, canMoveTo } from '../../../../src/systems/movementSystem.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';

export function clearMoveQueueOnUnit(state: GameState, unitId: UnitId): GameState {
  const unit = state.units.get(unitId);
  if (!unit?.moveQueueDestination) return state;
  const newUnits = new Map(state.units);
  newUnits.set(unitId, { ...unit, moveQueueDestination: undefined });
  return { ...state, units: newUnits };
}

export function clearQueueAndReturn(
  state: GameState,
  unitId: UnitId,
  arrived: boolean,
): { state: GameState; arrived: boolean; blocked: boolean; stoppedByZoC: boolean } {
  const unit = state.units.get(unitId);
  if (!unit?.moveQueueDestination) {
    return { state, arrived, blocked: !arrived, stoppedByZoC: false };
  }
  const newUnits = new Map(state.units);
  newUnits.set(unitId, { ...unit, moveQueueDestination: undefined });
  return { state: { ...state, units: newUnits }, arrived, blocked: !arrived, stoppedByZoC: false };
}

export function executeQueuedMovesForUnit(
  state: GameState,
  registry: RulesRegistry,
  unitId: UnitId,
  destination: HexCoord,
): { state: GameState; arrived: boolean; blocked: boolean; stoppedByZoC: boolean } {
  if (!state.map) return { state, arrived: false, blocked: false, stoppedByZoC: false };

  const unit = state.units.get(unitId);
  if (!unit || unit.movesRemaining <= 0) {
    return { state, arrived: false, blocked: false, stoppedByZoC: false };
  }

  const pathResult = findPath(state, unitId, destination, state.map, registry);
  if (!pathResult || pathResult.path.length < 2) {
    return clearQueueAndReturn(state, unitId, !!pathResult);
  }

  let currentState = state;
  const fullPath = pathResult.path;

  for (let i = 1; i < fullPath.length; i++) {
    const step = fullPath[i];
    const unitBeforeMove = currentState.units.get(unitId);
    if (!unitBeforeMove || unitBeforeMove.movesRemaining <= 0) break;

    if (!canMoveTo(currentState, unitId, step, currentState.map!, registry)) {
      return clearQueueAndReturn(currentState, unitId, false);
    }

    currentState = moveUnit(currentState, unitId, step, currentState.map!, registry);

    const movedUnit = currentState.units.get(unitId);
    if (!movedUnit) {
      return { state: currentState, arrived: false, blocked: true, stoppedByZoC: false };
    }

    if (movedUnit.enteredZoCThisActivation || movedUnit.movesRemaining <= 0) {
      const atDest = movedUnit.position.q === destination.q && movedUnit.position.r === destination.r;
      if (atDest) {
        return clearQueueAndReturn(currentState, unitId, true);
      }
      return { state: currentState, arrived: false, blocked: false, stoppedByZoC: true };
    }
  }

  const finalUnit = currentState.units.get(unitId);
  if (finalUnit && finalUnit.position.q === destination.q && finalUnit.position.r === destination.r) {
    return clearQueueAndReturn(currentState, unitId, true);
  }

  return { state: currentState, arrived: false, blocked: false, stoppedByZoC: false };
}
