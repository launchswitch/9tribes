import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { exportReplayBundle } from '../src/replay/exportReplay';
import { createSimulationTrace, getVictoryStatus, runWarEcologySimulation } from '../src/systems/warEcologySimulation';

const registry = loadRulesRegistry();

function keepOnlyUnits(state: ReturnType<typeof buildMvpScenario>, keptUnitIds: string[]) {
  const keep = new Set(keptUnitIds);
  state.units = new Map(Array.from(state.units.entries()).filter(([unitId]) => keep.has(unitId)));
  for (const faction of state.factions.values()) {
    faction.unitIds = faction.unitIds.filter((unitId) => keep.has(unitId));
  }
}

describe('replay export', () => {
  it('exports structured combat events when a battle occurs', () => {
    const state = buildMvpScenario(42);
    const jungleId = 'jungle_clan' as never;
    const steppeId = 'steppe_clan' as never;
    const jungleUnitId = state.factions.get(jungleId)!.unitIds[0];
    const steppeUnitId = state.factions.get(steppeId)!.unitIds[0];

    state.units.set(jungleUnitId, {
      ...state.units.get(jungleUnitId)!,
      position: { q: 10, r: 10 },
    });
    state.units.set(steppeUnitId, {
      ...state.units.get(steppeUnitId)!,
      position: { q: 11, r: 10 },
    });

    const trace = createSimulationTrace(true);
    const finalState = runWarEcologySimulation(state, registry, 1, trace);
    const replay = exportReplayBundle(finalState, trace, 1);

    expect(replay.version).toBe(3);
    expect(replay.turns[0]?.combatEvents.length).toBeGreaterThan(0);
    expect(replay.turns[0]?.snapshotStart.phase).toBe('start');
    expect(replay.turns[0]?.snapshotEnd.phase).toBe('end');
    expect(replay.turns[0]?.combatEvents[0]?.summary).toBeTruthy();
    expect(replay.turns[0]?.combatEvents[0]?.breakdown.triggeredEffects).toBeDefined();
  });

  it('exports siege wall HP changes and victory details', () => {
    const state = buildMvpScenario(42);
    const targetCityId = Array.from(state.cities.keys())[0];
    const targetCity = state.cities.get(targetCityId)!;
    const attackerFactionId = Array.from(state.factions.keys()).find((factionId) => factionId !== targetCity.factionId)!;
    const secondEnemyFactionId = Array.from(state.factions.keys()).find(
      (factionId) => factionId !== targetCity.factionId && factionId !== attackerFactionId
    )!;
    const attackerUnits = [
      ...state.factions.get(attackerFactionId)!.unitIds.slice(0, 2),
      state.factions.get(secondEnemyFactionId)!.unitIds[0],
    ];
    state.cities.set(targetCityId, {
      ...targetCity,
      besieged: true,
      wallHP: 100,
      turnsUnderSiege: 2,
    });
    state.units.set(attackerUnits[0], {
      ...state.units.get(attackerUnits[0])!,
      position: { q: targetCity.position.q + 1, r: targetCity.position.r },
    });
    state.units.set(attackerUnits[1], {
      ...state.units.get(attackerUnits[1])!,
      position: { q: targetCity.position.q, r: targetCity.position.r + 1 },
    });
    state.units.set(attackerUnits[2], {
      ...state.units.get(attackerUnits[2])!,
      position: { q: targetCity.position.q - 1, r: targetCity.position.r + 1 },
    });

    const trace = createSimulationTrace(true);
    const finalState = runWarEcologySimulation(state, registry, 1, trace);
    const replay = exportReplayBundle(finalState, trace, 1);
    const firstTurn = replay.turns[0];
    const endCity = firstTurn.snapshotEnd.cities.find((city) => city.id === targetCityId);

    expect(firstTurn.siegeEvents.some((event) => event.eventType === 'wall_damaged')).toBe(true);
    expect(endCity?.wallHp).toBeLessThan(100);
    expect(replay.victory).toEqual({
      winnerFactionId: getVictoryStatus(finalState).winnerFactionId,
      victoryType: getVictoryStatus(finalState).victoryType,
      controlledCities: getVictoryStatus(finalState).controlledCities,
      dominationThreshold: getVictoryStatus(finalState).dominationThreshold,
    });
  });

  it('exports positional and special combat modifiers into the war log breakdown', () => {
    const state = buildMvpScenario(42);
    const steppeId = 'steppe_clan' as never;
    const jungleId = 'jungle_clan' as never;
    const attackerId = state.factions.get(steppeId)!.unitIds[0];
    const flankerId = state.factions.get(steppeId)!.unitIds[1];
    const defenderId = state.factions.get(jungleId)!.unitIds[0];

    keepOnlyUnits(state, [attackerId, flankerId, defenderId]);

    const attacker = state.units.get(attackerId)!;
    const flanker = state.units.get(flankerId)!;
    const defender = state.units.get(defenderId)!;

    state.units.set(attackerId, {
      ...attacker,
      position: { q: 5, r: 5 },
      movesRemaining: Math.max(0, attacker.maxMoves - 1),
      preparedAbility: 'ambush',
      preparedAbilityExpiresOnRound: state.round,
      isStealthed: true,
    });
    state.units.set(flankerId, {
      ...flanker,
      position: { q: 6, r: 4 },
      hp: 20,
      maxHp: 20,
    });
    state.units.set(defenderId, {
      ...defender,
      position: { q: 6, r: 5 },
      facing: 0,
      attacksRemaining: 0,
      preparedAbility: 'brace',
      preparedAbilityExpiresOnRound: state.round,
    });

    const trace = createSimulationTrace(true);
    const finalState = runWarEcologySimulation(state, registry, 1, trace);
    const replay = exportReplayBundle(finalState, trace, 1);
    const combatEvent = replay.turns
      .flatMap((turn) => turn.combatEvents)
      .find((event) => event.attackerUnitId === attackerId && event.defenderUnitId === defenderId);

    expect(combatEvent).toBeDefined();
    expect(combatEvent?.breakdown.modifiers.flankingBonus).toBeGreaterThan(0);
    expect(combatEvent?.breakdown.modifiers.stealthAmbushBonus).toBe(0.5);
    expect(combatEvent?.breakdown.morale.defenderLoss).toBeGreaterThan(0);
    expect(combatEvent?.breakdown.triggeredEffects.some((effect) => effect.label === 'Flanking')).toBe(true);
    expect(combatEvent?.breakdown.triggeredEffects.some((effect) => effect.label === 'Stealth Ambush')).toBe(true);
    expect(combatEvent?.summary.length).toBeGreaterThan(0);
  });
});
