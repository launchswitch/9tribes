import { describe, expect, it } from 'vitest';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { GameSession } from '../web/src/game/controller/GameSession';
import { createCuratedPlaytestPayload } from '../web/src/game/fixtures/curatedPlaytest';
import { serializeGameState } from '../web/src/game/types/playState';
import { buildResearchInspectorViewModel } from '../web/src/game/view-model/worldViewModel';
import { assemblePrototype } from '../src/design/assemblePrototype';
import type { GameState } from '../src/game/types';

function trimStateToFactions(state: GameState, factionIds: string[]) {
  const factionSet = new Set(factionIds);
  const unitEntries = Array.from(state.units.entries()).filter(([, unit]) => factionSet.has(unit.factionId));
  const cityEntries = Array.from(state.cities.entries()).filter(([, city]) => factionSet.has(city.factionId));
  const villageEntries = Array.from(state.villages.entries()).filter(([, village]) => factionSet.has(village.factionId));

  state.factions = new Map(
    Array.from(state.factions.entries())
      .filter(([id]) => factionSet.has(id))
      .map(([id, faction]) => [
        id,
        {
          ...faction,
          unitIds: faction.unitIds.filter((unitId) => unitEntries.some(([id]) => id === unitId)),
          cityIds: faction.cityIds.filter((cityId) => cityEntries.some(([id]) => id === cityId)),
          villageIds: faction.villageIds.filter((villageId) => villageEntries.some(([id]) => id === villageId)),
        },
      ]),
  );
  state.units = new Map(unitEntries);
  state.cities = new Map(cityEntries);
  state.villages = new Map(villageEntries);
  state.economy = new Map(Array.from(state.economy.entries()).filter(([id]) => factionSet.has(id)));
  state.research = new Map(Array.from(state.research.entries()).filter(([id]) => factionSet.has(id)));
  state.warExhaustion = new Map(Array.from(state.warExhaustion.entries()).filter(([id]) => factionSet.has(id)));
  state.factionStrategies = new Map(Array.from((state.factionStrategies ?? new Map()).entries()).filter(([id]) => factionSet.has(id)));
  state.fogStates = new Map(Array.from((state.fogStates ?? new Map()).entries()).filter(([id]) => factionSet.has(id)));
}

