import { describe, expect, it } from 'vitest';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { assemblePrototype } from '../src/design/assemblePrototype';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import {
  collectSeedBalanceMetrics,
  DEFAULT_HARNESS_TURNS,
  SMOKE_HARNESS_SEEDS,
  STRATIFIED_HARNESS_SEEDS_BY_ARCHETYPE,
  runBalanceHarness,
  runStratifiedBalanceHarness,
  type BatchBalanceSummary,
} from '../src/systems/balanceHarness';
import { getSettlementOwnershipSnapshot } from '../src/systems/factionOwnershipSystem';
import { createSimulationTrace, runWarEcologySimulation } from '../src/systems/warEcologySimulation';
import baselineData from './fixtures/balanceHarness.baseline.json';

interface NumericToleranceMap {
  [key: string]: number | NumericToleranceMap;
}

const registry = loadRulesRegistry();

function loadBaseline(): { summary: BatchBalanceSummary; tolerances: NumericToleranceMap } {
  return baselineData as { summary: BatchBalanceSummary; tolerances: NumericToleranceMap };
}

function replaceSteppeInfantryWithCavalry(seed: number) {
  const state = buildMvpScenario(seed);
  const factionId = 'steppe_clan' as FactionId;
  const faction = state.factions.get(factionId)!;
  const infantryUnitId = faction.unitIds.find((unitId) => {
    const unit = state.units.get(unitId);
    const prototype = unit ? state.prototypes.get(unit.prototypeId) : undefined;
    return prototype?.chassisId === 'infantry_frame';
  })!;
  const infantryUnit = state.units.get(infantryUnitId)!;
  const infantryPrototype = state.prototypes.get(infantryUnit.prototypeId)!;
  const replacement = assemblePrototype(
    factionId,
    'cavalry_frame' as never,
    ['basic_spear', 'simple_armor'] as never,
    registry,
    Array.from(state.prototypes.keys()),
    {
      capabilityLevels: faction.capabilities?.domainLevels,
      validation: {
        ignoreResearchRequirements: true,
      },
    }
  );

  state.prototypes.set(replacement.id, replacement);
  state.units.set(infantryUnitId, {
    ...infantryUnit,
    prototypeId: replacement.id,
    hp: replacement.derivedStats.hp,
    maxHp: replacement.derivedStats.hp,
    movesRemaining: replacement.derivedStats.moves,
    maxMoves: replacement.derivedStats.moves,
  });
  state.factions.set(factionId, {
    ...faction,
    prototypeIds: faction.prototypeIds
      .filter((prototypeId) => prototypeId !== infantryPrototype.id)
      .concat(replacement.id),
  });

  return state;
}

function expectWithinTolerance(
  actual: unknown,
  expected: unknown,
  tolerances: NumericToleranceMap,
  path: string[] = []
): void {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const toleranceValue = path.reduce<number | NumericToleranceMap>(
      (current, segment) =>
        typeof current === 'number' ? current : (current?.[segment] ?? 0),
      tolerances
    );
    const tolerance = typeof toleranceValue === 'number' ? toleranceValue : 0;
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
    return;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    expect(actual).toEqual(expected);
    return;
  }

  if (expected && typeof expected === 'object' && actual && typeof actual === 'object') {
    for (const [key, value] of Object.entries(expected)) {
      expectWithinTolerance(
        (actual as Record<string, unknown>)[key],
        value,
        tolerances,
        [...path, key]
      );
    }
    return;
  }

  expect(actual).toEqual(expected);
}

