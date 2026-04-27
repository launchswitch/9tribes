---
name: ZoC Civ-Style Model
description: ZoC no longer adds +1 movement cost; always allows entry, consumes all remaining moves (like Civilization)
type: project
---

Zone of Control uses a **forced-stop model** (Civilization-style), NOT a cost-additive model.

**What changed (2026-04-15):** Previously `previewMove()` in `src/systems/movementSystem.ts` added `zocCost (+1)` to `totalCost`. This meant forest+ZoC = cost 3, hill+ZoC = cost 3 — both impassable for a 2-MP infantry. Enemy units became impenetrable walls; melee units could never close to attack range.

**The fix:** Removed `zocCost` from `totalCost` calculation (line ~123). ZoC now only triggers the existing forced-stop mechanic at `moveUnit()` line 240: `movesRemaining = preview.entersZoC ? 0 : ...`. Doctrine terrain-reduction floors changed from `1 + zocCost` to `1`.

**Why:** User reported being unable to advance on an adjacent spearman with full 2/2 movement. The fundamental problem: if ZoC blocks entry, melee combat becomes impossible. Per Civilization's design, ZoC should create a front-line slowdown (consume all moves), not an impenetrable barrier.

**How to apply:**
- ZoC detection functions (`getZoCMovementCost`, `isHexInEnemyZoC`, `entersEnemyZoC`) still return correct values — they're used for boolean checks, not cost gating
- Exemptions work via `entersEnemyZoC` returning false → no forced stop (mounted, hit-and-run doctrine, forts)
- If you ever re-add ZoC to `totalCost`, you re-break melee approach
- The `MovementPreview.zocCost` field is still populated (for UI display) even though it's no longer added to totalCost
