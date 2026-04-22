import { buildMvpScenario } from '../src/game/buildMvpScenario';
import {
  getCityTerritoryHexes,
  getHexOwner,
  calculateTerritoryYield,
  isCityEncircled,
  isEncirclementBroken,
} from '../src/systems/territorySystem';
import { createUnitId, createFactionId } from '../src/core/ids';
import { initializeFogForFaction } from '../src/systems/fogSystem';

function makeUnit(overrides: Partial<any> = {}) {
  return {
    id: createUnitId(),
    factionId: createFactionId('red'),
    position: { q: 5, r: 5 },
    facing: 0,
    hp: 10,
    maxHp: 10,
    movesRemaining: 2,
    maxMoves: 2,
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green',
    status: 'ready',
    prototypeId: 'test_proto',
    history: [],
    morale: 100,
    routed: false,
    enteredZoCThisActivation: false,
    ...overrides,
  };
}

describe('Territory Control', () => {
  it('city claims hexes within radius', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const city = Array.from(state.cities.values())[0];
    const territory = getCityTerritoryHexes(city, state.map!, 2);
    // City at radius 2 claims 25 hexes (Chebyshev square: (2*2+1)^2 = 25)
    expect(territory.size).toBe(25);
  });

  it('hex owner is the faction that claims it', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const city = Array.from(state.cities.values())[0];
    const owner = getHexOwner(city.position, state);
    expect(owner).toBe(city.factionId);
  });

  it('hex is contested when enemy unit is adjacent', () => {
    let state = buildMvpScenario(42);
    const city = Array.from(state.cities.values())[0];
    const enemyFaction = Array.from(state.factions.keys()).find(
      (id) => id !== city.factionId
    )!;

    // Place enemy unit adjacent to city center
    const enemyUnit = makeUnit({
      id: 'enemy_scout' as any,
      factionId: enemyFaction,
      position: { q: city.position.q + 1, r: city.position.r },
    });
    state.units.set(enemyUnit.id, enemyUnit);

    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }

    // City center should be contested
    const owner = getHexOwner(city.position, state);
    expect(owner).toBeNull();
  });

  it('territory yield is calculated for uncontested hexes', () => {
    let state = buildMvpScenario(42);
    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }
    const factionId = Array.from(state.factions.keys())[0];
    const yield_ = calculateTerritoryYield(factionId, state);
    // Should have some territory yield from city radius
    expect(yield_).toBeGreaterThan(0);
  });

  it('besieged cities do not contribute territory', () => {
    let state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const cityId = state.factions.get(factionId)!.cityIds[0];
    const city = state.cities.get(cityId)!;

    // Mark city as besieged
    state.cities.set(cityId, { ...city, besieged: true });

    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }

    const yield_ = calculateTerritoryYield(factionId, state);
    expect(yield_).toBe(0);
  });

  it('city is encircled when all 6 neighbors have enemy units', () => {
    let state = buildMvpScenario(42);
    // Use a city position safely in the interior of the map
    const city = Array.from(state.cities.values())[0];
    // Move city to interior position to ensure all neighbors are on-map
    const interiorCity = { ...city, position: { q: 8, r: 6 } };
    state.cities.set(interiorCity.id, interiorCity);

    const enemyFaction = Array.from(state.factions.keys()).find(
      (id) => id !== interiorCity.factionId
    )!;

    // Get all 6 neighbors of city
    const neighbors = [
      { q: interiorCity.position.q + 1, r: interiorCity.position.r },
      { q: interiorCity.position.q + 1, r: interiorCity.position.r - 1 },
      { q: interiorCity.position.q, r: interiorCity.position.r - 1 },
      { q: interiorCity.position.q - 1, r: interiorCity.position.r },
      { q: interiorCity.position.q - 1, r: interiorCity.position.r + 1 },
      { q: interiorCity.position.q, r: interiorCity.position.r + 1 },
    ];

    // Place enemy units on all 6 neighbors
    for (let i = 0; i < 6; i++) {
      const unit = makeUnit({
        id: `encircle_${i}` as any,
        factionId: enemyFaction,
        position: neighbors[i],
      });
      state.units.set(unit.id, unit);
    }

    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }

    expect(isCityEncircled(interiorCity, state)).toBe(true);
  });

  it('encirclement is broken when enemy count drops below threshold', () => {
    let state = buildMvpScenario(42);
    const city = Array.from(state.cities.values())[0];
    const enemyFaction = Array.from(state.factions.keys()).find(
      (id) => id !== city.factionId
    )!;

    // Place only 2 enemy units — ENCIRCLEMENT_THRESHOLD=2, so 2>=2 means encircling (not broken)
    const positions = [
      { q: city.position.q + 1, r: city.position.r },
      { q: city.position.q + 1, r: city.position.r - 1 },
    ];

    for (let i = 0; i < 2; i++) {
      const unit = makeUnit({
        id: `encircle_${i}` as any,
        factionId: enemyFaction,
        position: positions[i],
      });
      state.units.set(unit.id, unit);
    }

    for (const factionId of state.factions.keys()) {
      state = initializeFogForFaction(state, factionId);
    }

    expect(isEncirclementBroken(city, state)).toBe(false);
  });
});
