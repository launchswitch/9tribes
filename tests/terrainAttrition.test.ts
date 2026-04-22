import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { applyEnvironmentalDamage } from '../src/systems/simulation/environmentalEffects';
import { hexToKey } from '../src/core/grid';

const registry = loadRulesRegistry();

// ── Helpers ──

/**
 * Build a minimal GameState with one unit from `victimFactionId` on `terrain`
 * at position (8,8), no cities/villages (so no settlement safety).
 * Optionally add a second unit from `immuneFactionId` at (9,8).
 */
function buildTerrainTestState(
  victimFactionId: string,
  terrain: string,
  options?: { immuneFactionId?: string; unitTags?: string[] },
) {
  const state = buildMvpScenario(42);
  const victimUnitId = state.factions.get(victimFactionId as never)!.unitIds[0];
  const immuneUnitId = options?.immuneFactionId
    ? state.factions.get(options.immuneFactionId as never)!.unitIds[0]
    : null;

  // Filter down to just the factions we need
  const keepFactionIds = new Set(
    [victimFactionId, options?.immuneFactionId].filter(Boolean) as string[],
  );
  const keepUnitIds = new Set(
    [victimUnitId, immuneUnitId].filter(Boolean) as string[],
  );

  state.factions = new Map(
    Array.from(state.factions.entries())
      .filter(([id]) => keepFactionIds.has(id))
      .map(([id, faction]) => [
        id,
        {
          ...faction,
          unitIds: id === victimFactionId ? [victimUnitId] : immuneUnitId ? [immuneUnitId] : [],
          cityIds: [],
          villageIds: [],
        },
      ]),
  );
  state.units = new Map(
    Array.from(state.units.entries()).filter(([id]) => keepUnitIds.has(id)),
  );
  state.cities = new Map();
  state.villages = new Map();
  state.improvements = new Map();
  state.economy = new Map(
    Array.from(state.economy.entries()).filter(([id]) => keepFactionIds.has(id)),
  );
  state.research = new Map(
    Array.from(state.research.entries()).filter(([id]) => keepFactionIds.has(id)),
  );
  state.warExhaustion = new Map(
    Array.from(state.warExhaustion.entries()).filter(([id]) => keepFactionIds.has(id)),
  );

  // Set all terrain to plains, then the test hex to the target terrain
  const pos = { q: 8, r: 8 };
  const immunePos = { q: 9, r: 8 };
  for (const tile of state.map!.tiles.values()) {
    tile.terrain = 'plains';
  }
  state.map!.tiles.set(hexToKey(pos), { position: pos, terrain: terrain as never });
  state.map!.tiles.set(hexToKey(immunePos), { position: immunePos, terrain: terrain as never });

  // Place victim unit on the target terrain
  state.units.set(victimUnitId, {
    ...state.units.get(victimUnitId)!,
    position: pos,
    hp: 10,
  });

  // Place immune unit if provided
  if (immuneUnitId && options?.immuneFactionId) {
    state.units.set(immuneUnitId, {
      ...state.units.get(immuneUnitId)!,
      position: immunePos,
      hp: 10,
    });
  }

  // Optionally inject tags onto the victim unit's prototype (e.g. 'amphibious')
  if (options?.unitTags?.length) {
    const victim = state.units.get(victimUnitId)!;
    const proto = state.prototypes.get(victim.prototypeId)!;
    state.prototypes.set(victim.prototypeId, {
      ...proto,
      tags: [...new Set([...(proto.tags ?? []), ...options.unitTags])],
    });
  }

  return { state, victimUnitId, immuneUnitId };
}

// ── Desert Attrition ──

