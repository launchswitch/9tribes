# Hard Difficulty Rollout Plan

## Purpose

Make `hard` meaningfully stronger than `normal` through stricter AI decision-making, cleaner timing, and better coordination.

This project should build directly on the `normal` work:

- explicit difficulty-aware harness runs
- army-quality telemetry
- stronger breadth / supply / settler / quality heuristics on `normal`

The goal is not "normal, but slightly more aggressive."

The goal is:

- `hard` reaches stronger armies faster than `normal`
- `hard` wastes fewer turns on low-value expansion or weak compositions
- `hard` uses unlocked T2/T3, hybrid, and signature-capable units more consistently
- `hard` applies more coordinated tactical pressure once its economy is online

Initial constraint:

- keep `hard` fair first
- no flat production buffs
- no hidden combat modifiers
- no opaque resource cheats during the first pass

## Current Starting Point

### 1. The harness is now usable for difficulty-specific AI work

Current files:

- [`src/systems/balanceHarness.ts`](C:/Users/fosbo/war-civ-v2/src/systems/balanceHarness.ts)
- [`scripts/runBalanceHarness.ts`](C:/Users/fosbo/war-civ-v2/scripts/runBalanceHarness.ts)

Current telemetry now includes:

- highest available production cost
- highest fielded production cost
- average fielded production cost
- units by prototype id
- hybrid units fielded
- signature-capable units fielded
- supply utilization ratio
- stalled production markers

This means `hard` can be tuned against explicit deltas instead of intuition.

### 2. `hard` is not truly split from `normal` yet

Current file:

- [`src/systems/aiDifficulty.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiDifficulty.ts)

Current issue:

- `usesNormalAiBehavior()` still groups `normal` and `hard` together
- the AI has some difficulty hooks, but not a real difficulty-profile architecture

Conclusion:

- the next project is not only tuning
- it is a clean behavioral split

### 3. The strongest next step is structured divergence, not random extra aggression

The normal work already exposed the right categories:

- research breadth
- settler gating
- supply-cap usage
- strongest-available unit preference
- tactical coordination

`hard` should diverge along exactly those axes.

## Project Principles

### 1. Split behavior in a measurable way

Every hard-mode change should be visible in harness output or targeted regression tests.

### 2. Prefer better choices before numeric assistance

Order of operations:

1. better research choices
2. better production choices
3. better timing / expansion discipline
4. better tactical coordination
5. only then consider small honest economic assists if still required

### 3. Tune against `normal`, not in a vacuum

The correct question is not "is hard difficult enough?"

The correct question is:

- does `hard` materially outperform `normal` on the same seeds
- does it do so for understandable reasons
- does it remain fair

## Success Criteria

By the end of the project, on matched `normal` vs `hard` harness runs:

- `hard` should show higher average supply utilization for factions that were floating supply on `normal`
- `hard` should reduce the gap between highest available and highest fielded production cost
- `hard` should field more hybrid and signature-capable units by turn 120
- `hard` should show fewer production stalls and fewer low-value settler windows
- `hard` should generate more threatening midgame pressure, measured through battles, kills, siege starts, and front-level tactical tests

Qualitative target:

- a player who comfortably beats `normal` should feel a real difference in timing, composition quality, and tactical punishment on `hard`

## Rollout Order

### Phase 0: Create A Real Difficulty Profile Layer

Goal:

Replace the current boolean-style split with explicit difficulty profiles.

Primary files:

- [`src/systems/aiDifficulty.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiDifficulty.ts)
- [`src/systems/aiProductionStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiProductionStrategy.ts)
- [`src/systems/aiResearchStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiResearchStrategy.ts)
- [`src/systems/aiPersonality.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiPersonality.ts)
- [`src/systems/strategicAi.ts`](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts)

Add a profile object per difficulty with fields such as:

- research breadth weight
- native T3 greed
- hybrid reach weight
- settler gate strength
- reserve threshold
- under-cap pressure
- army-quality lag pressure
- focus-fire discipline
- tactical commitment strictness
- anti-skirmish response weight

Success criteria:

- `normal` and `hard` no longer depend on the same implicit behavior bucket
- all subsequent tuning reads from explicit profile values

### Phase 1: Build Normal-vs-Hard Comparison Harness Output

Goal:

Make it easy to compare both difficulties on identical seeds.

Primary files:

- [`src/systems/balanceHarness.ts`](C:/Users/fosbo/war-civ-v2/src/systems/balanceHarness.ts)
- [`scripts/runBalanceHarness.ts`](C:/Users/fosbo/war-civ-v2/scripts/runBalanceHarness.ts)

Changes to add:

- optional paired runs for `normal` and `hard`
- a comparison summary focused on deltas, not just raw values
- per-faction comparisons for:
  - supply utilization ratio
  - highest fielded vs highest available cost
  - hybrid units
  - signature-capable units
  - stalled production count

Success criteria:

- we can say exactly why `hard` is stronger than `normal` for each faction

### Phase 2: Split Economic And Composition Discipline

Goal:

Make `hard` reach stronger armies faster and with less waste.

Primary files:

- [`src/systems/aiProductionStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiProductionStrategy.ts)
- [`src/systems/aiPersonality.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiPersonality.ts)

Changes to investigate:

- stronger under-cap pressure on `hard`
- more aggressive quality-lag correction
- earlier preference for strong unlocked military prototypes
- stricter anti-settler gating when army, reserve, or pressure thresholds are not met
- more willingness to saturate supply in stable midgame states

Success criteria:

- `hard` armies get larger earlier
- `hard` floating-supply factions convert more economy into field presence
- `hard` closes the strongest-available vs strongest-fielded gap faster

### Phase 3: Split Research Timing And Breadth

Goal:

Make `hard` reach better tech states earlier and cash them out into real units.

Primary files:

- [`src/systems/aiResearchStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiResearchStrategy.ts)
- [`src/systems/strategicAi.ts`](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts)

