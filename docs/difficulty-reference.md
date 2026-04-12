# War-Civ V2 — Difficulty System Reference

> LLM-optimized reference for tuning AI difficulty. Last updated: 2026-04-12.
> Source of truth: `src/systems/aiDifficulty.ts`, `src/systems/aiPersonality.ts`, `src/systems/strategicAi.ts`.

---

## Architecture Overview

Difficulty is controlled by **three layered systems**:

1. **Difficulty profile** (`aiDifficulty.ts`) — A flat data object per difficulty level. Controls whether advanced AI features are on, sets numeric thresholds for aggression gates, production weights, research strategy, and personality floors. No logic — pure parameters.

2. **Personality system** (`aiPersonality.ts`) — Each faction has a baseline personality (scalars like aggression, caution, siegeBias). The difficulty profile sets *minimum floors* for key scalars and *additive offsets* to combat thresholds. The personality is then modified at runtime by state (exhaustion, supply deficit, threatened cities).

3. **Strategic AI pipeline** (`strategicAi.ts`) — The decision engine that reads difficulty profile + personality to determine posture, assign unit intents, run the coordinator, and gate aggression. All the logic lives here.

### Pipeline per turn

```
computeFactionStrategy()
  -> computeAiPersonalitySnapshot()     // merge baseline + difficulty + state
  -> getLivingEnemyUnits()              // fog-gated or omniscient
  -> detectFronts()                     // visible + last-seen enemies
  -> determinePosture()                 // score 6 postures, pick winner
  -> choosePrimaryCityObjective()       // pick which enemy city to target
  -> chooseFocusTargets()               // pick specific units to focus
  -> assignUnitIntents()                // per-unit assignments + waypoints
  -> applyDifficultyCoordinator()       // override with coordinated attack plan
  -> applyWaitForAlliesGate()           // hold back solo attackers
  -> return FactionStrategy
```

---

## Difficulty Profiles — Full Current Values

### Key: What `adaptiveAi` controls

`adaptiveAi: true` means the difficulty profile is applied to personality overrides via `applyDifficultyBaselineOverrides`. When `false` (Easy), personality scalars use faction baseline unchanged. The coordinator has a separate lightweight path for non-adaptive AI.

---

### Easy Profile

