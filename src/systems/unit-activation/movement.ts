import { hexDistance } from '../../core/grid.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { GameState, Unit } from '../../game/types.js';
import type { HexCoord, UnitId } from '../../types.js';
import { getTerrainAt as getAbilityTerrainAt } from '../abilitySystem.js';
import { getNearbySupportScore, getNearestFriendlyCity, getUnitIntent, scoreStrategicTerrain } from '../strategicAi.js';
import { scoreMoveCandidate } from '../aiTactics.js';
import { getHexVisibility } from '../fogSystem.js';
import { moveUnit, getValidMoves } from '../movementSystem.js';
import {
  boardTransport,
  canBoardTransport,
  getEmbarkedUnits,
  isTransportUnit,
  isUnitEmbarked,
} from '../transportSystem.js';
import {
  log,
  recordAiIntent,
  type SimulationTrace,
} from '../warEcologySimulation.js';
import type { UnitStrategicIntent } from '../factionStrategy.js';

import { getTerrainAt, isFortificationHex } from './helpers.js';
import { moveTransportAndDisembark } from './transport.js';
import { mapAssignmentToIntent } from './helpers.js';

export function buildFallbackIntent(state: GameState, unit: Unit): UnitStrategicIntent {
  const city = getNearestFriendlyCity(state, unit.factionId, unit.position);
  const strategy = state.factionStrategies.get(unit.factionId);
  const posture = strategy?.posture;

  // During exploration/offensive posture, fall forward toward map center
  // instead of retreating to a friendly city
  if ((posture === 'exploration' || posture === 'offensive') && state.map) {
    const centerQ = Math.floor(state.map.width / 2);
    const centerR = Math.floor(state.map.height / 2);
    return {
      assignment: 'raider',
      waypointKind: 'front_anchor',
      waypoint: { q: centerQ, r: centerR },
      anchor: city?.position ?? unit.position,
      isolationScore: 0,
      isolated: false,
      reason: 'fallback movement toward map center to search for enemies',
    };
  }

  const waypoint = city?.position ?? unit.position;
  return {
    assignment: 'reserve',
    waypointKind: 'friendly_city',
    waypoint,
    anchor: waypoint,
    isolationScore: 0,
    isolated: false,
    reason: 'fallback movement toward the nearest friendly city',
  };
}

export function resolveWaypoint(state: GameState, unit: Unit, intent: UnitStrategicIntent): HexCoord {
  if (intent.objectiveUnitId) {
    const liveTarget = state.units.get(intent.objectiveUnitId);
    if (liveTarget && liveTarget.hp > 0) {
      return liveTarget.position;
    }
  }
  if (intent.objectiveCityId) {
    const city = state.cities.get(intent.objectiveCityId);
    if (city) {
      return city.position;
    }
  }
  return intent.waypoint;
}

export function wouldBeUnsafeAfterMove(
  state: GameState,
  unit: Unit,
  move: HexCoord,
  intent: UnitStrategicIntent
): boolean {
  let nearestFriendly = Infinity;
  let nearbyEnemies = 0;
  for (const other of state.units.values()) {
    if (other.id === unit.id || other.hp <= 0) continue;
    const dist = hexDistance(move, other.position);
    if (other.factionId === unit.factionId) {
      nearestFriendly = Math.min(nearestFriendly, dist);
    } else if (dist <= 2) {
      nearbyEnemies += 1;
    }
  }
  return nearestFriendly > 3 && hexDistance(move, intent.anchor) > 4 && nearbyEnemies > 0;
}

