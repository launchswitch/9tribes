import Phaser from 'phaser';
import type { ClientSelection } from '../../types/clientState';
import type { WorldViewModel } from '../../types/worldView';
import { TEXTURES } from '../assets/keys';

export class SelectionRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel, selected: ClientSelection, inspectedKey: string | null, hoveredKey: string | null) {
    this.layer.removeAll(true);
    const reachableKeys = new Set(world.overlays.reachableHexes.map((entry) => entry.key));
    const attackKeys = new Set(world.overlays.attackHexes.map((entry) => entry.key));

    if (hoveredKey && !reachableKeys.has(hoveredKey) && !attackKeys.has(hoveredKey)) {
      const [q, r] = hoveredKey.split(',').map(Number);
      const point = this.worldToScreen(q, r);
      this.layer.add(
        this.scene.add.image(point.x, point.y, TEXTURES.selection, 1)
          .setOrigin(0.5, 1)
          .setAlpha(0.16)
          .setTint(0xd8c06f),
      );
    }

    for (const target of world.overlays.reachableHexes) {
      const point = this.worldToScreen(target.q, target.r);
      this.layer.add(
        this.scene.add.image(point.x, point.y, TEXTURES.selection, 1)
          .setOrigin(0.5, 1)
          .setScale(1.02)
          .setAlpha(0.62)
          .setTint(0x7ff0bf),
      );
    }

    for (const target of world.overlays.attackHexes) {
      const point = this.worldToScreen(target.q, target.r);
      this.layer.add(
        this.scene.add.image(point.x, point.y, TEXTURES.selection, 1)
          .setOrigin(0.5, 1)
          .setScale(1.02)
          .setAlpha(0.62)
          .setTint(0xff8d7b),
      );
    }

    if (hoveredKey && (reachableKeys.has(hoveredKey) || attackKeys.has(hoveredKey))) {
      const [q, r] = hoveredKey.split(',').map(Number);
      const point = this.worldToScreen(q, r);
      this.layer.add(
        this.scene.add.image(point.x, point.y, TEXTURES.selection, 1)
          .setOrigin(0.5, 1)
          .setScale(0.96)
          .setAlpha(0.3)
          .setTint(attackKeys.has(hoveredKey) ? 0xffd1c8 : 0xf5f1b2),
      );
    }

    const position = resolveSelectionPosition(world, selected);
    if (position && selected) {
      const point = this.worldToScreen(position.q, position.r);
      this.layer.add(
        this.scene.add.image(point.x, point.y, TEXTURES.selection, 0)
          .setOrigin(0.5, 1)
          .setAlpha(0.92)
          .setTint(selected.type === 'unit' ? 0xf7e7bf : 0xd9b86a),
      );
    }

    if (inspectedKey) {
      const [q, r] = inspectedKey.split(',').map(Number);
      const point = this.worldToScreen(q, r);
      this.layer.add(
        this.scene.add.image(point.x, point.y, TEXTURES.selection, 0)
          .setOrigin(0.5, 1)
          .setScale(1.1)
          .setAlpha(0.9)
          .setTint(0xffd84d),
      );
    }
  }
}

function resolveSelectionPosition(world: WorldViewModel, selected: ClientSelection) {
  if (!selected) {
    return null;
  }

  if (selected.type === 'hex') {
    return { q: selected.q, r: selected.r };
  }

  if (selected.type === 'unit') {
    const unit = world.units.find((entry) => entry.id === selected.unitId);
    return unit ? { q: unit.q, r: unit.r } : null;
  }

  if (selected.type === 'city') {
    const city = world.cities.find((entry) => entry.id === selected.cityId);
    return city ? { q: city.q, r: city.r } : null;
  }

  const village = world.villages.find((entry) => entry.id === selected.villageId);
  return village ? { q: village.q, r: village.r } : null;
}
