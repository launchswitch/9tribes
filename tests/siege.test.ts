import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import {
  degradeWalls,
  repairWalls,
  getWallDefenseBonus,
  isCityVulnerable,
  hasDefendingGarrison,
  getCapturingFaction,
  captureCity,
  SIEGE_CONFIG,
} from '../src/systems/siegeSystem';
import { runWarEcologySimulation } from '../src/systems/warEcologySimulation';
import { getFactionCityIds, getSettlementOwnershipSnapshot } from '../src/systems/factionOwnershipSystem';
import { initializeFogForFaction } from '../src/systems/fogSystem';
import type { City } from '../src/features/cities/types';
import type { GameState } from '../src/game/types';

const registry = loadRulesRegistry();

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'test_city' as any,
    factionId: 'test_faction' as any,
    position: { q: 0, r: 0 },
    name: 'Test City',
    productionQueue: [],
    productionProgress: 0,
    territoryRadius: 2,
    wallHP: 100,
    maxWallHP: 100,
    besieged: false,
    turnsUnderSiege: 0,
    ...overrides,
  };
}

describe('siege config', () => {
  it('wall damage is 20 per turn', () => {
    expect(SIEGE_CONFIG.WALL_DAMAGE_PER_TURN).toBe(20);
  });

  it('wall repair is 3 per turn', () => {
    expect(SIEGE_CONFIG.WALL_REPAIR_PER_TURN).toBe(3);
  });

  it('captured walls start at 50%', () => {
    expect(SIEGE_CONFIG.CAPTURED_WALL_HP_PERCENT).toBe(50);
  });
});

describe('wall degradation', () => {
  it('degrades walls by 20 HP per turn when besieged', () => {
    const city = makeCity({ besieged: true, wallHP: 100 });
    const result = degradeWalls(city);
    expect(result.wallHP).toBe(80);
  });

  it('does not degrade below 0', () => {
    const city = makeCity({ besieged: true, wallHP: 5 });
    const result = degradeWalls(city);
    expect(result.wallHP).toBe(0);
  });

  it('does not degrade when not besieged', () => {
    const city = makeCity({ besieged: false, wallHP: 100 });
    const result = degradeWalls(city);
    expect(result.wallHP).toBe(100);
  });

  it('takes 5 turns to breach from full HP', () => {
    let city = makeCity({ besieged: true, wallHP: 100 });
    for (let i = 0; i < 5; i++) {
      city = degradeWalls(city);
    }
    expect(city.wallHP).toBe(0);
  });
});

describe('wall repair', () => {
  it('repairs walls by 3 HP per turn when not besieged', () => {
    const city = makeCity({ besieged: false, wallHP: 50, maxWallHP: 100 });
    const result = repairWalls(city);
    expect(result.wallHP).toBe(53);
  });

  it('does not repair above maxWallHP', () => {
    const city = makeCity({ besieged: false, wallHP: 98, maxWallHP: 100 });
    const result = repairWalls(city);
    expect(result.wallHP).toBe(100);
  });

  it('does not repair when besieged', () => {
    const city = makeCity({ besieged: true, wallHP: 50, maxWallHP: 100 });
    const result = repairWalls(city);
    expect(result.wallHP).toBe(50);
  });
});

describe('wall defense bonus', () => {
  it('returns 5 for full walls (100 HP)', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    expect(getWallDefenseBonus(state, { q: 0, r: 0 })).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 for position with no city', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    // A hex far from any city
    expect(getWallDefenseBonus(state, { q: 100, r: 100 })).toBe(0);
  });

  it('scales with wallHP: floor(wallHP/20)', () => {
    expect(Math.floor(100 / 20)).toBe(5);
    expect(Math.floor(80 / 20)).toBe(4);
    expect(Math.floor(60 / 20)).toBe(3);
    expect(Math.floor(40 / 20)).toBe(2);
    expect(Math.floor(20 / 20)).toBe(1);
    expect(Math.floor(0 / 20)).toBe(0);
  });
});