describe('GameSession', () => {
  it('returns legal moves and applies movement', () => {
    const session = new GameSession({ type: 'fresh', seed: 42 });
    const state = session.getState();
    const activeUnit = Array.from(state.units.values()).find((unit) =>
      unit.factionId === state.activeFactionId && session.getLegalMoves(unit.id).length > 0,
    );

    expect(activeUnit).toBeTruthy();
    const legalMoves = session.getLegalMoves(activeUnit!.id);
    expect(legalMoves.length).toBeGreaterThan(0);

    session.dispatch({
      type: 'move_unit',
      unitId: activeUnit!.id,
      destination: { q: legalMoves[0].q, r: legalMoves[0].r },
    });

    const movedUnit = session.getState().units.get(activeUnit!.id);
    expect(movedUnit?.position).toEqual({ q: legalMoves[0].q, r: legalMoves[0].r });
    expect(session.getEvents()[0]?.message).toContain('moved to');
  });

  it('advances the active faction on end turn', () => {
    const session = new GameSession({ type: 'fresh', seed: 42 });
    const before = session.getState().activeFactionId;

    session.dispatch({ type: 'end_turn' });

    expect(session.getState().activeFactionId).not.toBe(before);
  });

  it('starts a siege in live play when a player surrounds an enemy city and ends the turn', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['steppe_clan', 'hill_clan']);

    const attackerFactionId = 'steppe_clan' as never;
    const defenderFactionId = 'hill_clan' as never;
    const attackerFaction = state.factions.get(attackerFactionId)!;
    const defenderFaction = state.factions.get(defenderFactionId)!;
    const defenderCityId = defenderFaction.cityIds[0];
    const defenderCity = state.cities.get(defenderCityId)!;
    const siegeCenter = { q: 8, r: 6 };

    state.cities.set(defenderCityId, {
      ...defenderCity,
      position: siegeCenter,
      besieged: false,
      turnsUnderSiege: 0,
    });

    const baseUnits = attackerFaction.unitIds.map((unitId) => state.units.get(unitId)!);
    const siegeUnits = [
      {
        ...baseUnits[0],
        position: { q: 9, r: 6 },
        status: 'ready' as const,
        attacksRemaining: 1,
        movesRemaining: baseUnits[0].maxMoves,
      },
      {
        ...baseUnits[1],
        position: { q: 9, r: 5 },
        status: 'ready' as const,
        attacksRemaining: 1,
        movesRemaining: baseUnits[1].maxMoves,
      },
      {
        ...baseUnits[0],
        id: 'live_siege_attacker_3' as never,
        position: { q: 8, r: 5 },
        status: 'ready' as const,
        attacksRemaining: 1,
        movesRemaining: baseUnits[0].maxMoves,
      },
      {
        ...baseUnits[1],
        id: 'live_siege_attacker_4' as never,
        position: { q: 7, r: 6 },
        status: 'ready' as const,
        attacksRemaining: 1,
        movesRemaining: baseUnits[1].maxMoves,
      },
    ];

    state.units = new Map(siegeUnits.map((unit) => [unit.id, unit]));
    state.factions.set(attackerFactionId, {
      ...attackerFaction,
      unitIds: siegeUnits.map((unit) => unit.id),
    });
    state.factions.set(defenderFactionId, {
      ...defenderFaction,
      unitIds: [],
      cityIds: [defenderCityId],
    });
    state.activeFactionId = attackerFactionId;

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [attackerFactionId] },
    );

    expect(session.getState().cities.get(defenderCityId)?.besieged).toBe(false);

    session.dispatch({ type: 'end_turn' });

    const besiegedCity = session.getState().cities.get(defenderCityId);
    expect(session.getState().activeFactionId).toBe(attackerFactionId);
    expect(besiegedCity?.besieged).toBe(true);
    expect(besiegedCity?.turnsUnderSiege).toBe(1);
  });

  it('supports multi-step movement plans in play mode', () => {
    const session = new GameSession({ type: 'serialized', payload: createCuratedPlaytestPayload() });
    const state = session.getState();
    const activeUnit = Array.from(state.units.values()).find((unit) =>
      unit.factionId === state.activeFactionId && session.getLegalMoves(unit.id).some((move) => move.path.length > 2),
    );

    expect(activeUnit).toBeTruthy();
    const farMove = session.getLegalMoves(activeUnit!.id).find((move) => move.path.length > 2);
    expect(farMove).toBeTruthy();

    session.dispatch({
      type: 'move_unit',
      unitId: activeUnit!.id,
      destination: { q: farMove!.q, r: farMove!.r },
    });

    const movedUnit = session.getState().units.get(activeUnit!.id);
    expect(movedUnit?.position).toEqual({ q: farMove!.q, r: farMove!.r });
    expect(movedUnit?.movesRemaining).toBe(farMove!.movesRemainingAfterMove);
  });

  it('does not allow zero-cost cavalry steps to explode reachable range', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });

    // Inject a cavalry unit since no faction starts with cavalry anymore
    const steppeFaction = state.factions.get('steppe_clan' as never)!;
    const cavalryProto = assemblePrototype(
      steppeFaction.id,
      'cavalry_frame' as never,
      ['basic_spear', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: steppeFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(cavalryProto.id, cavalryProto);

    const cavalryId = 'test_cavalry_move' as never;
    const cavalryUnit = {
      id: cavalryId,
      factionId: steppeFaction.id,
      position: { q: 13, r: 10 },
      facing: 0,
      hp: cavalryProto.derivedStats.hp,
      maxHp: cavalryProto.derivedStats.hp,
      movesRemaining: cavalryProto.derivedStats.moves,
      maxMoves: cavalryProto.derivedStats.moves,
      attacksRemaining: 1,
      xp: 0,
      veteranLevel: 'green' as const,
      status: 'ready' as const,
      prototypeId: cavalryProto.id,
      history: [],
      morale: 100,
      routed: false,
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
    };
    state.units.set(cavalryId, cavalryUnit);
    steppeFaction.unitIds.push(cavalryId);
    state.activeFactionId = steppeFaction.id;

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
    );

    const cavalry = session.getState().units.get(cavalryId);
    expect(cavalry).toBeTruthy();
    const legalMoves = session.getLegalMoves(cavalry!.id);

    expect(legalMoves.length).toBeGreaterThan(0);
    expect(legalMoves.every((move) => move.cost >= 1)).toBe(true);
    expect(legalMoves.length).toBeLessThan(80);
  });

  it('keeps selected research active and advances it after ending the turn', () => {
    const session = new GameSession(
      { type: 'serialized', payload: createCuratedPlaytestPayload() },
      loadRulesRegistry(),
      { humanControlledFactionIds: ['steppe_clan'] },
    );

    // Complete hitrun_t1 first (tier 1 is auto-completed in the new system)
    // Then start hitrun_t2 as the active research
    const state = session.getState();
    const research = state.research.get('steppe_clan' as never);
    if (research && !research.completedNodes.includes('hitrun_t1' as never)) {
      research.completedNodes.push('hitrun_t1' as never);
    }

    session.dispatch({ type: 'start_research', nodeId: 'hitrun_t2' });
    session.dispatch({ type: 'end_turn' });

    const finalState = session.getState();
    const finalResearch = finalState.research.get('steppe_clan' as never);
    const inspector = buildResearchInspectorViewModel(finalState, session.getRegistry());

    expect(finalState.activeFactionId).toBe('steppe_clan');
    expect(finalResearch?.activeNodeId).toBe('hitrun_t2');
    expect(finalResearch?.progressByNodeId['hitrun_t2' as never]).toBeGreaterThan(0);
    expect(inspector?.activeNodeName).toBe('Hit & Run Mastery');
  });

  it('applies combat signals during live attacks so mounted factions gain horsemanship', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });

    // Inject a cavalry unit since no faction starts with cavalry anymore
    const steppeFaction = state.factions.get('steppe_clan' as never)!;
    const cavalryProto = assemblePrototype(
      steppeFaction.id,
      'cavalry_frame' as never,
      ['basic_spear', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: steppeFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(cavalryProto.id, cavalryProto);

    const cavalryId = 'test_cavalry_combat' as never;
    const cavalryUnit = {
      id: cavalryId,
      factionId: steppeFaction.id,
      position: { q: 10, r: 10 },
      facing: 0,
      hp: cavalryProto.derivedStats.hp,
      maxHp: cavalryProto.derivedStats.hp,
      movesRemaining: cavalryProto.derivedStats.moves,
      maxMoves: cavalryProto.derivedStats.moves,
      attacksRemaining: 1,
      xp: 0,
      veteranLevel: 'green' as const,
      status: 'ready' as const,
      prototypeId: cavalryProto.id,
      history: [],
      morale: 100,
      routed: false,
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
    };
    state.units.set(cavalryId, cavalryUnit);
    steppeFaction.unitIds.push(cavalryId);

    const attacker = cavalryUnit;
    const defender = Array.from(state.units.values()).find((unit) => unit.factionId === 'druid_circle');

    expect(attacker).toBeTruthy();
    expect(defender).toBeTruthy();

    attacker!.position = { q: 10, r: 10 };
    attacker!.attacksRemaining = 1;
    attacker!.movesRemaining = attacker!.maxMoves;
    attacker!.status = 'ready';
    defender!.position = { q: 11, r: 10 };
    defender!.hp = Math.max(defender!.hp, 1);
    state.activeFactionId = attacker!.factionId;

    const before = state.factions.get(attacker!.factionId)?.capabilities?.domainLevels.charge ?? 0;
    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [attacker!.factionId] },
    );

    session.dispatch({
      type: 'attack_unit',
      attackerId: attacker!.id,
      defenderId: defender!.id,
    });

    // Apply the pending combat to actually trigger combat signals
    const pending = session.getPendingCombat();
    if (pending) {
      session.applyResolvedCombat(pending);
    }

    const after = session.getState().factions.get(attacker!.factionId)?.capabilities?.domainLevels.charge ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it('captures retreating enemies during live combat when slaving t2 is researched', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const attackerFaction = state.factions.get('steppe_clan' as never)!;
    const defenderFaction = state.factions.get('druid_circle' as never)!;
    const attackerId = attackerFaction.unitIds[0];
    const attacker = state.units.get(attackerId)!;
    const cavalryProto = assemblePrototype(
      defenderFaction.id,
      'cavalry_frame' as never,
      ['basic_spear', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: defenderFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(cavalryProto.id, cavalryProto);
    attackerFaction.learnedDomains = [...new Set([...(attackerFaction.learnedDomains ?? []), 'slaving'])];
    state.research.get(attackerFaction.id)!.completedNodes.push('slaving_t1' as never, 'slaving_t2' as never);

    const defenderId = 'test_live_retreat_defender' as never;
    state.units.set(attackerId, {
      ...attacker,
      position: { q: 10, r: 10 },
      attacksRemaining: 1,
      movesRemaining: attacker.maxMoves,
      status: 'ready',
      history: [],
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    });
    state.units.set(defenderId, {
      ...state.units.get(defenderFaction.unitIds[0])!,
      id: defenderId,
      factionId: defenderFaction.id,
      prototypeId: cavalryProto.id,
      position: { q: 11, r: 10 },
      hp: 7,
      maxHp: cavalryProto.derivedStats.hp,
      morale: 100,
      routed: false,
      attacksRemaining: 1,
      movesRemaining: cavalryProto.derivedStats.moves,
      maxMoves: cavalryProto.derivedStats.moves,
      status: 'ready',
      history: [],
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    });
    attackerFaction.unitIds = [attackerId];
    defenderFaction.unitIds = [defenderId];
    state.activeFactionId = attackerFaction.id;
    state.rngState = { seed: 9, state: 9 };

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [attackerFaction.id] },
    );

    session.dispatch({
      type: 'attack_unit',
      attackerId,
      defenderId,
    });

    const pending = session.getPendingCombat();
    expect(pending?.result.defenderFled).toBe(true);
    if (pending) {
      session.applyResolvedCombat(pending);
    }

    const captured = session.getState().units.get(defenderId);
    expect(captured?.factionId).toBe(attackerFaction.id);
    expect(captured?.hp).toBe(Math.max(1, Math.floor(cavalryProto.derivedStats.hp * 0.25)));
  });

  it('applies native charge t3 bonus in live combat without requiring prior movement', () => {
    const registry = loadRulesRegistry();
    const buildSession = (withChargeT3: boolean) => {
      const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
      const attackerFaction = state.factions.get('savannah_lions' as never)!;
      const defender = Array.from(state.units.values()).find((unit) => unit.factionId === 'druid_circle')!;
      const infantryProto = assemblePrototype(
        attackerFaction.id,
        'infantry_frame' as never,
        ['basic_spear', 'simple_armor'] as never,
        registry,
        Array.from(state.prototypes.keys()),
        {
          capabilityLevels: attackerFaction.capabilities?.domainLevels,
          validation: { ignoreResearchRequirements: true },
        },
      );
      state.prototypes.set(infantryProto.id, infantryProto);
      const attackerId = 'test_charge_t3_infantry' as never;

      state.units.set(attackerId, {
        ...state.units.get(attackerFaction.unitIds[0])!,
        id: attackerId,
        factionId: attackerFaction.id,
        prototypeId: infantryProto.id,
        position: { q: 10, r: 10 },
        attacksRemaining: 1,
        movesRemaining: infantryProto.derivedStats.moves,
        maxMoves: infantryProto.derivedStats.moves,
        status: 'ready',
        history: [],
        poisonStacks: 0,
        isStealthed: false,
        turnsSinceStealthBreak: 0,
        learnedAbilities: [],
      });
      state.units.set(defender.id, {
        ...defender,
        position: { q: 11, r: 10 },
        hp: Math.max(defender.hp, 8),
      });
      attackerFaction.unitIds = [attackerId];
      state.activeFactionId = attackerFaction.id;

      if (withChargeT3) {
        attackerFaction.learnedDomains = [...new Set([...(attackerFaction.learnedDomains ?? []), 'charge'])];
        state.research.get(attackerFaction.id)!.completedNodes.push('charge_t1' as never, 'charge_t2' as never, 'charge_t3' as never);
      }

      const session = new GameSession(
        { type: 'serialized', payload: serializeGameState(state) },
        registry,
        { humanControlledFactionIds: [attackerFaction.id] },
      );

      session.dispatch({
        type: 'attack_unit',
        attackerId,
        defenderId: defender.id,
      });

      return session.getPendingCombat();
    };

    const baseline = buildSession(false);
    const transcendent = buildSession(true);

    expect(baseline).toBeTruthy();
    expect(transcendent).toBeTruthy();
    expect(transcendent!.result.situationalAttackModifier).toBeGreaterThan(baseline!.result.situationalAttackModifier);
  });
});
