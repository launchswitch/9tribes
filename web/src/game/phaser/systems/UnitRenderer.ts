import Phaser from 'phaser';
import type { ClientState } from '../../types/clientState';
import type { WorldViewModel } from '../../types/worldView';
import { getUnitTextureSpec, getUnitRearTextureSpec } from '../assets/keys';

type UnitCallbacks = {
  onUnitSelected: (unitId: string, pointer?: Phaser.Input.Pointer) => void;
  onUnitPointerDown: (unitId: string, pointer: Phaser.Input.Pointer) => void;
  /** IDs of units being animated elsewhere (e.g. CombatAnimator overlay) — skip rendering these */
  skipUnitIds?: Set<string>;
};

export class UnitRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel, state: ClientState, callbacks: UnitCallbacks) {
    this.layer.removeAll(true);

    const sortedUnits = [...world.units].sort((left, right) => (left.q + left.r) - (right.q + right.r) || left.q - right.q);
    const attackableUnitIds = new Set(state.actions.attackTargets.map((target) => target.unitId));

    for (const unit of sortedUnits) {
      if (callbacks.skipUnitIds?.has(unit.id)) {
        continue;
      }
      if (!unit.visible) {
        continue;
      }

      const point = this.worldToScreen(unit.q, unit.r);
      const factionColor = world.factions.find((faction) => faction.id === unit.factionId)?.color ?? '#d8c7a3';
      const tint = Phaser.Display.Color.HexStringToColor(factionColor).color;
      const isSelected = state.selected?.type === 'unit' && state.selected.unitId === unit.id;
      const isLastMoved = state.playFeedback?.lastMove?.unitId === unit.id;

      const marker = this.scene.add.ellipse(
        point.x,
        point.y - 8,
        isSelected ? 38 : 34,
        isSelected ? 22 : 18,
        tint,
        unit.canAct ? 0.66 : unit.isActiveFaction ? 0.34 : 0.22,
      );
      if (unit.canAct) {
        marker.setStrokeStyle(2, 0xf7e7bf, 0.3);
      }
      this.layer.add(marker);

      const isAttackTarget = attackableUnitIds.has(unit.id);

      // Directional rendering based on unit facing (0-7: N, NE, E, SE, S, SW, W, NW)
      const dir = ((unit.facing % 8) + 8) % 8;
      const isRearFacing = dir === 0 || dir === 1 || dir === 6 || dir === 7; // N, NE, W, NW

      // Select front or rear texture based on facing direction
      let texture: ReturnType<typeof getUnitTextureSpec>;
      if (isRearFacing) {
        texture = getUnitRearTextureSpec(unit.spriteKey) ?? getUnitTextureSpec(unit.spriteKey);
      } else {
        texture = getUnitTextureSpec(unit.spriteKey);
      }

      const sprite = texture.kind === 'sheet'
        ? this.scene.add.image(point.x, point.y - texture.yOffset, texture.texture, texture.frame)
        : this.scene.add.image(point.x, point.y - texture.yOffset, texture.texture);
      sprite
        .setOrigin(0.5, 1)
        .setDisplaySize(texture.displayWidth, texture.displayHeight)
        .setAlpha(unit.acted ? 0.58 : 1)
        .setInteractive({ cursor: unit.canAct || isAttackTarget ? 'pointer' : 'help' });

      // Horizontal flip for left-facing directions
      // Front sprite base: faces right/southeast; Rear sprite base: faces left/northwest
      if (dir === 1 || dir === 2 || dir === 5) {
        // NE (rear), E (front), SW (front) — flip horizontally
        sprite.setFlipX(true);
      } else if (dir === 6) {
        // West — rear sprite faces left by default; keep it
        sprite.setFlipX(false);
      }

      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        callbacks.onUnitSelected(unit.id, pointer);
        callbacks.onUnitPointerDown(unit.id, pointer);
      });
      this.layer.add(sprite);

      if (isLastMoved) {
        const movedRing = this.scene.add.ellipse(point.x, point.y - 8, 46, 24, 0xf2d67b, 0.12)
          .setStrokeStyle(2, 0xf2d67b, 0.95);
        this.layer.add(movedRing);
      }

      const hpRatio = unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
      const hpTrack = this.scene.add.rectangle(point.x, point.y + 4, 28, 4, 0x261d15, 0.8).setOrigin(0.5, 0.5);
      const hpFill = this.scene.add.rectangle(point.x - 14, point.y + 4, Math.max(3, 28 * hpRatio), 4, hpRatio < 0.35 ? 0xe05b3f : 0x8fd694, 0.95)
        .setOrigin(0, 0.5);
      this.layer.add(hpTrack);
      this.layer.add(hpFill);

      // Carrier marker for units with learned (foreign-domain) abilities — prominent pulsing glow
      const learned = unit.learnedAbilities ?? [];
      if (learned.length > 0) {
        const pulse = 0.6 + 0.4 * Math.sin(this.scene.time.now * 0.003);

        // Outer soft glow — large, pulsing halo
        const outerGlow = this.scene.add.ellipse(point.x, point.y - 8, 64, 36, 0x00e5ff, 0.12 * pulse);
        this.layer.add(outerGlow);

        // Mid glow — bright core ring with stroke for definition
        const midGlow = this.scene.add.ellipse(point.x, point.y - 8, 52, 30, 0x00e5ff, 0.22 * pulse)
          .setStrokeStyle(2, 0x00e5ff, 0.5 * pulse);
        this.layer.add(midGlow);

        // Inner bright center
        const innerGlow = this.scene.add.ellipse(point.x, point.y - 8, 40, 22, 0x00e5ff, 0.18 * pulse);
        this.layer.add(innerGlow);

        // Domain pips below HP bar — slightly larger and bolder
        let pipX = point.x - ((learned.length - 1) * 7) / 2;
        for (const domainId of learned) {
          const letter = domainId.charAt(0).toUpperCase();
          const pip = this.scene.add.text(pipX, point.y + 12, letter, {
            fontFamily: 'Inter, sans-serif',
            fontSize: '10px',
            fontStyle: 'bold',
            color: '#00e5ff',
            stroke: '#001a22',
            strokeThickness: 3,
          }).setOrigin(0.5, 0.5);
          this.layer.add(pip);
          pipX += 14;
        }
      }

      if (unit.acted && unit.isActiveFaction) {
        const spentTag = this.scene.add.text(point.x, point.y - 46, 'Spent', {
          fontFamily: 'Inter, sans-serif',
          fontSize: '10px',
          color: '#f7d7c4',
          backgroundColor: '#4b241c',
          padding: { x: 5, y: 2 },
        }).setOrigin(0.5, 1);
        this.layer.add(spentTag);
      }
    }
  }
}
