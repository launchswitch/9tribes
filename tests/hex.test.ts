import { hexDistance, getNeighbors, hexToKey, keyToHex, getHexesInRange } from '../src/core/hex';

describe('hexDistance', () => {
  it('returns 0 for same hex', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
  });

  it('returns 1 for adjacent hexes', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: -1 })).toBe(1);
  });

  it('returns 2 for hexes two steps apart', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 1 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: -1, r: 2 })).toBe(2);
  });
});

describe('getNeighbors', () => {
  it('returns 6 neighbors for center hex', () => {
    const neighbors = getNeighbors({ q: 0, r: 0 });
    expect(neighbors).toHaveLength(6);
  });

  it('returns distinct neighbors', () => {
    const neighbors = getNeighbors({ q: 0, r: 0 });
    const keys = neighbors.map(n => hexToKey(n));
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(6);
  });
});

describe('hexToKey and keyToHex', () => {
  it('round-trips correctly', () => {
    const hex = { q: 3, r: -5 };
    expect(keyToHex(hexToKey(hex))).toEqual(hex);
  });

  it('handles zero coordinates', () => {
    const hex = { q: 0, r: 0 };
    expect(keyToHex(hexToKey(hex))).toEqual(hex);
  });

  it('generates unique keys', () => {
    const hexes = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 1 },
    ];
    const keys = hexes.map(h => hexToKey(h));
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(4);
  });
});

describe('getHexesInRange', () => {
  it('returns center hex for range 0', () => {
    const hexes = getHexesInRange({ q: 0, r: 0 }, 0);
    expect(hexes).toHaveLength(1);
    expect(hexes).toContainEqual({ q: 0, r: 0 });
  });

  it('returns 7 hexes for range 1', () => {
    const hexes = getHexesInRange({ q: 0, r: 0 }, 1);
    expect(hexes).toHaveLength(7);
  });

  it('returns 19 hexes for range 2', () => {
    const hexes = getHexesInRange({ q: 0, r: 0 }, 2);
    expect(hexes).toHaveLength(19);
  });

  it('all hexes are within range', () => {
    const center = { q: 5, r: 3 };
    const hexes = getHexesInRange(center, 2);
    for (const hex of hexes) {
      expect(hexDistance(center, hex)).toBeLessThanOrEqual(2);
    }
  });
});
