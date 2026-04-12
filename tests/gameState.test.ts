import { createEmptyGameState, createScenarioState } from '../src/game/createGameState';
import type { GameState } from '../src/game/types';

describe('createEmptyGameState', () => {
  it('creates a GameState with the provided seed', () => {
    const state = createEmptyGameState(12345);
    expect(state.seed).toBe(12345);
  });

  it('initializes with round 1', () => {
    const state = createEmptyGameState(0);
    expect(state.round).toBe(1);
  });

  it('initializes with turnNumber 1', () => {
    const state = createEmptyGameState(0);
    expect(state.turnNumber).toBe(1);
  });

  it('initializes with no active faction', () => {
    const state = createEmptyGameState(0);
    expect(state.activeFactionId).toBeNull();
  });

  it('initializes with status "in_progress"', () => {
    const state = createEmptyGameState(0);
    expect(state.status).toBe('in_progress');
  });

  it('initializes with empty factions map', () => {
    const state = createEmptyGameState(0);
    expect(state.factions).toBeInstanceOf(Map);
    expect(state.factions.size).toBe(0);
  });

  it('initializes with empty units map', () => {
    const state = createEmptyGameState(0);
    expect(state.units).toBeInstanceOf(Map);
    expect(state.units.size).toBe(0);
  });

  it('initializes with empty cities map', () => {
    const state = createEmptyGameState(0);
    expect(state.cities).toBeInstanceOf(Map);
    expect(state.cities.size).toBe(0);
  });

  it('initializes with empty prototypes map', () => {
    const state = createEmptyGameState(0);
    expect(state.prototypes).toBeInstanceOf(Map);
    expect(state.prototypes.size).toBe(0);
  });

  it('initializes with empty improvements map', () => {
    const state = createEmptyGameState(0);
    expect(state.improvements).toBeInstanceOf(Map);
    expect(state.improvements.size).toBe(0);
  });

  it('initializes with empty research map', () => {
    const state = createEmptyGameState(0);
    expect(state.research).toBeInstanceOf(Map);
    expect(state.research.size).toBe(0);
  });

  it('initializes RNG state from seed', () => {
    const state = createEmptyGameState(42);
    expect(state.rngState.seed).toBe(42);
    expect(state.rngState.state).toBe(42);
  });

  it('creates independent states for different seeds', () => {
    const state1 = createEmptyGameState(100);
    const state2 = createEmptyGameState(200);
    
    expect(state1.seed).toBe(100);
    expect(state2.seed).toBe(200);
    expect(state1.rngState.state).toBe(100);
    expect(state2.rngState.state).toBe(200);
  });

  it('returns a new object each call (no shared references)', () => {
    const state1 = createEmptyGameState(0);
    const state2 = createEmptyGameState(0);
    
    expect(state1).not.toBe(state2);
    expect(state1.factions).not.toBe(state2.factions);
    expect(state1.units).not.toBe(state2.units);
  });
});

describe('createScenarioState', () => {
  it('creates a game state with the provided seed', () => {
    const state = createScenarioState(999);
    expect(state.seed).toBe(999);
  });

  it('returns empty state for MVP (no scenario config)', () => {
    const state = createScenarioState(0);
    expect(state.factions.size).toBe(0);
    expect(state.units.size).toBe(0);
    expect(state.cities.size).toBe(0);
  });

  it('accepts optional scenario config', () => {
    // MVP: config is ignored but should not throw
    const state = createScenarioState(0, { name: 'test', description: 'test scenario' });
    expect(state).toBeDefined();
    expect(state.seed).toBe(0);
  });

  it('produces same result as createEmptyGameState in MVP', () => {
    const empty = createEmptyGameState(42);
    const scenario = createScenarioState(42);
    
    // Same initial structure (MVP behavior)
    expect(scenario.seed).toBe(empty.seed);
    expect(scenario.round).toBe(empty.round);
    expect(scenario.turnNumber).toBe(empty.turnNumber);
    expect(scenario.activeFactionId).toBe(empty.activeFactionId);
    expect(scenario.status).toBe(empty.status);
  });
});

describe('GameState type completeness', () => {
  it('has all required fields', () => {
    const state: GameState = createEmptyGameState(0);
    
    // Type check ensures all fields exist at compile time
    // Runtime check for completeness
    const keys: (keyof GameState)[] = [
      'seed',
      'round',
      'turnNumber',
      'activeFactionId',
      'status',
      'factions',
      'units',
      'cities',
      'prototypes',
      'improvements',
      'research',
      'factionStrategies',
      'rngState',
    ];
    
    for (const key of keys) {
      expect(state).toHaveProperty(key);
    }
  });
});
