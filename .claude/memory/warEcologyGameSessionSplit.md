---
name: warEcologyGameSessionSplit
description: Player-facing GameSession and AI warEcologySimulation are two separate combat paths — features must be wired into both
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
The AI sim loop (`warEcologySimulation.ts`) and the player-facing controller (`GameSession.ts`) are **separate combat resolution paths**. When a gameplay feature is implemented in the sim loop (hit-and-run retreat, learn-by-kill, sacrifice, capture-on-retreat, etc.), it must also be manually wired into `GameSession.applyResolvedCombat()`.

**Why:** The sim loop is the "god function" that handles all unit activations end-to-end. GameSession breaks this into two phases — `resolveAttack()` (math, no mutation) then `applyResolvedCombat()` (state mutation after animation). The apply method rebuilds unit state from scratch and has historically missed features that exist in the sim loop.

**How to apply:** When investigating a bug where a researched ability or combat feature "doesn't work" for the player, check both paths. The sim loop is the authoritative reference; GameSession must replicate the same logic. When adding a new combat feature, implement in both places and wire feedback through `SessionFeedback` → `GameController` → `clientState.ts` → `sfxManager.ts` (via `useCombatBridge` and `useSessionAudio` hooks in `web/src/app/hooks/`).

**Exception — `applyCombatAction()` is shared:** Both paths call `applyCombatAction()` (defined in `src/systems/combat-action/apply.ts`, re-exported from `combatActionSystem.ts` barrel) for state mutation. Mechanics implemented inside that function (e.g., melee advance-after-kill) automatically apply to both paths. Only the pre-mutation phase (preview math) and post-mutation phase (feedback, animation) differ between paths. When adding a mechanic to `applyCombatAction()`, note that variables scoped to `previewCombatAction()` (in `combat-action/preview.ts`, like `attackerIsRanged`) are NOT available — recompute them from `attackerPrototype`.
