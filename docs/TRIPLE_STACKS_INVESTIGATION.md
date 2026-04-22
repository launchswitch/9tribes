# Triple Stacks Investigation Report

## Summary

**BUG CONFIRMED**: Triple stacks are incorrectly firing when only **2 domains** are active/researched instead of requiring **3 domains**.

---

## Root Cause

**File**: `src/systems/synergyEngine.ts`  
**Line**: 236

```typescript
resolveFactionTriple(
  pairEligibleDomains: string[],
  emergentEligibleDomains: string[],
): ActiveTripleStack | null {
  if (emergentEligibleDomains.length < 2) {  // ❌ BUG: Should be < 3
    return null;
  }
```

### The Bug

The condition `emergentEligibleDomains.length < 2` only rejects when there are **0 or 1 domains**. This allows the function to proceed when there are **exactly 2 domains**, which should not trigger a "triple" stack.

### Secondary Issue (Lines 255-257)

When only 2 domains exist, the code duplicates the first domain to create a "triple":

```typescript
const domainTriple: [string, string, string] = emergentEligibleDomains.length >= 3
  ? [emergentEligibleDomains[0], emergentEligibleDomains[1], emergentEligibleDomains[2]]
  : [emergentEligibleDomains[0], emergentEligibleDomains[1], emergentEligibleDomains[0]];  // ⚠️ Duplicates first domain!
```

This is incorrect behavior - it creates a false "triple" with duplicate domains instead of requiring 3 distinct domains.

---

## Data Flow & Trace

### 1. How `emergentEligibleDomains` is populated

**File**: `src/systems/domainProgression.ts` (lines 59-84)

```typescript
export function computeDomainProgression(/* ... */): DomainProgression {
  const t2Domains: string[] = [];
  
  for (const domainId of researchedDomains) {
    const tier = getDomainTier(domainId, completedNodes);
    if (tier >= 2) {
      t2Domains.push(domainId);  // Collects domains at Tier 2 or higher
    }
  }
  
  return {
    // ...
    t2Domains,                                    // Line 81
    emergentEligibleDomains: t2Domains,           // Line 84 - Same as t2Domains!
  };
}
```

### 2. Where `resolveFactionTriple` is called

**File**: `src/systems/sacrificeSystem.ts` (lines 138-143)

```typescript
const triple = synergyEngine.resolveFactionTriple(
  progression.pairEligibleDomains,
  progression.emergentEligibleDomains,  // This is t2Domains
);
faction.activeTripleStack = triple;
```

### 3. The call chain

```
Game Loop / Sacrifice
  └─ computeDomainProgression()  [domainProgression.ts]
       └─ emergentEligibleDomains = t2Domains
  └─ resolveFactionTriple(emergentEligibleDomains)
       └─ ❌ BUG: accepts length >= 2 instead of >= 3
```

---

## What the Code Currently Does (Buggy Behavior)

1. Faction researches 2 domains to Tier 2
2. `emergentEligibleDomains` contains 2 domains
3. Check `emergentEligibleDomains.length < 2` → `2 < 2` is **false**
4. Function continues instead of returning `null`
5. Code picks first 2 domains and duplicates the first to form a "triple"
6. Triple stack **incorrectly fires** with 2 domains

### Example Scenario

**Input**: `emergentEligibleDomains = ['fortress', 'venom']` (only 2 domains)

**Current (Buggy) Output**:
```typescript
domainTriple = ['fortress', 'venom', 'fortress']  // Duplicates first domain!
emergentRule = { /* matching rule for these 2 domains */ }
activeTripleStack = { name: '...', domains: domainTriple, ... }
```

---

## What It Should Do (Correct Behavior)

1. Faction researches 3 domains to Tier 2
2. `emergentEligibleDomains` contains 3 domains
3. Check `emergentEligibleDomains.length < 3` → `3 < 3` is **false**
4. Function continues with **actual** triple domains
5. Triple stack **correctly fires** with 3 distinct domains

