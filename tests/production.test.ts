import { describe, expect, it } from 'vitest';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import {
  canCompleteCurrentProduction,
  queueUnit,
  advanceProduction,
  isProductionComplete,
  completeProduction,
  getUnitCost,
  UNIT_COSTS,
} from '../src/systems/productionSystem';
import { calculatePrototypeCost, getDomainIdsByTags } from '../src/systems/knowledgeSystem';
import { initializeFogForFaction } from '../src/systems/fogSystem';
import type { City } from '../src/features/cities/types';

const registry = loadRulesRegistry();

describe('unit costs', () => {
  it('infantry costs 20 production', () => {
    expect(getUnitCost('infantry_frame')).toBe(20);
  });

  it('ranged costs 24 production', () => {
    expect(getUnitCost('ranged_frame')).toBe(24);
  });

  it('cavalry costs 36 production', () => {
    expect(getUnitCost('cavalry_frame')).toBe(36);
  });

  it('unknown chassis defaults to 10', () => {
    expect(getUnitCost('unknown_frame')).toBe(10);
  });

  it('has unit cost entries for the expanded chassis roster', () => {
    expect(Object.keys(UNIT_COSTS).length).toBe(8);
  });

  it('keeps prototype costs finite once domain mastery is fully integrated', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = 'steppe_clan' as never;
    const faction = state.factions.get(factionId)!;
    const cavalryPrototype = Array.from(state.prototypes.values()).find(
      (prototype) => prototype.factionId === factionId && prototype.chassisId === 'cavalry_frame',
    );

    expect(cavalryPrototype).toBeTruthy();

    const domains = getDomainIdsByTags(cavalryPrototype!.tags ?? []);
    const masteredFaction = {
      ...faction,
      prototypeMastery: Object.fromEntries(domains.map((domainId) => [domainId, 3])),
    };

    const cost = calculatePrototypeCost(
      getUnitCost(cavalryPrototype!.chassisId),
      masteredFaction,
      domains,
    );

    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBe(getUnitCost(cavalryPrototype!.chassisId));
  });
});

describe('production queue', () => {
  it('queues unit when no current production', () => {
    const city: City = {
      id: 'test_city' as any,
      factionId: 'test_faction' as any,
      position: { q: 0, r: 0 },
      name: 'Test City',
      productionQueue: [],
      productionProgress: 0,
    };

    const updated = queueUnit(city, 'prototype_1', 'infantry_frame', 8);
    expect(updated.currentProduction).toBeDefined();
    expect(updated.currentProduction?.item.id).toBe('prototype_1');
    expect(updated.currentProduction?.progress).toBe(0);
    expect(updated.currentProduction?.cost).toBe(8);
  });

  it('adds to queue when production is active', () => {
    const city: City = {
      id: 'test_city' as any,
      factionId: 'test_faction' as any,
      position: { q: 0, r: 0 },
      name: 'Test City',
      productionQueue: [],
      productionProgress: 0,
      currentProduction: {
        item: { type: 'unit', id: 'proto_1', cost: 8 },
        progress: 3,
        cost: 8,
      },
    };

    const updated = queueUnit(city, 'proto_2', 'ranged_frame', 10);
    expect(updated.productionQueue.length).toBe(1);
    expect(updated.productionQueue[0].id).toBe('proto_2');
  });
});

describe('production advancement', () => {
  it('advances production by income amount', () => {
    const city: City = {
      id: 'test_city' as any,
      factionId: 'test_faction' as any,
      position: { q: 0, r: 0 },
      name: 'Test City',
      productionQueue: [],
      productionProgress: 0,
      currentProduction: {
        item: { type: 'unit', id: 'proto_1', cost: 8 },
        progress: 0,
        cost: 8,
      },
    };

    const updated = advanceProduction(city, 3);
    expect(updated.currentProduction?.progress).toBe(3);
  });

  it('accumulates progress over multiple advances', () => {
    let city: City = {
      id: 'test_city' as any,
      factionId: 'test_faction' as any,
      position: { q: 0, r: 0 },
      name: 'Test City',
      productionQueue: [],
      productionProgress: 0,
      currentProduction: {
        item: { type: 'unit', id: 'proto_1', cost: 8 },
        progress: 0,
        cost: 8,
      },
    };

    city = advanceProduction(city, 3);
    city = advanceProduction(city, 3);
    expect(city.currentProduction?.progress).toBe(6);
  });

  it('does nothing when no production is active', () => {
    const city: City = {
      id: 'test_city' as any,
      factionId: 'test_faction' as any,
      position: { q: 0, r: 0 },
      name: 'Test City',
      productionQueue: [],
      productionProgress: 0,
    };

    const updated = advanceProduction(city, 5);
    expect(updated.currentProduction).toBeUndefined();
  });
});

