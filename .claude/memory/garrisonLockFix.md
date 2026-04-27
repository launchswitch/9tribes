---
name: garrisonLockFix
description: Garrison lock removed from aiTactics.ts — defenders now use only threatenedCityDistance proximity bonus for movement. Previous approach (reduced lock + flat sally-forth bonus) was replaced.
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## Defender Movement in Cities (2026-04-12, revised)

**Original problem:** Non-charge melee defenders (spearmen) sat frozen in cities taking ranged fire. The garrison lock (-16 for leaving city) + sally-forth intercept that scaled with distance-closed couldn't be overcome at engagement distance 2-3 hexes.

**Current state:** The garrison lock and sally-forth intercept were entirely removed from `aiTactics.ts scoreMoveCandidate()`. Defenders now use only the `threatenedCityDistance` proximity bonus (+1.5 per hex closer to threatened city, max +6) for movement decisions. The `MoveCandidateScoreInput` interface no longer has `nearestEnemyDistance` or `originNearestEnemyDistance` fields.

**Side effect:** The code in `src/systems/unit-activation/` sub-modules that computed nearest enemy distances for intercept logic is now dead code (the values are no longer passed to `scoreMoveCandidate`). Can be cleaned up if desired.

**How to apply:** If defenders are too passive or too aggressive, the threatenedCityDistance bonus weight (1.5) and range (4 hexes) in `scoreMoveCandidate` are the tuning knobs. The removed garrison lock approach should NOT be re-introduced without understanding why it was removed — the simpler proximity-based approach replaced it.
