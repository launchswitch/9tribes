---
name: rangedAiFreeShotFix
description: +12 free-shot bonus in findBestRangedTarget so AI archers attack equal-type enemies instead of standing idle
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## Ranged AI Passivity Fix (2026-04-16)

**Problem:** AI ranged units (archers) never attacked equal-type enemies at range. Player could repeatedly shoot enemy archers with zero response.

**Root cause:** The engagement gate (`commitAdvantage` threshold 1.15 in `shouldCommitAttack`) requires `attackAdvantage = 1 + score/60 >= 1.15`, meaning score must be >= 9. But ranged-vs-ranged matchups produce scores near 0 (no role effectiveness, distance penalty -1). The gate was designed for melee charges where overcommitment is dangerous, but ranged attacks are risk-free — defenders can't retaliate against ranged attackers (`combatSystem.ts` line 191: `if (!attackerIsRanged)`).

**Fix:** Added +12 "free shot" bonus to `extraScore` in `findBestRangedTarget()` (defined in `src/systems/unit-activation/targeting.ts`). This function is only called for ranged attackers (`unitRange > 1` check in `activateUnit`), so the bonus is correctly scoped.

**Key math:** With +12, typical ranged-vs-ranged score goes from ~-1 to ~11, yielding `attackAdvantage = 1.183 > 1.15` threshold.

**Why:** The `commitAdvantage` gate and `scoreAttackCandidate` scoring were built around melee risk assessment. Ranged attacks have zero direct retaliation risk — the attacker always comes out ahead on damage. The scoring didn't account for this asymmetry.

**How to apply:** If tuning the engagement gate or attack scoring, remember that ranged and melee attacks have fundamentally different risk profiles. A melee charge into equal opposition is a fair fight; a ranged shot into equal opposition is a free damage trade. Do NOT apply the same threshold to both.
