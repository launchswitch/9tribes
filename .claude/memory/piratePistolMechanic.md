---
name: Pirate Pistol Mechanic
description: Pirates use pistol (point-blank ranged, +5 attack, no retaliation) instead of basic_bow. Musket is the high-power gun unlock.
type: project
---

Pirate starting ranged unit uses `pistol` component instead of `basic_bow`. Pistol stats: attackBonus 5, rangeBonus 0. On ranged_frame (baseRange 1), total range = 1 (adjacent only). Because the unit role is `ranged` and weapon tag is `ranged`, `isRangedAttack()` in combatSystem.ts returns true — no retaliation/counter-attack. Result: glass-cannon point-blank skirmisher.

Musket (infantry/heavy_infantry, training slot) now has attackBonus 4, rangeBonus 1. It's the high-power gun for late-game infantry, gated behind pirate tag and hybrid recipes.

**Why:** User wanted Pirates to have a gun identity with higher attack but thematic tradeoff (must be adjacent, no long-range fire).
**How to apply:** If adding new pirate weapons or adjusting ranged retaliation rules, note that the "no retaliation" mechanic depends on the `ranged` tag on the weapon AND the `ranged` role on the chassis. A range-1 unit with neither would still get retaliated against. The range floor is enforced by `calculatePrototypeStats.ts` line 38: `Math.max(1, stats.range)`.
