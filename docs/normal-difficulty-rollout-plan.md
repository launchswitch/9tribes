# Normal Difficulty Rollout Plan

## Purpose

Make `normal` meaningfully harder without using cheap resource cheats.

The target end state for `normal`:

- AI tribes reliably spend production instead of stalling.
- AI tribes convert surplus supply into real armies.
- AI tribes reach and use stronger T2/T3 states.
- AI tribes build stronger available prototypes, not just starter rosters.
- AI pressure feels coordinated and threatening across factions, not only in isolated matchup cases.

`hard` should eventually diverge from `normal`, but this plan is specifically for making `normal` respectable first.

## Current Findings

### 1. A major production blocker was present

Fixed in [`src/systems/knowledgeSystem.ts`](C:/Users/fosbo/war-civ-v2/src/systems/knowledgeSystem.ts).

Root cause:

- `PROTOTYPE_COST_MODIFIERS` was missing the `3 -> 1.0` entry.
- Once a faction reached prototype mastery `3+` for a domain-tagged unit, `getPrototypeCostModifier()` returned `undefined`.
- `calculatePrototypeCost()` then produced `NaN`.
- Cities could queue units with `cost = NaN`, never complete them, and accumulate absurd progress forever.

Regression coverage:

- Added in [`tests/production.test.ts`](C:/Users/fosbo/war-civ-v2/tests/production.test.ts).

### 2. That bug was materially suppressing normal difficulty

Observed in 120-turn `randomClimateBands` runs with `difficulty = 'normal'`:

- `steppe_clan` went from roughly `4.7` living units / `6.45` supply demand to `13.3` living units / `19.05` supply demand after the fix.
- `frost_wardens` went from roughly `4.7` to `9.1` living units.

Conclusion:

- A large part of “normal is too easy” was not only AI heuristics.
- Some factions were literally failing to turn economy into units.

### 3. Normal is still not strong enough holistically

After the bug fix, broader issues remain:

- Many factions still underuse available supply.
- Research tends to stay narrow: mostly native T2/T3, little breadth.
- Hybrid escalation is weak: average unlocked recipes remained near `0`.
- Some factions still choose settlers while they should be militarizing.
- Faction pressure is uneven: some tribes overboom villages but do not translate that into lethal timing.

## Verified Baseline After The Cost Fix

From 120-turn `randomClimateBands` normal sims:

| Faction | Avg Living Units | Avg Built Units | Avg Supply Income | Avg Supply Demand |
| --- | ---: | ---: | ---: | ---: |
| `steppe_clan` | 13.3 | 11.3 | 21.16 | 19.05 |
| `hill_clan` | 8.6 | 6.6 | 12.41 | 9.70 |
| `druid_circle` | 9.5 | 7.5 | 10.48 | 11.70 |
| `desert_nomads` | 5.6 | 3.6 | 29.71 | 9.25 |
| `frost_wardens` | 9.1 | 7.1 | 17.82 | 10.40 |

Interpretation:

- `steppe_clan` is now much closer to “uses its economy.”
- `desert_nomads` still massively under-convert economy into army.
- `hill_clan` and `druid_circle` are better, but still not obviously optimized around strongest-available units.

## Rollout Order

Do these in order. Do not start broad tuning before finishing the correctness and telemetry work.

### Phase 0: Keep The Production-Cost Fix

Status: complete.

Files:

- [`src/systems/knowledgeSystem.ts`](C:/Users/fosbo/war-civ-v2/src/systems/knowledgeSystem.ts)
- [`tests/production.test.ts`](C:/Users/fosbo/war-civ-v2/tests/production.test.ts)

Verification:

- `npx vitest run tests/production.test.ts`

## Phase 1: Add Honest Telemetry For Army Quality

Goal:

Measure whether AI is building the strongest units it can actually build.

Add telemetry to the balance harness for each faction:

- highest available production cost
- highest fielded production cost
- average fielded production cost
- number of units by prototype id
- number of hybrids fielded
- number of signature-capable units fielded
- supply utilization ratio: `supplyDemand / supplyIncome`
- stalled production markers:
  - current production item id
  - current production cost
  - turns queued if available

Primary files:

- [`src/systems/balanceHarness.ts`](C:/Users/fosbo/war-civ-v2/src/systems/balanceHarness.ts)
- Possibly [`scripts/runBalanceHarness.ts`](C:/Users/fosbo/war-civ-v2/scripts/runBalanceHarness.ts) if output shaping is needed

Success criteria:

- We can answer, per faction, whether the AI is failing because it cannot unlock stronger units, refuses to queue them, or loses them too fast.

## Phase 2: Improve Research Breadth On Normal

Goal:

Normal AI should not stop at “native line completed.”

Current issue:

- Average factions reach about one T2 and one T3 by turn 120, but recipe unlocks remain near zero.
- That strongly suggests narrow native progression instead of broader domain acquisition and hybrid payoff.

Changes to investigate:

- Increase normal weighting for foreign-domain breadth once native T2 is secured.
- Reduce normal bias toward native T3 if no second domain is developing.
- Increase value for reachable hybrid-enabling domain pairs.
- Increase value for emergent-rule breadth earlier, not only after depth is already underway.