| Section | Parameter | Value | Notes |
|---------|-----------|-------|-------|
| core | adaptiveAi | false | No personality overrides, no rush production |
| core | difficulty | 'easy' | |
| **production** | rushTurns | 0 | No rush phase |
| | codifiedPivotDuration | 0 | No codified pivot |
| | codifiedPivotScoringBonus | 0 | |
| | supplyEfficiencyWeight | 0.22 | |
| | forceProjectionWeight | 0.95 | |
| | underCapUtilizationFloor | 0.8 | |
| | underCapTargetUtilization | 0.9 | |
| | underCapPressureWeight | 12 | |
| | underCapArmyShortfallWeight | 1.2 | |
| | underCapArmyShortfallCap | 6 | |
| | underCapCheapSupplyWeight | 1.4 | |
| | underCapCheapProductionWeight | 0.08 | |
| | armyQualityNearTopWindow | 1 | |
| | armyQualityHighestLagWeight | 0.55 | |
| | armyQualityAverageLagWeight | 0.35 | |
| | settlerGateStrength | 1 | |
| | settlerReserveFloor | 3 | |
| | settlerReservePerCity | 2 | |
| | settlerArmyShortfallWeight | 3 | |
| | settlerUtilizationFloor | 0.75 | |
| | settlerUtilizationPenaltyWeight | 18 | |
| | settlerVisibleEnemyBasePenalty | 12 | |
| | settlerVisibleEnemyPerUnitPenalty | 1.5 | |
| | settlerReservePenaltyWeight | 2.5 | |
| | counterCompositionThreshold | 1 | No counter-composition logic |
| | counterCompositionWeight | 0 | |
| | signatureExploitWeight | 0 | |
| | aggressiveFillMargin | null | No aggressive fill |
| | aggressiveFillWeight | 0 | |
| **research** | stickyThreshold | 3 | |
| | tier3DepthWeight | 3 | |
| | breadthPivotFirstWeight | 7 | |
| | breadthPivotFollowupWeight | 4 | |
| | breadthPivotDevelopmentBonus | 2 | |
| | nativeTier3DelayPenalty | 5 | |
| | hybridBreadthWeight | 4.5 | |
| | emergentBreadthWeight | 2.5 | |
| | tripleStackTier2Weight | 10 | |
| | tripleStackTier3Weight | 7 | |
| | emergentRuleNearBonus | 0 | No emergent rule bonuses |
| | emergentRuleSacrificePriority | 0 | |
| | emergentRuleCompletionBonus | 0 | |
| | signatureExploitWeight | 0 | |
| **personality** | aggressionFloor | 0.5 | Matches default baseline |
| | siegeBiasFloor | 0.25 | |
| | raidBiasFloor | 0.25 | |
| | focusFireLimitBonus | 0 | |
| | squadSizeBonus | -1 | squadSize becomes 2 (from default 3) |
| | commitAdvantageOffset | 0 | commitAdvantage stays 1.15 |
| | retreatThresholdOffset | 0 | retreatThreshold stays 0.80 |
| | antiSkirmishResponseWeight | 0 | No anti-skirmish logic |
| **strategy** | focusTargetLimit | 3 | |
| | focusBudgetLeaderBonus | 0.5 | |
| | focusOverfillPenalty | 2.4 | |
| | coordinatorEnabled | true | **Recently enabled** (was false) |
| | multiAxisEnabled | false | Single-axis only |
| | multiAxisGroupCount | 1 | |
| | multiAxisPrimaryShare | 1 | |
| | multiAxisFlankShare | 0 | |
| | multiAxisHarassShare | 0 | |
| | multiAxisMinGroupSize | 2 | |
| | multiAxisStaggerTurns | 0 | |
| | coordinatorMinSupplyRatio | 0.8 | |
| | coordinatorMinIdleNearHome | 1 | **Lowered** (was 3) |
| | coordinatorMinActiveArmy | 2 | **Lowered** (was 4) |
| | coordinatorHunterShare | 0.5 | |
| | coordinatorHunterFloor | 1 | **Lowered** (was 3) |
| | villageDetourTolerance | 3 | |
| | villageCityDistanceLimit | 8 | |
| | learnLoopEnabled | false | No learn-by-kill loop |
| | learnLoopHighAbilityThreshold | 2 | |
| | learnLoopMinAbilitiesToReturn | 2 | |
| | learnLoopMaxAbilitiesToLearn | 1 | |
| | learnLoopDomainTargetingEnabled | false | |
| | learnLoopFarFromHomeDistance | 5 | |
| | learnLoopIdleHomeRadius | 4 | |
| | learnLoopMinFieldForce | 3 | |
| | learnLoopMaxReturnShare | 0.4 | |
| | strategicFogCheat | false | Fog of war active |
| | memoryDecayTurns | 10 | Forgets after 10 turns |
| | economicDenialWeight | 0 | No economic denial |
| | freshVillageDenialTurns | 0 | |
| | settlerInterceptionEnabled | false | |
| | settlerInterceptionRadius | 0 | |
| | postureCommitmentLockTurns | 0 | Posture can change every turn |
| | postureExplorationDeadline | 30 | **Lowered** (was 99) |
| | advantageHunterShare | 0.5 | |
| | losingDenialMode | false | |
| | explorationCenterBias | 0.6 | **New field** — biases exploration toward map center |
| | explorationCenterBiasDecayPerRound | 0.03 | Bias decays to 0 by ~turn 20 |
| | noEnemySeenOffensivePenalty | -0.5 | **New field** (was hardcoded -2) |

---

### Normal Profile