describe('desert attrition', () => {
  it('deals 1 damage to a non-immune unit on desert terrain', () => {
    // steppe_clan has passiveTrait='foraging_riders' — NOT immune to desert
    const { state, victimUnitId } = buildTerrainTestState('steppe_clan', 'desert');

    const result = applyEnvironmentalDamage(state, 'steppe_clan' as never, registry);
    expect(result.units.get(victimUnitId)?.hp).toBe(9);
  });

  it('immune faction desert_logistics (desert_nomads) takes no desert damage', () => {
    const { state, immuneUnitId } = buildTerrainTestState(
      'steppe_clan',
      'desert',
      { immuneFactionId: 'desert_nomads' },
    );

    // Process both factions
    let result = applyEnvironmentalDamage(state, 'steppe_clan' as never, registry);
    result = applyEnvironmentalDamage(result, 'desert_nomads' as never, registry);

    // steppe_clan (non-immune) should take damage
    expect(result.units.get(state.factions.get('steppe_clan' as never)!.unitIds[0])?.hp).toBe(9);
    // desert_nomads (immune) should NOT take damage
    expect(result.units.get(immuneUnitId)?.hp).toBe(10);
  });

  it('immune faction charge_momentum (savannah_lions) takes no desert damage', () => {
    const { state, immuneUnitId } = buildTerrainTestState(
      'steppe_clan',
      'desert',
      { immuneFactionId: 'savannah_lions' },
    );

    let result = applyEnvironmentalDamage(state, 'steppe_clan' as never, registry);
    result = applyEnvironmentalDamage(result, 'savannah_lions' as never, registry);

    expect(result.units.get(immuneUnitId)?.hp).toBe(10);
  });

  it('kills a unit at 1 HP from desert attrition', () => {
    const { state, victimUnitId } = buildTerrainTestState('steppe_clan', 'desert');
    state.units.set(victimUnitId, { ...state.units.get(victimUnitId)!, hp: 1 });

    const result = applyEnvironmentalDamage(state, 'steppe_clan' as never, registry);
    expect(result.units.has(victimUnitId)).toBe(false);
  });
});

// ── Tundra Attrition ──

describe('tundra attrition', () => {
  it('deals 1 damage to a non-immune unit on tundra terrain', () => {
    // jungle_clan has passiveTrait='jungle_stalkers' — NOT immune to tundra
    const { state, victimUnitId } = buildTerrainTestState('jungle_clan', 'tundra');

    const result = applyEnvironmentalDamage(state, 'jungle_clan' as never, registry);
    expect(result.units.get(victimUnitId)?.hp).toBe(9);
  });

  it('immune faction cold_hardened_growth (frost_wardens) takes no tundra damage', () => {
    const { state, immuneUnitId } = buildTerrainTestState(
      'jungle_clan',
      'tundra',
      { immuneFactionId: 'frost_wardens' },
    );

    let result = applyEnvironmentalDamage(state, 'jungle_clan' as never, registry);
    result = applyEnvironmentalDamage(result, 'frost_wardens' as never, registry);

    // jungle_clan (non-immune) should take damage
    expect(result.units.get(state.factions.get('jungle_clan' as never)!.unitIds[0])?.hp).toBe(9);
    // coral_dominion (immune) should NOT
    expect(result.units.get(immuneUnitId)?.hp).toBe(10);
  });

  it('immune faction foraging_riders (steppe_clan) takes no tundra damage', () => {
    const { state, immuneUnitId } = buildTerrainTestState(
      'jungle_clan',
      'tundra',
      { immuneFactionId: 'steppe_clan' },
    );

    let result = applyEnvironmentalDamage(state, 'jungle_clan' as never, registry);
    result = applyEnvironmentalDamage(result, 'steppe_clan' as never, registry);

    expect(result.units.get(immuneUnitId)?.hp).toBe(10);
  });
});

// ── Swamp Attrition ──