Primary files:

- [`src/systems/aiResearchStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiResearchStrategy.ts)
- [`src/systems/strategicAi.ts`](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts)
- [`src/systems/knowledgeSystem.ts`](C:/Users/fosbo/war-civ-v2/src/systems/knowledgeSystem.ts)

Success criteria:

- By turn 120, average unlocked recipes should be meaningfully above zero for the factions that can learn into them.
- More factions should field non-starter prototype mixes.

## Phase 3: Reduce Settler/Expansion Self-Sabotage

Goal:

Normal AI should expand when safe, not when it is obviously sacrificing military pressure.

Current issue:

- `hill_clan` and `druid_circle` still queue settlers in states where army pressure is more valuable.

Changes to investigate:

- Penalize settler builds while:
  - below target army size
  - supply utilization is already low
  - enemy pressure is visible
  - no reserve / garrison threshold has been met
- Require stronger defensive posture confirmation before settler production is attractive.

Primary files:

- [`src/systems/aiProductionStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiProductionStrategy.ts)
- [`src/systems/aiPersonality.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiPersonality.ts)
- [`src/systems/strategicAi.ts`](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts)

Success criteria:

- Defensive factions stop bleeding tempo into premature settlers.
- Built-unit count rises faster in the first 40-80 turns.

## Phase 4: Push Normal Toward Supply Cap Usage

Goal:

Tribes with large surplus supply should build toward that cap instead of floating it.

Current issue:

- Some factions still show very high surplus supply with weak armies.
- `desert_nomads` is the clearest example.

Changes to investigate:

- Raise priority for cheap, high-availability military units when supply utilization is low.
- Add a normal-only “under cap” pressure term in production ranking.
- Distinguish “preserve supply headroom because I am fragile” from “I am hoarding supply for no reason.”
- Re-check per-faction desired role ratios; some may be too conservative to ever saturate supply.

Primary files:

- [`src/systems/aiProductionStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiProductionStrategy.ts)
- [`src/systems/aiPersonality.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiPersonality.ts)

Success criteria:

- More factions approach `0.8-1.0` supply utilization in stable midgame states.
- Factions with surplus supply produce more lethal armies instead of just extra villages.

## Phase 5: Make “Strongest Available Unit” A First-Class AI Goal

Goal:

If a faction has unlocked stronger prototypes, normal should actually prefer them when economically sensible.

Changes to investigate:

- Score candidate quality relative to current field average.
- Prefer upgrading composition quality, not just filling role slots.
- Reward signature / faction-defining units once economy and unlock state support them.
- Add explicit “army quality lag” logic:
  - if strongest available prototype cost is much higher than strongest fielded prototype cost, weight the stronger option up.

Primary files:

- [`src/systems/aiProductionStrategy.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiProductionStrategy.ts)
- [`src/systems/balanceHarness.ts`](C:/Users/fosbo/war-civ-v2/src/systems/balanceHarness.ts)

Success criteria:

- Higher-cost unlocked prototypes show up in fielded armies.
- Signature and hybrid units appear more often in mid/late normal sims.

## Phase 6: Tactical Pressure And Coordination

Goal:

Once economy/research/production are honest, make normal tactically punishing enough to feel like a challenge.

This includes, but is not limited to, anti-skirmish behavior.

Changes to investigate:

- Better reserve and screen behavior around cities.
- Better focus-fire on exposed targets.
- Better formation discipline instead of isolated piecemeal attacks.
- Better reaction to visible mounted/skirmish threats.

Primary files:

- [`src/systems/strategicAi.ts`](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts)
- [`src/systems/aiTactics.ts`](C:/Users/fosbo/war-civ-v2/src/systems/aiTactics.ts)
- [`src/systems/warEcologySimulation.ts`](C:/Users/fosbo/war-civ-v2/src/systems/warEcologySimulation.ts)

Important:

- Do this after the economy/production/research fixes.
- Otherwise tactical retuning will be compensating for broken production.

## Scope Boundary For Normal vs Hard

Do not split `hard` yet.

For this pass:

- `normal` should become a serious baseline challenge.
- Keep the AI fair: no flat production bonuses, no hidden combat buffs.
- Use better decision-making and cleaner throughput first.

After normal is credible:

- split `hard` from `normal`
- add harder tactical coordination
- add stricter timing and composition behavior
- only consider small honest economic assists if still necessary

## Recommended Immediate Next Task

If context is cleared, start here:

1. Extend [`src/systems/balanceHarness.ts`](C:/Users/fosbo/war-civ-v2/src/systems/balanceHarness.ts) with army-quality telemetry.
2. Re-run 60-turn and 120-turn `randomClimateBands` normal harnesses.
3. Identify which factions still fail to field stronger available prototypes.
4. Patch research breadth and settler gating before doing any more tactical tuning.

## Suggested Verification Stack

- `npx vitest run tests/production.test.ts`
- `npm run balance:harness -- --turns 20 --random`
- targeted 60-turn and 120-turn `runWarEcologySimulation(..., 'normal')` telemetry scripts
- if production heuristics change, also run:
  - `npx vitest run tests/adaptiveAiPhase2.test.ts`
  - any strategic AI tests touching production/research behavior

