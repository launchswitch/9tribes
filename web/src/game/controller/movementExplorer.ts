/**
 * BFS reachable-moves computation extracted from GameSession.
 */

import type { GameState, UnitId } from '../../../../src/game/types.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import { getValidMoves, moveUnit, previewMove } from '../../../../src/systems/movementSystem.js';
import type { ReachableHexView } from '../types/worldView';

export function buildReachableMoves(
  state: GameState,
  unitId: UnitId,
  map: NonNullable<GameState['map']>,
  registry: RulesRegistry,
): ReachableHexView[] {
  const unit = state.units.get(unitId);
  if (!unit || !map) {
    return [];
  }

  type FrontierNode = {
    state: GameState;
    path: Array<{ q: number; r: number }>;
  };

  const start = { q: unit.position.q, r: unit.position.r };
  const frontier: FrontierNode[] = [{ state, path: [start] }];
  const bestRemainingByKey = new Map<string, number>([[`${start.q},${start.r}`, unit.movesRemaining]]);
  const movesByKey = new Map<string, ReachableHexView>();

  while (frontier.length > 0) {
    frontier.sort((left, right) => {
      const leftUnit = left.state.units.get(unitId)!;
      const rightUnit = right.state.units.get(unitId)!;
      return rightUnit.movesRemaining - leftUnit.movesRemaining;
    });

    const current = frontier.shift()!;
    for (const hex of getValidMoves(current.state, unitId, map, registry)) {
      if (current.path.some((step) => step.q === hex.q && step.r === hex.r)) {
        continue;
      }

      const preview = previewMove(current.state, unitId, hex, map, registry);
      if (!preview) {
        continue;
      }

      const nextState = moveUnit(current.state, unitId, hex, map, registry);
      const movedUnit = nextState.units.get(unitId);
      if (!movedUnit) {
        continue;
      }

      const key = `${hex.q},${hex.r}`;
      const path = [...current.path, { q: hex.q, r: hex.r }];
      const candidate: ReachableHexView = {
        key,
        q: hex.q,
        r: hex.r,
        cost: unit.movesRemaining - movedUnit.movesRemaining,
        movesRemainingAfterMove: movedUnit.movesRemaining,
        path,
      };

      const previous = movesByKey.get(key);
      if (
        !previous
        || candidate.movesRemainingAfterMove > previous.movesRemainingAfterMove
        || (
          candidate.movesRemainingAfterMove === previous.movesRemainingAfterMove
          && candidate.path.length < previous.path.length
        )
      ) {
        movesByKey.set(key, candidate);
      }

      const bestRemaining = bestRemainingByKey.get(key) ?? -1;
      if (movedUnit.movesRemaining <= bestRemaining) {
        continue;
      }

      bestRemainingByKey.set(key, movedUnit.movesRemaining);
      frontier.push({ state: nextState, path });
    }
  }

  movesByKey.delete(`${start.q},${start.r}`);
  return [...movesByKey.values()].sort((left, right) => left.cost - right.cost || left.path.length - right.path.length);
}