describe('production completion', () => {
  it('detects when production is complete', () => {
    const city: City = {
      id: 'test_city' as any,
      factionId: 'test_faction' as any,
      position: { q: 0, r: 0 },
      name: 'Test City',
      productionQueue: [],
      productionProgress: 0,
      currentProduction: {
        item: { type: 'unit', id: 'proto_1', cost: 8 },
        progress: 8,
        cost: 8,
      },
    };

    expect(isProductionComplete(city)).toBe(true);
  });

  it('detects when production is not complete', () => {
    const city: City = {
      id: 'test_city' as any,
      factionId: 'test_faction' as any,
      position: { q: 0, r: 0 },
      name: 'Test City',
      productionQueue: [],
      productionProgress: 0,
      currentProduction: {
        item: { type: 'unit', id: 'proto_1', cost: 8 },
        progress: 5,
        cost: 8,
      },
    };

    expect(isProductionComplete(city)).toBe(false);
  });

  it('spawns unit when production completes', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;
    const cityId = faction.cityIds[0];
    const city = state.cities.get(cityId)!;

    // Set up a city with completed production
    const prototypeId = faction.prototypeIds[0];
    const updatedCity: City = {
      ...city,
      currentProduction: {
        item: { type: 'unit', id: prototypeId, cost: 8 },
        progress: 10,
        cost: 8,
      },
    };
    const newCities = new Map(state.cities);
    newCities.set(cityId, updatedCity);
    const newState = { ...state, cities: newCities };

    const unitsBefore = newState.units.size;
    const result = completeProduction(newState, cityId, registry);

    // Should have one more unit
    expect(result.units.size).toBe(unitsBefore + 1);

    // City should have cleared production
    const updatedCityAfter = result.cities.get(cityId);
    expect(updatedCityAfter?.currentProduction).toBeUndefined();
  });

  it('consumes four villages to complete settler production', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;
    const cityId = faction.cityIds[0];
    const city = state.cities.get(cityId)!;
    const settlerPrototype = Array.from(state.prototypes.values()).find(
      (prototype) => prototype.factionId === factionId && prototype.tags?.includes('settler'),
    );

    expect(settlerPrototype).toBeTruthy();

    const villages = new Map(state.villages);
    for (let index = 0; index < 4; index += 1) {
      villages.set(`v_${index}` as never, {
        id: `v_${index}` as never,
        factionId,
        position: { q: 20 + index, r: 20 },
        name: `Village ${index}`,
        foundedRound: state.round,
        productionBonus: 1,
        supplyBonus: 1,
      });
    }

    state = {
      ...state,
      villages,
      factions: new Map(state.factions).set(factionId, {
        ...faction,
        villageIds: ['v_0', 'v_1', 'v_2', 'v_3'] as never[],
      }),
      cities: new Map(state.cities).set(cityId, {
        ...city,
        currentProduction: {
          item: { type: 'unit', id: settlerPrototype!.id, cost: 4, costType: 'villages' },
          progress: 0,
          cost: 4,
          costType: 'villages',
        },
      }),
    };

    expect(canCompleteCurrentProduction(state, cityId, registry)).toBe(true);

    const result = completeProduction(state, cityId, registry);
    expect(result.units.size).toBe(state.units.size + 1);
    expect(result.villages.size).toBe(state.villages.size - 4);
    expect(result.factions.get(factionId)?.villageIds).toHaveLength(0);
    expect(result.cities.get(cityId)?.currentProduction).toBeUndefined();
  });
});
