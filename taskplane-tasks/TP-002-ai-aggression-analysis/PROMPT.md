# TP-002: AI Aggression Analysis — Medium Difficulty

## Problem Statement

**Symptom:** On Medium difficulty, at round 27 with zero city pressure, AI spearmen refuse to leave their territory to attack weaker archer units at range. The AI should be more aggressive and willing to take risks on Normal.

**Expectation:** AI on Normal should pursue and engage skirmisher/archer units that are poking from a safe distance, rather than passively waiting.

---

## Context

- Difficulty: Medium (maps to `normal` profile in `src/systems/aiDifficulty.ts`)
- Round 27 — mid-game, neither side under significant pressure
- AI has spearmen (melee), player has archers (ranged) kiting from range
- Spearmen won't cross territory boundary to engage

---

## Relevant Files

```
src/systems/aiPersonality.ts     # aggression scalars, commit/retreat thresholds
src/systems/aiTactics.ts         # attack scoring, shouldEngageTarget()
src/systems/aiDifficulty.ts      # Normal difficulty profile values
src/data/roleEffectiveness.ts    # melee vs ranged currently neutral (0)
src/data/weaponEffectiveness.ts  # spear vs ranged effectiveness
```

---

## Step 1: Trace Attack Decision Flow

- [ ] Read `shouldEngageTarget()` in `aiTactics.ts` — understand entry point
- [ ] Read `shouldCommitAttack()` in `aiPersonality.ts` — understand threshold check
- [ ] Read `scoreAttackCandidate()` in `aiTactics.ts` — understand score composition
- [ ] Read `computeRetreatRisk()` in `aiTactics.ts` — understand retreat decision
- [ ] Document the decision tree: what conditions must be met for spearman to attack archer at range

---

## Step 2: Analyze Blocking Factors

- [ ] Calculate base attack score for spearman vs archer (role + weapon effectiveness)
- [ ] Check `commitAdvantage` threshold — is it 1.15 by default?
- [ ] Check `commitAdvantageOffset` for Normal — is it 0?
- [ ] Identify if `reverseRoleEffectiveness(ranged→melee) = -0.25` is suppressing engagement
- [ ] Check if defender assignment is preventing offensive pursuit
- [ ] Check distance penalty contribution to attack score

---

## Step 3: Review Anti-Skirmisher Response

- [ ] Read `antiSkirmishResponseWeight` usage in `applyStateModifiers()` (aiPersonality.ts)
- [ ] Check if this weight is being applied when archers are visible
- [ ] Document what the response does (assignmentWeights, productionWeights)

---

## Step 4: Recommend Tuning Changes

- [ ] Identify which parameters to adjust (prefer minimal changes)
- [ ] Propose specific value changes with justification
- [ ] Analyze trade-offs: will changes make AI recklessly attack cities?
- [ ] Consider alternative approaches (e.g., role effectiveness table changes)
- [ ] Write final recommendations to ANALYSIS.md in this folder

---

## Constraints

- Do NOT modify AI logic in ways that break other behaviors
- Prefer parameter changes over structural rewrites
- Changes should primarily affect the "pursuing skirmishers" scenario, not all engagements
