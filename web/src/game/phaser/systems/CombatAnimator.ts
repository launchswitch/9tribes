import Phaser from 'phaser';
import type { UnitView } from '../../types/worldView';
import {
  buildCombatAnimationScript,
  type CombatAnimationOutcome,
} from './combatAnimationScript';
import { getUnitTextureSpec, getUnitRearTextureSpec } from '../assets/keys';

export type CombatAnimData = CombatAnimationOutcome;

type ActiveAnimation = {
  tweens: Phaser.Tweens.Tween[];
  sprites: Phaser.GameObjects.GameObject[];
  unitIds: [string, string];
};

type HpBar = {
  container: Phaser.GameObjects.Container;
  track: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  setRatio: (ratio: number) => void;
};

type Point = { x: number; y: number };
type PositionTarget = Phaser.GameObjects.GameObject & { x: number; y: number };

export class CombatAnimator {
  private overlayLayer: Phaser.GameObjects.Container;
  private active: ActiveAnimation | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {
    this.overlayLayer = scene.add.container();
    this.overlayLayer.setDepth(100);
    this.overlayLayer.setVisible(false);
  }

  getOverlayLayer(): Phaser.GameObjects.Container {
    return this.overlayLayer;
  }

  isAnimating(): boolean {
    return this.active !== null;
  }

  getAnimatedUnitIds(): Set<string> {
    if (!this.active) return new Set();
    return new Set(this.active.unitIds);
  }

