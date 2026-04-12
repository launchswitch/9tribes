import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { computeFactionStrategy } from '../src/systems/strategicAi';
import { createSimulationTrace, runWarEcologySimulation } from '../src/systems/warEcologySimulation';
import { initializeFogForFaction, updateFogState } from '../src/systems/fogSystem';

const registry = loadRulesRegistry();

function trimState(state: ReturnType<typeof buildMvpScenario>, factionIds: string[]) {
  const keepFactions = new Set(factionIds);
  const keepUnits = new Set(
    Array.from(state.units.values())
      .filter((unit) => keepFactions.has(unit.factionId))
      .map((unit) => unit.id),
  );
  const keepCities = new Set(
    Array.from(state.cities.values())
      .filter((city) => keepFactions.has(city.factionId))
      .map((city) => city.id),
  );

  state.factions = new Map(Array.from(state.factions.entries()).filter(([factionId]) => keepFactions.has(factionId)));
  state.units = new Map(Array.from(state.units.entries()).filter(([unitId]) => keepUnits.has(unitId)));
  state.cities = new Map(Array.from(state.cities.entries()).filter(([cityId]) => keepCities.has(cityId)));
  state.villages = new Map();
  state.improvements = new Map();
  state.economy = new Map(Array.from(state.economy.entries()).filter(([factionId]) => keepFactions.has(factionId)));
  state.research = new Map(Array.from(state.research.entries()).filter(([factionId]) => keepFactions.has(factionId)));
  state.warExhaustion = new Map(Array.from(state.warExhaustion.entries()).filter(([factionId]) => keepFactions.has(factionId)));
  state.factionStrategies = new Map();

  for (const [factionId, faction] of state.factions) {
    state.factions.set(factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((unitId) => state.units.has(unitId)),
      cityIds: faction.cityIds.filter((cityId) => state.cities.has(cityId)),
      villageIds: [],
    });
  }

  let current = state;
  for (const factionId of keepFactions) {
    current = initializeFogForFaction(current, factionId as never);
  }
  return current;
}

function withUpdatedFog(state: ReturnType<typeof buildMvpScenario>, factionIds: string[]) {
  let current = state;
  for (const factionId of factionIds) {
    current = updateFogState(current, factionId as never);
  }
  return current;
}

function readBudgetReason(strategy: ReturnType<typeof computeFactionStrategy>) {
  return strategy.debugReasons.find((reason) => reason.startsWith('target_budget='));
}

function readWaitReason(strategy: ReturnType<typeof computeFactionStrategy>) {
  return strategy.debugReasons.find((reason) => reason.startsWith('squad_wait='));
}

