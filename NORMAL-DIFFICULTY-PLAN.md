# Normal Difficulty Overhaul — Project Plan

**Goal:** Make Normal difficulty a real challenge for playtesters without information cheats. Players should feel pressure from turn 1, struggle to survive into the mid-game, and experience the synergy/research system as a race against a credible opponent — not as a reward for patience against a passive AI.

**Constraint:** No blatant cheating. Specifically the AI must NOT get:
- `strategicFogCheat: true` (omniscient unit vision)
- `memoryDecayTurns: Infinity` (perfect recall)
- Blanket resource/production multipliers

**Context:** Easy and Hard are currently disabled in the menu. Normal is the only shipping difficulty, so every improvement lands directly in front of playtesters.

---

## Problem Statement

Current Normal has three structural gaps:

1. **Thin attacks.** Single-axis commits + 2-unit squads = easily swatted. Player defends one chokepoint and stalls indefinitely.
2. **Research AI identical to Easy.** Normal's research block is copy-pasted from Easy. The AI never chases emergent rules, signature exploits, or codified pivots. Player reaches the synergy system uncontested.
3. **Collapse on first city loss.** AI spiral-collapses once the player takes its home city. Rest of the game is a coronation — playtesters disengage.

---

## Phase 1 — Parameter Overhaul

**Scope:** Single-file edit to [src/systems/aiDifficulty.ts](src/systems/aiDifficulty.ts). Fully reversible. Pulls non-cheating behavior from Hard's profile into Normal.

### Strategy block changes

