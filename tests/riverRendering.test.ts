import { getRiverOverlayFrameForTile } from '../web/src/game/phaser/assets/keys.js';

describe('getRiverOverlayFrameForTile', () => {
  it('maps north-south cardinal neighbors to the straight frame', () => {
    const terrainByKey = new Map<string, string>([
      ['5,4', 'river'],
      ['5,6', 'river'],
    ]);

    expect(getRiverOverlayFrameForTile(5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(10);
  });

  it('treats diagonal river neighbors as edge connections for the isometric sheet', () => {
    const terrainByKey = new Map<string, string>([
      ['6,4', 'river'],
      ['4,6', 'river'],
    ]);

    expect(getRiverOverlayFrameForTile(5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(10);
  });

  it('connects river mouths into adjacent coast tiles', () => {
    const terrainByKey = new Map<string, string>([
      ['5,4', 'river'],
      ['5,6', 'coast'],
    ]);

    expect(getRiverOverlayFrameForTile(5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(10);
  });
});
