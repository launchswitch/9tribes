import { createEmptyGameState } from '../src/game/createGameState';
import {
  buildActivationQueue,
  nextUnitActivation,
  resetAllUnitsForRound,
} from '../src/systems/turnSystem';

function makeFaction(id: string, unitIds: string[]) {
  return {
    id: id as never,
    name: id,
    unitIds: unitIds as never[],
    cityIds: [],
    villageIds: [],
    prototypeIds: [],
    identityProfile: {
      homeBiome: 'plains',
      signatureUnit: 'test',
      passiveTrait: 'none',
      earlyResearchBias: 'formation_warfare',
      naturalPrey: 'none',
      naturalCounter: 'none',
      economyAngle: 'none',
      terrainDependence: 'none',
      lateGameHybridPotential: 'none',
    },
    combatRecord: {
      recentWins: 0,
      recentLosses: 0,
      lastLossRound: 0,
      lastWinRound: 0,
      totalEliminations: 0,
    },
  };
}

function makeUnit(id: string, factionId: string, activatedThisRound = false, hp = 10) {
  return {
    id: id as never,
    factionId: factionId as never,
    position: { q: 0, r: 0 },
    facing: 0,
    hp,
    maxHp: 10,
    movesRemaining: 0,
    maxMoves: 2,
    attacksRemaining: 0,
    xp: 0,
    veteranLevel: 'green' as const,
    status: 'spent' as const,
    prototypeId: 'proto' as never,
    history: [],
    morale: 60,
    routed: false,
    activatedThisRound,
    enteredZoCThisActivation: false,
  };
}

function buildState() {
  const state = createEmptyGameState(1);
  state.factions.set('alpha' as never, makeFaction('alpha', ['a1', 'a2']));
  state.factions.set('beta' as never, makeFaction('beta', ['b1']));
  state.units.set('a1' as never, makeUnit('a1', 'alpha'));
  state.units.set('a2' as never, makeUnit('a2', 'alpha'));
  state.units.set('b1' as never, makeUnit('b1', 'beta'));
  return state;
}

describe('turnSystem alternating activation', () => {
  it('builds Option A queue order with extras at the end', () => {
    const state = buildState();

    const activation = buildActivationQueue(state);

    expect(activation.queue).toEqual(['a1', 'b1', 'a2']);
  });

  it('skips dead and already-activated units when advancing the queue', () => {
    const state = buildState();
    state.units.set('a1' as never, makeUnit('a1', 'alpha', true));
    state.units.set('b1' as never, makeUnit('b1', 'beta', false, 0));

    const activation = buildActivationQueue(state);
    const next = nextUnitActivation(state, activation);

    expect(next).toEqual({ unitId: 'a2', factionId: 'alpha' });
    expect(nextUnitActivation(state, activation)).toBeNull();
  });

  it('resetAllUnitsForRound clears activation flags and restores actions', () => {
    const state = buildState();
    const reset = resetAllUnitsForRound(state);

    expect(reset.units.get('a1' as never)?.activatedThisRound).toBe(false);
    expect(reset.units.get('a1' as never)?.movesRemaining).toBe(2);
    expect(reset.units.get('a1' as never)?.attacksRemaining).toBe(1);
    expect(reset.units.get('a1' as never)?.status).toBe('ready');
  });
});
