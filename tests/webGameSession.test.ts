import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { GameSession } from '../web/src/game/controller/GameSession';
import { createCuratedPlaytestPayload } from '../web/src/game/fixtures/curatedPlaytest';
import { deserializeGameState, serializeGameState } from '../web/src/game/types/playState';
import { buildResearchInspectorViewModel } from '../web/src/game/view-model/worldViewModel';
import { assemblePrototype } from '../src/design/assemblePrototype';
import type { GameState } from '../src/game/types';
import { computeFactionStrategy } from '../src/systems/strategicAi';
import { activateAiUnit, type UnitActivationCombatMode } from '../src/systems/unitActivationSystem';

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

function cloneState(state: GameState): GameState {
  return deserializeGameState(serializeGameState(state));
}

function primeAiStrategy(state: GameState, factionId: string) {
  const strategy = computeFactionStrategy(state, factionId as never, loadRulesRegistry());
  const strategies = new Map(state.factionStrategies ?? new Map());
  strategies.set(factionId as never, strategy);
  state.factionStrategies = strategies;
  return strategy;
}

function runSharedAiActivation(
  state: GameState,
  registry: ReturnType<typeof loadRulesRegistry>,
  factionId: string,
  unitId: string,
  combatMode: UnitActivationCombatMode = 'apply',
) {
  const shared = cloneState(state);
  const strategy = computeFactionStrategy(shared, factionId as never, registry);
  const strategies = new Map(shared.factionStrategies ?? new Map());
  strategies.set(factionId as never, strategy);
  shared.factionStrategies = strategies;
  return {
    strategy,
    ...activateAiUnit(shared, unitId as never, registry, { combatMode }),
  };
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

  it('captures killed enemies during live combat when the attacker has capture gear', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['coral_people', 'druid_circle']);

    const attackerFaction = state.factions.get('coral_people' as never)!;
    const defenderFaction = state.factions.get('druid_circle' as never)!;
    const slaverProto = assemblePrototype(
      attackerFaction.id,
      'infantry_frame' as never,
      ['slaver_net', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(slaverProto.id, slaverProto);

    const attackerId = 'test_live_kill_capture_attacker' as never;
    const defenderId = defenderFaction.unitIds[0];
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderBase = state.units.get(defenderId as never)!;

    state.units = new Map([
      [
        attackerId,
        {
          ...attackerBase,
          id: attackerId,
          factionId: attackerFaction.id,
          prototypeId: slaverProto.id,
          position: { q: 10, r: 10 },
          hp: slaverProto.derivedStats.hp,
          maxHp: slaverProto.derivedStats.hp,
          movesRemaining: slaverProto.derivedStats.moves,
          maxMoves: slaverProto.derivedStats.moves,
          attacksRemaining: 1,
          status: 'ready' as const,
          history: [],
          poisonStacks: 0,
          isStealthed: false,
          turnsSinceStealthBreak: 0,
          learnedAbilities: [],
        },
      ],
      [
        defenderId,
        {
          ...defenderBase,
          position: { q: 11, r: 10 },
          hp: 3,
          morale: 60,
          routed: false,
          attacksRemaining: 1,
          movesRemaining: defenderBase.maxMoves,
          maxMoves: defenderBase.maxMoves,
          status: 'ready' as const,
          history: [],
          poisonStacks: 0,
          isStealthed: false,
          turnsSinceStealthBreak: 0,
          learnedAbilities: [],
        },
      ],
    ]);
    state.factions.set(attackerFaction.id, {
      ...attackerFaction,
      unitIds: [attackerId],
      cityIds: [],
      villageIds: [],
    });
    state.factions.set(defenderFaction.id, {
      ...defenderFaction,
      unitIds: [defenderId],
      cityIds: [],
      villageIds: [],
    });
    state.cities = new Map();
    state.villages = new Map();
    state.improvements = new Map();
    state.activeFactionId = attackerFaction.id;
    state.rngState = { seed: 3, state: 3 };

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
    expect(pending?.result.defenderDestroyed).toBe(true);
    if (pending) {
      session.applyResolvedCombat(pending);
    }

    const captured = session.getState().units.get(defenderId as never);
    expect(captured?.factionId).toBe(attackerFaction.id);
    expect(captured?.hp).toBe(Math.max(1, Math.floor(defenderBase.maxHp * 0.5)));
  });

  it('lets a player brace, then applies the brace combat bonus and clears the stance', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['steppe_clan', 'druid_circle']);

    const attackerFaction = state.factions.get('steppe_clan' as never)!;
    const defenderFaction = state.factions.get('druid_circle' as never)!;
    const attackerId = attackerFaction.unitIds[0];
    const defenderId = defenderFaction.unitIds[0];

    state.units.set(attackerId as never, {
      ...state.units.get(attackerId as never)!,
      position: { q: 10, r: 10 },
      attacksRemaining: 1,
      movesRemaining: state.units.get(attackerId as never)!.maxMoves,
      status: 'ready',
      history: [],
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    });
    state.units.set(defenderId as never, {
      ...state.units.get(defenderId as never)!,
      position: { q: 11, r: 10 },
      attacksRemaining: 1,
      movesRemaining: state.units.get(defenderId as never)!.maxMoves,
      status: 'ready',
      history: [],
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    });
    state.factions.set(attackerFaction.id, { ...attackerFaction, unitIds: [attackerId] });
    state.factions.set(defenderFaction.id, { ...defenderFaction, unitIds: [defenderId] });
    state.activeFactionId = defenderFaction.id;

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [attackerFaction.id, defenderFaction.id] },
    );

    session.dispatch({ type: 'prepare_ability', unitId: defenderId, ability: 'brace' });
    expect(session.getState().units.get(defenderId as never)?.preparedAbility).toBe('brace');

    session.dispatch({ type: 'end_turn' });
    session.dispatch({ type: 'attack_unit', attackerId, defenderId });

    const pending = session.getPendingCombat();
    expect(pending?.result.braceDefenseBonus).toBeGreaterThan(0);
    if (pending) {
      session.applyResolvedCombat(pending);
    }

    const postCombatDefender = session.getState().units.get(defenderId as never);
    expect(postCombatDefender?.preparedAbility).toBeUndefined();
  });

  it('lets a player prepare an ambush, attack from it, and clears the prep afterwards', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['steppe_clan', 'druid_circle']);

    const attackerFaction = state.factions.get('steppe_clan' as never)!;
    const defenderFaction = state.factions.get('druid_circle' as never)!;
    const rangedProto = assemblePrototype(
      attackerFaction.id,
      'ranged_frame' as never,
      ['basic_bow', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(rangedProto.id, rangedProto);

    const attackerId = 'test_live_ambush_attacker' as never;
    const defenderId = defenderFaction.unitIds[0];
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;

    state.map!.tiles.get('10,10')!.terrain = 'forest';
    state.units.set(attackerId, {
      ...attackerBase,
      id: attackerId,
      factionId: attackerFaction.id,
      prototypeId: rangedProto.id,
      position: { q: 10, r: 10 },
      attacksRemaining: 1,
      movesRemaining: rangedProto.derivedStats.moves,
      maxMoves: rangedProto.derivedStats.moves,
      status: 'ready',
      history: [],
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    });
    state.units.set(defenderId as never, {
      ...state.units.get(defenderId as never)!,
      position: { q: 12, r: 10 },
      hp: Math.max(8, state.units.get(defenderId as never)!.hp),
      attacksRemaining: 1,
      movesRemaining: state.units.get(defenderId as never)!.maxMoves,
      status: 'ready',
      history: [],
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    });
    state.factions.set(attackerFaction.id, { ...attackerFaction, unitIds: [attackerId] });
    state.factions.set(defenderFaction.id, { ...defenderFaction, unitIds: [defenderId] });
    state.activeFactionId = attackerFaction.id;

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [attackerFaction.id, defenderFaction.id] },
    );

    session.dispatch({ type: 'prepare_ability', unitId: attackerId, ability: 'ambush' });
    expect(session.getState().units.get(attackerId)?.preparedAbility).toBe('ambush');

    session.dispatch({ type: 'end_turn' });
    session.dispatch({ type: 'end_turn' });
    session.dispatch({ type: 'attack_unit', attackerId, defenderId });

    const pending = session.getPendingCombat();
    expect(pending?.result.ambushAttackBonus).toBeGreaterThan(0);
    if (pending) {
      session.applyResolvedCombat(pending);
    }

    expect(session.getState().units.get(attackerId)?.preparedAbility).toBeUndefined();
  });

  it('lets a player board a transport and disembark with the expected move spend', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['coral_people']);

    const faction = state.factions.get('coral_people' as never)!;
    const transportProto = assemblePrototype(
      faction.id,
      'galley_frame' as never,
      ['slaver_net', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: faction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(transportProto.id, transportProto);

    const unitId = faction.unitIds[0];
    const transportId = 'test_transport_galley' as never;
    const baseUnit = state.units.get(unitId as never)!;

    state.map!.tiles.get('10,10')!.terrain = 'plains';
    state.map!.tiles.get('11,10')!.terrain = 'coast';
    state.map!.tiles.get('12,10')!.terrain = 'plains';
    state.units.set(unitId as never, {
      ...baseUnit,
      position: { q: 10, r: 10 },
      movesRemaining: baseUnit.maxMoves,
      attacksRemaining: 1,
      status: 'ready',
      history: [],
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    });
    state.units.set(transportId, {
      ...baseUnit,
      id: transportId,
      prototypeId: transportProto.id,
      position: { q: 11, r: 10 },
      hp: transportProto.derivedStats.hp,
      maxHp: transportProto.derivedStats.hp,
      movesRemaining: transportProto.derivedStats.moves,
      maxMoves: transportProto.derivedStats.moves,
      attacksRemaining: 1,
      status: 'ready',
      history: [],
      poisonStacks: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    });
    state.factions.set(faction.id, {
      ...faction,
      unitIds: [unitId, transportId],
    });
    state.activeFactionId = faction.id;

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [faction.id] },
    );

    session.dispatch({ type: 'board_transport', unitId, transportId });
    expect(session.getState().transportMap.get(transportId)?.embarkedUnitIds).toContain(unitId);

    session.dispatch({
      type: 'disembark_unit',
      unitId,
      transportId,
      destination: { q: 12, r: 10 },
    });

    expect(session.getState().transportMap.get(transportId)?.embarkedUnitIds ?? []).not.toContain(unitId);
    expect(session.getState().units.get(unitId as never)?.position).toEqual({ q: 12, r: 10 });
    expect(session.getState().units.get(unitId as never)?.movesRemaining).toBe(0);
    expect(session.getState().units.get(transportId)?.movesRemaining).toBe(0);
  });

  it('matches the shared AI ranged target choice at the live combat boundary', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['steppe_clan', 'druid_circle']);

    const attackerFaction = state.factions.get('steppe_clan' as never)!;
    const defenderFaction = state.factions.get('druid_circle' as never)!;
    const rangedProto = assemblePrototype(
      attackerFaction.id,
      'ranged_frame' as never,
      ['basic_bow', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(rangedProto.id, rangedProto);

    const attackerId = 'ai_ranged_target_attacker' as never;
    const supportId = 'ai_ranged_target_support' as never;
    const lowHpTargetId = 'ai_ranged_target_low' as never;
    const highHpTargetId = 'ai_ranged_target_high' as never;
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;
    const supportBase = state.units.get(attackerFaction.unitIds[1] as never)!;
    const defenderBase = state.units.get(defenderFaction.unitIds[0] as never)!;
    const cityId = attackerFaction.cityIds[0];

    state.cities.set(cityId, {
      ...state.cities.get(cityId)!,
      position: { q: 9, r: 10 },
      besieged: false,
      turnsUnderSiege: 0,
    });
    state.units = new Map([
      [attackerId, {
        ...attackerBase,
        id: attackerId,
        factionId: attackerFaction.id,
        prototypeId: rangedProto.id,
        position: { q: 10, r: 10 },
        hp: rangedProto.derivedStats.hp,
        maxHp: rangedProto.derivedStats.hp,
        movesRemaining: rangedProto.derivedStats.moves,
        maxMoves: rangedProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready',
      }],
      [supportId, {
        ...supportBase,
        id: supportId,
        factionId: attackerFaction.id,
        position: { q: 10, r: 11 },
        movesRemaining: supportBase.maxMoves,
        attacksRemaining: 1,
        status: 'ready',
      }],
      [lowHpTargetId, {
        ...defenderBase,
        id: lowHpTargetId,
        factionId: defenderFaction.id,
        position: { q: 11, r: 10 },
        hp: 3,
        maxHp: Math.max(defenderBase.maxHp, 8),
        movesRemaining: defenderBase.maxMoves,
        attacksRemaining: 1,
        status: 'ready',
        routed: true,
      }],
      [highHpTargetId, {
        ...defenderBase,
        id: highHpTargetId,
        factionId: defenderFaction.id,
        position: { q: 12, r: 10 },
        hp: Math.max(defenderBase.hp, 8),
        maxHp: Math.max(defenderBase.maxHp, 8),
        movesRemaining: defenderBase.maxMoves,
        attacksRemaining: 1,
        status: 'ready',
      }],
    ]);
    state.factions.set(attackerFaction.id, { ...attackerFaction, unitIds: [attackerId, supportId], cityIds: [cityId] });
    state.factions.set(defenderFaction.id, { ...defenderFaction, unitIds: [lowHpTargetId, highHpTargetId] });
    state.activeFactionId = attackerFaction.id;

    const expected = runSharedAiActivation(state, registry, attackerFaction.id, attackerId, 'preview');
    expect(expected.pendingCombat?.defenderId).toBe(lowHpTargetId);

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [defenderFaction.id] },
    );

    const pending = session.dequeueAiCombat();
    expect(pending?.attackerId).toBe(attackerId);
    expect(pending?.defenderId).toBe(expected.pendingCombat?.defenderId);
  });

  it('matches shared AI city-pressure movement toward an enemy city', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['hill_clan', 'steppe_clan']);

    const attackerFaction = state.factions.get('hill_clan' as never)!;
    const defenderFaction = state.factions.get('steppe_clan' as never)!;
    const siegeProto = assemblePrototype(
      attackerFaction.id,
      'catapult_frame' as never,
      ['catapult_arm', 'fortress_training'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(siegeProto.id, siegeProto);

    const attackerId = 'ai_siege_force_catapult' as never;
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderCityId = defenderFaction.cityIds[0];

    state.units = new Map([
      [attackerId, {
        ...attackerBase,
        id: attackerId,
        factionId: attackerFaction.id,
        prototypeId: siegeProto.id,
        position: { q: 10, r: 10 },
        hp: siegeProto.derivedStats.hp,
        maxHp: siegeProto.derivedStats.hp,
        movesRemaining: siegeProto.derivedStats.moves,
        maxMoves: siegeProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready',
      }],
    ]);
    state.cities.set(defenderCityId, {
      ...state.cities.get(defenderCityId)!,
      position: { q: 14, r: 10 },
      besieged: false,
      turnsUnderSiege: 0,
    });
    state.factions.set(attackerFaction.id, { ...attackerFaction, unitIds: [attackerId] });
    state.activeFactionId = attackerFaction.id;

    const expected = runSharedAiActivation(state, registry, attackerFaction.id, attackerId);

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [defenderFaction.id] },
    );

    expect(session.getState().units.get(attackerId)?.position).toEqual(
      expected.state.units.get(attackerId)?.position,
    );
  });

  it('matches shared AI fort-build behavior for hill defenders', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['hill_clan', 'steppe_clan']);

    const hillFaction = state.factions.get('hill_clan' as never)!;
    const enemyFaction = state.factions.get('steppe_clan' as never)!;
    const unitId = hillFaction.unitIds[0];
    const supportId = 'ai_hill_fort_support' as never;
    const enemyId = enemyFaction.unitIds[0];
    const unitBase = state.units.get(unitId as never)!;
    const supportBase = state.units.get(hillFaction.unitIds[1] as never)!;
    const enemyBase = state.units.get(enemyId as never)!;
    const cityId = hillFaction.cityIds[0];

    state.research.get(hillFaction.id)!.completedNodes.push('fortress_t2' as never);
    state.map!.tiles.get('10,10')!.terrain = 'hill';
    state.map!.tiles.get('10,11')!.terrain = 'hill';
    state.map!.tiles.get('11,10')!.terrain = 'hill';
    state.cities.set(cityId, {
      ...state.cities.get(cityId)!,
      position: { q: 11, r: 10 },
      besieged: false,
      turnsUnderSiege: 0,
    });
    state.units = new Map([
      [unitId as never, {
        ...unitBase,
        position: { q: 10, r: 10 },
        movesRemaining: unitBase.maxMoves,
        attacksRemaining: 1,
        status: 'ready',
      }],
      [supportId, {
        ...supportBase,
        id: supportId,
        position: { q: 10, r: 11 },
        movesRemaining: supportBase.maxMoves,
        attacksRemaining: 1,
        status: 'ready',
      }],
      [enemyId as never, {
        ...enemyBase,
        position: { q: 12, r: 10 },
        movesRemaining: enemyBase.maxMoves,
        attacksRemaining: 1,
        status: 'ready',
      }],
    ]);
    state.factions.set(hillFaction.id, { ...hillFaction, unitIds: [unitId, supportId], cityIds: [cityId] });
    state.factions.set(enemyFaction.id, { ...enemyFaction, unitIds: [enemyId] });
    state.activeFactionId = hillFaction.id;

    const expected = runSharedAiActivation(state, registry, hillFaction.id, unitId);
    const expectedFort = Array.from(expected.state.improvements.values()).find(
      (improvement) => improvement.position.q === 10 && improvement.position.r === 10,
    );
    expect(expectedFort?.type).toBe('fortification');

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [enemyFaction.id] },
    );

    const liveFort = Array.from(session.getState().improvements.values()).find(
      (improvement) => improvement.position.q === 10 && improvement.position.r === 10,
    );
    expect(liveFort?.type).toBe(expectedFort?.type);
    expect(session.getState().units.get(unitId as never)?.hillDugIn).toBe(
      expected.state.units.get(unitId as never)?.hillDugIn,
    );
  });

  it('matches shared AI transport-aware movement when a loaded transport is available', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    trimStateToFactions(state, ['coral_people', 'steppe_clan']);

    const attackerFaction = state.factions.get('coral_people' as never)!;
    const defenderFaction = state.factions.get('steppe_clan' as never)!;
    const transportProto = assemblePrototype(
      attackerFaction.id,
      'galley_frame' as never,
      ['slaver_net', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(transportProto.id, transportProto);

    const transportId = 'a_ai_transport' as never;
    const embarkedId = 'z_ai_embarked' as never;
    const baseUnit = state.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderCityId = defenderFaction.cityIds[0];

    for (const key of ['10,10', '11,10', '12,10', '13,10', '14,10']) {
      state.map!.tiles.get(key)!.terrain = 'coast';
    }
    state.cities.set(defenderCityId, {
      ...state.cities.get(defenderCityId)!,
      position: { q: 16, r: 10 },
      besieged: false,
      turnsUnderSiege: 0,
    });
    state.units = new Map([
      [transportId, {
        ...baseUnit,
        id: transportId,
        factionId: attackerFaction.id,
        prototypeId: transportProto.id,
        position: { q: 10, r: 10 },
        hp: transportProto.derivedStats.hp,
        maxHp: transportProto.derivedStats.hp,
        movesRemaining: transportProto.derivedStats.moves,
        maxMoves: transportProto.derivedStats.moves,
        attacksRemaining: 1,
        status: 'ready',
      }],
      [embarkedId, {
        ...baseUnit,
        id: embarkedId,
        factionId: attackerFaction.id,
        position: { q: 10, r: 10 },
        movesRemaining: baseUnit.maxMoves,
        attacksRemaining: 1,
        status: 'ready',
      }],
    ]);
    state.transportMap = new Map([
      [transportId, {
        transportId,
        embarkedUnitIds: [embarkedId],
      }],
    ]);
    state.factions.set(attackerFaction.id, { ...attackerFaction, unitIds: [transportId, embarkedId] });
    state.activeFactionId = attackerFaction.id;

    const expected = runSharedAiActivation(state, registry, attackerFaction.id, transportId);

    const session = new GameSession(
      { type: 'serialized', payload: serializeGameState(state) },
      registry,
      { humanControlledFactionIds: [defenderFaction.id] },
    );

    expect(session.getState().units.get(transportId)?.position).toEqual(
      expected.state.units.get(transportId)?.position,
    );
    expect(session.getState().transportMap.get(transportId)?.embarkedUnitIds).toEqual(
      expected.state.transportMap.get(transportId)?.embarkedUnitIds,
    );
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