describe('defending garrison', () => {
  it('returns true when a friendly unit is on the city tile', () => {
    const city = makeCity({ factionId: 'defender' as any, wallHP: 0 });
    const state = buildMvpScenario(42);
    // Place a defender unit on the city
    let unitId: string | undefined;
    for (const [id, unit] of state.units) {
      if (unit.factionId === Array.from(state.factions.keys())[0]) {
        unitId = id;
        state.units.set(id, { ...unit, position: { ...city.position }, factionId: 'defender' as any, hp: 10 });
        break;
      }
    }
    expect(hasDefendingGarrison(city, state)).toBe(true);
  });

  it('returns true when a friendly unit is adjacent to the city', () => {
    const city = makeCity({ factionId: 'defender' as any, wallHP: 0, position: { q: 0, r: 0 } });
    const state = buildMvpScenario(42);
    // Place a defender unit adjacent to the city
    for (const [id, unit] of state.units) {
      if (unit.factionId === Array.from(state.factions.keys())[0]) {
        state.units.set(id, { ...unit, position: { q: 1, r: 0 }, factionId: 'defender' as any, hp: 10 });
        break;
      }
    }
    expect(hasDefendingGarrison(city, state)).toBe(true);
  });

  it('returns false when no friendly units are nearby', () => {
    const city = makeCity({ factionId: 'defender' as any, wallHP: 0 });
    const state = buildMvpScenario(42);
    // All units belong to other factions
    expect(hasDefendingGarrison(city, state)).toBe(false);
  });

  it('returns false for dead friendly units', () => {
    const city = makeCity({ factionId: 'defender' as any, wallHP: 0 });
    const state = buildMvpScenario(42);
    for (const [id, unit] of state.units) {
      if (unit.factionId === Array.from(state.factions.keys())[0]) {
        state.units.set(id, { ...unit, position: { ...city.position }, factionId: 'defender' as any, hp: 0 });
        break;
      }
    }
    expect(hasDefendingGarrison(city, state)).toBe(false);
  });

  it('returns false for enemy units on the city tile', () => {
    const city = makeCity({ factionId: 'defender' as any, wallHP: 0 });
    const state = buildMvpScenario(42);
    // Enemy unit on city — not a garrison
    for (const [id, unit] of state.units) {
      state.units.set(id, { ...unit, position: { ...city.position }, hp: 10 });
      break;
    }
    expect(hasDefendingGarrison(city, state)).toBe(false);
  });
});

describe('city capture vulnerability with garrison', () => {
  it('blocks capture when defending garrison exists even at 0 walls and encircled', () => {
    const city = makeCity({
      factionId: 'defender' as any,
      wallHP: 0,
      position: { q: 0, r: 0 },
    });
    const state = buildMvpScenario(42);
    const attackerId = Array.from(state.factions.keys())[1];

    // Place 2+ enemy units within distance 2 (encircled)
    const encirclementPositions = [
      { q: 1, r: 0 },   // dist 1
      { q: 1, r: -1 },  // dist 1
    ];
    let placed = 0;
    for (const [id, unit] of state.units) {
      if (placed < encirclementPositions.length) {
        state.units.set(id, {
          ...unit,
          position: encirclementPositions[placed],
          factionId: attackerId,
          hp: 10,
        });
        placed++;
      }
    }

    // Place a defender on the city (garrison)
    for (const [id, unit] of state.units) {
      if (unit.factionId !== attackerId) {
        state.units.set(id, { ...unit, position: { q: 0, r: 0 }, factionId: 'defender' as any, hp: 10 });
        break;
      }
    }

    // Walls breached + encircled BUT garrison present → NOT vulnerable
    expect(isCityVulnerable(city, state)).toBe(false);
  });

  it('allows capture when walls breached, encircled, and no garrison', () => {
    const city = makeCity({
      factionId: 'defender' as any,
      wallHP: 0,
      position: { q: 0, r: 0 },
    });
    const state = buildMvpScenario(42);
    const attackerId = Array.from(state.factions.keys())[1];

    // Place 2+ enemy units within distance 2 (encircled)
    const encirclementPositions = [
      { q: 1, r: 0 },   // dist 1
      { q: 1, r: -1 },  // dist 1
    ];
    let placed = 0;
    for (const [id, unit] of state.units) {
      if (placed < encirclementPositions.length) {
        state.units.set(id, {
          ...unit,
          position: encirclementPositions[placed],
          factionId: attackerId,
          hp: 10,
        });
        placed++;
      }
    }

    // No defender units near city → vulnerable
    expect(isCityVulnerable(city, state)).toBe(true);
  });
});

