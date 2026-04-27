---
name: componentSlotSystem
description: Component slot types (weapon/armor/training/utility), one per chassis; use utility for non-conflicting bonuses
type: project
---

## Component Slot Type System

**4 slot types exist** (defined in `src/core/enums.ts` as `ComponentSlotType`):
- `weapon` — attack/range bonuses
- `armor` — defense/hp bonuses
- `training` — mixed bonuses (atk/def/hp/moves), most common
- `utility` — niche bonuses (movement, special)

**Rule:** A chassis can have at most **one component of each slot type**. The validator in `src/design/validatePrototype.ts:74` enforces this with "Duplicate slot type" error.

**Why:** When adding a movement bonus to an existing unit that already uses its training slot, you can't add another training component. Use `slotType: "utility"` instead.

**How to apply:** Before creating a new component, check what slot types the target chassis's existing components use. If you need a bonus that doesn't fit weapon/armor/training, use `utility`. The `light_mount` component (added 2026-04-15) is the canonical example: +1 moves on ranged/cavalry frames via utility slot, allowing Horse Archer to stack skirmish_drill (training) + light_mount (utility).

**Existing utility components:** Only `light_mount` as of 2026-04-15. Slot is underutilized — good home for future mount/mobility/special components that shouldn't compete with training.