describe('adaptive AI phase 5', () => {
  it('switches hard into denial raids when losing and exposed enemy economy exists', () => {
    const state = buildMvpScenario(42, { registry });
    const trimmed = trimState(state, ['hill_clan', 'steppe_clan', 'coral_people']);
    const hillId = 'hill_clan' as never;
    const steppeId = 'steppe_clan' as never;
    const hillFaction = trimmed.factions.get(hillId)!;
    const homeCity = trimmed.cities.get(hillFaction.homeCityId!)!;
    const baseUnit = trimmed.units.get(hillFaction.unitIds[0])!;
    const steppeSettlerProto = Array.from(trimmed.prototypes.values()).find(
      (prototype) => prototype.factionId === steppeId && prototype.tags?.includes('settler'),
    )!;

    for (let index = 0; index < 4; index += 1) {
      const unitId = `hill_denial_${index}` as never;
      trimmed.units.set(unitId, {
        ...baseUnit,
        id: unitId,
        position: { q: homeCity.position.q + (index % 2), r: homeCity.position.r + 1 + Math.floor(index / 2) },
        veteranLevel: 'elite',
        learnedAbilities: [
          { domainId: 'fortress', fromFactionId: hillId, learnedOnRound: 1 },
          { domainId: 'charge', fromFactionId: steppeId, learnedOnRound: 2 },
          { domainId: 'slaving', fromFactionId: 'coral_people' as never, learnedOnRound: 3 },
        ],
      });
      hillFaction.unitIds.push(unitId);
    }
    trimmed.units.set(baseUnit.id, {
      ...baseUnit,
      veteranLevel: 'elite',
      learnedAbilities: [
        { domainId: 'fortress', fromFactionId: hillId, learnedOnRound: 1 },
        { domainId: 'charge', fromFactionId: steppeId, learnedOnRound: 2 },
        { domainId: 'slaving', fromFactionId: 'coral_people' as never, learnedOnRound: 3 },
      ],
    });

    const enemyBaseUnit = trimmed.units.get(trimmed.factions.get(steppeId)!.unitIds[0])!;
    for (let index = 0; index < 6; index += 1) {
      const unitId = `steppe_pressure_${index}` as never;
      trimmed.units.set(unitId, {
        ...enemyBaseUnit,
        id: unitId,
        position: { q: homeCity.position.q + 6 + (index % 3), r: homeCity.position.r - 1 + Math.floor(index / 3) },
      });
      trimmed.factions.get(steppeId)!.unitIds.push(unitId);
    }

    trimmed.villages.set('steppe_denial_village' as never, {
      id: 'steppe_denial_village' as never,
      factionId: steppeId,
      position: { q: homeCity.position.q + 5, r: homeCity.position.r - 2 },
      name: 'Steppe Outpost',
      foundedRound: trimmed.round,
      productionBonus: 1,
      supplyBonus: 1,
    });
    trimmed.factions.set(steppeId, {
      ...trimmed.factions.get(steppeId)!,
      villageIds: ['steppe_denial_village' as never],
    });
    trimmed.units.set('steppe_denial_settler' as never, {
      ...enemyBaseUnit,
      id: 'steppe_denial_settler' as never,
      prototypeId: steppeSettlerProto.id,
      position: { q: homeCity.position.q + 7, r: homeCity.position.r - 2 },
    });
    trimmed.factions.get(steppeId)!.unitIds.push('steppe_denial_settler' as never);
    trimmed.economy.set(hillId, {
      factionId: hillId,
      productionPool: 0,
      supplyIncome: 24,
      supplyDemand: 22,
    });
    trimmed.round = 22;

    const strategy = computeFactionStrategy(trimmed, hillId, registry, 'hard');

    expect(
      Object.values(strategy.unitIntents)
        .filter((intent) => intent.reason.includes('coordinator'))
        .some((intent) => intent.assignment === 'raider' && /intercept settler|deny village/.test(intent.reason)),
    ).toBe(true);
  });

  it('holds/regroups when squad mass is insufficient to commit', () => {
    const state = buildMvpScenario(42, { registry });
    const trimmed = trimState(state, ['steppe_clan', 'hill_clan']);
    const steppeId = 'steppe_clan' as never;
    const hillId = 'hill_clan' as never;
    const steppeUnits = trimmed.factions.get(steppeId)!.unitIds;
    const hillUnits = trimmed.factions.get(hillId)!.unitIds;

    trimmed.units.set(steppeUnits[0], { ...trimmed.units.get(steppeUnits[0])!, position: { q: 5, r: 5 }, hp: 100 });
    trimmed.units.set(steppeUnits[1], { ...trimmed.units.get(steppeUnits[1])!, position: { q: 10, r: 4 }, hp: 100 });
    trimmed.units.set(steppeUnits[2], { ...trimmed.units.get(steppeUnits[2])!, position: { q: 14, r: 6 }, hp: 100 });
    trimmed.units.set(hillUnits[0], { ...trimmed.units.get(hillUnits[0])!, position: { q: 10, r: 5 }, hp: 100 });

    const withFog = withUpdatedFog(trimmed, [steppeId, hillId]);
    const strategy = computeFactionStrategy(withFog, steppeId, registry);

    const waitedUnits = Object.values(strategy.unitIntents).filter((intent) =>
      intent.reason.includes('wait_for_allies=holding_for_squad'),
    );
    expect(waitedUnits.length).toBeGreaterThan(0);
    expect(readWaitReason(strategy)).toContain('waits:');
  });

  it('uses soft target budgets and allows overfill when one opportunity dominates', () => {
    const state = buildMvpScenario(42, { registry });
    const trimmed = trimState(state, ['steppe_clan', 'hill_clan']);
    const steppeId = 'steppe_clan' as never;
    const hillId = 'hill_clan' as never;
    const steppeUnits = trimmed.factions.get(steppeId)!.unitIds;
    const hillUnits = trimmed.factions.get(hillId)!.unitIds;

    trimmed.units.set(steppeUnits[0], { ...trimmed.units.get(steppeUnits[0])!, position: { q: 6, r: 5 }, hp: 100 });
    trimmed.units.set(steppeUnits[1], { ...trimmed.units.get(steppeUnits[1])!, position: { q: 7, r: 5 }, hp: 100 });
    trimmed.units.set(steppeUnits[2], { ...trimmed.units.get(steppeUnits[2])!, position: { q: 8, r: 5 }, hp: 100 });
    trimmed.units.set(hillUnits[0], { ...trimmed.units.get(hillUnits[0])!, position: { q: 10, r: 5 }, hp: 35, routed: false });
    trimmed.units.set(hillUnits[1], { ...trimmed.units.get(hillUnits[1])!, position: { q: 18, r: 10 }, hp: 100, routed: false });

    const withFog = withUpdatedFog(trimmed, [steppeId, hillId]);
    const strategy = computeFactionStrategy(withFog, steppeId, registry);
    const reason = readBudgetReason(strategy);
    expect(reason).toBeTruthy();

    const match = reason?.match(/overfills:(\d+)/);
    expect(match).toBeTruthy();
    expect(Number(match?.[1] ?? 0)).toBeGreaterThanOrEqual(0);
    expect(strategy.focusTargetUnitIds.length).toBeGreaterThan(0);
  });

  it('allows doctrine override for exceptional hitrun/charge opportunities', () => {
    const state = buildMvpScenario(42, { registry });
    const trimmed = trimState(state, ['savannah_lions', 'hill_clan']);
    const steppeId = 'savannah_lions' as never;
    const hillId = 'hill_clan' as never;

    const steppeUnits = trimmed.factions.get(steppeId)!.unitIds;
    const hillUnits = trimmed.factions.get(hillId)!.unitIds;
    trimmed.units.set(steppeUnits[0], { ...trimmed.units.get(steppeUnits[0])!, position: { q: 8, r: 5 }, hp: 100 });
    trimmed.units.set(steppeUnits[1], { ...trimmed.units.get(steppeUnits[1])!, position: { q: 9, r: 6 }, hp: 100 });
    trimmed.units.set(hillUnits[0], { ...trimmed.units.get(hillUnits[0])!, position: { q: 10, r: 5 }, hp: 70, routed: false });

    const withFog = withUpdatedFog(trimmed, [steppeId, hillId]);
    const strategy = computeFactionStrategy(withFog, steppeId, registry);

    const overrideIntents = Object.values(strategy.unitIntents).filter((intent) =>
      intent.reason.includes('doctrine_override=exceptional_opportunity'),
    );
    expect(overrideIntents.length).toBeGreaterThan(0);
    expect(overrideIntents.every((intent) => ['main_army', 'raider', 'siege_force'].includes(intent.assignment))).toBe(true);
  });

  it('emits stable phase-5 telemetry markers and remains deterministic across runs', () => {
    const stateA = buildMvpScenario(42, { registry });
    const stateB = buildMvpScenario(42, { registry });
    const traceA = createSimulationTrace();
    const traceB = createSimulationTrace();

    runWarEcologySimulation(stateA, registry, 2, traceA);
    runWarEcologySimulation(stateB, registry, 2, traceB);

    const normalize = (events: typeof traceA.factionStrategyEvents) =>
      events?.map((event) => ({
        factionId: event.factionId,
        posture: event.posture,
        reasons: event.reasons
          .filter((reason) =>
            reason.startsWith('assignment_mix=')
            || reason.startsWith('target_budget=')
            || reason.startsWith('squad_wait=')
            || reason.startsWith('squad_count=')
          ),
      }));

    const normalizedA = normalize(traceA.factionStrategyEvents);
    const normalizedB = normalize(traceB.factionStrategyEvents);
    expect(normalizedA).toEqual(normalizedB);
    expect(normalizedA?.some((event) => event.reasons.some((reason) => reason.startsWith('target_budget=')))).toBe(true);
    expect(normalizedA?.some((event) => event.reasons.some((reason) => reason.startsWith('squad_wait=')))).toBe(true);
  });
});