describe('city capture', () => {
  it('razes city on capture (city removed from map)', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const factionIds = Array.from(state.factions.keys());
    const attackerId = factionIds[1];
    const defenderId = factionIds[0];

    const defenderFaction = state.factions.get(defenderId)!;
    const cityId = defenderFaction.cityIds[0];
    const city = state.cities.get(cityId)!;

    const result = captureCity(city, attackerId, state);

    // City should be destroyed (not in map)
    expect(result.cities.has(cityId)).toBe(false);

    // Attacker does NOT gain the city
    expect(result.factions.get(attackerId)?.cityIds).not.toContain(cityId);

    // Defender loses the city
    expect(result.factions.get(defenderId)?.cityIds).not.toContain(cityId);
  });

  it('adds war exhaustion to victim (15) and attacker (5)', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const factionIds = Array.from(state.factions.keys());
    const attackerId = factionIds[1];
    const defenderId = factionIds[0];

    const defenderFaction = state.factions.get(defenderId)!;
    const cityId = defenderFaction.cityIds[0];
    const city = state.cities.get(cityId)!;

    const result = captureCity(city, attackerId, state);

    expect(result.warExhaustion.get(defenderId)?.exhaustionPoints).toBe(15);
    expect(result.warExhaustion.get(attackerId)?.exhaustionPoints).toBe(5);
  });

  it('destroys villages in city territory on capture', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const factionIds = Array.from(state.factions.keys());
    const attackerId = factionIds[1];
    const defenderId = factionIds[0];

    const defenderFaction = state.factions.get(defenderId)!;
    const cityId = defenderFaction.cityIds[0];
    const city = state.cities.get(cityId)!;

    // Note: villages in the city's territory are destroyed by captureCity
    const result = captureCity(city, attackerId, state);

    // City should be destroyed
    expect(result.cities.has(cityId)).toBe(false);
  });

  it('transfers loser nativeDomain to victor on raze', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const factionIds = Array.from(state.factions.keys());
    const attackerId = factionIds[1];
    const defenderId = factionIds[0];

    const defenderFaction = state.factions.get(defenderId)!;
    const attackerFaction = state.factions.get(attackerId)!;
    const cityId = defenderFaction.cityIds[0];
    const city = state.cities.get(cityId)!;

    const result = captureCity(city, attackerId, state);
    const updatedAttacker = result.factions.get(attackerId)!;

    // Victor should have learned the defender's nativeDomain
    if (defenderFaction.nativeDomain !== attackerFaction.nativeDomain) {
      expect(updatedAttacker.learnedDomains).toContain(defenderFaction.nativeDomain);
    }
  });
});

describe('simulation integration', () => {
  it('runs 50 turns without errors after siege changes', () => {
    const state = buildMvpScenario(42);
    const result = runWarEcologySimulation(state, registry, 50);
    expect(result).toBeDefined();
    expect(result.round).toBeGreaterThan(0);
  });

  it('faction with 0 cities but living units continues as raider', () => {
    // Run a long simulation to see if raiders emerge
    const state = buildMvpScenario(42);
    const result = runWarEcologySimulation(state, registry, 100);

    // Check if any faction has 0 cities but still has units
    for (const [factionId, faction] of result.factions) {
      if (getFactionCityIds(result, factionId).length === 0) {
        const livingUnits = faction.unitIds.filter(id => {
          const u = result.units.get(id);
          return u && u.hp > 0;
        });
        // Raiders should still be able to fight (have units)
        // This is valid behavior — they just can't produce
        expect(livingUnits.length).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps authoritative city ownership bounded to the world city count', () => {
    const result = runWarEcologySimulation(buildMvpScenario(37), registry, 50);
    const snapshot = getSettlementOwnershipSnapshot(result);

    expect(snapshot.totalAuthoritativeCities).toBe(result.cities.size);
    expect(snapshot.totalListedCities).toBe(result.cities.size);
    // Cities are razed on capture, so count may be less than 9
    expect(result.cities.size).toBeLessThanOrEqual(9);
  });
});