| Section | Parameter | Value | Diff from Easy |
|---------|-----------|-------|---------------|
| core | adaptiveAi | true | Personality floors applied |
| core | difficulty | 'normal' | |
| **production** | rushTurns | 10 | Rush cheapest military for 10 turns |
| | codifiedPivotDuration | 3 | |
| | codifiedPivotScoringBonus | 0 | |
| | supplyEfficiencyWeight | 0.22 | Same |
| | forceProjectionWeight | 0.95 | Same |
| | underCapUtilizationFloor | 0.5 | Lower (produces more eagerly) |
| | underCapTargetUtilization | 0.9 | Same |
| | underCapPressureWeight | 12 | Same |
| | underCapArmyShortfallWeight | 1.2 | Same |
| | underCapArmyShortfallCap | 6 | Same |
| | underCapCheapSupplyWeight | 1.4 | Same |
| | underCapCheapProductionWeight | 0.08 | Same |
| | armyQualityNearTopWindow | 1 | Same |
| | armyQualityHighestLagWeight | 0.55 | Same |
| | armyQualityAverageLagWeight | 0.35 | Same |
| | settlerGateStrength | 1 | Same |
| | settlerReserveFloor | 3 | Same |
| | settlerReservePerCity | 2 | Same |
| | settlerArmyShortfallWeight | 3 | Same |
| | settlerUtilizationFloor | 0.75 | Same |
| | settlerUtilizationPenaltyWeight | 18 | Same |
| | settlerVisibleEnemyBasePenalty | 12 | Same |
| | settlerVisibleEnemyPerUnitPenalty | 1.5 | Same |
| | settlerReservePenaltyWeight | 2.5 | Same |
| | counterCompositionThreshold | 0.5 | Active |
| | counterCompositionWeight | 0.75 | |
| | signatureExploitWeight | 0 | |
| | aggressiveFillMargin | 2 | Active |
| | aggressiveFillWeight | 8 | |
| **research** | (all values) | (same as Easy) | No difference |
| **personality** | aggressionFloor | 0.7 | +0.2 above default |
| | siegeBiasFloor | 0.5 | +0.25 above default |
| | raidBiasFloor | 0.4 | +0.15 above default |
| | focusFireLimitBonus | 0 | |
| | squadSizeBonus | -1 | squadSize becomes 2 (from default 3) |
| | commitAdvantageOffset | -0.05 | commitAdvantage becomes 1.10 (more willing to attack) |
| | retreatThresholdOffset | 0.05 | retreatThreshold becomes 0.85 (slightly more cautious retreats) |
| | antiSkirmishResponseWeight | 1.8 | Responds to enemy skirmishers |
| **strategy** | focusTargetLimit | 3 | Same |
| | focusBudgetLeaderBonus | 0.5 | Same |
| | focusOverfillPenalty | 2.4 | Same |
| | coordinatorEnabled | true | |
| | multiAxisEnabled | false | Single-axis |
| | (multi-axis fields) | (single-axis defaults) | |
| | coordinatorMinSupplyRatio | 0.8 | |
| | coordinatorMinIdleNearHome | 1 | **Lowered** (was 3) |
| | coordinatorMinActiveArmy | 2 | **Lowered** (was 4) |
| | coordinatorHunterShare | 0.5 | |
| | coordinatorHunterFloor | 2 | **Lowered** (was 3) |
| | villageDetourTolerance | 3 | |
| | villageCityDistanceLimit | 8 | |
| | learnLoopEnabled | true | Learn-by-kill active |
| | learnLoopHighAbilityThreshold | 2 | |
| | learnLoopMinAbilitiesToReturn | 2 | |
| | learnLoopMaxAbilitiesToLearn | 1 | |
| | learnLoopDomainTargetingEnabled | false | |
| | learnLoopFarFromHomeDistance | 5 | |
| | learnLoopIdleHomeRadius | 4 | |
| | learnLoopMinFieldForce | 3 | |
| | learnLoopMaxReturnShare | 0.4 | |
| | strategicFogCheat | false | Fog active |
| | memoryDecayTurns | 10 | Forgets after 10 turns |
| | economicDenialWeight | 0 | |
| | freshVillageDenialTurns | 0 | |
| | settlerInterceptionEnabled | false | |
| | settlerInterceptionRadius | 0 | |
| | postureCommitmentLockTurns | 1 | Locks offensive/siege posture 1 turn |
| | postureExplorationDeadline | 12 | **Lowered** (was 24) |
| | advantageHunterShare | 0.65 | |
| | losingDenialMode | false | |
| | explorationCenterBias | 0.8 | **New** — strong center bias |
| | explorationCenterBiasDecayPerRound | 0.04 | Decays to 0 by ~turn 20 |
| | noEnemySeenOffensivePenalty | -0.5 | **New** (was hardcoded -2) |

---

### Hard Profile