  playCombat(
    data: CombatAnimData,
    attackerView: UnitView,
    defenderView: UnitView,
    onComplete: () => void,
    skipAnimation = false,
  ): void {
    if (skipAnimation) {
      this.playInstant(data, attackerView, defenderView, onComplete);
      return;
    }

    this.cancel();

    const attPos = this.worldToScreen(attackerView.q, attackerView.r);
    const defPos = this.worldToScreen(defenderView.q, defenderView.r);
    const engageRatio = attackerView.range > 1 ? 0.26 : 0.55;
    const engageDx = defPos.x - attPos.x;
    const engageDy = defPos.y - attPos.y;
    const engageOffset = { x: engageDx * engageRatio, y: engageDy * engageRatio };

    this.overlayLayer.removeAll(true);
    this.overlayLayer.setAlpha(1);
    this.overlayLayer.setVisible(true);

    const allSprites: Phaser.GameObjects.GameObject[] = [];
    const allTweens: Phaser.Tweens.Tween[] = [];

    const script = buildCombatAnimationScript(data, attackerView, defenderView);

    const attSprite = this.cloneSprite(attackerView, attPos.x, attPos.y);
    const defSprite = this.cloneSprite(defenderView, defPos.x, defPos.y);
    const attMarker = this.scene.add.ellipse(attPos.x, attPos.y - 8, 38, 22, this.getFactionColor(attackerView), 0.66);
    const defMarker = this.scene.add.ellipse(defPos.x, defPos.y - 8, 38, 22, this.getFactionColor(defenderView), 0.66);
    const attHpBar = this.createHpBar(attPos, attackerView.hp, attackerView.maxHp);
    const defHpBar = this.createHpBar(defPos, defenderView.hp, defenderView.maxHp);

    const attSpriteStart = { x: attSprite.x, y: attSprite.y };
    const defSpriteStart = { x: defSprite.x, y: defSprite.y };
    const attMarkerStart = { x: attMarker.x, y: attMarker.y };
    const defMarkerStart = { x: defMarker.x, y: defMarker.y };
    const attHpBarStart = { x: attHpBar.container.x, y: attHpBar.container.y };
    const defHpBarStart = { x: defHpBar.container.x, y: defHpBar.container.y };

    const attEngage = {
      x: attSpriteStart.x + engageOffset.x,
      y: attSpriteStart.y + engageOffset.y,
    };
    const attMarkerEngage = {
      x: attMarkerStart.x + engageOffset.x,
      y: attMarkerStart.y + engageOffset.y,
    };
    const attHpBarEngage = {
      x: attHpBarStart.x + engageOffset.x,
      y: attHpBarStart.y + engageOffset.y,
    };

    allSprites.push(
      attSprite,
      defSprite,
      attMarker,
      defMarker,
      attHpBar.container,
      defHpBar.container,
    );

    for (const obj of allSprites) {
      this.overlayLayer.add(obj);
    }

    const addTween = (config: Phaser.Types.Tweens.TweenBuilderConfig) => {
      const tween = this.scene.tweens.add(config);
      allTweens.push(tween);
      return tween;
    };
    const tweenTargetsTo = (
      targets: Array<{ obj: PositionTarget; point: Point }>,
      config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets' | 'x' | 'y'>,
    ) => {
      for (const target of targets) {
        addTween({
          ...config,
          targets: target.obj,
          x: target.point.x,
          y: target.point.y,
        });
      }
    };

    addTween({
      targets: attSprite,
      x: attEngage.x,
      y: attEngage.y,
      duration: 320,
      ease: 'Quad.easeOut',
    });
    addTween({
      targets: attMarker,
      x: attMarkerEngage.x,
      y: attMarkerEngage.y,
      duration: 320,
      ease: 'Quad.easeOut',
    });
    addTween({
      targets: attHpBar.container,
      x: attHpBarEngage.x,
      y: attHpBarEngage.y,
      duration: 320,
      ease: 'Quad.easeOut',
    });

    const exchangeStart = 360;
    const exchangeEnd = 1480;
    const beatWindow = Math.max(150, Math.floor((exchangeEnd - exchangeStart) / Math.max(1, script.beats.length)));
    const exchangeVector = this.normalize({
      x: defSpriteStart.x - attEngage.x,
      y: defSpriteStart.y - attEngage.y,
    });

    script.beats.forEach((beat, index) => {
      const start = exchangeStart + index * beatWindow;
      const impact = start + Math.floor(beatWindow * 0.45);

      const actorSprite = beat.actor === 'attacker' ? attSprite : defSprite;
      const targetSprite = beat.actor === 'attacker' ? defSprite : attSprite;
      const actorMarker = beat.actor === 'attacker' ? attMarker : defMarker;
      const targetMarker = beat.actor === 'attacker' ? defMarker : attMarker;
      const actorHpBar = beat.actor === 'attacker' ? attHpBar : defHpBar;
      const targetHpBar = beat.actor === 'attacker' ? defHpBar : attHpBar;
      const actorBase = beat.actor === 'attacker' ? attEngage : defSpriteStart;
      const targetBase = beat.actor === 'attacker' ? defSpriteStart : attEngage;
      const actorMarkerBase = beat.actor === 'attacker' ? attMarkerEngage : defMarkerStart;
      const targetMarkerBase = beat.actor === 'attacker' ? defMarkerStart : attMarkerEngage;
      const actorHpBarBase = beat.actor === 'attacker' ? attHpBarEngage : defHpBarStart;
      const targetHpBarBase = beat.actor === 'attacker' ? defHpBarStart : attHpBarEngage;
      const direction = beat.actor === 'attacker'
        ? exchangeVector
        : { x: -exchangeVector.x, y: -exchangeVector.y };
      const lungeDistance = 9 + beat.intensity * 10;
      const recoilDistance = beat.kind === 'glance' ? 2.5 : 4 + beat.intensity * 5;
      const actorPeak = {
        x: actorBase.x + direction.x * lungeDistance,
        y: actorBase.y + direction.y * lungeDistance,
      };
      const actorMarkerPeak = {
        x: actorMarkerBase.x + direction.x * lungeDistance,
        y: actorMarkerBase.y + direction.y * lungeDistance,
      };
      const actorHpBarPeak = {
        x: actorHpBarBase.x + direction.x * lungeDistance,
        y: actorHpBarBase.y + direction.y * lungeDistance,
      };
      const targetPeak = {
        x: targetBase.x + direction.x * recoilDistance,
        y: targetBase.y + direction.y * recoilDistance,
      };
      const targetMarkerPeak = {
        x: targetMarkerBase.x + direction.x * recoilDistance,
        y: targetMarkerBase.y + direction.y * recoilDistance,
      };
      const targetHpBarPeak = {
        x: targetHpBarBase.x + direction.x * recoilDistance,
        y: targetHpBarBase.y + direction.y * recoilDistance,
      };

      tweenTargetsTo(
        [
          { obj: actorSprite as PositionTarget, point: actorPeak },
          { obj: actorMarker as PositionTarget, point: actorMarkerPeak },
          { obj: actorHpBar.container as PositionTarget, point: actorHpBarPeak },
        ],
        {
          duration: Math.floor(beatWindow * 0.28),
          ease: 'Quad.easeOut',
          yoyo: true,
          hold: Math.max(18, Math.floor(beatWindow * 0.1)),
          delay: start,
        },
      );

      tweenTargetsTo(
        [
          { obj: targetSprite as PositionTarget, point: targetPeak },
          { obj: targetMarker as PositionTarget, point: targetMarkerPeak },
          { obj: targetHpBar.container as PositionTarget, point: targetHpBarPeak },
        ],
        {
          duration: Math.floor(beatWindow * 0.18),
          ease: 'Quad.easeOut',
          yoyo: true,
          repeat: beat.kind === 'glance' ? 0 : 1,
          delay: impact,
        },
      );

      addTween({
        targets: [actorSprite, targetSprite],
        alpha: beat.kind === 'glance' ? 0.82 : 0.48,
        duration: 48,
        yoyo: true,
        repeat: beat.kind === 'glance' ? 0 : 1,
        delay: impact,
      });

      const impactPoint = {
        x: targetBase.x - direction.x * 8,
        y: targetBase.y - direction.y * 8,
      };
      const flash = this.createImpactFlash(impactPoint, beat.intensity, beat.kind === 'glance');
      allSprites.push(flash);
      this.overlayLayer.add(flash);
      addTween({
        targets: flash,
        alpha: beat.kind === 'glance' ? 0.35 : 0.6,
        scale: beat.kind === 'glance' ? 1.05 : 1.18,
        duration: 70,
        yoyo: true,
        delay: impact,
      });

      if (beat.kind === 'hit' && beat.damage > 0) {
        const damageText = this.createDamageText(
          {
            x: impactPoint.x,
            y: impactPoint.y - 8,
          },
          beat.damage,
        );
        allSprites.push(damageText);
        this.overlayLayer.add(damageText);
        addTween({
          targets: damageText,
          alpha: 1,
          y: damageText.y - (28 + beat.intensity * 10),
          duration: Math.floor(beatWindow * 0.8),
          ease: 'Sine.easeOut',
          delay: impact,
          onStart: () => {
            damageText.setVisible(true);
          },
        });

        const targetMaxHp = beat.actor === 'attacker' ? defenderView.maxHp : attackerView.maxHp;
        const nextRatio = beat.actor === 'attacker'
          ? beat.defenderHpAfter / Math.max(1, targetMaxHp)
          : beat.attackerHpAfter / Math.max(1, targetMaxHp);

        addTween({
          targets: targetHpBar.fill,
          scaleX: Math.max(0.06, nextRatio),
          duration: Math.floor(beatWindow * 0.42),
          ease: 'Quad.easeOut',
          delay: impact,
          onUpdate: () => {
            targetHpBar.setRatio(targetHpBar.fill.scaleX);
          },
        });
      }
    });

    const defenderDead = data.defenderDestroyed;
    const defenderRan = !defenderDead && (data.defenderRouted || data.defenderFled);
    const attackerDead = data.attackerDestroyed;
    const attackerRan = !attackerDead && (data.attackerRouted || data.attackerFled);

    if (defenderDead && !attackerDead) {
      addTween({
        targets: [defSprite, defMarker, defHpBar.container],
        alpha: 0,
        y: `+=12`,
        duration: 360,
        ease: 'Sine.easeIn',
        delay: 1500,
      });
      tweenTargetsTo(
        [
          { obj: attSprite as PositionTarget, point: defSpriteStart },
          { obj: attMarker as PositionTarget, point: defMarkerStart },
          { obj: attHpBar.container as PositionTarget, point: defHpBarStart },
        ],
        {
          duration: 420,
          ease: 'Quad.easeOut',
          delay: 1540,
        },
      );
    } else if (defenderRan && !attackerDead) {
      const pursuitRatio = 0.35;
      const pursuit = {
        x: attSpriteStart.x + engageDx * pursuitRatio,
        y: attSpriteStart.y + engageDy * pursuitRatio,
      };
      const pursuitMarker = {
        x: attMarkerStart.x + engageDx * pursuitRatio,
        y: attMarkerStart.y + engageDy * pursuitRatio,
      };
      const pursuitHpBar = {
        x: attHpBarStart.x + engageDx * pursuitRatio,
        y: attHpBarStart.y + engageDy * pursuitRatio,
      };
      addTween({
        targets: [defSprite, defMarker, defHpBar.container],
        alpha: 0.2,
        y: `+=18`,
        duration: 420,
        ease: 'Sine.easeIn',
        delay: 1500,
      });
      tweenTargetsTo(
        [
          { obj: attSprite as PositionTarget, point: pursuit },
          { obj: attMarker as PositionTarget, point: pursuitMarker },
          { obj: attHpBar.container as PositionTarget, point: pursuitHpBar },
        ],
        {
          duration: 360,
          ease: 'Quad.easeOut',
          delay: 1540,
        },
      );
    } else if (attackerDead && !defenderDead) {
      addTween({
        targets: [attSprite, attMarker, attHpBar.container],
        alpha: 0,
        y: `+=12`,
        duration: 360,
        ease: 'Sine.easeIn',
        delay: 1500,
      });
    } else if (attackerRan && !defenderDead) {
      addTween({
        targets: [attSprite, attMarker, attHpBar.container],
        alpha: 0.2,
        y: `+=18`,
        duration: 420,
        ease: 'Sine.easeIn',
        delay: 1500,
      });
    } else if (defenderDead || attackerDead) {
      addTween({
        targets: [attSprite, defSprite, attMarker, defMarker, attHpBar.container, defHpBar.container],
        alpha: 0,
        duration: 360,
        delay: 1500,
      });
    } else {
      tweenTargetsTo(
        [
          { obj: attSprite as PositionTarget, point: attSpriteStart },
          { obj: attMarker as PositionTarget, point: attMarkerStart },
          { obj: attHpBar.container as PositionTarget, point: attHpBarStart },
        ],
        {
          duration: 380,
          ease: 'Quad.easeIn',
          delay: 1500,
        },
      );
    }

    addTween({
      targets: this.overlayLayer,
      alpha: 0,
      duration: 180,
      delay: 1820,
      onComplete: () => {
        this.cleanup();
        this.active = null;
        onComplete();
      },
    });

    this.active = { tweens: allTweens, sprites: allSprites, unitIds: [attackerView.id, defenderView.id] };
  }

