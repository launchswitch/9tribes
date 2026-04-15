import { getTerrainOverlayTagForTile } from '../web/src/game/phaser/assets/keys.js';

describe('getTerrainOverlayTagForTile', () => {
  it('builds swamp overlay tags from connected wetland neighbors', () => {
    const terrainByKey = new Map<string, string>([
      ['5,4', 'swamp'],
      ['6,5', 'swamp'],
      ['4,6', 'swamp'],
    ]);

    expect(getTerrainOverlayTagForTile('swamp', 5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(
      't.l1.swamp_n1e1s1w0',
    );
  });

  it('uses the mountains tag prefix for mountain overlay resolution', () => {
    const terrainByKey = new Map<string, string>([
      ['4,5', 'mountain'],
      ['5,6', 'mountain'],
    ]);

    expect(getTerrainOverlayTagForTile('mountain', 5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(
      't.l1.mountains_n0e0s1w1',
    );
  });
});