| Section | Parameter | Value | Diff from Normal |
|---------|-----------|-------|-----------------|
| core | adaptiveAi | true | Same |
| core | difficulty | 'hard' | |
| **production** | rushTurns | 7 | Shorter rush (7 vs 10) but more intense |
| | codifiedPivotDuration | 4 | |
| | codifiedPivotScoringBonus | 5 | Actively pursues codified abilities |
| | supplyEfficiencyWeight | 0.24 | +0.02 |
| | forceProjectionWeight | 1.1 | +0.15 |
| | underCapUtilizationFloor | 0.88 | Much higher (produces only when nearly full) |
| | underCapTargetUtilization | 0.98 | +0.08 |
| | underCapPressureWeight | 16 | +4 (stronger army pressure) |
| | underCapArmyShortfallWeight | 1.5 | +0.3 |
| | underCapArmyShortfallCap | 8 | +2 |
| | underCapCheapSupplyWeight | 1.6 | +0.2 |
| | underCapCheapProductionWeight | 0.1 | +0.02 |
| | armyQualityNearTopWindow | 1 | Same |
| | armyQualityHighestLagWeight | 0.8 | +0.25 |
| | armyQualityAverageLagWeight | 0.5 | +0.15 |
| | settlerGateStrength | 1.35 | +0.35 (stricter settler gates) |
| | settlerReserveFloor | 4 | +1 |
| | settlerReservePerCity | 2.5 | +0.5 |
| | settlerArmyShortfallWeight | 4 | +1 |
| | settlerUtilizationFloor | 0.85 | +0.10 |
| | settlerUtilizationPenaltyWeight | 24 | +6 |
| | settlerVisibleEnemyBasePenalty | 14 | +2 |
| | settlerVisibleEnemyPerUnitPenalty | 2 | +0.5 |
| | settlerReservePenaltyWeight | 3.25 | +0.75 |
| | counterCompositionThreshold | 0.4 | More responsive |
| | counterCompositionWeight | 2.5 | 3.3x Normal |
| | signatureExploitWeight | 2.2 | Active |
| | aggressiveFillMargin | 2 | Same |
| | aggressiveFillWeight | 10 | +2 |
| **research** | stickyThreshold | 2.5 | -0.5 (less sticky, more adaptive) |
| | tier3DepthWeight | 2.25 | -0.75 (less depth-focused) |
| | breadthPivotFirstWeight | 9 | +2 (more breadth-seeking) |
| | breadthPivotFollowupWeight | 6 | +2 |
| | breadthPivotDevelopmentBonus | 3 | +1 |
| | nativeTier3DelayPenalty | 8 | +3 (harsher penalty for neglecting native) |
| | hybridBreadthWeight | 6.25 | +1.75 |
| | emergentBreadthWeight | 4 | +1.5 |
| | tripleStackTier2Weight | 12 | +2 |
| | tripleStackTier3Weight | 8.5 | +1.5 |
| | emergentRuleNearBonus | 15 | Active (was 0) |
| | emergentRuleSacrificePriority | 3 | Active (was 0) |
| | emergentRuleCompletionBonus | 4 | Active (was 0) |
| | signatureExploitWeight | 1.8 | Active (was 0) |
| **personality** | aggressionFloor | 0.78 | +0.08 above Normal |
| | siegeBiasFloor | 0.62 | +0.12 above Normal |
| | raidBiasFloor | 0.48 | +0.08 above Normal |
| | focusFireLimitBonus | 1 | focusFireLimit becomes 3 (from default 2) |
| | squadSizeBonus | 0 | squadSize stays 3 (Normal is -1 = 2) |
| | commitAdvantageOffset | -0.05 | Same as Normal |
| | retreatThresholdOffset | 0.05 | Same as Normal |
| | antiSkirmishResponseWeight | 1.8 | Same |
| **strategy** | focusTargetLimit | 2 | Tighter focus (was 3) |
| | focusBudgetLeaderBonus | 1.1 | +0.6 (stronger leader focus) |
| | focusOverfillPenalty | 3.8 | +1.4 (harsher overfill) |
| | coordinatorEnabled | true | |
| | multiAxisEnabled | true | **Multi-axis attacks ON** |
| | multiAxisGroupCount | 3 | 3 attack groups |
| | multiAxisPrimaryShare | 0.5 | 50% main push |
| | multiAxisFlankShare | 0.3 | 30% flank |
| | multiAxisHarassShare | 0.2 | 20% harass |
| | multiAxisMinGroupSize | 2 | |
| | multiAxisStaggerTurns | 1 | Stagger waves by 1 turn |
| | coordinatorMinSupplyRatio | 0.9 | +0.1 (higher supply bar) |
| | coordinatorMinIdleNearHome | 2 | +1 above Normal |
| | coordinatorMinActiveArmy | 4 | **Lowered** (was 6), +2 above Normal |
| | coordinatorHunterShare | 0.80 | +0.30 above Normal |
| | coordinatorHunterFloor | 3 | **Lowered** (was 4), +1 above Normal |
| | villageDetourTolerance | 2 | -1 |
| | villageCityDistanceLimit | 6 | -2 |
| | learnLoopEnabled | true | |
| | learnLoopHighAbilityThreshold | 2 | |
| | learnLoopMinAbilitiesToReturn | 1 | Returns sooner (was 2) |
| | learnLoopMaxAbilitiesToLearn | 2 | Learns more (was 1) |
| | learnLoopDomainTargetingEnabled | true | Targets factions for domain learning |
| | learnLoopFarFromHomeDistance | 4 | -1 |
| | learnLoopIdleHomeRadius | 5 | +1 |
| | learnLoopMinFieldForce | 4 | +1 |
| | learnLoopMaxReturnShare | 0.33 | -0.07 |
| | strategicFogCheat | true | **Omniscient vision** |
| | memoryDecayTurns | Infinity | **Perfect memory** |
| | economicDenialWeight | 4 | Active (was 0) |
| | freshVillageDenialTurns | 3 | Active (was 0) |
| | settlerInterceptionEnabled | true | Active (was false) |
| | settlerInterceptionRadius | 18 | |
| | postureCommitmentLockTurns | 3 | +2 above Normal |
| | postureExplorationDeadline | 10 | **Lowered** (was 15) |
| | advantageHunterShare | 0.95 | +0.30 above Normal |
| | losingDenialMode | true | Active (was false) |
| | explorationCenterBias | 0.5 | **New** (lower — Hard has fogCheat) |
| | explorationCenterBiasDecayPerRound | 0.03 | |
| | noEnemySeenOffensivePenalty | 0 | **New** — no penalty at all |

