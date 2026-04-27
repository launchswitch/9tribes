---
name: difficultyReshuffle
description: Difficulty reshuffle: Easy=old Hard, Normal=rebuilt, Hard=Normal+. Bug fixes for siege bypass + captured city 2x cost. Specific parameters revised post-reshuffle — check aiDifficulty.ts for current values.
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## Difficulty Reshuffle (2026-04-09, revised 2026-04-12)

**Why:** User played Hard mode, dominated by R13 with zero resistance. Paired harness data confirmed Normal and Hard were nearly identical. "Hard" was fake — just weight tweaks within the same passive behavioral envelope.

### Completed Changes

**1. Bug #2 Fix — Captured city 2x production cost (EVOLVED)**
- Initial fix: `aiProductionStrategy.ts` switched from `calculatePrototypeCost()` to `getPrototypeQueueCost()` to avoid mastery multiplier on captured cities.
- **2026-04-13 refinement:** Domain mastery multiplier now only applies to **unlock prototypes** (from `hybrid-recipes.json`, have `sourceRecipeId`), not starting units. `calculatePrototypeCost()` accepts optional `prototype` param; if `!isUnlockPrototype(prototype)`, returns base cost unmodified. Both AI and human player paths updated.
- Root cause: `knowledgeSystem.ts` PROTOTYPE_COST_MODIFIERS: `{0: 2.0, 1: 1.5, 2: 1.2, 3: 1.0}` — still exists but only applies to unlock units now.
- UI: City builder shows struck-through base cost + red "Culture Shock" badge when modifier > 1.0x on unlock prototypes.

**2. Bug #1 Fix — City capture without siege (walls 100/100)**
- Root cause: `maybeAbsorbFaction()` in `src/systems/combat-action/factionAbsorption.ts` transfers all cities to victor when last unit dies — bypasses `captureCity()`, no wall reduction.
- Fix: Units garrisoned inside a walled city cannot be targeted until walls breach to 0 HP.
- Two locations: `src/systems/combat-action/preview.ts` canAttackTarget + `GameSession.ts` getAttackTargets.
- **STALE (2026-04-18):** No wall/garrison logic found in `canAttackTarget` in `combat-action/helpers.ts`. Either reverted or implemented differently.

**3. Difficulty reshuffle — Easy = old Hard**
- `src/systems/aiDifficulty.ts`: EASY_PROFILE replaced with former HARD_PROFILE values

**4. Normal difficulty rebuilt from scratch**
- `src/systems/aiDifficulty.ts`: NORMAL_PROFILE redesigned for aggression.
- **Note:** Specific parameter values have been revised multiple times post-reshuffle. Check `aiDifficulty.ts` and `docs/difficulty-reference.md` for current values.

**5. Hard difficulty derived from Normal**
- `src/systems/aiDifficulty.ts`: HARD_PROFILE = Normal + more aggression, multi-axis attacks, fog cheat, emergent rule bonuses.

**6. Siege mechanics fix**
- `warEcologySimulation.ts`: Post-activation encirclement check — **STALE**: no encirclement references found in warEcologySimulation.ts as of 2026-04-18
- `territorySystem.ts`: ENCIRCLEMENT_THRESHOLD=2, ENCIRCLEMENT_RADIUS=2 — note: radius is 2, not 3 as previously claimed

### Reshuffle Map

| Slot | Source | Status |
|------|--------|--------|
| **Easy** | Old HARD_PROFILE (passive) | DONE |
| **Normal** | Rebuilt aggressive — battle-focused | DONE (parameters revised) |
| **Hard** | Normal+ — hyper-aggressive, multi-axis | DONE |

### Menu UI (2026-04-13)
- Easy and Hard chips disabled in `MenuClient.tsx` — only Normal is selectable. Uses `is-disabled` class + `disabled` attr, same pattern as Multiplayer button. CSS: `.menu-chip:disabled { opacity: 0.64; cursor: not-allowed }`.

### Remaining Known Issues
- Normal AI passive after initial rush (2026-04-12 aggression improvements added directed exploration, lowered coordinator thresholds)
- Garrison lock trapping non-charge melee in cities (fixed 2026-04-12 in aiTactics.ts)

### Subsequent Tuning (post-reshuffle)
- **Execute tier** (2026-04-12): AI now strongly prioritizes finishing nearly-dead enemies. Three scoring layers got execute bonuses: `scoreStrategicTarget` +8 at hpRatio≤0.15, `scoreAttackCandidate` +6 at hpRatio≤0.2, `chooseFocusTargets` +6 at hpRatio≤0.15. Applies to all difficulties equally.
