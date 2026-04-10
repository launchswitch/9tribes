# Hard Mode Design — Making Hard Actually Hard

**Date:** 2026-04-09
**Status:** Draft — pre-implementation
**Depends on:** Normal difficulty complete, difficulty profile architecture in place

---

## Executive Summary

The current Hard profile (`HARD_PROFILE` in `src/systems/aiDifficulty.ts`) is Normal with tuned-up sliders — higher aggression, tighter coordination thresholds, stricter settler gating. A player who comfortably beats Normal will adapt within a few games.

This document defines a phased approach to making Hard feel *qualitatively* different: smarter decisions, better information, coordinated pressure, and aggressive pursuit of the game's deepest mechanics (emergent rules, hybrid units, domain combos).

The guiding principle from the existing rollout plan holds: **better choices before numeric assistance.** Honest economic assists are Phase 6 — optional, last resort, small and explicit.

---

## Current State Assessment

### What Hard Does Now

Hard is defined entirely by profile scalar differences from Normal:

| Field | Normal | Hard | Delta |
|-------|--------|------|-------|
| `aggressionFloor` | 0.9 | 0.95 | +0.05 |
| `siegeBiasFloor` | 0.8 | 0.9 | +0.1 |
| `raidBiasFloor` | 0.7 | 0.8 | +0.1 |
| `coordinatorHunterShare` | 0.8 | 0.9 | +0.1 |
| `focusTargetLimit` | 2 | 1 | -1 |
| `focusBudgetLeaderBonus` | 1.5 | 2.0 | +0.5 |
| `breadthPivotFirstWeight` | 10 | 12 | +2 |
| `underCapPressureWeight` | 20 | 24 | +4 |
| `commitAdvantageOffset` | -0.15 | -0.2 | -0.05 |
| `retreatThresholdOffset` | 0.1 | 0.15 | +0.05 |

All the same systems fire. All the same code paths execute. Hard just turns the knobs further.

### What's Missing

1. **No information advantage** — Hard AI uses the same fog-of-war as Easy
2. **No multi-axis attacks** — one hunter group, one target
3. **No adaptive counter-composition** — counter-builds visible enemies, doesn't anticipate
4. **No emergent rule pursuit** — doesn't plan research around triple-stack combos
5. **No economic denial focus** — doesn't prioritize starving the player
6. **No strategic pivot discipline** — can sit in indecisive postures
7. **No domain-targeted learning** — doesn't hunt specific factions for specific domains

### Architecture Baseline

The difficulty profile system is solid:

- `AiDifficultyProfile` in `src/systems/aiDifficulty.ts` has ~60 tunable fields
- All AI systems read from the profile via `getAiDifficultyProfile(difficulty)`
- The paired harness (`src/systems/balanceHarness.ts`) supports `--paired` for Normal vs Hard comparison
- The coordinator layer (`applyDifficultyCoordinator` in `strategicAi.ts`) is difficulty-aware
- The learn-loop coordinator (`applyDifficultyLearnAndSacrificeCoordinator`) is difficulty-aware

This means most changes can be expressed as either:
- New profile fields (for scalar differences)
- Difficulty-gated code paths (for qualitative behavioral differences)

---

## Design Principles

### 1. Better decisions, not bigger numbers

The player should feel "the AI outplayed me," not "the AI outstat me." Every change should be explainable as "the AI made a smarter choice," even if the mechanism is an information advantage.

### 2. Information asymmetry is fair game

Fog-of-war advantages are the single highest-leverage, lowest-cost way to make Hard feel smart. The player never sees the AI's internal state — they just experience an opponent that always seems to know where to strike. This is standard in strategy games (Civ, Age of Empires, StarCraft campaigns).

### 3. Qualitative jumps, not slider increments

Each phase should introduce something Hard does that Normal *does not do at all*, not just does less.

### 4. Tunable against harness output

Every change must be visible in paired harness deltas. If we can't measure it, we can't tune it.

### 5. Easy and Normal must remain unchanged