  private playInstant(
    data: CombatAnimData,
    attackerView: UnitView,
    defenderView: UnitView,
    onComplete: () => void,
  ): void {
    this.cancel();

    const attPos = this.worldToScreen(attackerView.q, attackerView.r);
    const defPos = this.worldToScreen(defenderView.q, defenderView.r);

    this.overlayLayer.removeAll(true);
    this.overlayLayer.setAlpha(1);
    this.overlayLayer.setVisible(true);

    const allSprites: Phaser.GameObjects.GameObject[] = [];
    const script = buildCombatAnimationScript(data, attackerView, defenderView);

    const defenderDead = data.defenderDestroyed;
    const defenderRan = !defenderDead && (data.defenderRouted || data.defenderFled);
    const attackerDead = data.attackerDestroyed;
    const attackerRan = !attackerDead && (data.attackerRouted || data.attackerFled);

    let attFinal = this.cloneSprite(attackerView, attPos.x, attPos.y);
    let defFinal = this.cloneSprite(defenderView, defPos.x, defPos.y);
    let attMarkerPos = { x: attPos.x, y: attPos.y - 8 };
    let defMarkerPos = { x: defPos.x, y: defPos.y - 8 };
    let attHpBarPos = attPos;
    let defHpBarPos = defPos;
    let attAlpha = 1;
    let defAlpha = 1;
    let attMarkerAlpha = 1;
    let defMarkerAlpha = 1;

    if (defenderDead && !attackerDead) {
      attFinal = this.cloneSprite(attackerView, defPos.x, defPos.y);
      attMarkerPos = { x: defPos.x, y: defPos.y - 8 };
      attHpBarPos = defPos;
      defAlpha = 0;
      defMarkerAlpha = 0;
    } else if (defenderRan && !attackerDead) {
      const pursuitRatio = 0.35;
      const pursuePos = {
        x: attPos.x + (defPos.x - attPos.x) * pursuitRatio,
        y: attPos.y + (defPos.y - attPos.y) * pursuitRatio,
      };
      attFinal = this.cloneSprite(attackerView, pursuePos.x, pursuePos.y);
      attMarkerPos = { x: pursuePos.x, y: pursuePos.y - 8 };
      attHpBarPos = pursuePos;
      defFinal = this.cloneSprite(defenderView, defPos.x, defPos.y + 18);
      defMarkerPos = { x: defPos.x, y: defPos.y + 10 };
      defHpBarPos = { x: defPos.x, y: defPos.y + 18 };
      defAlpha = 0.2;
      defMarkerAlpha = 0.2;
    } else if (attackerDead && !defenderDead) {
      attFinal = this.cloneSprite(attackerView, attPos.x, attPos.y + 12);
      attMarkerPos = { x: attPos.x, y: attPos.y + 4 };
      attHpBarPos = { x: attPos.x, y: attPos.y + 12 };
      attAlpha = 0;
      attMarkerAlpha = 0;
    } else if (attackerRan && !defenderDead) {
      attFinal = this.cloneSprite(attackerView, attPos.x, attPos.y + 18);
      attMarkerPos = { x: attPos.x, y: attPos.y + 10 };
      attHpBarPos = { x: attPos.x, y: attPos.y + 18 };
      attAlpha = 0.2;
      attMarkerAlpha = 0.2;
    } else if (defenderDead || attackerDead) {
      attAlpha = 0;
      defAlpha = 0;
      attMarkerAlpha = 0;
      defMarkerAlpha = 0;
    }

    attFinal.setAlpha(attAlpha);
    defFinal.setAlpha(defAlpha);
    const attMarker = this.scene.add.ellipse(attMarkerPos.x, attMarkerPos.y, 38, 22, this.getFactionColor(attackerView), 0.66 * attMarkerAlpha).setVisible(attMarkerAlpha > 0);
    const defMarker = this.scene.add.ellipse(defMarkerPos.x, defMarkerPos.y, 38, 22, this.getFactionColor(defenderView), 0.66 * defMarkerAlpha).setVisible(defMarkerAlpha > 0);
    const attHpBar = this.createHpBar(attHpBarPos, script.attackerEndHp, attackerView.maxHp);
    const defHpBar = this.createHpBar(defHpBarPos, script.defenderEndHp, defenderView.maxHp);
    attHpBar.setRatio(script.attackerEndHp / Math.max(1, attackerView.maxHp));
    defHpBar.setRatio(script.defenderEndHp / Math.max(1, defenderView.maxHp));

    allSprites.push(attFinal, defFinal, attMarker, defMarker, attHpBar.container, defHpBar.container);

    script.beats
      .filter((beat) => beat.kind === 'hit' && beat.damage > 0)
      .slice(-3)
      .forEach((beat, index) => {
        const targetPos = beat.actor === 'attacker' ? defPos : attPos;
        const damageText = this.createDamageText(
          { x: targetPos.x + index * 12 - 12, y: targetPos.y - 44 - index * 10 },
          beat.damage,
        ).setAlpha(1).setVisible(true);
        allSprites.push(damageText);
      });

    for (const obj of allSprites) {
      this.overlayLayer.add(obj);
    }

    this.active = { tweens: [], sprites: allSprites, unitIds: [attackerView.id, defenderView.id] };

    this.scene.time.delayedCall(150, () => {
      this.cleanup();
      this.active = null;
      onComplete();
    });
  }

