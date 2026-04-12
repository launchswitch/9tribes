import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { assemblePrototype } from '../src/design/assemblePrototype';
import { computeFactionStrategy } from '../src/systems/strategicAi';
import { rankProductionPriorities } from '../src/systems/aiProductionStrategy';
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

  for (const factionId of keepFactions) {
    state = initializeFogForFaction(state, factionId as never);
  }
}

function countAssignments(strategy: ReturnType<typeof computeFactionStrategy>, assignment: string): number {
  return Object.values(strategy.unitIntents).filter((intent) => intent.assignment === assignment).length;
}

describe('adaptive AI phase 3', () => {
  it('pushes hard steppe production further toward mounted skirmish identity units than normal', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['steppe_clan', 'hill_clan']);
    const steppeId = 'steppe_clan' as never;
    const cavalry = assemblePrototype(
      steppeId,
      'cavalry_frame' as never,
      ['basic_bow', 'skirmish_drill'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: state.factions.get(steppeId)?.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(cavalry.id, cavalry);
    state.factions.set(steppeId, {
      ...state.factions.get(steppeId)!,
      prototypeIds: [...state.factions.get(steppeId)!.prototypeIds, cavalry.id],
    });
    const infantry = Array.from(state.prototypes.values()).find(
      (prototype) => prototype.factionId === steppeId && prototype.chassisId === 'infantry_frame' && !prototype.tags?.includes('settler'),
    );

    expect(cavalry).toBeTruthy();
    expect(infantry).toBeTruthy();

    state.economy.set(steppeId, {
      factionId: steppeId,
      productionPool: 0,
      supplyIncome: 20,
      supplyDemand: 4,
    });
    state.round = 24;

    const normalStrategy = computeFactionStrategy(state, steppeId, registry, 'normal');
    const hardStrategy = computeFactionStrategy(state, steppeId, registry, 'hard');
    const normalPriorities = rankProductionPriorities(state, steppeId, normalStrategy, registry, 'normal');
    const hardPriorities = rankProductionPriorities(state, steppeId, hardStrategy, registry, 'hard');
    const normalCamel = normalPriorities.find(
      (entry) => state.prototypes.get(entry.prototypeId)?.derivedStats.role === 'mounted',
    );
    const normalInfantry = normalPriorities.find((entry) => entry.prototypeId === infantry!.id);
    const hardCamel = hardPriorities.find(
      (entry) => state.prototypes.get(entry.prototypeId)?.derivedStats.role === 'mounted',
    );
    const hardInfantry = hardPriorities.find((entry) => entry.prototypeId === infantry!.id);

    expect(normalCamel).toBeTruthy();
    expect(normalInfantry).toBeTruthy();
    expect(hardCamel).toBeTruthy();
    expect(hardInfantry).toBeTruthy();
    expect((hardCamel?.score ?? 0) - (hardInfantry?.score ?? 0)).toBeGreaterThan(
      (normalCamel?.score ?? 0) - (normalInfantry?.score ?? 0),
    );
  });

  it('keeps hard recovery guard ahead of weighted posture scoring', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['steppe_clan', 'hill_clan']);
    const steppeId = 'steppe_clan' as never;

    state.warExhaustion.set(steppeId, {
      ...state.warExhaustion.get(steppeId)!,
      exhaustionPoints: 12,
    });

    const strategy = computeFactionStrategy(state, steppeId, registry);
    expect(strategy.posture).toBe('recovery');
    expect(strategy.debugReasons.some((reason) => reason.includes('posture_guard=recovery'))).toBe(true);
  });

  it('uses personality-weighted posture selection after safety guards', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['steppe_clan', 'druid_circle']);
    const steppeId = 'steppe_clan' as never;
    const druidId = 'druid_circle' as never;
    const steppeUnitId = state.factions.get(steppeId)!.unitIds[0];
    const druidUnitId = state.factions.get(druidId)!.unitIds[0];

    state.units.set(steppeUnitId, { ...state.units.get(steppeUnitId)!, position: { q: 8, r: 6 }, hp: 100 });
    state.units.set(druidUnitId, { ...state.units.get(druidUnitId)!, position: { q: 9, r: 6 }, hp: 100 });
    let withFog = updateFogState(state, steppeId);
    withFog = updateFogState(withFog, druidId);

    const steppeStrategy = computeFactionStrategy(withFog, steppeId, registry);
    const druidStrategy = computeFactionStrategy(withFog, druidId, registry);

    expect(['offensive', 'siege']).toContain(steppeStrategy.posture);
    expect(steppeStrategy.debugReasons.some((reason) => reason.startsWith('posture_choice='))).toBe(true);
    expect(druidStrategy.debugReasons.some((reason) => reason.startsWith('posture_choice='))).toBe(true);
  });

  it('changes focus target preference when doctrine/personality changes', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['druid_circle', 'steppe_clan']);
    const druidId = 'druid_circle' as never;
    const steppeId = 'steppe_clan' as never;
    const druidUnits = state.factions.get(druidId)!.unitIds;
    const steppeUnits = state.factions.get(steppeId)!.unitIds;
    const enemyFrontId = steppeUnits[0];
    const enemySupportId = steppeUnits[1];
    const enemyIsolatedId = steppeUnits[2] ?? steppeUnits[0];

    state.units.set(druidUnits[0], { ...state.units.get(druidUnits[0])!, position: { q: 6, r: 6 }, hp: 100 });
    state.units.set(druidUnits[1], { ...state.units.get(druidUnits[1])!, position: { q: 7, r: 6 }, hp: 100 });
    state.units.set(enemyFrontId, { ...state.units.get(enemyFrontId)!, position: { q: 9, r: 6 }, hp: 100, routed: false });
    state.units.set(enemySupportId, { ...state.units.get(enemySupportId)!, position: { q: 9, r: 7 }, hp: 100, routed: false });
    state.units.set(enemyIsolatedId, { ...state.units.get(enemyIsolatedId)!, position: { q: 5, r: 8 }, hp: 100, routed: false });

    let withFog = updateFogState(state, druidId);
    withFog = updateFogState(withFog, steppeId);
    const baseline = computeFactionStrategy(withFog, druidId, registry);

    const druid = withFog.factions.get(druidId)!;
    withFog.factions.set(druidId, {
      ...druid,
      learnedDomains: [...new Set([...druid.learnedDomains, 'slaving'])],
    });
    const slaving = computeFactionStrategy(withFog, druidId, registry);

    expect(baseline.debugReasons.some((reason) => reason.startsWith('focus_1='))).toBe(true);
    expect(slaving.debugReasons.some((reason) => reason.startsWith('focus_1='))).toBe(true);
    expect(slaving.focusTargetUnitIds).toContain(enemyIsolatedId);
  });

  it('changes assignment mix by faction personality and emits assignment debug reasons', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['steppe_clan', 'hill_clan']);
    const steppeId = 'steppe_clan' as never;
    const hillId = 'hill_clan' as never;
    const steppeUnit = state.factions.get(steppeId)!.unitIds[0];
    const hillUnit = state.factions.get(hillId)!.unitIds[0];

    state.units.set(steppeUnit, { ...state.units.get(steppeUnit)!, position: { q: 8, r: 6 }, hp: 100 });
    state.units.set(hillUnit, { ...state.units.get(hillUnit)!, position: { q: 9, r: 6 }, hp: 100 });
    let withFog = updateFogState(state, steppeId);
    withFog = updateFogState(withFog, hillId);

    const steppeStrategy = computeFactionStrategy(withFog, steppeId, registry);
    const hillStrategy = computeFactionStrategy(withFog, hillId, registry);

    expect(steppeStrategy.debugReasons.some((reason) => reason.startsWith('assignment_mix='))).toBe(true);
    expect(hillStrategy.debugReasons.some((reason) => reason.startsWith('assignment_mix='))).toBe(true);
    expect(countAssignments(steppeStrategy, 'raider')).toBeGreaterThanOrEqual(countAssignments(hillStrategy, 'raider'));
  });

  it('remains deterministic in short sim runs with phase-3 strategy wiring', () => {
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
        frontAnchors: event.frontAnchors,
        focusTargetCount: event.focusTargetUnitIds.length,
        reasons: event.reasons
          .filter((r) => r.startsWith('posture_') || r.startsWith('focus_1=') || r.startsWith('assignment_mix='))
          .map((r) => r.replace(/^focus_1=[^:]+/, 'focus_1=unit')),
      }));

    expect(normalize(traceA.factionStrategyEvents)).toEqual(normalize(traceB.factionStrategyEvents));
  });
});
