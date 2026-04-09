import { describe, expect, it } from 'vitest';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { computeFactionStrategy } from '../src/systems/strategicAi';
import {
  getProjectedSupplyMarginAfterBuild,
  getSupplyMargin,
  rankProductionPriorities,
} from '../src/systems/aiProductionStrategy';
import { rankResearchPriorities } from '../src/systems/aiResearchStrategy';
import { getFactionProjectedSupplyDemand } from '../src/systems/productionSystem';

const registry = loadRulesRegistry();

function getPrototypeByChassis(state: ReturnType<typeof buildMvpScenario>, factionId: string, chassisId: string) {
  return Array.from(state.prototypes.values()).find(
    (prototype) => prototype.factionId === factionId && prototype.chassisId === chassisId,
  );
}

describe('adaptive AI phase 2', () => {
  it('keeps settler production off on easy and makes it more attractive for defensive tribes on normal', () => {
    const state = buildMvpScenario(42, { registry });
    const hillId = 'hill_clan' as never;
    const steppeId = 'steppe_clan' as never;
    const hillFaction = state.factions.get(hillId)!;
    const steppeFaction = state.factions.get(steppeId)!;

    state.factions.set(hillId, {
      ...hillFaction,
      villageIds: ['hill_v1', 'hill_v2', 'hill_v3', 'hill_v4'] as never[],
    });
    state.factions.set(steppeId, {
      ...steppeFaction,
      villageIds: ['steppe_v1', 'steppe_v2', 'steppe_v3', 'steppe_v4'] as never[],
    });
    state.round = 12;

    const hillSettler = Array.from(state.prototypes.values()).find(
      (prototype) => prototype.factionId === hillId && prototype.tags?.includes('settler'),
    );
    const steppeSettler = Array.from(state.prototypes.values()).find(
      (prototype) => prototype.factionId === steppeId && prototype.tags?.includes('settler'),
    );
    expect(hillSettler).toBeTruthy();
    expect(steppeSettler).toBeTruthy();

    const hillEasy = rankProductionPriorities(state, hillId, computeFactionStrategy(state, hillId, registry, 'easy'), registry, 'easy');
    expect(hillEasy.find((entry) => entry.prototypeId === hillSettler!.id)).toBeUndefined();

    const hillNormal = rankProductionPriorities(state, hillId, computeFactionStrategy(state, hillId, registry, 'normal'), registry, 'normal');
    const steppeNormal = rankProductionPriorities(state, steppeId, computeFactionStrategy(state, steppeId, registry, 'normal'), registry, 'normal');
    const hillSettlerScore = hillNormal.find((entry) => entry.prototypeId === hillSettler!.id);
    const steppeSettlerScore = steppeNormal.find((entry) => entry.prototypeId === steppeSettler!.id);

    expect(hillSettlerScore).toBeTruthy();
    expect(steppeSettlerScore).toBeTruthy();
    expect(hillSettlerScore!.score).toBeGreaterThan(steppeSettlerScore!.score);
  });

  it('computes projected supply margins for production candidates', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = 'steppe_clan' as never;
    const cavalry = getPrototypeByChassis(state, factionId, 'cavalry_frame');
    expect(cavalry).toBeTruthy();

    const projectedDemand = getFactionProjectedSupplyDemand(state, factionId, registry);
    state.economy.set(factionId, {
      factionId,
      productionPool: 0,
      supplyIncome: projectedDemand + 2,
      supplyDemand: projectedDemand,
    });

    const currentMargin = getSupplyMargin(state.economy.get(factionId)!);
    const projectedMargin = getProjectedSupplyMarginAfterBuild(state, factionId, cavalry!, registry);

    expect(currentMargin).toBe(2);
    expect(projectedMargin).toBeLessThan(currentMargin);
  });

  it('applies strong soft penalties to premium upkeep when supply tightens', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = 'steppe_clan' as never;
    const cavalry = getPrototypeByChassis(state, factionId, 'cavalry_frame');
    expect(cavalry).toBeTruthy();

    const projectedDemand = getFactionProjectedSupplyDemand(state, factionId, registry);
    state.economy.set(factionId, {
      factionId,
      productionPool: 0,
      supplyIncome: projectedDemand + 3,
      supplyDemand: projectedDemand,
    });

    const relaxedStrategy = computeFactionStrategy(state, factionId, registry);
    const relaxedPriorities = rankProductionPriorities(state, factionId, relaxedStrategy, registry);
    const relaxedCavalry = relaxedPriorities.find((entry) => entry.prototypeId === cavalry!.id);
    expect(relaxedCavalry).toBeTruthy();

    state.economy.set(factionId, {
      factionId,
      productionPool: 0,
      supplyIncome: Math.max(0, projectedDemand - 1.5),
      supplyDemand: projectedDemand,
    });

    const tightStrategy = computeFactionStrategy(state, factionId, registry);
    const tightPriorities = rankProductionPriorities(state, factionId, tightStrategy, registry);
    const tightCavalry = tightPriorities.find((entry) => entry.prototypeId === cavalry!.id);
    expect(tightCavalry).toBeTruthy();
    expect(tightCavalry!.score).toBeLessThan(relaxedCavalry!.score);
    expect(tightCavalry!.reason).toContain('projects supply deficit');
  });

  it('shifts mounted-heavy research toward logistics-friendly domains when supply is tight', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = 'steppe_clan' as never;
    const faction = state.factions.get(factionId)!;
    const research = state.research.get(factionId)!;
    state.factions.set(factionId, {
      ...faction,
      learnedDomains: [...new Set([...faction.learnedDomains, 'charge'])],
    });
    state.research.set(factionId, {
      ...research,
      completedNodes: [...new Set([...(research.completedNodes as string[]), 'charge_t1'])] as never[],
    });

    const projectedDemand = getFactionProjectedSupplyDemand(state, factionId, registry);

    state.economy.set(factionId, {
      factionId,
      productionPool: 0,
      supplyIncome: projectedDemand + 2,
      supplyDemand: projectedDemand,
    });
    const relaxedStrategy = computeFactionStrategy(state, factionId, registry);
    const relaxedPriorities = rankResearchPriorities(state, factionId, relaxedStrategy, registry);
    const relaxedHitrun = relaxedPriorities.find((entry) => entry.nodeId === 'hitrun_t2');
    const relaxedCharge = relaxedPriorities.find((entry) => entry.nodeId === 'charge_t2');
    expect(relaxedHitrun).toBeTruthy();
    expect(relaxedCharge).toBeTruthy();

    state.economy.set(factionId, {
      factionId,
      productionPool: 0,
      supplyIncome: Math.max(0, projectedDemand - 2),
      supplyDemand: projectedDemand,
    });
    const tightStrategy = computeFactionStrategy(state, factionId, registry);
    const tightPriorities = rankResearchPriorities(state, factionId, tightStrategy, registry);
    const tightHitrun = tightPriorities.find((entry) => entry.nodeId === 'hitrun_t2');
    const tightCharge = tightPriorities.find((entry) => entry.nodeId === 'charge_t2');
    expect(tightHitrun).toBeTruthy();
    expect(tightCharge).toBeTruthy();

    const relaxedDelta = (relaxedHitrun?.score ?? 0) - (relaxedCharge?.score ?? 0);
    const tightDelta = (tightHitrun?.score ?? 0) - (tightCharge?.score ?? 0);
    expect(tightDelta).toBeGreaterThan(relaxedDelta);
  });

  it('pushes normal research toward foreign breadth before native tier 3 when breadth is undeveloped', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = 'steppe_clan' as never;
    const faction = state.factions.get(factionId)!;
    const research = state.research.get(factionId)!;

    state.factions.set(factionId, {
      ...faction,
      learnedDomains: [...new Set([...faction.learnedDomains, 'charge'])],
    });
    state.research.set(factionId, {
      ...research,
      completedNodes: [...new Set([...(research.completedNodes as string[]), 'hitrun_t2', 'charge_t1'])] as never[],
    });
    state.round = 40;

    const strategy = computeFactionStrategy(state, factionId, registry, 'normal');
    const priorities = rankResearchPriorities(state, factionId, strategy, registry, 'normal');
    const foreignBreadth = priorities.find((entry) => entry.nodeId === 'charge_t2');
    const nativeDepth = priorities.find((entry) => entry.nodeId === 'hitrun_t3');

    expect(foreignBreadth).toBeTruthy();
    expect(nativeDepth).toBeTruthy();
    expect((foreignBreadth?.score ?? 0)).toBeGreaterThan(nativeDepth?.score ?? 0);
    expect(foreignBreadth?.reason).toContain('breadth');
  });

  it('weights stronger available military more heavily on normal when army quality lags the unlock state', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = 'steppe_clan' as never;
    const cavalry = getPrototypeByChassis(state, factionId, 'cavalry_frame');
    const infantry = getPrototypeByChassis(state, factionId, 'infantry_frame');
    expect(cavalry).toBeTruthy();
    expect(infantry).toBeTruthy();

    for (const unitId of state.factions.get(factionId)!.unitIds) {
      const unit = state.units.get(unitId)!;
      state.units.set(unitId, { ...unit, prototypeId: infantry!.id });
    }
    state.economy.set(factionId, {
      factionId,
      productionPool: 0,
      supplyIncome: 20,
      supplyDemand: 4,
    });
    state.round = 30;

    const strategy = computeFactionStrategy(state, factionId, registry, 'normal');
    const priorities = rankProductionPriorities(state, factionId, strategy, registry, 'normal');
    const cavalryPriority = priorities.find((entry) => entry.prototypeId === cavalry!.id);

    expect(cavalryPriority).toBeTruthy();
    expect(priorities[0]?.prototypeId).toBe(cavalry!.id);
    expect(cavalryPriority?.reason).toContain('quality gap');
  });
});
