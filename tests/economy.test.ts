import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { assemblePrototype } from '../src/design/assemblePrototype';
import { deriveResourceIncome, getSupplyDeficit } from '../src/systems/economySystem';
import { createFactionEconomy } from '../src/features/economy/types';
import { getFactionProjectedSupplyDemand, getProjectedSupplyDemandWithPrototype, getUnitSupplyCost } from '../src/systems/productionSystem';

const registry = loadRulesRegistry();

describe('terrain yields', () => {
  it('plains yields 0.1 production', () => {
    const plains = registry.getTerrainYield('plains');
    expect(plains?.productionYield).toBe(0.1);
  });

  it('forest yields 0.06 production', () => {
    const forest = registry.getTerrainYield('forest');
    expect(forest?.productionYield).toBe(0.06);
  });

  it('hill yields 0.14 production', () => {
    const hill = registry.getTerrainYield('hill');
    expect(hill?.productionYield).toBe(0.14);
  });

  it('ocean yields are defined', () => {
    expect(registry.getTerrainYield('ocean')).toBeDefined();
    expect(registry.getTerrainYield('ocean')?.productionYield).toBe(0.03);
  });

  it('has terrain yields defined for all current terrain types', () => {
    expect(registry.getAllTerrainYields().length).toBe(11);
  });
});

describe('faction economy', () => {
  it('creates default economy with zero values', () => {
    const economy = createFactionEconomy('test' as any);
    expect(economy.productionPool).toBe(0);
    expect(economy.supplyIncome).toBe(0);
    expect(economy.supplyDemand).toBe(0);
  });
});

describe('resource income derivation', () => {
  it('derives income from city territory', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const economy = deriveResourceIncome(state, factionId, registry);

    // Should have city base production (1) + territory yields
    expect(economy.productionPool).toBeGreaterThan(1);
    // Should have city base supply (5) + territory supply bonus
    expect(economy.supplyIncome).toBeGreaterThanOrEqual(1);
  });

  it('calculates supply demand from per-unit supply costs', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;
    const economy = deriveResourceIncome(state, factionId, registry);

    const expectedDemand = faction.unitIds.reduce((sum, id) => {
      const unit = state.units.get(id);
      if (!unit || unit.hp <= 0) return sum;
      const prototype = state.prototypes.get(unit.prototypeId)!;
      return sum + getUnitSupplyCost(prototype, registry);
    }, 0);
    expect(economy.supplyDemand).toBe(Number(expectedDemand.toFixed(2)));
  });

  it('projects supply demand for current armies and after a hypothetical build', () => {
    const state = buildMvpScenario(42);
    const factionId = 'steppe_clan' as never;
    const currentDemand = getFactionProjectedSupplyDemand(state, factionId, registry);
    let cavalryPrototype = Array.from(state.prototypes.values()).find(
      (prototype) => prototype.factionId === factionId && prototype.chassisId === 'cavalry_frame',
    );
    if (!cavalryPrototype) {
      cavalryPrototype = assemblePrototype(factionId, 'cavalry_frame', ['basic_bow', 'skirmish_drill'], registry);
      state.prototypes.set(cavalryPrototype.id, cavalryPrototype);
      const faction = state.factions.get(factionId)!;
      state.factions.set(factionId, { ...faction, prototypeIds: [...faction.prototypeIds, cavalryPrototype!.id] });
    }

    expect(currentDemand).toBeGreaterThan(0);
    expect(cavalryPrototype).toBeTruthy();
    expect(getProjectedSupplyDemandWithPrototype(state, factionId, cavalryPrototype!, registry)).toBe(
      Number((currentDemand + 1.5).toFixed(2)),
    );
  });

  it('villages add production bonus', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const economyBefore = deriveResourceIncome(state, factionId, registry);

    // Manually add a village to the faction
    const faction = state.factions.get(factionId)!;
    const villageId = 'test_village' as any;
    const village = {
      id: villageId,
      factionId,
      position: { q: 3, r: 5 },
      name: 'Test Village',
      foundedRound: 1,
      productionBonus: 1,
      supplyBonus: 1,
    };
    state.villages.set(villageId, village);
    const updatedFaction = {
      ...faction,
      villageIds: [...faction.villageIds, villageId],
    };
    const newFactions = new Map(state.factions);
    newFactions.set(factionId, updatedFaction);
    const newState = { ...state, factions: newFactions };

    const economyAfter = deriveResourceIncome(newState, factionId, registry);
    expect(economyAfter.productionPool).toBe(economyBefore.productionPool + 1);
    expect(economyAfter.supplyIncome).toBe(economyBefore.supplyIncome + 1);
  });
});

describe('supply deficit', () => {
  it('returns 0 when supply is sufficient', () => {
    const economy = createFactionEconomy('test' as any);
    economy.supplyIncome = 10;
    economy.supplyDemand = 5;
    expect(getSupplyDeficit(economy)).toBe(0);
  });

  it('returns deficit when demand exceeds income', () => {
    const economy = createFactionEconomy('test' as any);
    economy.supplyIncome = 2;
    economy.supplyDemand = 7;
    expect(getSupplyDeficit(economy)).toBe(5);
  });
});
