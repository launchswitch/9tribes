import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import {
  getZoCBlockers,
  getZoCMovementCost,
  calculateFlankingBonus,
  entersEnemyZoC,
} from '../src/systems/zocSystem';
import { createUnitId, createFactionId } from '../src/core/ids';
import { moveUnit } from '../src/systems/movementSystem';

const registry = loadRulesRegistry();

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

describe('Zone of Control', () => {
  it('detects adjacent enemy blockers', () => {
    const state = buildMvpScenario(42);
    state.units = new Map();
    // Place an enemy unit adjacent to a friendly unit
    const friendlyUnit = makeUnit({
      id: 'friendly_1' as any,
      factionId: 'red' as any,
      position: { q: 5, r: 5 },
    });
    const enemyUnit = makeUnit({
      id: 'enemy_1' as any,
      factionId: 'blue' as any,
      position: { q: 6, r: 5 }, // adjacent to friendly
    });

    state.units.set(friendlyUnit.id, friendlyUnit);
    state.units.set(enemyUnit.id, enemyUnit);

    const blockers = getZoCBlockers({ q: 5, r: 5 }, 'red' as any, state);
    expect(blockers.length).toBe(1);
    expect(blockers[0].id).toBe(enemyUnit.id);
  });

  it('does not count friendly units as blockers', () => {
    const state = buildMvpScenario(42);
    state.units = new Map();
    const friendlyUnit = makeUnit({
      id: 'friendly_1' as any,
      factionId: 'red' as any,
      position: { q: 5, r: 5 },
    });
    const friendlyUnit2 = makeUnit({
      id: 'friendly_2' as any,
      factionId: 'red' as any,
      position: { q: 6, r: 5 },
    });

    state.units.set(friendlyUnit.id, friendlyUnit);
    state.units.set(friendlyUnit2.id, friendlyUnit2);

    const blockers = getZoCBlockers({ q: 5, r: 5 }, 'red' as any, state);
    expect(blockers.length).toBe(0);
  });

  it('does not count routed units as blockers', () => {
    const state = buildMvpScenario(42);
    state.units = new Map();
    const enemyUnit = makeUnit({
      id: 'enemy_1' as any,
      factionId: 'blue' as any,
      position: { q: 6, r: 5 },
      routed: true,
    });

    state.units.set(enemyUnit.id, enemyUnit);

    const blockers = getZoCBlockers({ q: 5, r: 5 }, 'red' as any, state);
    expect(blockers.length).toBe(0);
  });

  it('adds +1 movement cost when entering enemy ZoC', () => {
    const state = buildMvpScenario(42);
    const movingUnit = makeUnit({
      id: 'mover' as any,
      factionId: 'red' as any,
      position: { q: 4, r: 5 },
      movesRemaining: 3,
    });
    const enemyUnit = makeUnit({
      id: 'enemy_1' as any,
      factionId: 'blue' as any,
      position: { q: 6, r: 5 }, // adjacent to target {5,5}
    });

    state.units.set(movingUnit.id, movingUnit);
    state.units.set(enemyUnit.id, enemyUnit);

    const cost = getZoCMovementCost({ q: 5, r: 5 }, movingUnit, state);
    expect(cost).toBe(1);
  });

  it('cavalry ignores ZoC movement cost', () => {
    const state = buildMvpScenario(42);
    // Create a cavalry prototype
    const cavalryProto = {
      id: 'cav_proto' as any,
      factionId: 'red' as any,
      chassisId: 'cavalry_frame' as any,
      componentIds: [],
      version: 1,
      name: 'Cavalry',
      derivedStats: { hp: 9, attack: 2, defense: 1, moves: 4, range: 1, role: 'mounted' },
    };
    state.prototypes.set(cavalryProto.id, cavalryProto);

    const cavalryUnit = makeUnit({
      id: 'cavalry' as any,
      factionId: 'red' as any,
      position: { q: 4, r: 5 },
      prototypeId: cavalryProto.id,
    });
    const enemyUnit = makeUnit({
      id: 'enemy_1' as any,
      factionId: 'blue' as any,
      position: { q: 6, r: 5 },
    });

    state.units.set(cavalryUnit.id, cavalryUnit);
    state.units.set(enemyUnit.id, enemyUnit);

    const cost = getZoCMovementCost({ q: 5, r: 5 }, cavalryUnit, state);
    expect(cost).toBe(0); // cavalry ignores ZoC
  });

  it('forced stop exhausts infantry movement when newly entering enemy ZoC', () => {
    const state = buildMvpScenario(42);
    state.units = new Map();
    const mover = makeUnit({
      id: 'mover' as any,
      factionId: 'red' as any,
      position: { q: 4, r: 5 },
      movesRemaining: 3,
      maxMoves: 3,
    });
    const enemyUnit = makeUnit({
      id: 'enemy_1' as any,
      factionId: 'blue' as any,
      position: { q: 6, r: 5 },
    });

    state.units.set(mover.id, mover);
    state.units.set(enemyUnit.id, enemyUnit);

    expect(entersEnemyZoC(mover.position, { q: 5, r: 5 }, mover, state)).toBe(true);

    const moved = moveUnit(state, mover.id, { q: 5, r: 5 }, state.map!, registry);
    expect(moved.units.get(mover.id)?.movesRemaining).toBe(0);
    expect(moved.units.get(mover.id)?.enteredZoCThisActivation).toBe(true);
  });

  it('moving within existing ZoC does not re-trigger the forced stop marker', () => {
    const state = buildMvpScenario(42);
    state.units = new Map();
    const mover = makeUnit({
      id: 'mover' as any,
      factionId: 'red' as any,
      position: { q: 5, r: 5 },
    });
    const enemyUnit = makeUnit({
      id: 'enemy_1' as any,
      factionId: 'blue' as any,
      position: { q: 6, r: 5 },
    });

    state.units.set(mover.id, mover);
    state.units.set(enemyUnit.id, enemyUnit);

    expect(entersEnemyZoC(mover.position, { q: 5, r: 4 }, mover, state)).toBe(false);
  });

  it('calculates flanking bonus from adjacent allies', () => {
    const state = buildMvpScenario(42);
    state.units = new Map();
    const attacker = makeUnit({
      id: 'attacker' as any,
      factionId: 'red' as any,
      position: { q: 5, r: 5 },
    });
    const defender = makeUnit({
      id: 'defender' as any,
      factionId: 'blue' as any,
      position: { q: 6, r: 5 },
    });
    // Flanking ally adjacent to defender but not attacker
    const flanker = makeUnit({
      id: 'flanker' as any,
      factionId: 'red' as any,
      position: { q: 6, r: 4 },
    });

    state.units.set(attacker.id, attacker);
    state.units.set(defender.id, defender);
    state.units.set(flanker.id, flanker);

    const bonus = calculateFlankingBonus(attacker, defender, state);
    expect(bonus).toBe(0.15); // +15% per flanking ally
  });

  it('no flanking bonus when no allies adjacent', () => {
    const state = buildMvpScenario(42);
    const attacker = makeUnit({
      id: 'attacker' as any,
      factionId: 'red' as any,
      position: { q: 5, r: 5 },
    });
    const defender = makeUnit({
      id: 'defender' as any,
      factionId: 'blue' as any,
      position: { q: 6, r: 5 },
    });

    state.units.set(attacker.id, attacker);
    state.units.set(defender.id, defender);

    const bonus = calculateFlankingBonus(attacker, defender, state);
    expect(bonus).toBe(0);
  });
});