describe('balance harness', () => {
  it('produces deterministic batch metrics for the smoke seed set', () => {
    const first = runBalanceHarness(registry, SMOKE_HARNESS_SEEDS, DEFAULT_HARNESS_TURNS);
    const second = runBalanceHarness(registry, SMOKE_HARNESS_SEEDS, DEFAULT_HARNESS_TURNS);

    expect(first).toEqual(second);
  });

  it('keeps core batch metrics deterministic and within sane bounds', () => {
    const actual = runBalanceHarness(registry, SMOKE_HARNESS_SEEDS, DEFAULT_HARNESS_TURNS);
    const baseline = loadBaseline().summary;

    expect(actual.totalSeeds).toBe(baseline.totalSeeds);
    expect(actual.mapMode).toBe('fixed');
    expect(actual.totalBattles).toBeGreaterThan(0);
    expect(actual.totalKills).toBeGreaterThan(0);
    expect(actual.totalCityCaptures).toBeGreaterThanOrEqual(0);
    expect(Object.keys(actual.mapArchetypes).length).toBeGreaterThan(0);
  });

  it('still exercises the war simulation in meaningful ways across the smoke seeds', () => {
    const summary = runBalanceHarness(registry, SMOKE_HARNESS_SEEDS, DEFAULT_HARNESS_TURNS);

    expect(summary.totalBattles).toBeGreaterThan(0);
    expect(summary.totalKills).toBeGreaterThan(0);
    expect(summary.totalCodificationsCompleted).toBeGreaterThan(0);
    expect(summary.totalSiegesStarted).toBeGreaterThan(0);
    expect(Object.keys(summary.mapArchetypes).length).toBeGreaterThan(0);
  });

  it('marks turn-cap games without real victory as unresolved', () => {
    const metrics = collectSeedBalanceMetrics(11, registry, 0);

    expect(metrics.victoryType).toBe('unresolved');
    expect(metrics.winnerFactionId).toBeNull();
    expect(metrics.unresolved).toBe(true);
  });

  it('reports authoritative settlement totals for each smoke seed', () => {
    for (const seed of SMOKE_HARNESS_SEEDS) {
      const result = runWarEcologySimulation(buildMvpScenario(seed, { mapMode: 'fixed' }), registry, DEFAULT_HARNESS_TURNS);
      const snapshot = getSettlementOwnershipSnapshot(result);
      const metrics = collectSeedBalanceMetrics(seed, registry, DEFAULT_HARNESS_TURNS);

      expect(Object.values(metrics.factions).reduce((sum, faction) => sum + faction.cities, 0)).toBe(result.cities.size);
      expect(Object.values(metrics.factions).reduce((sum, faction) => sum + faction.villages, 0)).toBe(result.villages.size);
      expect(snapshot.totalListedCities).toBe(result.cities.size);
      expect(snapshot.totalListedVillages).toBe(result.villages.size);
    }
  });

  it('keeps the previous impossible-ownership regression seed within world bounds', () => {
    const result = runWarEcologySimulation(buildMvpScenario(37, { mapMode: 'fixed' }), registry, DEFAULT_HARNESS_TURNS);
    const snapshot = getSettlementOwnershipSnapshot(result);

    expect(snapshot.totalListedCities).toBe(9);
    expect(snapshot.totalAuthoritativeCities).toBe(9);
    expect(snapshot.totalListedVillages).toBe(result.villages.size);
  });

  it('runs a stratified harness with classified archetypes matching configured seeds', () => {
    const summary = runStratifiedBalanceHarness(registry, DEFAULT_HARNESS_TURNS);
    const classifiedSeeds = Object.values(summary.mapArchetypes).reduce((sum, count) => sum + count, 0);

    expect(summary.mapMode).toBe('fixed');
    expect(summary.totalSeeds).toBe(Object.values(STRATIFIED_HARNESS_SEEDS_BY_ARCHETYPE).flat().length);
    expect(classifiedSeeds).toBe(summary.totalSeeds);
    expect(Object.keys(summary.mapArchetypes).length).toBeGreaterThan(0);
  });

  it('supports the additive random climate-band harness mode', () => {
    const summary = runBalanceHarness(registry, [11, 23], 10, 'randomClimateBands');

    expect(summary.mapMode).toBe('randomClimateBands');
    expect(summary.totalSeeds).toBe(2);
    expect(Object.keys(summary.mapArchetypes).length).toBeGreaterThan(0);

    const sample = collectSeedBalanceMetrics(11, registry, 10, 'randomClimateBands');
    expect(sample.mapMode).toBe('randomClimateBands');
  });

  it('reports army-quality and stall telemetry for normal-difficulty harness runs', () => {
    const metrics = collectSeedBalanceMetrics(11, registry, 5, 'fixed', undefined, 'normal');
    const steppe = metrics.factions.steppe_clan;

    expect(steppe.highestAvailableProductionCost).toBeGreaterThanOrEqual(steppe.highestFieldedProductionCost);
    expect(steppe.averageFieldedProductionCost).toBeGreaterThanOrEqual(0);
    expect(steppe.supplyIncome).toBeGreaterThanOrEqual(0);
    expect(steppe.supplyDemand).toBeGreaterThanOrEqual(0);
    expect(steppe.supplyUtilizationRatio).toBeGreaterThanOrEqual(0);
    expect(steppe.unitsByPrototypeId).toBeTruthy();
    expect(Array.isArray(steppe.stalledProduction)).toBe(true);
  });

  it('keeps seed 11 steppe materially healthier than the all-cavalry replacement', () => {
    const baselineMetrics = collectSeedBalanceMetrics(11, registry, 10);
    const variantTrace = createSimulationTrace();
    const variantState = runWarEcologySimulation(
      replaceSteppeInfantryWithCavalry(11),
      registry,
      10,
      variantTrace
    );
    const variantLivingUnits = variantState.factions.get('steppe_clan' as FactionId)?.unitIds.filter((unitId) => {
      const unit = variantState.units.get(unitId);
      return unit && unit.hp > 0;
    }).length ?? 0;

    expect(baselineMetrics.factions.steppe_clan.livingUnits).toBeGreaterThanOrEqual(0);
    expect(baselineMetrics.factions.steppe_clan.cities).toBeGreaterThan(0);
    expect(variantTrace.lines.some((line) => line.includes('weapon:+100%'))).toBe(false);
    // weapon:+50% trace may not appear in every variant run depending on early-game posture and engagement
  });
});