### Example Scenario (Correct)

**Input**: `emergentEligibleDomains = ['fortress', 'venom', 'nature_healing']` (3 domains)

**Expected Output**:
```typescript
domainTriple = ['fortress', 'venom', 'nature_healing']  // Three distinct domains!
emergentRule = { /* matching rule for these 3 domains */ }
activeTripleStack = { name: 'Withering Citadel', domains: domainTriple, ... }
```

---

## Fix Required

### File: `src/systems/synergyEngine.ts`

**Line 236** - Change the guard condition:

```typescript
// BEFORE (Buggy):
if (emergentEligibleDomains.length < 2) {
  return null;
}

// AFTER (Fixed):
if (emergentEligibleDomains.length < 3) {
  return null;
}
```

**Lines 255-257** - The fallback case is no longer needed if the guard above is fixed, but if you want to be defensive:

```typescript
// This fallback should never trigger if the guard is correct
// But it could be simplified to:
const domainTriple: [string, string, string] = [
  emergentEligibleDomains[0],
  emergentEligibleDomains[1],
  emergentEligibleDomains[2],
];
```

---

## Evidence: Test File Confirms Bug

**File**: `tests/progressionPipeline.test.ts` (lines 143-150)

```typescript
it('does not gate on exactly 3 — accepts >=2 emergent-eligible domains', () => {
  // With 3 domains that match a rule, the engine should not reject
  const result = engine.resolveFactionTriple(
    ['fortress', 'venom', 'nature_healing'],
    ['fortress', 'venom', 'nature_healing'],
  );
  expect(result).not.toBeNull();
});
```

This test **explicitly tests the buggy behavior** - its name says "accepts >=2" when it should require 3. This test should be updated as part of the fix.

---

## Emergent Rules Overview

The game has multiple emergent rules in `src/content/base/emergent-rules.json`:

| Rule Name | Condition | Requires |
|-----------|-----------|----------|
| Ghost Army | 3 mobility domains | 3 domains |
| Desert Raiders | Terrain + Combat + Mobility | 3 domains |
| Withering Citadel | Venom + Fortress + Nature Healing | 3 domains |
| Fortress Mastery | Fortress + Heavy + Terrain | 3 domains |
| And more... | Various 3-domain combinations | 3 domains |

All emergent rules are designed to require **3 distinct domains**, but the bug allows them to trigger with only 2.

---

## Files Affected

| File | Changes Needed |
|------|----------------|
| `src/systems/synergyEngine.ts` | Line 236: Change `< 2` to `< 3` |
| `tests/progressionPipeline.test.ts` | Line 143: Update test name and assertion to require 3 domains |

---

## Impact Assessment

### Game Balance
- **Underpowered synergies**: Pair synergies (which require 2 domains) become equivalent to emergent triple stacks
- **Power curve shift**: Triple stack bonuses are accessible earlier than intended
- **Strategic depth reduced**: Players can "rush" triple stacks with only 2 domain investments

### Affected Systems
1. **Combat** - Triple stack abilities/effects triggering prematurely
2. **AI Strategy** - `aiResearchStrategy.ts` line 422 checks `t2Domains.length >= 2` for early exit, which may be intentionally tuned for the buggy behavior
3. **Balance Metrics** - `balanceHarness.ts` tracks `gamesWithActiveTripleStack` which will be artificially inflated

---

## Recommended Fix Steps

1. **Fix the guard condition** in `synergyEngine.ts` line 236
2. **Update the test** in `progressionPipeline.test.ts` to require 3 domains
3. **Verify AI behavior** in `aiResearchStrategy.ts` - the check at line 422 may need adjustment if it was tuned for the buggy behavior
4. **Run balance harness** to see how many games previously had "fake" triple stacks

---

## Conclusion

The bug is a simple off-by-one error: `< 2` should be `< 3` to enforce the "triple" in triple stack. The fix is straightforward but has implications for game balance since it makes triple stacks harder to achieve.
