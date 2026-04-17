import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import { hexToKey } from '../../core/grid.js';
import type {
  SimulationTrace,
  TurnSnapshot,
  TraceCombatEvent,
  TraceSiegeEvent,
  TraceAiIntentEvent,
  TraceFactionStrategyEvent,
} from './traceTypes.js';

export function createSimulationTrace(recordSnapshots: boolean = false): SimulationTrace {
  return {
    lines: [],
    snapshots: recordSnapshots ? [] : undefined,
    events: [],
    combatEvents: [],
    siegeEvents: [],
    aiIntentEvents: [],
    factionStrategyEvents: [],
    abilityLearnedEvents: [],
    unitSacrificedEvents: [],
    currentRound: 0,
  };
}

export function recordSnapshot(
  state: GameState,
  trace: SimulationTrace | undefined,
  phase: 'start' | 'end'
): void {
  if (!trace?.snapshots) return;

  const factions: TurnSnapshot['factions'] = [];
  for (const [id, faction] of state.factions) {
    const livingUnits = faction.unitIds.filter((uid) => state.units.has(uid as never));
    factions.push({
      id,
      name: faction.name,
      livingUnits: livingUnits.length,
      cities: faction.cityIds.length,
      villages: faction.villageIds.length,
    });
  }

  const units: TurnSnapshot['units'] = [];
  for (const [id, unit] of state.units) {
    if (unit.hp <= 0) continue;
    units.push({
      id,
      factionId: unit.factionId,
      prototypeId: unit.prototypeId,
      q: unit.position.q,
      r: unit.position.r,
      hp: unit.hp,
      maxHp: unit.maxHp,
      facing: unit.facing,
    });
  }

  const cities: TurnSnapshot['cities'] = [];
  for (const [id, city] of state.cities) {
    cities.push({
      id,
      factionId: city.factionId,
      q: city.position.q,
      r: city.position.r,
      besieged: city.besieged,
      wallHP: city.wallHP,
      maxWallHP: city.maxWallHP,
      turnsUnderSiege: city.turnsUnderSiege,
    });
  }

  const villages: TurnSnapshot['villages'] = [];
  for (const [id, village] of state.villages) {
    villages.push({
      id,
      factionId: village.factionId,
      q: village.position.q,
      r: village.position.r,
    });
  }

  const factionTripleStacks: TurnSnapshot['factionTripleStacks'] = [];
  for (const [id, faction] of state.factions) {
    if (faction.activeTripleStack) {
      factionTripleStacks.push({
        factionId: id,
        domains: faction.activeTripleStack.domains,
        tripleName: faction.activeTripleStack.name,
        emergentRule: faction.activeTripleStack.emergentRule.name,
      });
    }
  }

  trace.snapshots.push({ round: state.round, phase, factions, units, cities, villages, factionTripleStacks });
}

export function log(trace: SimulationTrace | undefined, line: string): void {
  trace?.lines.push(line);
  if (trace?.events) {
    trace.events.push({
      round: trace.currentRound ?? 0,
      message: line,
    });
  }
}

export function recordCombatEvent(trace: SimulationTrace | undefined, event: TraceCombatEvent): void {
  trace?.combatEvents?.push(event);
}

export function recordSiegeEvent(trace: SimulationTrace | undefined, event: TraceSiegeEvent): void {
  trace?.siegeEvents?.push(event);
}

export function recordAiIntent(trace: SimulationTrace | undefined, event: TraceAiIntentEvent): void {
  trace?.aiIntentEvents?.push(event);
}

export function recordFactionStrategy(trace: SimulationTrace | undefined, event: TraceFactionStrategyEvent): void {
  trace?.factionStrategyEvents?.push(event);
}

export function maybeRecordEndSnapshot(state: GameState, trace: SimulationTrace | undefined): void {
  if (!trace?.snapshots) return;
  const lastSnapshot = trace.snapshots[trace.snapshots.length - 1];
  if (lastSnapshot?.round === state.round && lastSnapshot.phase === 'end') {
    return;
  }
  recordSnapshot(state, trace, 'end');
}
