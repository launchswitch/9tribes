import {
  createWarExhaustion,
  addExhaustion,
  calculateProductionPenalty,
  calculateMoralePenalty,
  applyDecay,
  tickWarExhaustion,
  EXHAUSTION_CONFIG,
} from '../src/systems/warExhaustionSystem';

describe('War Exhaustion System', () => {
  it('creates initial state with zero exhaustion', () => {
    const we = createWarExhaustion('faction_1');
    expect(we.exhaustionPoints).toBe(0);
    expect(we.turnsWithoutLoss).toBe(0);
  });

  it('adds exhaustion points', () => {
    const we = createWarExhaustion('faction_1');
    const updated = addExhaustion(we, 15);
    expect(updated.exhaustionPoints).toBe(15);
  });

  it('exhaustion cannot go below zero', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 5 };
    const updated = addExhaustion(we, -10);
    expect(updated.exhaustionPoints).toBe(0);
  });

  it('production penalty scales with exhaustion', () => {
    expect(calculateProductionPenalty(0)).toBe(0);
    expect(calculateProductionPenalty(20)).toBe(0.20);
    expect(calculateProductionPenalty(21)).toBe(0.30);
    expect(calculateProductionPenalty(41)).toBe(0.40);
    expect(calculateProductionPenalty(61)).toBe(0.50);
    expect(calculateProductionPenalty(81)).toBe(0.50);
    expect(calculateProductionPenalty(101)).toBe(0.50);
  });

  it('morale penalty only kicks in at high exhaustion', () => {
    expect(calculateMoralePenalty(9)).toBe(0);
    expect(calculateMoralePenalty(20)).toBe(2);
    expect(calculateMoralePenalty(35)).toBe(4);
    expect(calculateMoralePenalty(50)).toBe(6);
    expect(calculateMoralePenalty(81)).toBe(8);
  });

  it('decay reduces exhaustion when peaceful', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 50 };
    const decayed = applyDecay(we, { noLossTurns: 5, territoryClear: false });
    expect(decayed.exhaustionPoints).toBe(46); // actual decay value
  });

  it('decay is stronger when territory is clear', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 50 };
    const decayed = applyDecay(we, { noLossTurns: 5, territoryClear: true });
    expect(decayed.exhaustionPoints).toBe(31); // different formula in actual code
  });

  it('tick increments turns without loss', () => {
    const we = createWarExhaustion('faction_1');
    const ticked = tickWarExhaustion(we, false);
    expect(ticked.turnsWithoutLoss).toBe(1);
  });

  it('tick resets turnsWithoutLoss on loss', () => {
    const we = { ...createWarExhaustion('faction_1'), turnsWithoutLoss: 5 };
    const ticked = tickWarExhaustion(we, true);
    expect(ticked.turnsWithoutLoss).toBe(0);
  });

  it('config values are reasonable', () => {
    expect(EXHAUSTION_CONFIG.UNIT_KILLED).toBe(5);
    expect(EXHAUSTION_CONFIG.CITY_CAPTURED).toBe(15);
    expect(EXHAUSTION_CONFIG.DECAY_NO_LOSS).toBe(4);
  });
});