| Parameter | Current | New | Rationale |
|---|---|---|---|
| `multiAxisEnabled` | false | **true** | Player must defend two fronts |
| `multiAxisGroupCount` | 1 | 2 | Primary + flanker (not Hard's 3-group swarm) |
| `multiAxisPrimaryShare` | 1 | 0.65 | |
| `multiAxisFlankShare` | 0 | 0.35 | |
| `multiAxisHarassShare` | 0 | 0 | Skip harass — it's what pushes Hard into hyper-aggressive territory |
| `multiAxisStaggerTurns` | 0 | 2 | Waves arrive separately, extending pressure window |
| `multiAxisMinGroupSize` | 2 | 2 | unchanged |
| `focusTargetLimit` | 3 | 2 | Concentrates damage on key enemy units |
| `focusBudgetLeaderBonus` | 0.5 | 1.1 | |
| `focusOverfillPenalty` | 2.4 | 3.8 | |
| `coordinatorHunterShare` | 0.65 | 0.75 | Commit more units forward |
| `advantageHunterShare` | 0.65 | 0.80 | When winning, commit — don't trickle |
| `postureCommitmentLockTurns` | 1 | 2 | Stop flip-flopping plans |
| `memoryDecayTurns` | 10 | 20 | AI remembers longer; still fog-respecting |
| `learnLoopDomainTargetingEnabled` | false | true | AI actively farms ability domains |
| `learnLoopMaxAbilitiesToLearn` | 1 | 2 | |
| `learnLoopMinAbilitiesToReturn` | 2 | 1 | Returns to sacrifice sooner |
| `economicDenialWeight` | 0 | 2 | Razes villages when raiding |
| `freshVillageDenialTurns` | 0 | 2 | |
| `settlerInterceptionEnabled` | false | **true (verify fog-gated first)** | See verification task below |
| `settlerInterceptionRadius` | 0 | 6 | Short radius — visible-only intercept |

### Personality block changes

| Parameter | Current | New | Rationale |
|---|---|---|---|
| `squadSizeBonus` | -1 | 0 | Attacks arrive as 3-unit waves, not 2-unit drip |
| `focusFireLimitBonus` | 0 | 1 | Allows 3 attackers per target |

### Verification task before shipping Phase 1

- [ ] Confirm `settlerInterceptionEnabled` in `src/systems/strategic-ai/` only acts on **fog-visible** settlers. If it iterates all factions' settlers regardless of visibility, either fix it to fog-gate or leave disabled on Normal.

### Expected player experience after Phase 1

- First enemy contact arrives as a coordinated 3-unit wave, not a single scout
- A second (flank) group shows up 2 turns later, forcing split defense
- Enemy picks off the player's weakest frontline unit instead of spreading damage
- Villages the player captured get razed when AI raiders reach them
- Once the AI commits to an offensive, it stays committed for 2+ turns

---

## Phase 2 — Research IQ Parity

**Scope:** Same file as Phase 1. Ship together as one commit.

**Why full Hard values here, not half:** Research is entirely hidden from the player. A smarter AI research curve doesn't feel like a cheat — it feels like a real opponent racing you to synergies. This is the specific lever that makes "getting to the synergy system matter."

### Research block — promote Normal to Hard values

| Parameter | Current (= Easy) | New (= Hard) |
|---|---|---|
| `stickyThreshold` | 3 | 2.5 |
| `tier3DepthWeight` | 3 | 2.25 |
| `breadthPivotFirstWeight` | 7 | 9 |
| `breadthPivotFollowupWeight` | 4 | 6 |
| `breadthPivotDevelopmentBonus` | 2 | 3 |
| `nativeTier3DelayPenalty` | 5 | 8 |
| `hybridBreadthWeight` | 4.5 | 6.25 |
| `emergentBreadthWeight` | 2.5 | 4 |
| `tripleStackTier2Weight` | 10 | 12 |
| `tripleStackTier3Weight` | 7 | 8.5 |
| `emergentRuleNearBonus` | 0 | **15** |
| `emergentRuleSacrificePriority` | 0 | **3** |
| `emergentRuleCompletionBonus` | 0 | **4** |
| `signatureExploitWeight` (research) | 0 | **1.8** |

### Production block — activate dormant levers

| Parameter | Current | New | Rationale |
|---|---|---|---|
| `signatureExploitWeight` | 0 | 2.2 | AI produces units that exploit its faction signature |
| `codifiedPivotScoringBonus` | 0 | 5 | Leans into codified abilities once sacrificed |
| `codifiedPivotDuration` | 3 | 4 | |
| `counterCompositionWeight` | 0.75 | 2.5 | Picks counter-units decisively against visible enemy composition |
| `counterCompositionThreshold` | 0.5 | 0.4 | More responsive |
| `aggressiveFillWeight` | 8 | 10 | |

### Expected player experience after Phase 2

- AI completes its first emergent rule ~2-4 turns before player
- AI's second-wave units hard-counter what the player fielded in the first clash
- AI signature abilities start showing up in combat (Frost Nova, Desert Swarm, etc.)
- Race to synergy feels genuinely contested — player must choose between defense and research throughput

---

## Phase 3 — Collapse Prevention ("Last Stand")

**Scope:** New logic in [src/systems/strategicAi.ts](src/systems/strategicAi.ts) + a posture hook. Larger than Phase 1/2 combined but still scoped to ~1-2 functions.

**Why:** Currently if the player takes the AI's first city, the rest of the game is a coronation. Playtesters check out. This is the single biggest threat to engagement.

**Why not just enable `losingDenialMode`:** Hard's denial mode is scorched-earth and feels punitive. We want *dignified resistance*, not spite.

### Trigger conditions (any)

- AI loses its home city
- AI army drops below 40% of its peak size
- AI is reduced to one remaining city

### Behavior

1. **Recall phase (1 turn):** All raiders/hunters recalled to a chokepoint adjacent to the nearest remaining city.
2. **Dig-in phase (4 turns):** Defensive posture locked. Production utilization boosted to 1.0 (all-in). Retreat threshold raised — AI fights in its own ZoC.
3. **Counter-offensive phase:** Single-target counter-attack against the city the player took. Full army commit, no multi-axis.
4. **Exit:** Returns to normal posture logic if the city is retaken OR after 8 turns regardless.

### Implementation sketch

- New posture: `lastStand` added to `determinePosture()` with high priority when trigger conditions hit
- New parameter block on Normal profile: `lastStandEnabled: true`, `lastStandRecallTurns: 1`, `lastStandDigInTurns: 4`, `lastStandCounterTurns: 3`
- Overrides `postureCommitmentLockTurns` while active

### Expected player experience after Phase 3

- Taking the AI's first city triggers visible repositioning (player sees units converge on the next city)
- The "easy cleanup phase" becomes a genuine second act
- Player must choose: press the counter-offensive immediately, or consolidate and risk the AI's wave

---

## Phase 4 — Validation

### Paired harness runs

Run `npm run balance:harness` (or `:stratified`) with Normal-current vs Normal-v2 across ~20 seeds. Target deltas:

| Metric | Target |
|---|---|
| AI city captures per game | +40% |
| Games where AI completes first emergent rule before player | >50% |
| Average game length (turns) | +8 to +12 |
| AI army peak size at turn 20 | +20% |
| Player win rate at Normal | 50-65% (playable but tense) |

### Guardrails / regression checks

- If average game length exceeds +15 turns, back off Phase 3's dig-in duration
- If AI win rate exceeds 50% in paired harness, reduce `multiAxisStaggerTurns` or `focusTargetLimit`
- If playtesters report "AI keeps teleporting to my settlers," re-check Phase 1 settler interception fog-gating

### Playtest acceptance criteria

A successful overhaul means playtesters report:
1. "I had to actually defend" in the first 10 turns
2. "The AI was researching fast / I felt rushed to the synergy system"
3. "Taking their first city wasn't the end of the game"

---

## Sequencing

| Order | Phase | Effort | Risk |
|---|---|---|---|
| 1 | Phase 1 + Phase 2 combined commit | 1-2 hours | Low — single file, reversible |
| 2 | Harness validation | 30 min | — |
| 3 | Phase 3 Last Stand system | 3-5 hours | Medium — new logic path |
| 4 | Second harness + playtest pass | 1 hour | — |

Ship Phase 1+2 to playtesters immediately. Use their feedback to calibrate Phase 3 before building it.

---

## Explicitly out of scope

- Enabling `strategicFogCheat` — information cheat
- Enabling `memoryDecayTurns: Infinity` — information cheat
- Enabling Hard's `losingDenialMode` — punitive, sours playtests
- Adding more difficulty tiers — Normal is the only shipping tier right now
- Blanket production/supply multipliers — players notice, feels cheap
- Changes to combat resolution, unit stats, or content JSON — this plan is AI behavior only