describe('swamp attrition', () => {
  it('deals 1 damage to a non-immune unit on swamp terrain', () => {
    // hill_clan has passiveTrait='hill_engineering' — NOT immune to swamp
    const { state, victimUnitId } = buildTerrainTestState('hill_clan', 'swamp');

    const result = applyEnvironmentalDamage(state, 'hill_clan' as never, registry);
    expect(result.units.get(victimUnitId)?.hp).toBe(9);
  });

  it('immune faction healing_druids (druid_circle) takes no swamp damage', () => {
    const { state, immuneUnitId } = buildTerrainTestState(
      'hill_clan',
      'swamp',
      { immuneFactionId: 'druid_circle' },
    );

    let result = applyEnvironmentalDamage(state, 'hill_clan' as never, registry);
    result = applyEnvironmentalDamage(result, 'druid_circle' as never, registry);

    expect(result.units.get(immuneUnitId)?.hp).toBe(10);
  });

  it('immune faction jungle_stalkers (jungle_clan) takes no swamp damage', () => {
    const { state, immuneUnitId } = buildTerrainTestState(
      'hill_clan',
      'swamp',
      { immuneFactionId: 'jungle_clan' },
    );

    let result = applyEnvironmentalDamage(state, 'hill_clan' as never, registry);
    result = applyEnvironmentalDamage(result, 'jungle_clan' as never, registry);

    expect(result.units.get(immuneUnitId)?.hp).toBe(10);
  });

  it('immune faction river_assault (plains_riders) takes no swamp damage', () => {
    const { state, immuneUnitId } = buildTerrainTestState(
      'hill_clan',
      'swamp',
      { immuneFactionId: 'plains_riders' },
    );

    let result = applyEnvironmentalDamage(state, 'hill_clan' as never, registry);
    result = applyEnvironmentalDamage(result, 'plains_riders' as never, registry);

    expect(result.units.get(immuneUnitId)?.hp).toBe(10);
  });

  it('amphibious unit takes no swamp damage regardless of faction', () => {
    // coral_people has passiveTrait='greedy' — NOT a swamp-immune trait
    // but we'll give the unit prototype the 'amphibious' tag
    const { state, victimUnitId } = buildTerrainTestState(
      'coral_people',
      'swamp',
      { unitTags: ['amphibious'] },
    );

    const result = applyEnvironmentalDamage(state, 'coral_people' as never, registry);
    expect(result.units.get(victimUnitId)?.hp).toBe(10);
  });

  it('non-amphibious unit on swamp still takes damage without immune trait', () => {
    const { state, victimUnitId } = buildTerrainTestState('coral_people', 'swamp');

    const result = applyEnvironmentalDamage(state, 'coral_people' as never, registry);
    expect(result.units.get(victimUnitId)?.hp).toBe(9);
  });
});

// ── Settlement Safety (shared across all terrains) ──

describe('terrain attrition settlement safety', () => {
  it('does not apply desert attrition to a unit in a friendly city', () => {
    const state = buildMvpScenario(42);
    const factionId = 'steppe_clan' as never;
    const unitId = state.factions.get(factionId)!.unitIds[0];
    const cityId = state.factions.get(factionId)!.cityIds[0];
    const city = state.cities.get(cityId)!;

    // Place unit on the city hex, set terrain to desert
    const cityPos = city.position;
    state.units.set(unitId, { ...state.units.get(unitId)!, position: cityPos, hp: 10 });
    state.map!.tiles.set(hexToKey(cityPos), { position: cityPos, terrain: 'desert' as never });

    const result = applyEnvironmentalDamage(state, factionId, registry);
    // Unit is safe in city despite desert terrain
    expect(result.units.get(unitId)?.hp).toBe(10);
  });

  it('does not apply tundra attrition to a unit in a friendly village', () => {
    const state = buildMvpScenario(42);
    const factionId = 'jungle_clan' as never;
    const unitId = state.factions.get(factionId)!.unitIds[0];

    // Create a village at (8,8) and place the unit there on tundra
    const villagePos = { q: 8, r: 8 };
    state.villages = new Map([
      ['test_village' as never, {
        id: 'test_village' as never,
        factionId,
        position: villagePos,
        name: 'Test Village',
        foundedRound: 1,
        productionBonus: 1,
        supplyBonus: 1,
      }],
    ]);
    state.factions.set(factionId, {
      ...state.factions.get(factionId)!,
      villageIds: ['test_village' as never],
    });
    state.units.set(unitId, { ...state.units.get(unitId)!, position: villagePos, hp: 10 });
    state.map!.tiles.set(hexToKey(villagePos), { position: villagePos, terrain: 'tundra' as never });

    const result = applyEnvironmentalDamage(state, factionId, registry);
    expect(result.units.get(unitId)?.hp).toBe(10);
  });
});

// ── No attrition on non-hostile terrain ──

describe('no attrition on benign terrain', () => {
  it('plains terrain deals no attrition damage', () => {
    const { state, victimUnitId } = buildTerrainTestState('steppe_clan', 'plains');

    const result = applyEnvironmentalDamage(state, 'steppe_clan' as never, registry);
    expect(result.units.get(victimUnitId)?.hp).toBe(10);
  });

  it('forest terrain deals no attrition damage', () => {
    const { state, victimUnitId } = buildTerrainTestState('steppe_clan', 'forest');

    const result = applyEnvironmentalDamage(state, 'steppe_clan' as never, registry);
    expect(result.units.get(victimUnitId)?.hp).toBe(10);
  });
});