export function performStrategicMovement(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const unit = state.units.get(unitId);
  if (!unit || unit.hp <= 0 || !state.map) {
    return state;
  }

  const faction = state.factions.get(unit.factionId);
  const prototype = state.prototypes.get(unit.prototypeId);
  const strategy = state.factionStrategies.get(unit.factionId);
  if (!faction || !prototype) {
    return state;
  }

  // Skip embarked units — they move with their transport
  if (isUnitEmbarked(unitId, state.transportMap)) {
    return state;
  }

  const unitIntent = getUnitIntent(strategy, unitId) ?? buildFallbackIntent(state, unit);
  const waypoint = resolveWaypoint(state, unit, unitIntent);

  // Transport units with embarked troops: move toward waypoint, then auto-disembark
  if (isTransportUnit(prototype, registry)) {
    const embarked = getEmbarkedUnits(unitId, state.transportMap);
    if (embarked.length > 0) {
      return moveTransportAndDisembark(state, unitId, registry, waypoint, unitIntent, trace);
    }
  }

  const validMoves = getValidMoves(state, unitId, state.map, registry);

  // Pirate Lords: score boarding a transport as a move option alongside regular moves
  const isGreedyInfantry = faction.identityProfile.passiveTrait === 'greedy'
    && !isTransportUnit(prototype, registry)
    && !isUnitEmbarked(unitId, state.transportMap);

  let bestBoardTransportId: UnitId | null = null;
  let bestBoardScore = -Infinity;

  if (isGreedyInfantry) {
    for (const [, candidate] of state.units) {
      if (candidate.factionId !== unit.factionId) continue;
      if (candidate.hp <= 0) continue;
      if (hexDistance(unit.position, candidate.position) !== 1) continue;

      const candidatePrototype = state.prototypes.get(candidate.prototypeId);
      if (!candidatePrototype) continue;
      const chassis = registry.getChassis(candidatePrototype.chassisId);
      if (!chassis?.tags?.includes('transport')) continue;

      if (canBoardTransport(state, unitId, candidate.id, registry, state.transportMap)) {
        // Score boarding: how much closer would the transport get us to the waypoint?
        const transportToWaypoint = hexDistance(candidate.position, waypoint);
        const selfToWaypoint = hexDistance(unit.position, waypoint);
        // Board if transport is closer to waypoint, or if we have no good moves
        let boardScore = (selfToWaypoint - transportToWaypoint) * 6;
        // Bonus for offensive posture — prioritize raiding
        if (unitIntent.assignment === 'raider' || unitIntent.assignment === 'siege_force') {
          boardScore += 4;
        }
        if (boardScore > bestBoardScore) {
          bestBoardScore = boardScore;
          bestBoardTransportId = candidate.id;
        }
      }
    }
  }

  if (validMoves.length === 0) {
    // No regular moves — board transport if available
    if (bestBoardTransportId) {
      const result = boardTransport(state, unitId, bestBoardTransportId, state.transportMap);
      log(trace, `${faction.name} infantry boarded transport (no moves)`);
      return { ...result.state, transportMap: result.transportMap };
    }
    return state;
  }

  const originSupport = getNearbySupportScore(state, unit.factionId, unit.position);
  const originAnchorDistance = hexDistance(unit.position, unitIntent.anchor);
  let bestMove: HexCoord | null = null;
  let bestScore = -Infinity;
  let bestTargetCityId = unitIntent.objectiveCityId;
  let bestTargetUnitId = unitIntent.objectiveUnitId;

  // For defender units: compute distance to threatened city for engagement scoring
  const threatenedCity = unitIntent.threatenedCityId
    ? state.cities.get(unitIntent.threatenedCityId)
    : undefined;
  const threatenedCityPosition = threatenedCity?.position;
  for (const move of validMoves) {
    const waypointDistance = hexDistance(move, waypoint);
    const originWaypointDistance = hexDistance(unit.position, waypoint);
    const supportScore = getNearbySupportScore(state, unit.factionId, move);
    let terrainScore = scoreStrategicTerrain(state, unit.factionId, move);
    const anchorDistance = hexDistance(move, unitIntent.anchor);
    const nearestCity = getNearestFriendlyCity(state, unit.factionId, move);
    const cityDistance = nearestCity ? hexDistance(move, nearestCity.position) : 99;
    const moveVisibility = getHexVisibility(state, unit.factionId, move);
    if (isFortificationHex(state, move)) {
      const isDefensiveAssignment =
        unitIntent.assignment === 'defender'
        || unitIntent.assignment === 'recovery'
        || unitIntent.assignment === 'reserve';
      terrainScore += isDefensiveAssignment ? 8 : 4;
    }
    const score = scoreMoveCandidate({
      assignment: unitIntent.assignment,
      originWaypointDistance,
      waypointDistance,
      terrainScore,
      supportScore,
      originSupport,
      originAnchorDistance,
      anchorDistance,
      cityDistance,
      hiddenExplorationBonus: moveVisibility === 'hidden' && !['siege_force', 'main_army', 'raider'].includes(unitIntent.assignment),
      unsafeAfterMove: wouldBeUnsafeAfterMove(state, unit, move, unitIntent),
      // For defender units: encourage moving toward the threatened city
      threatenedCityDistance: threatenedCityPosition
        ? hexDistance(move, threatenedCityPosition)
        : undefined,
    });

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  // Compare best regular move against boarding
  if (bestBoardTransportId && bestBoardScore > bestScore) {
    const result = boardTransport(state, unitId, bestBoardTransportId, state.transportMap);
    log(trace, `${faction.name} infantry boarded transport (scored ${bestBoardScore.toFixed(1)} vs move ${bestScore.toFixed(1)})`);
    return { ...result.state, transportMap: result.transportMap };
  }

  if (!bestMove || bestScore <= 0) {
    return state;
  }

  const moved = moveUnit(state, unitId, bestMove, state.map, registry);
  recordAiIntent(trace, {
    round: moved.round,
    factionId: moved.units.get(unitId)?.factionId ?? unit.factionId,
    unitId,
    intent: mapAssignmentToIntent(unitIntent),
    from: unit.position,
    to: bestMove,
    reason: unitIntent.reason,
    targetUnitId: bestTargetUnitId,
    targetCityId: bestTargetCityId,
  });
  return moved;
}