  cancel(): void {
    if (this.active) {
      for (const t of this.active.tweens) {
        t.stop();
        t.destroy();
      }
      this.cleanup();
      this.active = null;
    }
  }

  private cleanup(): void {
    this.overlayLayer.removeAll(true);
    this.overlayLayer.setAlpha(1);
    this.overlayLayer.setVisible(false);
  }

  private cloneSprite(unit: UnitView, x: number, y: number): Phaser.GameObjects.Image {
    const dir = ((unit.facing % 8) + 8) % 8;
    const isRearFacing = dir === 0 || dir === 1 || dir === 6 || dir === 7;

    let texture: ReturnType<typeof getUnitTextureSpec>;
    if (isRearFacing) {
      texture = getUnitRearTextureSpec(unit.spriteKey) ?? getUnitTextureSpec(unit.spriteKey);
    } else {
      texture = getUnitTextureSpec(unit.spriteKey);
    }

    const sprite = texture.kind === 'sheet'
      ? this.scene.add.image(x, y - texture.yOffset, texture.texture, texture.frame)
      : this.scene.add.image(x, y - texture.yOffset, texture.texture);
    sprite
      .setOrigin(0.5, 1)
      .setDisplaySize(texture.displayWidth, texture.displayHeight)
      .setAlpha(unit.acted ? 0.58 : 1);

    if (dir === 1 || dir === 2 || dir === 5) {
      sprite.setFlipX(true);
    } else if (dir === 6) {
      sprite.setFlipX(false);
    }

    return sprite;
  }

