import { createRNG, rngInt, rngPick, rngChance, rngShuffle, type RNGState } from '../src/core/rng';

describe('createRNG', () => {
  it('creates RNG with the given seed', () => {
    const rng = createRNG(12345);
    expect(rng.seed).toBe(12345);
    expect(rng.state).toBe(12345);
  });

  it('normalizes negative seeds to unsigned 32-bit', () => {
    const rng = createRNG(-1);
    expect(rng.seed).toBe(4294967295);
    expect(rng.state).toBe(4294967295);
  });

  it('creates independent RNG states from same seed', () => {
    const rng1 = createRNG(100);
    const rng2 = createRNG(100);
    // States start equal but mutate independently
    expect(rng1.state).toBe(rng2.state);
  });
});

describe('rngInt', () => {
  it('returns values within range [min, max]', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 100; i++) {
      const value = rngInt(rng, 0, 10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it('returns min when min equals max', () => {
    const rng = createRNG(42);
    expect(rngInt(rng, 5, 5)).toBe(5);
  });

  it('throws when min > max', () => {
    const rng = createRNG(42);
    expect(() => rngInt(rng, 10, 0)).toThrow('min (10) cannot be greater than max (0)');
  });

  it('is deterministic for same seed', () => {
    const rng1 = createRNG(12345);
    const rng2 = createRNG(12345);
    
    const values1 = [rngInt(rng1, 0, 100), rngInt(rng1, 0, 100), rngInt(rng1, 0, 100)];
    const values2 = [rngInt(rng2, 0, 100), rngInt(rng2, 0, 100), rngInt(rng2, 0, 100)];
    
    expect(values1).toEqual(values2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createRNG(111);
    const rng2 = createRNG(222);
    
    const value1 = rngInt(rng1, 0, 1000);
    const value2 = rngInt(rng2, 0, 1000);
    
    expect(value1).not.toBe(value2);
  });
});

describe('rngPick', () => {
  it('returns an element from the array', () => {
    const rng = createRNG(42);
    const arr = [1, 2, 3, 4, 5];
    for (let i = 0; i < 20; i++) {
      expect(arr).toContain(rngPick(rng, arr));
    }
  });

  it('returns the only element from single-element array', () => {
    const rng = createRNG(42);
    expect(rngPick(rng, ['only'])).toBe('only');
  });

  it('throws on empty array', () => {
    const rng = createRNG(42);
    expect(() => rngPick(rng, [])).toThrow('cannot pick from empty array');
  });

  it('is deterministic for same seed', () => {
    const rng1 = createRNG(999);
    const rng2 = createRNG(999);
    const arr = ['a', 'b', 'c', 'd', 'e'];
    
    expect(rngPick(rng1, arr)).toBe(rngPick(rng2, arr));
    expect(rngPick(rng1, arr)).toBe(rngPick(rng2, arr));
  });
});

describe('rngChance', () => {
  it('always returns true when probability is 1', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 10; i++) {
      expect(rngChance(rng, 1)).toBe(true);
    }
  });

  it('always returns false when probability is 0', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 10; i++) {
      expect(rngChance(rng, 0)).toBe(false);
    }
  });

  it('throws for probability < 0', () => {
    const rng = createRNG(42);
    expect(() => rngChance(rng, -0.1)).toThrow('must be between 0 and 1');
  });

  it('throws for probability > 1', () => {
    const rng = createRNG(42);
    expect(() => rngChance(rng, 1.1)).toThrow('must be between 0 and 1');
  });

  it('is deterministic for same seed', () => {
    const rng1 = createRNG(777);
    const rng2 = createRNG(777);
    
    const results1 = [rngChance(rng1, 0.5), rngChance(rng1, 0.5), rngChance(rng1, 0.5)];
    const results2 = [rngChance(rng2, 0.5), rngChance(rng2, 0.5), rngChance(rng2, 0.5)];
    
    expect(results1).toEqual(results2);
  });
});

describe('rngShuffle', () => {
  it('returns array with same elements', () => {
    const rng = createRNG(42);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rngShuffle(rng, arr);
    
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it('does not mutate the original array', () => {
    const rng = createRNG(42);
    const arr = [1, 2, 3, 4, 5];
    const original = [...arr];
    rngShuffle(rng, arr);
    
    expect(arr).toEqual(original);
  });

  it('returns empty array for empty input', () => {
    const rng = createRNG(42);
    expect(rngShuffle(rng, [])).toEqual([]);
  });

  it('returns single-element array unchanged', () => {
    const rng = createRNG(42);
    expect(rngShuffle(rng, ['only'])).toEqual(['only']);
  });

  it('is deterministic for same seed', () => {
    const rng1 = createRNG(555);
    const rng2 = createRNG(555);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    expect(rngShuffle(rng1, arr)).toEqual(rngShuffle(rng2, arr));
  });

  it('produces different orderings for different seeds', () => {
    const rng1 = createRNG(111);
    const rng2 = createRNG(222);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    // Very unlikely to produce same shuffle with different seeds
    expect(rngShuffle(rng1, arr)).not.toEqual(rngShuffle(rng2, arr));
  });
});

describe('RNG state mutation', () => {
  it('mutates state on each call', () => {
    const rng = createRNG(100);
    const initialState = rng.state;
    
    rngInt(rng, 0, 10);
    expect(rng.state).not.toBe(initialState);
    
    const stateAfterFirst = rng.state;
    rngInt(rng, 0, 10);
    expect(rng.state).not.toBe(stateAfterFirst);
  });

  it('shared state affects subsequent calls', () => {
    const rng = createRNG(100);
    
    // Call sequence: int, pick, chance
    const v1 = rngInt(rng, 0, 100);
    const v2 = rngPick(rng, ['a', 'b', 'c']);
    const v3 = rngChance(rng, 0.5);
    
    // Same sequence with fresh RNG should match
    const rng2 = createRNG(100);
    expect(rngInt(rng2, 0, 100)).toBe(v1);
    expect(rngPick(rng2, ['a', 'b', 'c'])).toBe(v2);
    expect(rngChance(rng2, 0.5)).toBe(v3);
  });
});
