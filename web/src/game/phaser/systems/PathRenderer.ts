import Phaser from 'phaser';
import type { WorldViewModel } from '../../types/worldView';

export class PathRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel) {
    this.layer.removeAll(true);

    for (const hex of world.overlays.reachableHexes) {
      const point = this.worldToScreen(hex.q, hex.r);
      const ring = this.scene.add.ellipse(point.x, point.y - 8, 62, 28, 0x5ec7a0, 0.28)
        .setStrokeStyle(3, 0xb8ffe4, 0.95);
      this.layer.add(ring);
    }

    for (const hex of world.overlays.attackHexes) {
      const point = this.worldToScreen(hex.q, hex.r);
      const ring = this.scene.add.ellipse(point.x, point.y - 8, 62, 28, 0xb84242, 0.26)
        .setStrokeStyle(3, 0xffb2a7, 0.95);
      this.layer.add(ring);
    }

    if (world.overlays.lastMove) {
      const point = this.worldToScreen(world.overlays.lastMove.destination.q, world.overlays.lastMove.destination.r);
      const marker = this.scene.add.ellipse(point.x, point.y - 8, 68, 32, 0xf2d67b, 0.08)
        .setStrokeStyle(3, 0xf2d67b, 0.95);
      this.layer.add(marker);
    }

    // Render queued path before the live hover preview so the active preview stays on top.
    if (world.overlays.queuedPath.length >= 2) {
      const queuedGraphics = this.scene.add.graphics();
      queuedGraphics.lineStyle(4, 0x4ecdc4, 0.65);
      for (let index = 0; index < world.overlays.queuedPath.length - 1; index += 1) {
        const current = world.overlays.queuedPath[index];
        const next = world.overlays.queuedPath[index + 1];
        const from = this.worldToScreen(current.q, current.r);
        const to = this.worldToScreen(next.q, next.r);
        this.drawDashedLine(queuedGraphics, from.x, from.y - 8, to.x, to.y - 8, 8, 5);
      }
      this.layer.add(queuedGraphics);

      for (const node of world.overlays.queuedPath) {
        const point = this.worldToScreen(node.q, node.r);
        const isLast = node.step === world.overlays.queuedPath.length - 1;
        const marker = this.scene.add.ellipse(
          point.x,
          point.y - 8,
          isLast ? 16 : 10,
          isLast ? 8 : 5,
          0x4ecdc4,
          0.5,
        ).setStrokeStyle(2, 0x7eeee4, 0.85);
        this.layer.add(marker);
      }
    }

    if (world.overlays.pathPreview.length < 2) {
      return;
    }

    const graphics = this.scene.add.graphics();
    graphics.lineStyle(6, 0xf2d67b, 0.92);
    for (let index = 0; index < world.overlays.pathPreview.length - 1; index += 1) {
      const current = world.overlays.pathPreview[index];
      const next = world.overlays.pathPreview[index + 1];
      const from = this.worldToScreen(current.q, current.r);
      const to = this.worldToScreen(next.q, next.r);
      graphics.lineBetween(from.x, from.y - 8, to.x, to.y - 8);
    }
    this.layer.add(graphics);

    for (const node of world.overlays.pathPreview) {
      const point = this.worldToScreen(node.q, node.r);
      const marker = this.scene.add.ellipse(point.x, point.y - 8, node.step === 0 ? 18 : 14, node.step === 0 ? 10 : 8, 0xf7e7a8, node.step === 0 ? 0.78 : 0.9)
        .setStrokeStyle(2, 0xfff4c8, 0.95);
      this.layer.add(marker);
    }
  }

  private drawDashedLine(
    graphics: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dashLength: number,
    gapLength: number,
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) {
      return;
    }

    const stepX = dx / distance;
    const stepY = dy / distance;

    let position = 0;
    let drawing = true;
    while (position < distance) {
      const segmentLength = drawing
        ? Math.min(dashLength, distance - position)
        : Math.min(gapLength, distance - position);
      if (drawing) {
        const startX = x1 + stepX * position;
        const startY = y1 + stepY * position;
        const endX = x1 + stepX * (position + segmentLength);
        const endY = y1 + stepY * (position + segmentLength);
        graphics.lineBetween(startX, startY, endX, endY);
      }
      position += segmentLength;
      drawing = !drawing;
    }
  }
}