---

## Personality Defaults and Difficulty Interaction

### Default Baseline (`aiPersonality.ts` line 49)

```typescript
aggression: 0.5,    caution: 0.5,     cohesion: 0.5,
opportunism: 0.5,   raidBias: 0.25,   siegeBias: 0.25,
defenseBias: 0.25,  exploreBias: 0.25, captureBias: 0.25,
stealthBias: 0.25,  attritionBias: 0.25, mobilityBias: 0.25,
commitAdvantage: 1.15,  retreatThreshold: 0.8,
focusFireLimit: 2,  squadSize: 3,
```

### Effective Values After Difficulty Override

| Scalar | Easy | Normal | Hard |
|--------|------|--------|------|
| aggression | 0.5 (no override) | max(baseline, 0.7) | max(baseline, 0.78) |
| siegeBias | 0.25 (no override) | max(baseline, 0.5) | max(baseline, 0.62) |
| raidBias | 0.25 (no override) | max(baseline, 0.4) | max(baseline, 0.48) |
| focusFireLimit | 2 | 2 + 0 = 2 | 2 + 1 = 3 |
| squadSize | 3 + (-1) = 2 | 3 + (-1) = 2 | 3 + 0 = 3 |
| commitAdvantage | 1.15 + 0 = 1.15 | 1.15 + (-0.05) = 1.10 | 1.15 + (-0.05) = 1.10 |
| retreatThreshold | 0.80 + 0 = 0.80 | 0.80 + 0.05 = 0.85 | 0.80 + 0.05 = 0.85 |

**Note:** Easy has `adaptiveAi: false`, so personality scalars are NOT overridden. The table above for Easy shows the default baseline values. The coordinator uses a lightweight path instead.

### Posture Score Formulas (`scorePosture`, `aiPersonality.ts` line 380)

```
offensive  = aggression * 4 + mobilityBias * 2 + localAdvantage - supplyDeficit
defensive  = defenseBias * 4 + threatenedCities * 2 + caution * 2
recovery   = caution * 3 + attritionBias * 2 + supplyDeficit * 1.5
siege      = siegeBias * 4 + localAdvantage * 1.5 - threatenedCities
exploration= exploreBias * 4 + mobilityBias * 2 - fronts
balanced   = cohesion * 3 + opportunism * 1.5
```

### Posture Conditional Bonuses (`determinePosture`, `strategicAi.ts` line 433)

