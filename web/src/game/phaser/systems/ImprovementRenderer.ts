import Phaser from 'phaser';
import type { WorldViewModel } from '../../types/worldView';
import { TEXTURES } from '../assets/keys';

export class ImprovementRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel) {
    this.layer.removeAll(true);

    for (const improvement of world.improvements) {
      if (improvement.type !== 'fortification') {
        continue;
      }

      if (!improvement.visible) {
        continue;
      }

      const point = this.worldToScreen(improvement.q, improvement.r);
      const ownerColor = world.factions.find((faction) => faction.id === improvement.ownerFactionId)?.color ?? null;
      const sprite = this.scene.add.image(point.x, point.y - 8, TEXTURES.hillFortress)
        .setOrigin(0.5, 1)
        .setDisplaySize(48, 64)
        .setAlpha(0.95);

      if (ownerColor) {
        sprite.setTint(Phaser.Display.Color.HexStringToColor(ownerColor).color);
      }

      this.layer.add(sprite);
    }
  }
}
