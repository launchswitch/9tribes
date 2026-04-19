# Triple Stack Off-by-One Ripple Check

**Date:** 2026-04-19
**Bug fixed:** `resolveFactionTriple()` in `synergyEngine.ts:236` changed guard from `< 2` to `< 3`. Old code allowed triple stacks with only 2 `emergentEligibleDomains`; fix requires 3.

---

## Findings

### 1. AI Research Strategy — `scoreNormalEmergentBreadth` gate
- **File:** `src/systems/aiResearchStrategy.ts:422`
- **Code:** `if (progression.t2Domains.length >= 2) return 0;`
- **What it does:** When a faction already has 2 T2 domains, this scoring function stops giving emergent-breadth bonus. The idea is "you already have enough breadth, stop spreading."
- **Needs update? YES.** Under the old bug, having 2 T2 domains meant you already had a triple stack firing. Now it doesn't — you need 3. This early-exit prevents the AI from pursuing the crucial third domain.
- **Fix:** Change `>= 2` to `>= 3` so the AI continues pursuing emergent breadth until it actually has 3 T2 domains.

### 2. AI Research Strategy — `getReachableTripleStackOpportunities`
- **File:** `src/systems/aiResearchStrategy.ts:455`
- **Code:** `if (codifiedCount !== 2) { continue; }`
- **What it does:** For single-group emergent rules, only considers an opportunity "reachable" when exactly 2 domains from the group are already codified (i.e., 1 missing).
- **Needs update? NO — this is correct.** This is about finding opportunities where you're *one domain away* from completing a group. A group with 3 eligible domains needs 2 codified + 1 missing to be "reachable." The `codifiedCount !== 2` filter finds rules that are exactly 1 domain short, which is the right heuristic for prioritizing the final domain.

### 3. Codemap — stale invariant comment
- **File:** `codemap.md:116`
- **Code:** `Triple-stack gate requires emergentEligibleDomains.length >= 2. ... Domain tuple padded to 3 elements if needed.`
- **What it does:** Documents the (now-fixed) invariant.
- **Needs update? YES.** Should say `>= 3` and remove reference to tuple padding (the padding was removed in the fix).

### 4. Balance Harness — `gamesWithActiveTripleStack` metric
- **File:** `src/systems/balanceHarness.ts:731`
- **Code:** `gamesWithActiveTripleStack: runs.filter((run) => run.factions[factionId]?.activeTripleStack != null).length`
- **What it does:** Counts how many harness runs had an active triple stack for each faction.
- **Needs update? NO — metric is structurally correct.** It reads `faction.activeTripleStack` which is set by `resolveFactionTriple()`. Now that the guard is fixed, this metric will naturally drop to reflect only real 3-domain triples. **However**, any historical baseline data is inflated.
- **Action:** Baseline fixture at `tests/fixtures/balanceHarness.baseline.json` (lines 81, 126, 173, 220, 264, 309, 358, 406, 453) was generated under the buggy behavior and will need re-baselining after a harness run with the fix.

### 5. UI — `SynergyChip.tsx` triple display gate
- **File:** `web/src/ui/SynergyChip.tsx:123`
- **Code:** `if (result.isComplete && emergentEligibleDomains.length >= 3) { activeTriple = rule; }`
- **What it does:** Client-side triple stack resolution — only shows active triple when 3+ domains are present.
- **Needs update? NO — already correct.** This was independently gating on `>= 3`, matching the fixed behavior. It was *never* affected by the bug because it's a separate client-side implementation that didn't have the off-by-one.

### 6. Sacrifice System — `sacrificeSystem.ts`
- **File:** `src/systems/sacrificeSystem.ts:139-147`
- **Code:** Calls `resolveFactionTriple(progression.pairEligibleDomains, progression.emergentEligibleDomains)` and sets `activeTripleStack`.
- **What it does:** Re-evaluates triple stack after sacrifice codifies a new domain.
- **Needs update? NO — delegation is correct.** It passes through to the fixed `resolveFactionTriple()`. No pre-checks or messaging references "2 domains."

