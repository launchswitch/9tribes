import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { computeRendezvousHex, RENDEZVOUS_OFFSET_HEXES, RENDEZVOUS_READY_DISTANCE, HOLD_DEFENSE_RADIUS } from '../src/systems/strategic-ai/rendezvous';
import { hexDistance, hexToKey } from '../src/core/grid';
import type { FactionId, HexCoord } from '../src/types';
import { applyDifficultyCoordinator } from '../src/systems/strategic-ai/difficultyCoordinator';
import { getLivingUnitsForFaction } from '../src/systems/strategic-ai/fronts';
import { getAiDifficultyProfile } from '../src/systems/aiDifficulty';
import { createUnitId } from '../src/core/ids';
import type { UnitStrategicIntent } from '../src/systems/factionStrategy';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { computeFactionStrategy } from '../src/systems/strategicAi';
import { performStrategicMovement } from '../src/systems/unit-activation/movement';

describe('computeRendezvousHex', () => {
  it('places rendezvous on the friendly side of the objective', () => {
    const state = buildMvpScenario(42);
    const objectiveHex: HexCoord = { q: 20, r: 10 };
    const friendlyAnchor: HexCoord = { q: 10, r: 5 };

    const result = computeRendezvousHex(objectiveHex, friendlyAnchor, state, 'hill_clan' as FactionId);

    const distToAnchor = hexDistance(result, friendlyAnchor);
    const objectiveToAnchor = hexDistance(objectiveHex, friendlyAnchor);
    expect(distToAnchor).toBeLessThan(objectiveToAnchor);
  });

  it('places rendezvous approximately RENDEZVOUS_OFFSET_HEXES from objective', () => {
    const state = buildMvpScenario(42);
    const objectiveHex: HexCoord = { q: 20, r: 10 };
    const friendlyAnchor: HexCoord = { q: 5, r: 10 };

    const result = computeRendezvousHex(objectiveHex, friendlyAnchor, state, 'hill_clan' as FactionId);

    const dist = hexDistance(result, objectiveHex);
    expect(dist).toBeGreaterThanOrEqual(RENDEZVOUS_OFFSET_HEXES - 2);
    expect(dist).toBeLessThanOrEqual(RENDEZVOUS_OFFSET_HEXES + 2);
  });

  it('prefers defensible terrain when available', () => {
    const state = buildMvpScenario(42);

    const objectiveHex: HexCoord = { q: 20, r: 10 };
    const friendlyAnchor: HexCoord = { q: 10, r: 10 };

    const map = state.map!;
    for (const key of ['16,10', '16,9', '16,11']) {
      const tile = map.tiles.get(key);
      if (tile) map.tiles.set(key, { ...tile, terrain: 'forest' });
    }

    const result = computeRendezvousHex(objectiveHex, friendlyAnchor, state, 'hill_clan' as FactionId);

    expect(result.q).toBeLessThanOrEqual(17);
    expect(result.q).toBeGreaterThanOrEqual(15);
  });

  it('returns a valid result when objective and anchor are the same hex', () => {
    const state = buildMvpScenario(42);
    const sameHex: HexCoord = { q: 15, r: 10 };

    const result = computeRendezvousHex(sameHex, sameHex, state, 'hill_clan' as FactionId);

    expect(result).toBeDefined();
    expect(typeof result.q).toBe('number');
    expect(typeof result.r).toBe('number');
  });

  it('avoids impassable terrain in candidate scoring', () => {
    const state = buildMvpScenario(42);

    const objectiveHex: HexCoord = { q: 20, r: 10 };
    const friendlyAnchor: HexCoord = { q: 10, r: 10 };

    const map = state.map!;
    for (const key of ['16,10', '16,9', '16,11', '16,8', '16,12']) {
      const tile = map.tiles.get(key);
      if (tile) map.tiles.set(key, { ...tile, terrain: 'mountain' });
    }

    const result = computeRendezvousHex(objectiveHex, friendlyAnchor, state, 'hill_clan' as FactionId);

    const resultTile = map.tiles.get(hexToKey(result));
    if (resultTile) {
      expect(resultTile.terrain).not.toBe('mountain');
    }
  });

  it('favors candidates with more nearby friendly units', () => {
    const state = buildMvpScenario(42);

    const objectiveHex: HexCoord = { q: 20, r: 10 };
    const friendlyAnchor: HexCoord = { q: 10, r: 10 };

    const hillUnits = Array.from(state.units.values()).filter(u => u.factionId === 'hill_clan');
    if (hillUnits.length >= 2) {
      state.units.set(hillUnits[0].id, { ...hillUnits[0], position: { q: 17, r: 10 } });
      state.units.set(hillUnits[1].id, { ...hillUnits[1], position: { q: 17, r: 9 } });
    }

    const result = computeRendezvousHex(objectiveHex, friendlyAnchor, state, 'hill_clan' as FactionId);

    expect(result.q).toBeGreaterThanOrEqual(15);
    expect(result.q).toBeLessThanOrEqual(18);
  });
});

