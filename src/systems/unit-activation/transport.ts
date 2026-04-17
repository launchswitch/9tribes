import { hexDistance, hexToKey } from '../../core/grid.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { GameState } from '../../game/types.js';
import type { HexCoord, UnitId } from '../../types.js';
import { moveUnit } from '../movementSystem.js';
import { getValidMoves } from '../movementSystem.js';
import {
  disembarkUnit,
  getEmbarkedUnits,
  getValidDisembarkHexes,
  isTransportUnit,
  updateEmbarkedPositions,
} from '../transportSystem.js';
import { log, type SimulationTrace } from '../warEcologySimulation.js';

/**
 * Transport with embarked troops: move toward waypoint, then auto-disembark
 * if near enemy objectives (villages, cities, or units).
 */
export function moveTransportAndDisembark(
  state: GameState,
  transportId: UnitId,
  registry: RulesRegistry,
  waypoint: HexCoord,
  unitIntent: import('../factionStrategy.js').UnitStrategicIntent,
  trace?: SimulationTrace,
): GameState {
  if (!state.map) return autoDisembark(state, transportId, registry, trace);
  const validMoves = getValidMoves(state, transportId, state.map, registry);
  if (validMoves.length === 0) {
    // Can't move — try to disembark anyway if near objectives
    return autoDisembark(state, transportId, registry, trace);
  }

  // Score moves toward waypoint
  let bestMove: HexCoord | null = null;
  let bestScore = -Infinity;
  const originWaypointDistance = hexDistance(
    (state.units.get(transportId) ?? { position: waypoint }).position,
    waypoint
  );

  for (const move of validMoves) {
    const waypointDistance = hexDistance(move, waypoint);
    let score = (originWaypointDistance - waypointDistance) * 8;
    // Prefer coast near enemy objectives
    const terrainId = state.map?.tiles.get(hexToKey(move))?.terrain ?? '';
    if (terrainId === 'coast' || terrainId === 'river') score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  if (!bestMove || bestScore <= 0) {
    return autoDisembark(state, transportId, registry, trace);
  }

  const moved = moveUnit(state, transportId, bestMove, state.map!, registry);
  // Update embarked positions after transport moves
  const updated = updateEmbarkedPositions(moved, transportId, bestMove, moved.transportMap);
  log(trace, `transport ${transportId} moved to ${hexToKey(bestMove)} with embarked troops`);

  // After moving, check if we should disembark
  return autoDisembark(updated, transportId, registry, trace);
}

/**
 * Auto-disembark embarked units if transport is near enemy objectives.
 */
export function autoDisembark(
  state: GameState,
  transportId: UnitId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
): GameState {
  const transport = state.units.get(transportId);
  if (!transport) return state;

  const factionId = transport.factionId;
  const embarked = getEmbarkedUnits(transportId, state.transportMap);
  if (embarked.length === 0) return state;

  // Check if there's an enemy village, city, or unit nearby worth disembarking for
  let nearObjective = false;
  for (const [, village] of state.villages) {
    if (village.factionId === factionId) continue;
    if (hexDistance(transport.position, village.position) <= 2) {
      nearObjective = true;
      break;
    }
  }
  if (!nearObjective) {
    for (const [, city] of state.cities) {
      if (city.factionId === factionId) continue;
      if (hexDistance(transport.position, city.position) <= 3) {
        nearObjective = true;
        break;
      }
    }
  }
  if (!nearObjective) {
    for (const [, enemy] of state.units) {
      if (enemy.factionId === factionId || enemy.hp <= 0) continue;
      if (hexDistance(transport.position, enemy.position) <= 2) {
        nearObjective = true;
        break;
      }
    }
  }

  if (!nearObjective) return state;

  // Disembark all embarked units
  const disembarkHexes = getValidDisembarkHexes(state, transportId, registry, state.transportMap);
  if (disembarkHexes.length === 0) return state;

  let current = state;
  let currentTransportMap = new Map(state.transportMap);

  for (const embarkedId of embarked) {
    if (disembarkHexes.length === 0) break;
    // Pick the hex closest to nearest enemy objective
    let bestHex = disembarkHexes[0];
    let bestDist = Infinity;
    for (const hex of disembarkHexes) {
      let minDist = Infinity;
      for (const [, village] of current.villages) {
        if (village.factionId === factionId) continue;
        minDist = Math.min(minDist, hexDistance(hex, village.position));
      }
      for (const [, city] of current.cities) {
        if (city.factionId === factionId) continue;
        minDist = Math.min(minDist, hexDistance(hex, city.position));
      }
      if (minDist < bestDist) {
        bestDist = minDist;
        bestHex = hex;
      }
    }

    const result = disembarkUnit(current, transportId, embarkedId, bestHex, registry, currentTransportMap);
    current = result.state;
    currentTransportMap = result.transportMap;
    // Remove used hex from options
    disembarkHexes.splice(disembarkHexes.indexOf(bestHex), 1);
    log(trace, `${factionId} disembarked unit ${embarkedId} at ${hexToKey(bestHex)}`);
  }

  return current;
}