| Condition | Effect |
|-----------|--------|
| `fronts.length === 0 && threatenedCities.length === 0` | exploration +2.5 |
| `enemyUnitCount === 0` | offensive +noEnemySeenOffensivePenalty, siege +noEnemySeenOffensivePenalty |
| `round >= postureExplorationDeadline` | exploration = -Infinity |
| Major front with friendly >= enemy | siege +2.5 |
| `unitCount >= enemy * 2 && unitCount >= 5` | siege +2 |
| Major front with friendly >= enemy | offensive +1.5 |
| `unitCount >= enemy + 2` | balanced -2.5, offensive +1.5 |
| Previous posture offensive/siege within commitment lock | +6 to previous posture |

### Default Personality Scores (with Normal difficulty floors applied)

```
offensive  = 0.7*4 + 0.25*2 + 0 - 0 = 3.3    (before conditionals)
defensive  = 0.25*4 + 0*2 + 0.5*2 = 2.0
recovery   = 0.5*3 + 0.25*2 + 0*1.5 = 2.0
siege      = 0.5*4 + 0*1.5 - 0 = 2.0
exploration= 0.25*4 + 0.25*2 - 0 = 1.5
balanced   = 0.5*3 + 0.5*1.5 = 2.25
```

With no enemies, no fronts: exploration gets +2.5 (total 4.0), offensive gets -0.5 (total 2.8). Exploration wins.

---

## Coordinator Pipeline

### Gate Sequence (`applyDifficultyCoordinator`, `strategicAi.ts` line 1052)

1. `coordinatorEnabled === false` → return empty (Easy: now true)
2. No faction or homeCity → skip
3. No active army (all in recovery/sacrifice) → skip
4. Designate garrison (closest unit to home)
5. **Easy non-adaptive path** → simplified coordinator (all non-garrison → raider toward enemy)
6. Supply ratio < min OR idle near home < min OR active army < min → standby
7. No enemy city findable → standby
8. Hunter pool < hunter floor → standby
9. Assign hunters (single/double/triple axis)

### Current Gate Thresholds

| Gate | Easy | Normal | Hard |
|------|------|--------|------|
| coordinatorEnabled | true | true | true |
| coordinatorMinActiveArmy | 2 | 2 | 4 |
| coordinatorMinIdleNearHome | 1 | 1 | 2 |
| coordinatorMinSupplyRatio | 0.8 | 0.8 | 0.9 |
| coordinatorHunterFloor | 1 | 2 | 3 |
| coordinatorHunterShare | 0.5 | 0.5 | 0.80 |
| advantageHunterShare | 0.5 | 0.65 | 0.95 |

### With 2 Starting Units

- Easy: 1 garrison + 1 hunter → simplified path sends raider toward enemy city or map center
- Normal: 1 garrison + 1 hunter → coordinator activates but only 1 hunter (floor is 2), so standby until turn ~3-4 when a 3rd unit is produced
- Hard: Needs 4 active army → standby until turn ~5-6

### Wait-for-Allies Gate (`applyWaitForAlliesGate`, line 2185)

Only affects units with `objectiveUnitId` or `objectiveCityId` and aggressive assignments (`main_army`, `raider`, `siege_force`).

A unit is released if:
- `squadReady` (committedAllies >= squadSize AND squadSupport >= squadSize) AND `canCommit` (attackAdvantage >= commitAdvantage), OR
- `trivialTarget` (enemyPressure === 0 OR targetHpRatio <= 0.35 OR targetRouted), OR
- Exceptional doctrine opportunity

Otherwise demoted to `reserve` at nearest regroup anchor.

Effective squadSize: Easy = 2, Normal = 2, Hard = 3.

---

## Exploration System

### Directed Exploration (`findDirectedExplorationWaypoint`, `strategicAi.ts`)

For each unexplored hex, scores: `distanceFromUnit + centerBias * distanceFromCenter`

- `centerBias` decays per round: `effectiveBias = max(0, centerBias - round * decay)`
- Center hex = `(width/2, height/2)`
- At round 0, centerBias is at full strength; decays to 0 over ~20 rounds

| | Easy | Normal | Hard |
|--|------|--------|------|
| centerBias | 0.6 | 0.8 | 0.5 |
| decay | 0.03 | 0.04 | 0.03 |
| Bias reaches 0 | ~turn 20 | ~turn 20 | ~turn 17 |

### Fallback Intent (`buildFallbackIntent`, `unitActivationSystem.ts` line 1004)

- During `exploration` or `offensive` posture: `raider` assignment, waypoint = map center
- Otherwise: `reserve` assignment, waypoint = nearest friendly city

### Exploration Posture Deadline