  private createHpBar(pos: Point, hp: number, maxHp: number): HpBar {
    const width = 28;
    const container = this.scene.add.container(pos.x, pos.y + 8);
    const track = this.scene.add.rectangle(0, 0, width, 4, 0x261d15, 0.8).setOrigin(0.5, 0.5);
    const fill = this.scene.add.rectangle(-width / 2, 0, width, 4, 0x8fd694, 0.95).setOrigin(0, 0.5);
    container.add([track, fill]);

    const setRatio = (ratio: number) => {
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      fill.setScale(Math.max(0.06, clampedRatio), 1);
      fill.setFillStyle(clampedRatio < 0.35 ? 0xe05b3f : 0x8fd694, 0.95);
    };

    setRatio(maxHp > 0 ? hp / maxHp : 0);

    return {
      container,
      track,
      fill,
      setRatio,
    };
  }

  private createDamageText(pos: Point, damage: number): Phaser.GameObjects.Text {
    return this.scene.add.text(pos.x, pos.y, `-${damage}`, {
      fontFamily: 'Inter, sans-serif',
      fontSize: '20px',
      color: '#e05b3f',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setVisible(false).setAlpha(0);
  }

  private createImpactFlash(pos: Point, intensity: number, isGlance: boolean): Phaser.GameObjects.Ellipse {
    return this.scene.add.ellipse(
      pos.x,
      pos.y,
      16 + intensity * 14,
      10 + intensity * 8,
      isGlance ? 0xc9d6e1 : 0xf5d784,
      0,
    );
  }

  private normalize(vector: Point): Point {
    const length = Math.hypot(vector.x, vector.y);
    if (length === 0) {
      return { x: 1, y: 0 };
    }
    return {
      x: vector.x / length,
      y: vector.y / length,
    };
  }

  private getFactionColor(_unit: UnitView): number {
    return 0xd8c7a3;
  }
}
