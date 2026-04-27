---
name: ZoC Cross-Domain Fix
description: naval and land units do not exert ZoC on each other; sameMovementDomain gate added to getZoCBlockers
type: feedback
---

ZoC must respect movement domain boundaries — naval units only exert ZoC on other naval units, land units only on land units.

**Why:** A river kayak was blocking a Pirate (infantry) from approaching adjacent land hexes, and vice versa. The `getZoCBlockers()` function checked faction/HP/routed but ignored chassis/movementClass, treating all enemy units as ZoC sources regardless of domain.

**How to apply:** The fix lives in `src/systems/zocSystem.ts`:
- `NAVAL_CHASSIS_IDS` Set contains the actual naval chassis IDs: `'naval_frame'`, `'ranged_naval_frame'`, `'galley_frame'` (NOT `'kayak'`/`'galley'` — those don't exist)
- `sameMovementDomain(a, b, state)` checks both prototypes' chassisId against this set
- `getZoCBlockers()` now accepts optional `movingUnit?` param; filters blockers through domain check
- `getZoCBlockersWithAura()` passes `movingUnit` through (including aura projection from hillDugIn units)
- Both callers (`getZoCMovementCost`, `entersEnemyZoC`) updated

**Don't revert:** Removing the domain filter will re-break land-naval approach/attack at shorelines.
**Gotcha:** Chassis IDs in `src/content/base/chassis.json` use `_frame` suffix (e.g. `naval_frame`, `galley_frame`). Always verify against the actual JSON before hardcoding IDs.
