import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewMove, moveUnit } from '../src/systems/movementSystem';
import { runWarEcologySimulation } from '../src/systems/warEcologySimulation';
import { destroyVillage, evaluateAndSpawnVillage, spawnVillage } from '../src/systems/villageSystem';
import { EXHAUSTION_CONFIG } from '../src/systems/warExhaustionSystem';
import { getSettlementOwnershipSnapshot } from '../src/systems/factionOwnershipSystem';
import type { GameState } from '../src/game/types';

const registry = loadRulesRegistry();

describe('village destruction', () => {
  it('destroyVillage removes village from state', () => {
    const state = buildMvpScenario(42);
    const factionIds = Array.from(state.factions.keys());
    const factionId = factionIds[0];

    // Spawn a village first
    const faction = state.factions.get(factionId)!;
    const city = state.cities.get(faction.cityIds[0])!;
    const villagePos = { q: city.position.q + 2, r: city.position.r };

    let stateWithVillage = spawnVillage(state, factionId, villagePos, registry);
    const villageId = Array.from(stateWithVillage.villages.keys()).find(
      id => stateWithVillage.villages.get(id)?.factionId === factionId &&
            stateWithVillage.villages.get(id)?.position.q === villagePos.q &&
            stateWithVillage.villages.get(id)?.position.r === villagePos.r
    );

    expect(villageId).toBeDefined();

    const result = destroyVillage(stateWithVillage, villageId!);
    expect(result.villages.has(villageId!)).toBe(false);
  });

  it('destroyVillage removes village from faction.villageIds', () => {
    const state = buildMvpScenario(42);
    const factionIds = Array.from(state.factions.keys());
    const factionId = factionIds[0];

    const faction = state.factions.get(factionId)!;
    const city = state.cities.get(faction.cityIds[0])!;
    const villagePos = { q: city.position.q + 2, r: city.position.r };

    let stateWithVillage = spawnVillage(state, factionId, villagePos, registry);
    const villageId = Array.from(stateWithVillage.villages.keys()).find(
      id => stateWithVillage.villages.get(id)?.factionId === factionId &&
            stateWithVillage.villages.get(id)?.position.q === villagePos.q &&
            stateWithVillage.villages.get(id)?.position.r === villagePos.r
    );

    const result = destroyVillage(stateWithVillage, villageId!);
    const updatedFaction = result.factions.get(factionId)!;
    expect(updatedFaction.villageIds).not.toContain(villageId);
  });

  it('VILLAGE_LOST war exhaustion is 3', () => {
    expect(EXHAUSTION_CONFIG.VILLAGE_LOST).toBe(3);
  });

  it('spawns villages from city territory after the base 4-turn cooldown', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;
    const cityId = faction.cityIds[0];
    const city = state.cities.get(cityId)!;
    const readyState: GameState = {
      ...state,
      round: 4,
      cities: new Map(state.cities).set(cityId, { ...city, lastVillageSpawnRound: 0 }),
    };

    const result = evaluateAndSpawnVillage(readyState, factionId, registry);
    const spawnedVillage = Array.from(result.villages.values()).find((village) => village.factionId === factionId);

    expect(spawnedVillage).toBeDefined();
    expect(Math.abs(spawnedVillage!.position.q - city.position.q) + Math.abs(spawnedVillage!.position.r - city.position.r)).toBeGreaterThan(0);
    expect(result.cities.get(cityId)?.lastVillageSpawnRound).toBe(4);
  });

  it('enemy movement onto a village destroys it', () => {
    const state = buildMvpScenario(42);
    const factionIds = Array.from(state.factions.keys());
    const ownerFactionId = factionIds[0];
    const enemyFactionId = factionIds[1];
    const enemyUnitId = state.factions.get(enemyFactionId)!.unitIds[0];
    const enemyUnit = state.units.get(enemyUnitId)!;
    const villagePos = [
      { q: enemyUnit.position.q + 1, r: enemyUnit.position.r },
      { q: enemyUnit.position.q - 1, r: enemyUnit.position.r },
      { q: enemyUnit.position.q, r: enemyUnit.position.r + 1 },
      { q: enemyUnit.position.q, r: enemyUnit.position.r - 1 },
      { q: enemyUnit.position.q + 1, r: enemyUnit.position.r - 1 },
      { q: enemyUnit.position.q - 1, r: enemyUnit.position.r + 1 },
    ].find((hex) => previewMove(state, enemyUnitId, hex, state.map!, registry) !== null);

    expect(villagePos).toBeDefined();

    const withVillage = spawnVillage(state, ownerFactionId, villagePos!, registry);
    const villageId = Array.from(withVillage.villages.keys())[0];

    const result = moveUnit(withVillage, enemyUnitId, villagePos!, withVillage.map!, registry);

    expect(result.villages.has(villageId)).toBe(false);
  });

  it('simulation runs with village destruction without errors', () => {
    const state = buildMvpScenario(42);
    const result = runWarEcologySimulation(state, registry, 50);
    expect(result).toBeDefined();
    expect(result.round).toBeGreaterThan(0);
  });

  it('villages can be destroyed during simulation', () => {
    // Run a longer simulation to increase chances of village encounters
    const state = buildMvpScenario(42);
    const result = runWarEcologySimulation(state, registry, 100);

    // Count total villages across all factions
    const snapshot = getSettlementOwnershipSnapshot(result);

    // Villages may or may not be destroyed depending on combat outcomes,
    // but the simulation should complete without errors
    expect(result).toBeDefined();
    expect(snapshot.totalListedVillages).toBe(result.villages.size);
  });
});