Zero behavior change for Easy. Zero behavior change for Normal. Hard diverges from the shared profile architecture with its own code paths gated on difficulty.

---

## Phased Rollout

### Phase 1: Information Supremacy

**Goal:** Hard AI has full map awareness for strategic planning while maintaining fog for tactical combat.

**Why first:** Single biggest behavioral upgrade. Nearly all other improvements (multi-axis attacks, economic denial, counter-composition) depend on the AI knowing where things are. Lowest implementation risk — no combat changes, no production changes, just better inputs to existing decision-making.

#### Changes

**1a. Strategic planning with full visibility**

In `src/systems/strategicAi.ts`, when difficulty is `hard`:
- `getLivingEnemyUnits()` returns all living enemy units regardless of fog state
- `choosePrimaryCityObjective()` considers *all* enemy cities, not just visible/last-seen
- `detectFronts()` uses actual enemy positions, not just visible ones
- `chooseFocusTargets()` scores all enemy units, not just visible

Implementation: Add a `useFullVisibility` boolean to the profile, or gate on `difficulty === 'hard'` in the strategy functions.

```typescript
// In computeFactionStrategy():
const enemyUnits = difficultyProfile.difficulty === 'hard'
  ? getAllLivingEnemyUnits(state, factionId)    // ignores fog
  : getVisibleEnemyUnits(state, factionId);     // respects fog
```

**1b. Permanent strategic memory**

In fog-related calls within strategic AI:
- Hard never decays `lastSeenEnemyCities` — all historical positions remain available
- Hard tracks player production queue progress (via visibility into city state)

**1c. Hidden from player**

Tactical combat (scoring attacks, movement decisions in `warEcologySimulation.ts`) continues to use normal visibility. The AI doesn't get to target invisible units in combat — it only uses full information for *strategic planning* (where to send armies, what to produce, what to research).

This distinction is important: the AI decides *where to go* with perfect info, but fights *using the same vision* as Normal once it arrives.

#### Profile Changes

```typescript
strategy: {
  // New fields
  strategicFogCheat: boolean;       // true on hard
  memoryDecayTurns: number;         // Infinity on hard, 15 on normal/easy
  tacticalFogCheat: boolean;        // always false — combat respects fog
}
```

#### Success Criteria

- Paired harness: Hard should show higher kill efficiency (better target selection)
- Hard should attack the player's *actual* weakest point, not the nearest visible one
- Player should not be able to detect the information advantage from gameplay alone

#### Verification

```powershell
npx vitest run tests/strategicAi.test.ts
npm run balance:harness -- --turns 60 --paired --stratified
```

---

### Phase 2: Coordinated Multi-Axis Pressure

**Goal:** Hard attacks from multiple directions simultaneously instead of massing into one hunter blob.

**Why second:** Depends on Phase 1 (knowing where to split requires map awareness). This is the biggest tactical differentiator — Normal sends one group, Hard sends two or three.

#### Changes

**2a. Multi-group hunter formation**

In `applyDifficultyCoordinator()`, when difficulty is `hard`:
- Instead of one hunter group toward the primary target, form 2-3 groups:
  - **Primary group** (~50% of hunters): heads toward primary enemy city
  - **Flanking group** (~30%): heads toward secondary enemy city or undefended villages
  - **Harassment group** (~20%): fast units that raid distant villages and intercept settlers
- Each group has its own waypoint and assignment override
- Minimum group size remains 2 (coordinated movement)

**2b. Staggered timing**

Hard should launch the harassment group 1-2 rounds before the primary push, so the player is already responding to raids when the main force arrives.

**2c. Adaptive group reassignment**

If the player shifts defenders to meet the primary push, Hard should detect the resulting vulnerability and redirect the flank group toward the now-exposed target.

#### Profile Changes