### 7. Faction Turn Effects — `factionTurnEffects.ts`
- **File:** `src/systems/simulation/factionTurnEffects.ts:569-592`
- **Code:** Calls `resolveFactionTriple()` each turn and applies emergent effects (Ghost Army movement, Juggernaut bonus, etc.).
- **Needs update? NO — delegation is correct.** No local thresholds; defers entirely to `resolveFactionTriple()`.

### 8. Combat Faction Absorption — `factionAbsorption.ts`
- **File:** `src/systems/combat-action/factionAbsorption.ts:65-73`
- **Code:** Calls `resolveFactionTriple()` after learn-by-kill codification.
- **Needs update? NO — delegation is correct.** Same pattern as sacrifice.

### 9. Domain Progression — `domainProgression.ts`
- **File:** `src/systems/domainProgression.ts:84`
- **Code:** `emergentEligibleDomains: t2Domains`
- **What it does:** Maps T2 domains as emergent-eligible. This is the source that feeds into `resolveFactionTriple()`.
- **Needs update? NO — this is the definition, not a threshold.** T2 domains are the correct input for emergent eligibility. The threshold check happens inside `resolveFactionTriple()`.

### 10. Tests — `progressionPipeline.test.ts`
- **File:** `tests/progressionPipeline.test.ts:136-153`
- **Code:** Tests 0, 1, 2, and 3 emergent-eligible domains.
- **Needs update? NO — tests already reflect the fix.** Line 143-144 explicitly asserts that 2 domains returns null (`"returns null for only 2 emergent-eligible domains (requires exactly 3)"`). These tests were updated alongside the fix.

### 11. Knowledge Gained Modal — `KnowledgeGainedModal.tsx`
- **File:** `web/src/ui/KnowledgeGainedModal.tsx:47`
- **Code:** `if (learnedDomains.length < 2) return [];` (for pair synergy lookup)
- **What it does:** Early-exit for pair synergy display when fewer than 2 domains learned.
- **Needs update? NO — this is for pair synergies, not triples.** The `< 2` guard is correct for pair-synergy display (pairs need 2 domains).

### 12. Learn Loop Coordinator — `learnLoopCoordinator.ts:188`
- **File:** `src/systems/strategic-ai/learnLoopCoordinator.ts:188`
- **Code:** `const baseCredit = difficultyProfile.research.emergentRuleSacrificePriority * 2;`
- **What it does:** Multiplies the sacrifice priority weight by 2 — unrelated to the domain count threshold.
- **Needs update? NO — the `* 2` is a scaling factor, not a domain count.**

### 13. Emergent Rules JSON — domain set sizes
- **File:** `src/content/base/emergent-rules.json`
- **What it does:** Defines 10 emergent rules + 1 default. Rules with `domainSets` have 3 categories (e.g., terrain/combat/mobility). Rules with `combatDomains` or `mobilityDomains` are single-group rules that need 3 domains from that group.
- **Needs update? NO — rules already require 3 categories/domains.** All rules define exactly 3 domain categories or use `contains_3_*` conditions. No rule specifies only 2.

---

## Summary: Required Actions

| # | File | Line | Issue | Action |
|---|------|------|-------|--------|
| 1 | `src/systems/aiResearchStrategy.ts` | 422 | `t2Domains.length >= 2` early-exit prevents AI from pursuing 3rd domain | Change `>= 2` to `>= 3` |
| 3 | `codemap.md` | 116 | Stale invariant says `>= 2` and mentions tuple padding | Update to `>= 3`, remove padding reference |
| 4 | `tests/fixtures/balanceHarness.baseline.json` | multiple | Baseline inflated under old bug | Re-baseline after next harness run |

Everything else is either already correct, a correct delegation to the fixed function, or unrelated to the threshold change.
