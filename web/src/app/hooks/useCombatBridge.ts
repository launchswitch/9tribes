import { useEffect, useState } from 'react';
import type { GameController } from '../../game/controller/GameController';
import type { PendingCombat } from '../../game/controller/combatSession';
import type { UnitView } from '../../game/types/worldView';
import { playCombatSoundForPendingCombat } from '../audio/sfxManager';

/**
 * Hook that bridges React and Phaser for combat animations.
 * Registers the onCombatPending callback to trigger Phaser scene animations
 * and play combat sounds. Manages the combatLocked state to prevent
 * user interaction during animation.
 */
export function useCombatBridge(
  controller: GameController,
  gameRef: React.RefObject<import('phaser').Game | null>,
) {
  const [combatLocked, setCombatLocked] = useState(false);

  useEffect(() => {
    if (!gameRef.current) return;

    const game = gameRef.current!;
    const scene = game.scene.getScene('MapScene') as import('../../game/phaser/scenes/MapScene').MapScene | undefined;
    if (!scene) return;

    controller.onCombatPending((pending: PendingCombat) => {
      const currentState = controller.getState();
      const attacker = currentState.world.units.find((u: UnitView) => u.id === pending.attackerId);
      const defender = currentState.world.units.find((u: UnitView) => u.id === pending.defenderId);
      if (!attacker || !defender) {
        // Fallback: apply immediately if we can't find the units
        controller.applyPendingCombat();
        return;
      }

      // AI-vs-AI combats get instant mode; anything involving a human gets full animation
      const isInstant = !controller.isCombatInvolvesHuman(attacker.factionId, defender.factionId);
      if (!isInstant) {
        playCombatSoundForPendingCombat(pending, attacker);
      }

      // Pan camera to show AI-initiated combat (player isn't already looking at it)
      const aiInitiated = !isInstant && !attacker.isActiveFaction;

      setCombatLocked(true);
      scene.startCombatAnimation(
        {
          attackerDamage: pending.result.attackerDamage,
          defenderDamage: pending.result.defenderDamage,
          attackerDestroyed: pending.result.attackerDestroyed,
          defenderDestroyed: pending.result.defenderDestroyed,
          attackerRouted: pending.result.attackerRouted,
          defenderRouted: pending.result.defenderRouted,
          attackerFled: pending.result.attackerFled,
          defenderFled: pending.result.defenderFled,
        },
        attacker,
        defender,
        () => {
          controller.applyPendingCombat();
          setCombatLocked(false);
        },
        isInstant,
        aiInitiated,
      );
    });

    return () => {
      // Cleanup: cancel any in-progress animation
      scene?.cancelCombatAnimation();
      if (controller.isCombatInProgress()) {
        controller.applyPendingCombat();
        setCombatLocked(false);
      }
    };
  }, [controller, gameRef.current]);

  return { combatLocked };
}