Changes to investigate:

- earlier foreign T2 breadth after native T2
- less hesitation around hybrid-enabling domain pairs
- earlier emergent-rule breadth
- smarter native T3 timing instead of blind depth
- more deliberate mapping between research goals and production goals

Success criteria:

- `hard` unlocks more relevant breadth by turn 60 and 120
- `hard` fields more non-starter, hybrid, and faction-defining units than `normal`

### Phase 4: Hard-Specific Strategic Timing

Goal:

Make `hard` waste fewer turns at the strategy layer.

Primary files:

- [`src/systems/strategicAi.ts`](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts)
- [`src/systems/aiPersonality.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiPersonality.ts)

Changes to investigate:

- stronger reserve requirements before expansion
- stricter regroup vs overextend decisions
- more decisive posture changes once local superiority is established
- better front concentration instead of diffuse pressure
- more reliable conversion from military advantage into siege posture

Success criteria:

- `hard` drops fewer turns into indecisive or contradictory posture states
- `hard` creates clearer attack windows and follows through on them

### Phase 5: Tactical Coordination And Punishment

Goal:

Make `hard` tactically sharper than `normal`.

Primary files:

- [`src/systems/aiTactics.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiTactics.ts)
- [`src/systems/strategicAi.ts`](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts)
- [`src/systems/warEcologySimulation.ts`](C:/Users/fosbo/war-civ-v2/src/systems/warEcologySimulation.ts)

Changes to investigate:

- better focus-fire discipline
- fewer overfilled target allocations
- stronger reserve and screen behavior around cities
- better anti-mounted / anti-skirmish responses
- more coherent squad movement and commitment windows
- better protection for siege-capable forces

Success criteria:

- `hard` punishes exposed units more often
- `hard` attacks with better concentration
- `hard` feels more coordinated rather than merely more numerous

### Phase 6: Evaluate Whether Honest Economic Assists Are Still Necessary

Goal:

Only after decision quality is clearly better, determine whether `hard` still needs any assistance.

Primary files:

- [`src/systems/aiDifficulty.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiDifficulty.ts)
- any affected AI or economy systems, only if required

Rules:

- this phase is optional
- do not start here
- if used at all, keep assists small, explicit, and explainable

Possible assists to consider only if needed:

- slightly cleaner production throughput
- slightly faster recovery from indecisive idle states

Do not add:

- hidden combat buffs
- large flat production bonuses
- anything that makes AI wins feel fraudulent

## Testing Strategy

### Regression coverage

Maintain and extend tests in:

- [`tests/adaptiveAiPhase2.test.ts`](C:/Users/fosbo/war-civ-v2/tests/adaptiveAiPhase2.test.ts)
- [`tests/strategicAi.test.ts`](C:/Users/fosbo/war-civ-v2/tests/strategicAi.test.ts)
- [`tests/balanceHarness.test.ts`](C:/Users/fosbo/war-civ-v2/tests/balanceHarness.test.ts)

Add hard-specific tests for:

- `hard` vs `normal` settler gating
- `hard` vs `normal` quality-lag response
- `hard` vs `normal` research breadth timing
- `hard` tactical target concentration
- `hard` anti-skirmish / reserve behavior

### Harness validation

Run paired harnesses at minimum on:

- 20 turns for smoke checks
- 60 turns for timing and throughput checks
- 120 turns for research / composition / army-quality checks

Focus on deltas for the same seed set.

## Recommended Immediate Next Task

If context is cleared, start here:

1. Replace the current `usesNormalAiBehavior()` split with a real difficulty profile API in [`src/systems/aiDifficulty.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiDifficulty.ts).
2. Refactor [`src/systems/aiProductionStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiProductionStrategy.ts) and [`src/systems/aiResearchStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiResearchStrategy.ts) to read those profile values.
3. Add paired `normal` vs `hard` harness output in [`src/systems/balanceHarness.ts`](C:/Users/fosbo/war-civ-v2/src/systems/balanceHarness.ts).
4. Make the first hard-mode split economic and compositional before touching tactics.

## Suggested Verification Stack

- `npx vitest run tests/adaptiveAiPhase2.test.ts`
- `npx vitest run tests/strategicAi.test.ts`
- `npx vitest run tests/balanceHarness.test.ts`
- `npm run balance:harness -- --turns 20 --random --difficulty normal`
- `npm run balance:harness -- --turns 20 --random --difficulty hard`
- targeted 60-turn and 120-turn paired harness runs on the same seeds

## Final Scope Reminder

For this project:

- `normal` is the baseline challenge
- `hard` should be a real step up
- the improvement should come from better AI choices and coordination first

Only after that is working should the project consider any small honest assists.
