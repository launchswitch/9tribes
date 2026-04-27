---
name: meleeAdvanceAfterKill
description: Melee attackers advance into defender's hex on kill. Ranged/capture excluded. Implemented in shared applyCombatAction().
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## Melee Advance After Kill (2026-04-13)

When a melee attacker destroys a defender, the attacker moves to the defender's hex (advance-after-combat).

**Rules:**
- Only melee attackers (range ≤ 1) advance
- Only on kills — NOT on captures (slaver keeps old position)
- Hit-and-run still retreats away (takes priority, checked later in the function)
- Attacker stays `spent`, no movement points restored

**Implementation:** `applyCombatAction()` in `src/systems/combat-action/apply.ts`, inserted after capture-on-kill block. Re-exported from `combatActionSystem.ts` barrel. Reads `attackerIsRanged` recomputed from `attackerPrototype` (the variable in `previewCombatAction` in `combat-action/preview.ts` is scoped differently). Uses the same new-Map pattern as hit-and-run retreat.

**Why:** Felt wrong that a melee unit kills an enemy and stays in place while the defender's hex empties. Standard wargame convention.

**How to apply:** If adding conditions to the advance (e.g., "no advance into cities" or "only for certain factions"), edit the guard block in `src/systems/combat-action/apply.ts` after the capture-on-kill block. The advance runs before knockback/hit-and-run processing.