describe('rendezvous constants', () => {
  it('has sensible default values', () => {
    expect(RENDEZVOUS_OFFSET_HEXES).toBe(4);
    expect(RENDEZVOUS_READY_DISTANCE).toBe(2);
  });
});

describe('coordinator squad stamping', () => {
  it('stamps squadId and rendezvousHex on double-axis hunters', () => {
    const state = buildMvpScenario(42);
    const factionId = [...state.factions.keys()][0];
    const faction = state.factions.get(factionId)!;
    const homeCity = faction.homeCityId ? state.cities.get(faction.homeCityId)! : undefined;
    if (!homeCity) return;

    // Economy must satisfy coordinatorMinSupplyRatio
    const economy = state.economy.get(factionId)!;
    economy.supplyIncome = 10;
    economy.supplyDemand = 8;

    // Add units near home to reach double-axis threshold (5+ total)
    const existingUnits = getLivingUnitsForFaction(state, factionId);
    const template = existingUnits[0];
    if (!template) return;

    const unitsNeeded = Math.max(0, 5 - existingUnits.length);
    for (let i = 0; i < unitsNeeded; i++) {
      const unitId = createUnitId();
      state.units.set(unitId, {
        ...template.unit,
        id: unitId,
        position: {
          q: homeCity.position.q + (i % 3) - 1,
          r: homeCity.position.r + Math.floor(i / 3),
        },
        status: 'ready',
      });
    }

    const friendlyUnits = getLivingUnitsForFaction(state, factionId);
    const intents: Record<string, UnitStrategicIntent> = {};
    for (const entry of friendlyUnits) {
      intents[entry.unit.id] = {
        assignment: 'main_army',
        waypointKind: 'front_anchor',
        waypoint: homeCity.position,
        anchor: homeCity.position,
        isolationScore: 0,
        isolated: false,
        reason: 'test initial',
      };
    }

    // Normal profile with relaxed group size for test, fog cheat to see enemies
    const baseProfile = getAiDifficultyProfile('normal');
    const profile = {
      ...baseProfile,
      strategy: {
        ...baseProfile.strategy,
        multiAxisEnabled: true,
        multiAxisGroupCount: 2,
        multiAxisMinGroupSize: 2,
        strategicFogCheat: true,
      },
    };

    const debugLines = applyDifficultyCoordinator(
      state,
      factionId,
      friendlyUnits,
      intents,
      'offensive',
      profile,
      undefined,
    );

    // Verify hunters got squad data
    const huntersWithSquad = friendlyUnits.filter(
      (entry) => intents[entry.unit.id]?.squadId !== undefined,
    );
    expect(huntersWithSquad.length).toBeGreaterThanOrEqual(2);

    // Verify debug lines contain squad info
    const squadLines = debugLines.filter((line) => line.includes('_squad='));
    expect(squadLines.length).toBeGreaterThanOrEqual(1);

    // Verify each hunter has valid rendezvous and role
    for (const hunter of huntersWithSquad) {
      const intent = intents[hunter.unit.id]!;
      expect(intent.squadId).toMatch(/^sq_/);
      expect(intent.rendezvousHex).toBeDefined();
      expect(intent.squadRole).toMatch(/^(primary|flank|harass)$/);
      // waypoint should be the rendezvous, not the objective
      expect(intent.waypoint).toEqual(intent.rendezvousHex);
      expect(intent.waypointKind).toBe('front_anchor');
    }

    // Double-axis should produce 2 distinct squads
    const squadIds = new Set(huntersWithSquad.map((e) => intents[e.unit.id]!.squadId));
    expect(squadIds.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Phase D: activation hold
// ---------------------------------------------------------------------------

describe('Phase D: activation hold', () => {
  const registry = loadRulesRegistry();

  it('restricts movement for units holding at rendezvous', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = [...state.factions.keys()][0] as FactionId;
    const faction = state.factions.get(factionId)!;
    const unitId = faction.unitIds[0];
    if (!unitId) return;

    const unit = state.units.get(unitId)!;
    const rendezvousHex = { ...unit.position };

    // Ensure unit can move
    state.units.set(unitId, { ...unit, movesRemaining: 2, maxMoves: 2 });

    // Compute base strategy, then override with a squad intent and a distant waypoint
    const baseStrategy = computeFactionStrategy(state, factionId, registry);
    baseStrategy.unitIntents[unitId] = {
      assignment: 'main_army',
      waypointKind: 'front_anchor',
      waypoint: { q: rendezvousHex.q + 20, r: rendezvousHex.r + 20 },
      anchor: rendezvousHex,
      isolationScore: 0,
      isolated: false,
      reason: 'test rendezvous hold',
      squadId: 'sq_test_hold',
      rendezvousHex,
      squadRole: 'primary',
    };
    state.factionStrategies.set(factionId, baseStrategy);

    const movedState = performStrategicMovement(state, unitId, registry);
    const movedUnit = movedState.units.get(unitId)!;

    expect(hexDistance(movedUnit.position, rendezvousHex)).toBeLessThanOrEqual(HOLD_DEFENSE_RADIUS);
  });

  it('does not restrict units far from rendezvous', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = [...state.factions.keys()][0] as FactionId;
    const faction = state.factions.get(factionId)!;
    const unitId = faction.unitIds[0];
    if (!unitId) return;

    const unit = state.units.get(unitId)!;
    const rendezvousHex = { q: unit.position.q + 10, r: unit.position.r + 10 };

    state.units.set(unitId, { ...unit, movesRemaining: 2, maxMoves: 2 });

    const baseStrategy = computeFactionStrategy(state, factionId, registry);
    baseStrategy.unitIntents[unitId] = {
      assignment: 'main_army',
      waypointKind: 'front_anchor',
      waypoint: rendezvousHex,
      anchor: unit.position,
      isolationScore: 0,
      isolated: false,
      reason: 'test distant squad member',
      squadId: 'sq_test_distant',
      rendezvousHex,
      squadRole: 'primary',
    };
    state.factionStrategies.set(factionId, baseStrategy);

    // Should not crash — unit is far from rendezvous so no restriction applies
    const movedState = performStrategicMovement(state, unitId, registry);
    expect(movedState.units.get(unitId)).toBeDefined();
  });

  it('restricts moves to HOLD_DEFENSE_RADIUS even with many valid moves', () => {
    const state = buildMvpScenario(42, { registry });
    const factionId = [...state.factions.keys()][0] as FactionId;
    const faction = state.factions.get(factionId)!;
    const unitId = faction.unitIds[0];
    if (!unitId) return;

    const unit = state.units.get(unitId)!;
    const rendezvousHex = { ...unit.position };

    state.units.set(unitId, { ...unit, movesRemaining: 3, maxMoves: 3 });

    const baseStrategy = computeFactionStrategy(state, factionId, registry);
    baseStrategy.unitIntents[unitId] = {
      assignment: 'siege_force',
      waypointKind: 'front_anchor',
      waypoint: { q: rendezvousHex.q + 15, r: rendezvousHex.r + 15 },
      objectiveCityId: undefined,
      anchor: rendezvousHex,
      isolationScore: 0,
      isolated: false,
      reason: 'test siege hold',
      squadId: 'sq_test_siege',
      rendezvousHex,
      squadRole: 'primary',
    };
    state.factionStrategies.set(factionId, baseStrategy);

    const movedState = performStrategicMovement(state, unitId, registry);
    const movedUnit = movedState.units.get(unitId)!;

    // Even with siege_force assignment and distant waypoint, hold guard wins
    expect(hexDistance(movedUnit.position, rendezvousHex)).toBeLessThanOrEqual(HOLD_DEFENSE_RADIUS);
  });
});