The round after which `exploration` posture gets -Infinity score, forcing transition:

| Easy | Normal | Hard |
|------|--------|------|
| 30 | 12 | 10 |

---

## Fog of War and Knowledge

| | Easy | Normal | Hard |
|--|------|--------|------|
| strategicFogCheat | false | false | true |
| memoryDecayTurns | 10 | 10 | Infinity |
| Unit vision radius | 3 (mounted: 4) | 3 (mounted: 4) | N/A (sees all) |
| City vision radius | 3 | 3 | N/A |
| Village vision radius | 2 | 2 | N/A |

When `strategicFogCheat: true`, the AI:
- Sees all enemy units regardless of visibility (`getLivingEnemyUnits` returns all)
- Can target any enemy city as primary objective (`choosePrimaryCityObjective` omniscient path)
- Detects fronts from all enemy positions, not just visible ones

When `strategicFogCheat: false`, the AI:
- Only sees enemies within vision range
- Relies on `getLastSeenEnemyCities` for remembered city positions
- Memory entries older than `memoryDecayTurns` are ignored

---

## Map Facts

- Default medium map: 50x38 hexes (~1900 tiles)
- Faction start separation: ~12 hexes (minimum 6, maximum 14)
- Each faction starts with 2 combat units + 1 city
- Target army size formula: `max(4, cities * 3 + floor(villages / 2))`
- With 1 city, 0 villages: target = 4 units

---

## Features Locked Behind Difficulty

| Feature | Easy | Normal | Hard |
|---------|------|--------|------|
| Adaptive AI personality overrides | No | Yes | Yes |
| Rush production phase | No (0 turns) | Yes (10 turns) | Yes (7 turns) |
| Counter-composition scoring | No | Yes | Yes (stronger) |
| Aggressive fill production | No | Yes | Yes (stronger) |
| Signature exploit targeting | No | No | Yes |
| Codified ability pivot scoring | No | No | Yes |
| Emergent rule bonuses | No | No | Yes |
| Learn-by-kill loop | No | Yes | Yes (domain targeting) |
| Multi-axis attacks | No | No | Yes (3 groups) |
| Economic denial | No | No | Yes |
| Settler interception | No | No | Yes |
| Losing denial mode | No | No | Yes |
| Strategic fog cheat | No | No | Yes |
| Posture commitment lock | 0 turns | 1 turn | 3 turns |

---

## Recent Changes (2026-04-12: AI Aggression Improvements)

Problem: AI never proactively sought the player in early game. Five compounding systems created passivity.

### What changed

1. **Directed exploration** — New `findDirectedExplorationWaypoint` biases exploration toward map center instead of nearest unexplored hex. Center bias decays over ~20 rounds.

2. **Reduced no-enemy offensive penalty** — Was hardcoded -2 to offensive/siege when `enemyUnitCount === 0`. Now parameterized as `noEnemySeenOffensivePenalty`: Easy/Normal = -0.5, Hard = 0.

3. **Lowered coordinator thresholds** — All difficulties can now activate coordinator with fewer units:
   - Easy: enabled (was disabled), min army 2, idle 1, floor 1
   - Normal: min army 2 (was 4), idle 1 (was 3), floor 2 (was 3)
   - Hard: min army 4 (was 6), floor 3 (was 4)

4. **Reduced squad size** — Easy/Normal get `squadSizeBonus: -1` (effective squadSize = 2). Hard stays at 3.

5. **Forward fallback intent** — During exploration/offensive posture, `buildFallbackIntent` moves toward map center instead of retreating to friendly city.

6. **Lowered exploration deadline** — Easy: 30 (was 99), Normal: 12 (was 24), Hard: 10 (was 15).

7. **Easy lightweight coordinator** — When `adaptiveAi: false` but `coordinatorEnabled: true`, simplified path sends all non-garrison units toward nearest enemy city as raiders.

### Files modified
- `src/systems/aiDifficulty.ts` — New fields, all parameter changes
- `src/systems/strategicAi.ts` — Directed exploration, posture penalty, Easy coordinator
- `src/systems/unitActivationSystem.ts` — Forward fallback intent

### Open tuning questions
- Does the AI send too many units away and leave cities undefended?
- Is Normal still too passive after turn 8-10?
- Should Easy's simplified coordinator also respect supply ratio?
- Does the exploration center bias need to be per-faction (e.g., factions on the edge should explore inward)?