```typescript
strategy: {
  // New fields
  multiAxisEnabled: boolean;          // true on hard
  multiAxisGroupCount: number;        // 2-3 on hard
  multiAxisPrimaryShare: number;      // 0.5
  multiAxisFlankShare: number;        // 0.3
  multiAxisHarassShare: number;       // 0.2
  multiAxisMinGroupSize: number;      // 2
  multiAxisStaggerTurns: number;      // 1 on hard
}
```

#### Success Criteria

- Hard generates pressure on 2+ fronts simultaneously (visible in harness event traces)
- Hard creates dilemmas for the player (can't defend everything)
- Paired harness: Hard should show more village captures and more distributed damage

#### Verification

```powershell
npx vitest run tests/strategicAi.test.ts
npm run balance:harness -- --turns 120 --paired --stratified
# Review factionStrategyEvents for multi-group hunter assignments
```

---

### Phase 3: Aggressive Learn-Loop & Domain Targeting

**Goal:** Hard pursues the learn-sacrifice-codify engine much more aggressively and targets specific factions for specific domains.

**Why third:** Independent of Phases 1-2 but synergizes — knowing which factions hold which domains (Phase 1) makes domain targeting viable.

#### Changes

**3a. Lower sacrifice thresholds**

In `applyDifficultyLearnAndSacrificeCoordinator()`:
- Hard sends units to learn even at `green` veterancy (Normal waits for `seasoned+`)
- Hard sacrifices units carrying 2+ abilities (Normal often waits for 3)
- Hard treats elite units as disposable if sacrifice unlocks a critical domain

**3b. Domain-targeted hunting**

Hard should identify which domains it needs (for emergent rules, hybrid recipes, or triple-stacks) and specifically send units to fight factions that carry those domains:

- Look up which faction has the needed native domain from `ability-domains.json`
- Prefer attacking that faction's units for learning opportunities
- Weight the `choosePrimaryEnemyFaction()` decision by domain needs

**3c. Immediate production pivot after codification**

After a sacrifice unlocks a new domain:
- Hard should immediately boost production scoring for units requiring that domain
- Duration: 5 rounds of production scoring bonus (vs Normal's 2-3)

**3d. Signature ability exploitation**

Hard should recognize when its faction has powerful signature abilities (frost_wardens summoning polar bears, coral_people village capture, steppe_clan hit-and-run) and build strategies around exploiting them:
- Frost Wardens: fight on tundra whenever possible
- Coral People: maximize village capture, use greedy capture aggressively
- Steppe Clan: cycle hit-and-run attacks, never stand and fight
- Desert Nomads: cluster units in desert for swarm bonuses

#### Profile Changes

```typescript
strategy: {
  // Extend existing learn-loop fields
  learnLoopMinVeterancy: string;           // 'green' on hard, 'seasoned' on normal
  learnLoopSacrificeThreshold: number;     // 2 on hard, 3 on normal
  learnLoopSacrificeElites: boolean;       // true on hard
  learnLoopProductionPivotDuration: number; // 5 on hard, 3 on normal
}
research: {
  // New fields
  domainTargetedHuntingWeight: number;     // how strongly to prefer factions with needed domains
  signatureExploitWeight: number;          // how strongly to research toward signature ability optimization
}
```

#### Success Criteria

- Hard codifies more domains by turn 60 than Normal
- Hard specifically targets faction matchups that unlock needed domains
- Hard fields more hybrid units and domain-locked advanced units
- Hard uses signature abilities more effectively (terrain-appropriate positioning)

#### Verification

```powershell
npx vitest run tests/adaptiveAiPhase2.test.ts
npx vitest run tests/adaptiveAiPhase3.test.ts
npm run balance:harness -- --turns 120 --paired --stratified
# Check: avgHybridUnits delta, avgSignatureCapableUnits delta
```

---

### Phase 4: Emergent Rule & Triple-Stack Pursuit

**Goal:** Hard actively plans research and domain acquisition around completing emergent rules (Paladin, Ghost Army, Terrain Rider, etc.).

**Why fourth:** Depends on Phase 3 (aggressive domain acquisition). This is the most sophisticated behavior — the AI plans a multi-step tech path toward a combo payoff.

#### Changes

**4a. Emergent rule awareness in research**

In `src/systems/aiResearchStrategy.ts`:
- Hard evaluates which emergent rules are achievable based on current domain progress
- For each rule in `emergent-rules.json`, calculate: how many of the required domain sets are satisfied vs remaining
- Rules with 2-of-3 domain sets complete get a massive research priority bonus
- This replaces the current `tripleStackTier2Weight` / `tripleStackTier3Weight` with explicit rule-level targeting

**4b. Emergent rule awareness in sacrifice**

When choosing which unit to sacrifice:
- Hard prioritizes domains that complete an emergent rule's requirements
- A unit carrying a "rule-completing" domain gets priority for return-to-sacrifice

**4c. Emergent rule awareness in production**

When a rule is completed:
- Immediately boost production for units that benefit from the emergent effect
- E.g., if Paladin is completed (healing + defensive + offensive), boost production of frontline melee units that would gain the sustain effect

#### Current Emergent Rules (from `emergent-rules.json`)

| Rule | Required Domain Sets | Effect |
|------|---------------------|--------|
| Terrain Rider | terrain + combat + mobility | Charge units ignore terrain, +50% native terrain damage |
| Paladin | healing + defensive + offensive | Heal 50% of damage dealt, can't drop below 1 HP |
| Terrain Assassin | stealth + combat + terrain | Permanent stealth in matching terrain |
| Anchor | fortress + healing + defensive | 3-hex zone: +30% defense, 3 HP/turn heal for allies |
| Ghost Army | 3× mobility domains | Ignore all terrain penalties, +1 movement |

These are all game-changing effects. Hard actively pursuing them creates a fundamentally different mid/late game.

#### Profile Changes

```typescript
research: {
  // Replace generic triple-stack weights with:
  emergentRulePursuitEnabled: boolean;        // true on hard
  emergentRuleNearBonus: number;              // research bonus when 2-of-3 complete
  emergentRuleCompletionBonus: number;        // production bonus when rule completes
  emergentRuleSacrificePriority: number;      // sacrifice priority for rule-completing domains
}
```

#### Success Criteria

- Hard should complete at least 1 emergent rule by turn 80 in most games
- Hard's emergent rule completion rate should be 3-5x Normal's
- Units benefiting from completed rules should appear in Hard's army composition
- This should be visible in harness output as a spike in powerful mid/late game units

#### Verification

```powershell
npx vitest run tests/adaptiveAiPhase5.test.ts
npm run balance:harness -- --turns 120 --paired --stratified
# Track emergent rule completion events in trace output
```

---

### Phase 5: Economic Denial & Adaptive Counter-Composition

**Goal:** Hard actively tries to starve the player's economy and preemptively counter-builds player compositions.

**Why fifth:** Depends on Phase 1 (visibility into player economy). Combines strategic pressure with economic warfare.

#### Changes

**5a. Economic denial priority**

In target selection and coordinator:
- Hard explicitly values enemy villages higher than Normal
- Hard targets newly founded cities within 2-3 turns of founding (before defenses establish)
- Hard assigns fast raider units to intercept known settler production
- Village destruction is not a detour — it's a primary objective for the harassment group (Phase 2)

**5b. Adaptive counter-composition**

In `src/systems/aiProductionStrategy.ts`:
- Hard reads the player's actual unit composition (not just visible units) via Phase 1 visibility
- If the player is building >40% cavalry, Hard shifts production toward anti-mounted units
- If the player is building ranged-heavy, Hard produces faster closing units
- Counter-build adjustments are proactive, not reactive — they anticipate the player's army *becoming* X, not just respond to what's currently on the board

**5c. Composition awareness in engagement**

In tactical scoring (`src/systems/aiTactics.ts`):
- Hard weighs role effectiveness more heavily when it has a composition advantage
- Hard avoids engaging when the enemy has a hard counter composition in the area
- Hard retreats from unfavorable matchups (something Normal almost never does)

#### Profile Changes

```typescript
strategy: {
  // New fields
  economicDenialWeight: number;              // how hard to prioritize village/city destruction
  settlerInterceptionEnabled: boolean;       // true on hard
  settlerInterceptionRadius: number;         // detection radius for settler interception
}
production: {
  // New fields
  counterCompositionEnabled: boolean;        // true on hard
  counterCompositionThreshold: number;       // enemy ratio that triggers counter-building (0.4)
  counterCompositionWeight: number;          // scoring bonus for counter units
}
personality: {
  // Extend existing
  unfavorableEngagementRetreatWeight: number; // willingness to disengage from bad matchups
}
```

#### Success Criteria

- Hard should destroy more enemy villages per game than Normal (measurable)
- Hard should show adaptive production shifts in response to player composition
- Hard should engage in fewer unfavorable fights (measurable via kill/death ratios)
- Player should feel "the AI is responding to what I'm building"

#### Verification

```powershell
npx vitest run tests/strategicAi.test.ts
npm run balance:harness -- --turns 120 --paired --stratified
# Check: village destruction events, production composition shifts
```

---

### Phase 6: Strategic Discipline & Pivot Logic

**Goal:** Hard wastes zero turns on indecisive or contradictory posture states. It commits to strategies and follows through.

**Why sixth:** This is polish on top of the other phases. The AI already makes better decisions; now it should never second-guess itself.

#### Changes

**6a. Posture commitment**

In posture scoring (`scorePosture` in `aiPersonality.ts`):
- Hard should never enter `exploration` posture after turn 15
- Hard should never enter `balanced` posture when it has military superiority
- Hard should lock into `offensive` or `siege` posture once committed and only change on decisive events (losing 30%+ of army, city captured, etc.)

**6b. Advantage exploitation**

When Hard detects it's winning (more units, more territory, player army depleted):
- Shift from 80% hunters to 95% hunters
- Reduce reserve requirements to minimum
- Increase siege aggression thresholds
- Never stop attacking until the game is over

**6c. Losing-state denial**

When Hard detects it's losing:
- Switch to pure raid/economic denial instead of frontal assault
- Send all mobile units to destroy villages and prevent player expansion
- Give up on city capture objectives and focus on making the win expensive

#### Profile Changes

```typescript
strategy: {
  // New fields
  postureCommitmentLockTurns: number;        // how many turns to lock posture after commitment (3-4 on hard)
  postureExplorationDeadline: number;        // never explore after this turn (15 on hard)
  advantageHunterShare: number;              // hunter share when winning (0.95 on hard)
  losingDenialMode: boolean;                 // true on hard — switch to raid-only when losing
}
```

#### Success Criteria

- Hard should spend <5% of turns in `balanced` or `exploration` postures after turn 20
- Hard should never have extended periods of army idleness
- Hard should show clear "press the advantage" behavior when winning
- Hard should show clear "make it expensive" behavior when losing

#### Verification

```powershell
npx vitest run tests/strategicAi.test.ts
npm run balance:harness -- --turns 120 --paired --stratified
# Review posture distribution in strategy events
```

---

### Phase 7: Honest Asymmetric Assists (Optional — Last Resort)

**Goal:** Only if Phases 1-6 don't produce a sufficient difficulty gap.

**Rules:**
- Do not start here
- Do not add hidden combat buffs
- Do not add large flat production bonuses
- Anything added must be small, explicit, and explainable in a tooltip

#### Possible Assists (only if needed)

| Assist | Magnitude | Player-Visible? | Rationale |
|--------|-----------|-----------------|-----------|
| Production throughput bonus | +10% | Yes (tooltip) | AI reaches midgame units slightly faster |
| Sacrifice codification speed | -1 round | No | AI unlocks domains faster, but still has to earn them |
| Extra starting village | 1 village | Yes (map) | Economic head start, not military |
| Slightly faster village spawning | +10% spawn rate | No | More economic opportunity on the map |

#### Never Add

- Hidden combat damage buffs
- Hidden defense buffs
- Flat HP increases
- Free units
- Anything that makes AI wins feel fraudulent

---

## Implementation Notes

### Profile Architecture

All new behavioral fields should be added to the `AiDifficultyProfile` interface. Hard-specific code paths should be gated by profile fields (not by `difficulty === 'hard'` string checks scattered through the codebase).

```typescript
// Good: profile-gated
if (difficultyProfile.strategy.strategicFogCheat) { ... }

// Bad: string-gated
if (difficulty === 'hard') { ... }
```

This keeps the architecture clean and makes it trivial to test individual features by setting profile flags.

### Testing Strategy

Each phase should include:

1. **Unit tests** — new test cases for the specific behavior in `tests/strategicAi.test.ts`, `tests/adaptiveAiPhase*.test.ts`
2. **Paired harness runs** — at 20, 60, and 120 turns, comparing Normal vs Hard on identical seeds
3. **Trace analysis** — use `difficulty-snapshot-review` skill to diagnose specific faction behavior
4. **Regression checks** — verify Easy and Normal behavior is unchanged after each phase

### Dependency Graph

```
Phase 1 (Fog) ←── Phase 2 (Multi-axis)
       ↕                  ↕
Phase 3 (Learn-loop) ←── Phase 4 (Emergent rules)
       ↕
Phase 5 (Econ denial + Counter-comp)
       ↕
Phase 6 (Strategic discipline)
       ↕
Phase 7 (Assists — optional)
```

Phases 1-2 can be developed in parallel with Phases 3-4. Phase 5 depends on both tracks. Phase 6 is independent polish. Phase 7 is optional.

### Key Files Modified Per Phase

| Phase | Primary Files |
|-------|--------------|
| 1 | `aiDifficulty.ts`, `strategicAi.ts`, `fogSystem.ts` |
| 2 | `aiDifficulty.ts`, `strategicAi.ts` |
| 3 | `aiDifficulty.ts`, `strategicAi.ts`, `aiResearchStrategy.ts`, `aiProductionStrategy.ts` |
| 4 | `aiDifficulty.ts`, `aiResearchStrategy.ts`, `aiProductionStrategy.ts`, `sacrificeSystem.ts` |
| 5 | `aiDifficulty.ts`, `aiProductionStrategy.ts`, `aiTactics.ts`, `strategicAi.ts` |
| 6 | `aiDifficulty.ts`, `aiPersonality.ts`, `strategicAi.ts` |
| 7 | `aiDifficulty.ts`, `economySystem.ts` (if needed) |

---

## Success Criteria (Overall)

By the end of the project, on matched Normal vs Hard harness runs:

1. **Information:** Hard makes consistently better strategic decisions (visible in target selection and movement efficiency)
2. **Coordination:** Hard attacks from multiple axes simultaneously (visible in assignment mix and front pressure)
3. **Tech quality:** Hard fields more hybrid units, more signature-capable units, and completes more emergent rules
4. **Economic pressure:** Hard destroys more villages and denies more player expansion
5. **Army quality:** Hard closes the strongest-available vs strongest-fielded gap faster and more consistently
6. **Strategic clarity:** Hard spends fewer turns in indecisive postures and shows clearer commitment
7. **Player feel:** A player who comfortably beats Normal should feel a real, qualitative difference in timing, composition quality, and tactical punishment on Hard — not just "more enemies, slightly faster"

### Qualitative Target

> "The Hard AI doesn't just bring more troops — it brings the *right* troops, to the *right* place, at the *right* time. It learns faster, adapts to your strategy, and punishes mistakes that Normal would let slide."

---

## Recommended Starting Point

If context is cleared, start here:

1. **Phase 1** — Add `strategicFogCheat` to the Hard profile
2. Modify `computeFactionStrategy()` to use full enemy visibility when the flag is set
3. Run paired harness at 60 turns to validate the delta
4. Move to Phase 2 or Phase 3 based on which delta is larger
