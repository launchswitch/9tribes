---
name: postMoveAttackFix
description: AI now attacks after strategic movement if adjacent to enemy; movesRemaining gate removed from combatActionSystem so ZoC entry doesn't block attacks
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## Post-Movement Attack Fix (2026-04-13)

Two bugs fixed that caused the AI to fail to attack with remaining movement:

**Bug 1 — No post-strategic-movement attack check**
- `activateUnit()` in `src/systems/unit-activation/activateUnit.ts` treated the decision as a branching tree (attack OR charge-move OR strategic-move), not a loop. After `performStrategicMovement`, units simply ended their turn — even if adjacent to an enemy.
- Fix: After `performStrategicMovement`, scan for adjacent enemies using `findBestTargetChoice` (from `src/systems/unit-activation/targeting.ts`) and attack if the engagement gate (`shouldEngageFromPosition`) passes. Initially was `score > 0` but now uses full threat assessment (2026-04-13).

**Bug 2 — movesRemaining gate blocked attacks after ZoC entry (PARTIAL FIX)**
- `previewCombatAction()` in `src/systems/combat-action/preview.ts` gated attacks on `attacker.movesRemaining > 0`. Entering enemy ZoC sets `movesRemaining = 0` (in `movementSystem.ts`), which blocked attacks.
- **Status as of 2026-04-18:** The `movesRemaining <= 0` guard is STILL PRESENT at line 53 of preview.ts. The fix described above may have been reverted or never applied. The post-strategic-movement attack path in `activateUnit.ts` (Bug 1 fix) is what makes AI attacks work after movement — not the removal of this gate.
- `attacksRemaining` is the authoritative "can this unit still attack" flag conceptually, but `movesRemaining <= 0` in the preview guard still blocks attacks for units with zero movement (including ZoC entry).

**Why:** User noticed AI not attacking when it had movement points remaining. Bug 1 fix (post-movement attack check) resolved the practical issue. Bug 2's guard removal is no longer in the code.

**How to apply:** The preview guard at `src/systems/combat-action/preview.ts` line 53 still checks both `attacksRemaining <= 0` and `movesRemaining <= 0`. If you need units to attack after ZoC entry, this guard needs to be relaxed.
