import Phaser from 'phaser';
import type { ClientState } from '../../types/clientState';
import type { WorldViewModel } from '../../types/worldView';
import {
  getRiverOverlayFrameForTile,
  getTerrainOverlayFrameForTile,
  getTerrainRenderSpec,
  TEXTURES,
  TILE_HEIGHT,
  TILE_WIDTH,
} from '../assets/keys';

type TileCallbacks = {
  onHexSelected: (q: number, r: number, pointer?: Phaser.Input.Pointer) => void;
  onHexHovered: (key: string | null) => void;
};

export class TileLayerRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel, state: ClientState, callbacks: TileCallbacks) {
    this.layer.removeAll(true);
    const reachableKeys = new Set(state.actions.legalMoves.map((hex) => hex.key));
    const terrainByKey = new Map(world.map.hexes.map((hex) => [hex.key, hex.terrain]));

    const sortedHexes = [...world.map.hexes].sort((left, right) => (left.q + left.r) - (right.q + right.r) || left.q - right.q);

    for (const hex of sortedHexes) {
      const point = this.worldToScreen(hex.q, hex.r);
      const baseSpec = getTerrainRenderSpec(hex.terrain);
      const spec = hex.terrain === 'river'
        ? {
            ...baseSpec,
            overlayFrame: getRiverOverlayFrameForTile(
              hex.q,
              hex.r,
              (q, r) => terrainByKey.get(`${q},${r}`),
            ),
          }
        : hex.terrain === 'swamp' || hex.terrain === 'mountain'
        ? {
            ...baseSpec,
            overlayFrame: getTerrainOverlayFrameForTile(
              hex.terrain,
              hex.q,
              hex.r,
              (q, r) => terrainByKey.get(`${q},${r}`),
            ),
          }
        : baseSpec;

      const hit = this.scene.add.polygon(
        point.x,
        point.y,
        [0, -TILE_HEIGHT / 2, TILE_WIDTH / 2, 0, 0, TILE_HEIGHT / 2, -TILE_WIDTH / 2, 0],
        spec.fallbackColor,
        0.24,
      )
        .setStrokeStyle(1, 0xf7e7bf, 0.12)
        .setInteractive({ cursor: reachableKeys.has(hex.key) ? 'pointer' : 'help' });

      hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => callbacks.onHexSelected(hex.q, hex.r, pointer));
      hit.on('pointerover', () => callbacks.onHexHovered(hex.key));
      hit.on('pointerout', () => callbacks.onHexHovered(null));
      this.layer.add(hit);

      if (spec.baseTexture) {
        const base = this.scene.add.image(point.x, point.y, spec.baseTexture, spec.baseFrame)
          .setOrigin(0.5, 1);
        if (spec.baseTexture === TEXTURES.oceanBase) {
          base.setDisplaySize(TILE_WIDTH, TILE_HEIGHT);
        }
        if (spec.baseTint !== undefined) {
          base.setTint(spec.baseTint);
        }
        if (spec.baseAlpha !== undefined) {
          base.setAlpha(spec.baseAlpha);
        }
        this.layer.add(base);
      }

      if (spec.overlayTexture) {
        const overlay = this.scene.add.image(point.x, point.y, spec.overlayTexture, spec.overlayFrame)
          .setOrigin(0.5, 1);
        if (spec.overlayTexture === TEXTURES.oceanBase) {
          overlay.setDisplaySize(TILE_WIDTH, TILE_HEIGHT);
        }
        if (spec.overlayTint !== undefined) {
          overlay.setTint(spec.overlayTint);
        }
        if (spec.overlayAlpha !== undefined) {
          overlay.setAlpha(spec.overlayAlpha);
        }
        this.layer.add(overlay);
      }
    }
  }
}
