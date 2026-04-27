---
name: aiThreatAssessment
description: AI retreat risk now considers target's surrounding support and city defense, not just attacker's local pressure. Post-move attacks are gated through shouldEngageFromPosition.
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## AI Threat Assessment for Engagement Decisions (2026-04-13)

**Problem:** AI made suicidal attacks — e.g., single spearman attacking a city with defender + 2 archers in support range. Existing `computeRetreatRisk()` only counted enemies near the *attacker*, not near the *target*.

**Fix (two parts):**

1. **`aiTactics.ts` `computeRetreatRisk()`** — added two new fields to `RetreatRiskInput`:
   - `targetEnemySupport`: enemy units within 2 hexes of the target (supportPressure weight: 0.18 per unit)
   - `targetInCity`: flat 0.25 risk penalty for attacking into a city
   - Typical scenario: 3 enemy support + city = 0.79 additional risk, enough to push past the 0.8 retreat threshold

2. **`src/systems/unit-activation/activateUnit.ts`** — post-strategic-movement attacks now pass through `shouldEngageFromPosition()` instead of just checking `score > 0`. This was a gap that let units attack after movement with zero safety consideration. The `shouldEngageFromPosition()` closure was updated to accept an optional `targetPos` parameter and compute `targetEnemySupport` and `targetInCity` when provided.

**Key files:** `aiTactics.ts` (RetreatRiskInput, computeRetreatRisk — not decomposed), `src/systems/unit-activation/activateUnit.ts` (shouldEngageFromPosition closure, post-move attack block), `src/systems/unit-activation/targeting.ts` (targeting helpers)

**Why:** The engagement gate was asymmetric — it protected initial attacks but not post-movement attacks. And the risk model was attacker-centric, not target-centric. Both gaps allowed suicidal attacks against defended positions.

**How to apply:** When adding new attack paths (charge, intercept, opportunity), always route through `shouldEngageFromPosition()`. The post-move attack block has been missed twice now. If tuning threat sensitivity, the weights are: supportPressure 0.18/unit, cityPressure 0.25 flat, retreatThreshold 0.8 (Normal: +0.05 offset).
