## Digest — 2026-04-03T13:55:30.382080Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-03T20:26:33.011821Z

### Modified Files
- `src/systems/researchSystem.ts` — +4 exports (getCapabilityResearchBonus, getEffectiveResearchXpCost, getKnowledgeResearchBonus, getResearchProgressPerTurn)

### Dependency Changes
- `src/systems/researchSystem.ts` — 4 dependencies

---

## Digest — 2026-04-04T17:30:10.427388Z

### Modified Files
- `src/core/enums.ts` — ~1 signatures (MovementClass)
- `src/data/registry/types.ts` — +1 exports (SummonConfig)
- `src/features/factions/types.ts` — +1 exports (SummonState); -1 exports (PolarBearState)
- `src/systems/balanceHarness.ts` — +1 exports (UnitComposition)
- `src/systems/factionIdentitySystem.ts` — +2 exports (DesertSwarmConfig, getDesertSwarmBonus)
- `src/systems/researchSystem.ts` — +4 exports (getCapabilityResearchBonus, getEffectiveResearchXpCost, getKnowledgeResearchBonus, getResearchProgressPerTurn)
- `src/systems/siegeSystem.ts` — ~1 signatures (degradeWalls)
- `src/systems/villageSystem.ts` — ~2 signatures (canSpawnVillage, getVillageSpawnReadiness)
- `src/systems/zocSystem.ts` — ~1 signatures (getZoCBlockersWithAura)
- `src/world/generation/generateMvpMap.ts` — ~1 signatures (generateMvpMap)

### Dependency Changes
- `src/features/factions/types.ts` — 2 dependencies
- `src/systems/balanceHarness.ts` — 7 dependencies
- `src/systems/factionIdentitySystem.ts` — 6 dependencies
- `src/systems/researchSystem.ts` — 2 dependencies
- `src/systems/siegeSystem.ts` — 7 dependencies
- `src/systems/villageSystem.ts` — 11 dependencies
- `src/systems/zocSystem.ts` — 6 dependencies
- `src/world/generation/generateMvpMap.ts` — 4 dependencies

---

## Digest — 2026-04-05T04:23:56.235004Z

### New Files
- `src/systems/captureSystem.ts` — 7 exports: hasCaptureAbility, getCaptureParams, getCaptureCooldownRemaining, isOnCaptureCooldownWithCooldown, isOnCaptureCooldown, ... (+2 more)
- `src/systems/transportSystem.ts` — 15 exports: TransportState, TransportMap, isTransportUnit, getTransportCapacity, getEmbarkedCount, ... (+10 more)
- `src/systems/villageCaptureSystem.ts` — 7 exports: VillageCaptureRecord, VillageCaptureCooldownMap, hasGreedyTrait, isOnVillageCooldown, canCaptureVillage, ... (+2 more)

### Dependency Changes
- `src/systems/captureSystem.ts` imports: src/game/types.ts (GameState), src/features/units/types.ts (Unit, HistoryEntry), src/data/registry/types.ts (RulesRegistry, SignatureAbilityParams), src/core/enums.ts (VeteranLevel), src/types.ts (UnitId)
- `src/systems/transportSystem.ts` imports: src/game/types.ts (GameState), src/types.ts (UnitId, HexCoord), src/data/registry/types.ts (RulesRegistry), src/core/grid.ts (getNeighbors, hexToKey, hexDistance)
- `src/systems/villageCaptureSystem.ts` imports: src/game/types.ts (GameState), src/features/villages/types.ts (Village), src/types.ts (FactionId, VillageId, HexCoord), src/data/registry/types.ts (RulesRegistry), src/systems/villageSystem.ts (destroyVillage)

---

## Digest — 2026-04-05T21:28:18.451663Z

### New Files
- `src/systems/fogSystem.ts` — 14 exports: HexVisibility, LastSeenSnapshot, FactionFogState, calculateVisibility, getLastSeenEnemyUnits, ... (+9 more)
- `src/systems/healingSystem.ts` — 1 exports: applyHealingForFaction

### Modified Files
- `src/systems/factionStrategy.ts` — ~1 signatures (FactionPosture)
- `src/systems/warEcologySimulation.ts` — +2 exports (TraceAbilityLearnedEvent, TraceUnitSacrificedEvent)
- `web/src/game/controller/GameSession.ts` — +1 exports (PendingCombat)
- `web/src/game/view-model/worldViewModel.ts` — ~1 signatures (buildHudViewModel)

### Dependency Changes
- `src/systems/fogSystem.ts` imports: src/game/types.ts (GameState), src/types.ts (FactionId, HexCoord), src/world/map/types.ts (TerrainType), src/core/hex.ts (getHexesInRange, hexToKey, keyToHex), src/features/units/types.ts (Unit)
- `src/systems/healingSystem.ts` imports: src/game/types.ts (GameState), src/types.ts (UnitId, FactionId), src/features/units/types.ts (Unit), src/data/registry/types.ts (RulesRegistry), src/core/grid.ts (hexDistance, hexToKey, getNeighbors)
- `src/systems/factionStrategy.ts` — 2 dependencies
- `src/systems/warEcologySimulation.ts` — 82 dependencies
- `web/src/game/controller/GameSession.ts` — 40 dependencies
- `web/src/game/view-model/worldViewModel.ts` — 16 dependencies

---

## Digest — 2026-04-06T03:00:17.279924Z

### New Files
- `src/systems/learnByKillSystem.ts` — 2 exports: LearnFromKillResult, tryLearnFromKill
- `src/systems/sacrificeSystem.ts` — 2 exports: canSacrifice, performSacrifice
- `web/src/game/phaser/systems/CombatAnimator.ts` — 2 exports: CombatAnimData, CombatAnimator

### Modified Files
- `src/features/units/types.ts` — +1 exports (LearnedAbility)

### Dependency Changes
- `src/systems/learnByKillSystem.ts` imports: src/game/types.ts (GameState), src/features/units/types.ts (Unit, LearnedAbility), src/systems/warEcologySimulation.ts (SimulationTrace), src/core/rng.ts (RNGState, rngNextFloat)
- `src/systems/sacrificeSystem.ts` imports: src/game/types.ts (GameState, Faction, FactionId), src/features/units/types.ts (Unit), src/data/registry/types.ts (RulesRegistry), src/systems/warEcologySimulation.ts (SimulationTrace), src/types.ts (UnitId, ResearchNodeId)
- `web/src/game/phaser/systems/CombatAnimator.ts` imports: web/src/game/types/worldView.ts (UnitView), web/src/game/phaser/assets/keys.ts (getUnitTextureSpec)
- `src/features/units/types.ts` — 3 dependencies

---

## Digest — 2026-04-06T03:00:17.279924Z

### New Files
- `src/systems/learnByKillSystem.ts` — 2 exports: LearnFromKillResult, tryLearnFromKill
- `src/systems/sacrificeSystem.ts` — 2 exports: canSacrifice, performSacrifice
- `web/src/game/phaser/systems/CombatAnimator.ts` — 2 exports: CombatAnimData, CombatAnimator

### Modified Files
- `src/features/units/types.ts` — +1 exports (LearnedAbility)

### Dependency Changes
- `src/systems/learnByKillSystem.ts` imports: src/game/types.ts (GameState), src/features/units/types.ts (Unit, LearnedAbility), src/systems/warEcologySimulation.ts (SimulationTrace), src/core/rng.ts (RNGState, rngNextFloat)
- `src/systems/sacrificeSystem.ts` imports: src/game/types.ts (GameState, Faction, FactionId), src/features/units/types.ts (Unit), src/data/registry/types.ts (RulesRegistry), src/systems/warEcologySimulation.ts (SimulationTrace), src/types.ts (UnitId, ResearchNodeId)
- `web/src/game/phaser/systems/CombatAnimator.ts` imports: web/src/game/types/worldView.ts (UnitView), web/src/game/phaser/assets/keys.ts (getUnitTextureSpec)
- `src/features/units/types.ts` — 3 dependencies

---

## Digest — 2026-04-06T18:01:14.207996Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-06T18:01:14.207996Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-06T21:54:12.263568Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-06T22:05:15.947741Z

### New Files
- `src/systems/aiTactics.ts` — 11 exports: StrategicTargetScoreInput, AttackCandidateScoreInput, MoveCandidateScoreInput, RetreatRiskInput, EngageTargetGateInput, ... (+6 more)

### Dependency Changes
- `src/systems/aiTactics.ts` imports: src/systems/factionStrategy.ts (UnitAssignment), src/systems/aiPersonality.ts (AiPersonalitySnapshot, shouldCommitAttack, shouldRetreat)

---

## Digest — 2026-04-06T22:05:15.947741Z

### New Files
- `src/systems/aiTactics.ts` — 11 exports: StrategicTargetScoreInput, AttackCandidateScoreInput, MoveCandidateScoreInput, RetreatRiskInput, EngageTargetGateInput, ... (+6 more)

### Dependency Changes
- `src/systems/aiTactics.ts` imports: src/systems/factionStrategy.ts (UnitAssignment), src/systems/aiPersonality.ts (AiPersonalitySnapshot, shouldCommitAttack, shouldRetreat)

---

## Digest — 2026-04-06T23:16:10.355963Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-08T16:01:21.562812Z

### New Files
- `src/systems/aiDifficulty.ts` — 2 exports: DifficultyLevel, usesNormalAiBehavior
- `web/src/app/savegames.ts` — 7 exports: SaveGameRecord, SaveGameSummary, listSaveGames, getSaveGame, findSaveGameByLabel, ... (+2 more)
- `web/src/game/phaser/assets/freelandSpec.ts` — 4 exports: FreecivGridTile, parseFreecivGridMainTiles, buildTagFrameLookup, parseFreecivTagFrameLookup
- `web/src/game/phaser/systems/TerrainCompositor.ts` — 2 exports: ComposedLayer, TerrainCompositor
- `web/src/game/phaser/systems/TerrainGeometry.ts` — 3 exports: RectCorner, RECT_CELLS, RECT_CORNER_NEIGHBORS

### Modified Files
- `src/features/cities/types.ts` — +3 exports (CitySiteBonuses, CitySiteTrait, CitySiteTraitKey)
- `src/systems/aiPersonality.ts` — ~1 signatures (computeAiPersonalitySnapshot)
- `src/systems/aiProductionStrategy.ts` — ~2 signatures (chooseStrategicProduction, rankProductionPriorities)
- `src/systems/aiResearchStrategy.ts` — ~2 signatures (chooseStrategicResearch, rankResearchPriorities)
- `src/systems/economySystem.ts` — +2 exports (advanceCaptureTimers, getCaptureRampMultiplier)
- `src/systems/productionSystem.ts` — +2 exports (cancelCurrentProduction, removeFromQueue)
- `src/systems/siegeSystem.ts` — +1 exports (hasDefendingGarrison)
- `src/systems/strategicAi.ts` — ~1 signatures (computeFactionStrategy)
- `src/systems/warEcologySimulation.ts` — ~1 signatures (runWarEcologySimulation)
- `web/src/game/controller/GameSession.ts` — +1 exports (SessionSaveSnapshot)
- `web/src/game/phaser/assets/keys.ts` — +7 exports (FREELAND_SPECS, FogRenderState, SettlementRenderKind, getFogRenderState, getFogTag); -1 exports (CITY_FRAMES)
- `web/src/game/types/clientState.ts` — +3 exports (SettlementBonusSummaryViewModel, SettlementPreviewViewModel, SettlementSiteTraitViewModel)

### Dependency Changes
- `web/src/app/savegames.ts` imports: web/src/game/controller/GameSession.ts (SessionSaveSnapshot), web/src/game/types/playState.ts (SerializedGameState)
- `web/src/game/phaser/systems/TerrainCompositor.ts` imports: web/src/game/phaser/assets/keys.ts (TILE_HEIGHT, TILE_WIDTH), web/src/game/phaser/systems/TerrainGeometry.ts (type, RECT_CELLS, RECT_CORNER_NEIGHBORS)
- `src/features/cities/types.ts` — 3 dependencies
- `src/systems/aiPersonality.ts` — 12 dependencies
- `src/systems/aiProductionStrategy.ts` — 30 dependencies
- `src/systems/aiResearchStrategy.ts` — 16 dependencies
- `src/systems/economySystem.ts` — 23 dependencies
- `src/systems/productionSystem.ts` — 47 dependencies
- `src/systems/siegeSystem.ts` — 17 dependencies
- `src/systems/strategicAi.ts` — 58 dependencies
- `src/systems/warEcologySimulation.ts` — 183 dependencies
- `web/src/game/controller/GameSession.ts` — 138 dependencies
- `web/src/game/phaser/assets/keys.ts` — 1 dependencies
- `web/src/game/types/clientState.ts` — 2 dependencies

---

## Digest — 2026-04-08T16:17:00.503471Z

### New Files
- `src/systems/citySiteSystem.ts` — 11 exports: CITY_SITE_PRODUCTION_BONUS, CITY_SITE_SUPPLY_BONUS, CITY_SITE_VILLAGE_COOLDOWN_REDUCTION, SettlementOccupancyBlocker, EMPTY_CITY_SITE_BONUSES, ... (+6 more)

### Modified Files
- `src/systems/villageSystem.ts` — +1 exports (findVillageSpawnHexForCity); -1 exports (findVillageSpawnHex); ~5 signatures (canSpawnVillage, evaluateAndSpawnVillage, getVillageSpawnReadiness, getVillageSpawnReadinessWithRegistry, spawnVillage)

### Dependency Changes
- `src/systems/citySiteSystem.ts` imports: src/core/grid.ts (getHexesInRange, hexToKey), src/features/cities/types.ts (CitySiteBonuses, CitySiteTrait), src/game/types.ts (City, GameState), src/types.ts (FactionId, HexCoord), src/world/map/types.ts (GameMap, TerrainType)
- `src/systems/villageSystem.ts` — 36 dependencies

---

## Digest — 2026-04-08T20:37:43.978734Z

### New Files
- `web/src/app/audio/musicManager.ts` — 2 exports: syncMusicForMode, playMenuUiSound

### Dependency Changes

---

## Digest — 2026-04-09T01:38:07.947831Z

### New Files
- `web/src/app/audio/sfxManager.ts` — 3 exports: playCombatSoundForPendingCombat, getDestroyedPlayerVillages, playSessionDeltaSounds

### Dependency Changes
- `web/src/app/audio/sfxManager.ts` imports: web/src/game/types/clientState.ts (ClientState), web/src/game/controller/GameSession.ts (PendingCombat), web/src/game/types/worldView.ts (UnitView)

---

## Digest — 2026-04-09T04:19:29.023833Z

### New Files
- `web/src/data/help-content.ts` — 5 exports: HelpSection, TribeProfile, SynergyGuideEntry, HelpContent, helpContent

### Modified Files
- `src/features/cities/types.ts` — +1 exports (ProductionCostType)
- `src/systems/aiDifficulty.ts` — +3 exports (AiDifficultyProfile, getAiDifficultyProfile, usesAdaptiveAiBehavior)
- `src/systems/balanceHarness.ts` — +6 exports (DifficultyComparisonSummary, FactionDifficultyComparison, FactionDifficultyComparisonMetrics, FactionProductionStallMarker, runPairedDifficultyBalanceHarness); ~3 signatures (collectSeedBalanceMetrics, runBalanceHarness, runStratifiedBalanceHarness)
- `src/systems/productionSystem.ts` — +8 exports (SETTLER_VILLAGE_COST, canCompleteCurrentProduction, canPaySettlerVillageCost, getNearestFactionVillageIds, getPrototypeCostType); ~1 signatures (queueUnit)

### Dependency Changes
- `src/features/cities/types.ts` — 1 dependencies
- `src/systems/balanceHarness.ts` — 11 dependencies
- `src/systems/productionSystem.ts` — 20 dependencies

---

## Digest — 2026-04-09T06:33:16.349385Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-09T12:18:32.695727Z

### New Files
- `src/systems/combatActionSystem.ts` — 9 exports: CombatActionEffectCategory, CombatActionEffect, CombatActionPreview, CombatActionPreviewOverrides, CombatActionFeedback, ... (+4 more)
- `src/systems/factionPhaseSystem.ts` — 2 exports: FactionPhaseOptions, runFactionPhase
- `web/src/game/phaser/systems/combatAnimationScript.ts` — 6 exports: CombatAnimationOutcome, CombatBeatActor, CombatBeatKind, CombatAnimationBeat, CombatAnimationScript, ... (+1 more)

### Modified Files
- `src/systems/warEcologySimulation.ts` — +5 exports (UnitActivationCombatMode, UnitActivationOptions, UnitActivationResult, activateUnit, processFactionPhases)
- `web/src/game/phaser/systems/CombatAnimator.ts` — ~1 signatures (CombatAnimData)

### Dependency Changes
- `src/systems/combatActionSystem.ts` imports: src/core/grid.ts (hexDistance, hexToKey), src/data/registry/types.ts (RulesRegistry), src/features/units/types.ts (Unit), src/game/types.ts (GameState, UnitId), src/systems/factionIdentitySystem.ts (getCombatAttackModifier, getCombatDefenseModifier)
- `src/systems/factionPhaseSystem.ts` imports: src/game/types.ts (GameState, FactionId), src/data/registry/types.ts (RulesRegistry), src/systems/aiDifficulty.ts (DifficultyLevel), src/systems/warEcologySimulation.ts (SimulationTrace, processFactionPhases)
- `web/src/game/phaser/systems/combatAnimationScript.ts` imports: web/src/game/types/worldView.ts (UnitView)
- `src/systems/warEcologySimulation.ts` — 104 dependencies
- `web/src/game/phaser/systems/CombatAnimator.ts` — 3 dependencies

---

## Digest — 2026-04-09T13:13:25.063796Z

### New Files
- `src/systems/unitActivationSystem.ts` — 6 exports: UnitActivationCombatMode, UnitActivationOptions, UnitActivationResult, maybeExpirePreparedAbility, activateUnit, ... (+1 more)

### Modified Files
- `src/systems/warEcologySimulation.ts` — +6 exports (calculateSynergyAttackBonus, calculateSynergyDefenseBonus, getSynergyEngine, log, recordAiIntent); -1 exports (activateUnit)

### Dependency Changes
- `src/systems/unitActivationSystem.ts` imports: src/core/ids.ts (createImprovementId), src/core/grid.ts (getDirectionIndex, getHexesInRange, getNeighbors), src/data/registry/types.ts (RulesRegistry), src/data/roleEffectiveness.ts (getRoleEffectiveness), src/data/weaponEffectiveness.ts (getWeaponEffectiveness)
- `src/systems/warEcologySimulation.ts` — 142 dependencies

---

## Digest — 2026-04-09T14:11:27.482818Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-11T21:58:06.782269Z

### New Files
- `src/systems/synergyRuntime.ts` — 3 exports: getSynergyEngine, calculateSynergyAttackBonus, calculateSynergyDefenseBonus

### Modified Files
- `src/systems/combatActionSystem.ts` — +2 exports (CombatActionPreviewDetails, CombatActionResolution); -2 exports (CombatActionPreviewOverrides, createCombatActionPreview)

### Dependency Changes
- `src/systems/synergyRuntime.ts` imports: src/systems/synergyEffects.ts (SynergyCombatResult), src/content/base/pair-synergies.json (pairSynergiesData), src/content/base/ability-domains.json (abilityDomainsData), src/content/base/emergent-rules.json (emergentRulesData)
- `src/systems/combatActionSystem.ts` — 60 dependencies

---

## Digest — 2026-04-14T03:00:41.321965Z

### Modified Files
- `src/systems/knowledgeSystem.ts` — +1 exports (isUnlockPrototype); ~1 signatures (calculatePrototypeCost)
- `src/systems/zocSystem.ts` — ~2 signatures (getZoCBlockers, getZoCBlockersWithAura)

### Dependency Changes
- `src/systems/knowledgeSystem.ts` — 6 dependencies
- `src/systems/zocSystem.ts` — 12 dependencies

---

## Digest — 2026-04-15T11:34:31.660549Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-16T22:34:17.334318Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-16T22:43:22.575045Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-04-17T11:00:34.910214Z

### Modified Files
- `web/src/game/controller/GameSession.ts` — -1 exports (PendingCombat)
- `web/src/game/types/replay.ts` — -9 exports (ReplayAiIntentEvent, ReplayBundle, ReplayCombatEvent, ReplayFactionStrategyEvent, ReplayFactionSummary); ~6 signatures (ReplayCity, ReplayFactionState, ReplayHex, ReplaySnapshot, ReplayUnit)
- `web/src/game/view-model/worldViewModel.ts` — ~1 signatures (buildResearchInspectorViewModel)

### Dependency Changes
- `web/src/game/controller/GameSession.ts` — 85 dependencies
- `web/src/game/view-model/worldViewModel.ts` — 42 dependencies

---

## Digest — 2026-04-17T17:31:58.378313Z

### New Files
- `src/systems/simulation/environmentalEffects.ts` — 5 exports: HEALING_CONFIG, getHealRate, getTerrainAt, occupiesFriendlySettlement, applyEnvironmentalDamage
- `src/systems/simulation/factionTurnEffects.ts` — 1 exports: processFactionPhases
- `src/systems/simulation/summarizeFaction.ts` — 1 exports: summarizeFaction
- `src/systems/simulation/traceRecorder.ts` — 8 exports: createSimulationTrace, recordSnapshot, log, recordCombatEvent, recordSiegeEvent, ... (+3 more)
- `src/systems/simulation/traceTypes.ts` — 17 exports: TurnSnapshot, TraceLogEvent, TraceCombatEvent, TraceCombatBreakdown, TraceCombatUnitBreakdown, ... (+12 more)
- `src/systems/simulation/victory.ts` — 2 exports: getVictoryStatus, getAliveFactions
- `src/systems/strategic-ai/assignments.ts` — 1 exports: assignUnitIntents
- `src/systems/strategic-ai/debugReasons.ts` — 2 exports: summarizePrimaryObjective, buildDebugReasons
- `src/systems/strategic-ai/difficultyCoordinator.ts` — 1 exports: applyDifficultyCoordinator
- `src/systems/strategic-ai/fronts.ts` — 4 exports: getLivingUnitsForFaction, getLivingEnemyUnits, assessThreatenedCities, detectFronts
- `src/systems/strategic-ai/helpers.ts` — 12 exports: compareUnitEntries, compareUnits, compareHexes, nearestHex, dedupeHexes, ... (+7 more)
- `src/systems/strategic-ai/learnLoopCoordinator.ts` — 1 exports: applyDifficultyLearnAndSacrificeCoordinator
- `src/systems/strategic-ai/objectives.ts` — 17 exports: choosePrimaryEnemyFaction, choosePrimaryCityObjective, choosePrimaryFrontAnchor, chooseFocusTargets, buildRegroupAnchors, ... (+12 more)
- `src/systems/strategic-ai/posture.ts` — 1 exports: determinePosture
- `src/systems/strategic-ai/types.ts` — 13 exports: FRONT_RADIUS, THREAT_RADIUS, REGROUP_DISTANCE, RECOVERY_HP_RATIO, UnitWithPrototype, ... (+8 more)
- `web/src/app/hooks/useCombatBridge.ts` — 1 exports: useCombatBridge
- `web/src/app/hooks/useEscapeHandler.ts` — 1 exports: useEscapeHandler
- `web/src/app/hooks/useSessionAudio.ts` — 1 exports: useSessionAudio
- `web/src/game/controller/combatSession.ts` — 2 exports: PendingCombat, buildPendingCombat
- `web/src/game/controller/moveQueueSession.ts` — 3 exports: clearMoveQueueOnUnit, clearQueueAndReturn, executeQueuedMovesForUnit
- `web/src/game/controller/movementExplorer.ts` — 1 exports: buildReachableMoves
- `web/src/game/controller/sessionUtils.ts` — 10 exports: refreshFogForAllFactions, updateSiegeState, getImprovementAtHex, isFortificationHex, getFortBuildEligibility, ... (+5 more)
- `web/src/game/view-model/inspectors/cityInspectorViewModel.ts` — 3 exports: buildCityInspectorViewModel, buildSettlementBonusSummary, buildSettlementPreview
- `web/src/game/view-model/inspectors/researchInspectorViewModel.ts` — 1 exports: buildResearchInspectorViewModel
- `web/src/game/view-model/spriteKeys.ts` — 3 exports: getSpriteKeyForImprovement, getSpriteKeyForUnit, inferChassisId

### Modified Files
- `src/systems/strategicAi.ts` — ~4 signatures (getNearbySupportScore, getNearestFriendlyCity, isThreatenedCityHex, scoreStrategicTerrain)
- `src/systems/warEcologySimulation.ts` — -30 exports (SimulationTrace, TraceAbilityLearnedEvent, TraceAiIntentEvent, TraceCombatBreakdown, TraceCombatEffect); ~1 signatures (runWarEcologySimulation)

### Dependency Changes
- `src/systems/simulation/environmentalEffects.ts` imports: src/game/types.ts (GameState, Unit), src/types.ts (FactionId, HexCoord, UnitId), src/core/grid.ts (hexToKey, hexDistance, getNeighbors), src/systems/capabilityDoctrine.ts (resolveResearchDoctrine), src/systems/factionIdentitySystem.ts (getHealingBonus)
- `src/systems/simulation/factionTurnEffects.ts` imports: src/game/types.ts (GameState, Unit), src/data/registry/types.ts (RulesRegistry), src/types.ts (FactionId, HexCoord, UnitId), src/features/prototypes/types.ts (Prototype), src/core/enums.ts (VeteranLevel, UnitStatus)
- `src/systems/simulation/summarizeFaction.ts` imports: src/game/types.ts (GameState), src/types.ts (FactionId), src/systems/historySystem.ts (getBattleCount, getKillCount), src/systems/capabilitySystem.ts (describeCapabilityLevels), src/systems/factionOwnershipSystem.ts (getFactionCityIds)
- `src/systems/simulation/traceRecorder.ts` imports: src/game/types.ts (GameState), src/types.ts (FactionId), src/core/grid.ts (hexToKey)
- `src/systems/simulation/traceTypes.ts` imports: src/types.ts (FactionId, HexCoord, UnitId), src/systems/factionStrategy.ts (FactionStrategy)
- `src/systems/simulation/victory.ts` imports: src/game/types.ts (GameState), src/types.ts (FactionId), src/systems/simulation/traceTypes.ts (VictoryType, VictoryStatus)
- `src/systems/strategic-ai/assignments.ts` imports: src/game/types.ts (GameState), src/types.ts (FactionId, HexCoord, UnitId), src/systems/factionStrategy.ts (FactionPosture, FactionStrategy, UnitStrategicIntent), src/systems/aiPersonality.ts (AiPersonalitySnapshot, shouldCommitAttack), src/systems/aiDifficulty.ts (AiDifficultyProfile)
- `src/systems/strategic-ai/debugReasons.ts` imports: src/systems/factionStrategy.ts (FactionPosture, ThreatAssessment, FrontLine), src/types.ts (CityId, FactionId), src/core/grid.ts (hexToKey)
- `src/systems/strategic-ai/difficultyCoordinator.ts` imports: src/game/types.ts (GameState), src/types.ts (FactionId, HexCoord, UnitId), src/systems/factionStrategy.ts (FactionPosture, FactionStrategy, UnitStrategicIntent), src/systems/aiDifficulty.ts (AiDifficultyProfile), src/systems/strategic-ai/types.ts (UnitWithPrototype, PressureObjective)
- `src/systems/strategic-ai/fronts.ts` imports: src/game/types.ts (GameState), src/types.ts (FactionId), src/systems/factionStrategy.ts (ThreatAssessment, FrontLine), src/systems/strategic-ai/types.ts (UnitWithPrototype, THREAT_RADIUS), src/core/grid.ts (hexDistance, hexToKey)
- `src/systems/strategic-ai/helpers.ts` imports: src/game/types.ts (City, Prototype, Unit), src/types.ts (CityId, FactionId, HexCoord), src/systems/factionStrategy.ts (UnitStrategicIntent), src/core/grid.ts (hexDistance, hexToKey), src/systems/strategic-ai/types.ts (UnitWithPrototype)
- `src/systems/strategic-ai/learnLoopCoordinator.ts` imports: src/game/types.ts (GameState, City), src/types.ts (FactionId, HexCoord, UnitId), src/systems/factionStrategy.ts (UnitStrategicIntent), src/systems/aiDifficulty.ts (AiDifficultyProfile), src/systems/strategic-ai/types.ts (UnitWithPrototype)
- `src/systems/strategic-ai/objectives.ts` imports: src/game/types.ts (GameState, City, Village), src/types.ts (CityId, FactionId, HexCoord), src/systems/strategic-ai/types.ts (FocusTargetDecision, FocusTargetCandidate, FocusTargetBudget), src/systems/factionStrategy.ts (FrontLine, ThreatAssessment, FactionPosture), src/systems/aiPersonality.ts (AiPersonalitySnapshot, scoreFocusTarget)
- `src/systems/strategic-ai/posture.ts` imports: src/types.ts (FactionId), src/systems/factionStrategy.ts (FactionPosture, FactionStrategy, ThreatAssessment), src/systems/strategic-ai/types.ts (PostureDecision), src/systems/aiPersonality.ts (AiPersonalitySnapshot, scorePosture), src/systems/aiDifficulty.ts (AiDifficultyProfile)
- `src/systems/strategic-ai/types.ts` imports: src/game/types.ts (City, Prototype, Unit), src/types.ts (CityId, FactionId, HexCoord), src/systems/factionStrategy.ts (FactionPosture, UnitAssignment, WaypointKind)
- `web/src/app/hooks/useCombatBridge.ts` imports: web/src/game/controller/GameController.ts (GameController), web/src/game/controller/combatSession.ts (PendingCombat), web/src/game/types/worldView.ts (UnitView), web/src/app/audio/sfxManager.ts (playCombatSoundForPendingCombat)
- `web/src/app/hooks/useSessionAudio.ts` imports: web/src/game/types/clientState.ts (ClientState), web/src/app/audio/sfxManager.ts (getDestroyedPlayerVillages, playSessionDeltaSounds)
- `web/src/game/controller/combatSession.ts` imports: src/game/types.ts (GameState, UnitId), src/data/registry/types.ts (RulesRegistry), src/systems/combatSystem.ts (CombatResult), src/systems/combatActionSystem.ts (CombatActionPreview), web/src/game/types/replay.ts (ReplayCombatEvent)
- `web/src/game/controller/moveQueueSession.ts` imports: src/game/types.ts (GameState, UnitId), src/types.ts (HexCoord), src/systems/pathfinder.ts (findPath), src/systems/movementSystem.ts (moveUnit, canMoveTo), src/data/registry/types.ts (RulesRegistry)
- `web/src/game/controller/movementExplorer.ts` imports: src/game/types.ts (GameState, UnitId), src/data/registry/types.ts (RulesRegistry), src/systems/movementSystem.ts (getValidMoves, moveUnit, previewMove), web/src/game/types/worldView.ts (ReachableHexView)
- `web/src/game/controller/sessionUtils.ts` imports: src/game/types.ts (GameState, Unit, UnitId), src/types.ts (HexCoord), src/core/ids.ts (createImprovementId), src/systems/capabilityDoctrine.ts (resolveCapabilityDoctrine), src/systems/fogSystem.ts (updateFogState)
- `web/src/game/view-model/inspectors/cityInspectorViewModel.ts` imports: src/game/types.ts (GameState), src/data/registry/types.ts (RulesRegistry), src/features/cities/types.ts (CitySiteBonuses, CitySiteTrait), src/systems/economySystem.ts (deriveResourceIncome, getCaptureRampMultiplier, getSupplyDeficit), src/systems/villageSystem.ts (getVillageSpawnReadinessWithRegistry)
- `web/src/game/view-model/inspectors/researchInspectorViewModel.ts` imports: src/game/types.ts (GameState), src/data/registry/types.ts (RulesRegistry, ResearchNodeDef), src/systems/domainProgression.ts (getDomainProgression)
- `src/systems/strategicAi.ts` — 28 dependencies
- `src/systems/warEcologySimulation.ts` — 47 dependencies

---

## Digest — 2026-04-18T08:04:36.198455Z

### New Files
- `src/systems/combat-action/apply.ts` — 1 exports: applyCombatAction
- `src/systems/combat-action/factionAbsorption.ts` — 1 exports: maybeAbsorbFaction
- `src/systems/combat-action/helpers.ts` — 9 exports: WATER_TERRAIN, getImprovementBonus, removeDeadUnitsFromFactions, canAttackTarget, rotateUnitToward, ... (+4 more)
- `src/systems/combat-action/labeling.ts` — 3 exports: formatPercent, humanizeCombatEffect, pushCombatEffect
- `src/systems/combat-action/preview.ts` — 1 exports: previewCombatAction
- `src/systems/combat-action/types.ts` — 7 exports: CombatActionEffectCategory, CombatActionEffect, CombatActionPreview, CombatActionPreviewDetails, CombatActionFeedback, ... (+2 more)
- `src/systems/unit-activation/activateUnit.ts` — 3 exports: maybeExpirePreparedAbility, activateUnit, activateAiUnit
- `src/systems/unit-activation/fieldFort.ts` — 6 exports: FIELD_FORT_ATTACK_MARGIN, FIELD_FORT_DECISION_SCORE, shouldBrace, getFieldFortOpportunity, buildFieldFortIfEligible, ... (+1 more)
- `src/systems/unit-activation/helpers.ts` — 16 exports: getTerrainAt, describeCombatOutcome, formatCombatSummary, rotateUnitToward, getImprovementAtHex, ... (+11 more)
- `src/systems/unit-activation/movement.ts` — 4 exports: buildFallbackIntent, resolveWaypoint, wouldBeUnsafeAfterMove, performStrategicMovement
- `src/systems/unit-activation/targeting.ts` — 2 exports: findBestTargetChoice, findBestRangedTarget
- `src/systems/unit-activation/transport.ts` — 2 exports: moveTransportAndDisembark, autoDisembark
- `src/systems/unit-activation/types.ts` — 3 exports: UnitActivationCombatMode, UnitActivationOptions, UnitActivationResult

### Removed Files
- `src/systems/combatActionSystem.ts` — 9 exports lost: CombatActionEffectCategory, CombatActionEffect, CombatActionPreview, CombatActionPreviewDetails, CombatActionFeedback, ... (+4 more)
- `src/systems/unitActivationSystem.ts` — 6 exports lost: UnitActivationCombatMode, UnitActivationOptions, UnitActivationResult, maybeExpirePreparedAbility, activateUnit, ... (+1 more)

### Dependency Changes
- `src/systems/combat-action/apply.ts` imports: src/core/grid.ts (getNeighbors, hexDistance, hexToKey), src/data/registry/types.ts (RulesRegistry), src/features/units/types.ts (Unit), src/game/types.ts (GameState), src/types.ts (FactionId)
- `src/systems/combat-action/factionAbsorption.ts` imports: src/game/types.ts (GameState), src/types.ts (FactionId), src/data/registry/types.ts (RulesRegistry), src/systems/capabilitySystem.ts (applyContactTransfer), src/systems/historySystem.ts (updateCombatRecordOnElimination)
- `src/systems/combat-action/helpers.ts` imports: src/core/grid.ts (getDirectionIndex, hexDistance, hexToKey), src/game/types.ts (GameState, UnitId), src/features/units/types.ts (Unit), src/types.ts (HexCoord), src/data/registry/types.ts (RulesRegistry)
- `src/systems/combat-action/labeling.ts` imports: src/systems/combat-action/types.ts (CombatActionEffect, CombatActionEffectCategory)
- `src/systems/combat-action/preview.ts` imports: src/core/grid.ts (getNeighbors, hexDistance, hexToKey), src/data/registry/types.ts (RulesRegistry), src/features/units/types.ts (Unit), src/game/types.ts (GameState, UnitId), src/systems/capabilityDoctrine.ts (resolveCapabilityDoctrine)
- `src/systems/combat-action/types.ts` imports: src/types.ts (HexCoord), src/systems/combatSystem.ts (CombatResult), src/game/types.ts (UnitId)
- `src/systems/unit-activation/activateUnit.ts` imports: src/core/grid.ts (hexDistance), src/data/registry/types.ts (RulesRegistry), src/game/types.ts (GameState, Unit), src/types.ts (HexCoord, UnitId), src/systems/combatActionSystem.ts (applyCombatAction, previewCombatAction)
- `src/systems/unit-activation/fieldFort.ts` imports: src/core/ids.ts (createImprovementId), src/core/grid.ts (hexDistance, hexToKey), src/game/types.ts (GameState, UnitId), src/types.ts (FactionId), src/data/registry/types.ts (RulesRegistry)
- `src/systems/unit-activation/helpers.ts` imports: src/core/grid.ts (getDirectionIndex, hexDistance, hexToKey), src/game/types.ts (GameState, Unit), src/types.ts (FactionId, HexCoord, UnitId), src/systems/abilitySystem.ts (getAbilityTerrainAt, hasAdjacentEnemy), src/systems/combat-action/helpers.ts (getImprovementBonus)
- `src/systems/unit-activation/movement.ts` imports: src/core/grid.ts (hexDistance), src/data/registry/types.ts (RulesRegistry), src/game/types.ts (GameState, Unit), src/types.ts (HexCoord, UnitId), src/systems/abilitySystem.ts (getAbilityTerrainAt)
- `src/systems/unit-activation/targeting.ts` imports: src/core/grid.ts (getHexesInRange, getNeighbors, hexDistance), src/data/registry/types.ts (RulesRegistry), src/data/roleEffectiveness.ts (getRoleEffectiveness), src/data/weaponEffectiveness.ts (getWeaponEffectiveness), src/game/types.ts (GameState)
- `src/systems/unit-activation/transport.ts` imports: src/core/grid.ts (hexDistance, hexToKey), src/data/registry/types.ts (RulesRegistry), src/game/types.ts (GameState), src/types.ts (HexCoord, UnitId), src/systems/movementSystem.ts (moveUnit, getValidMoves)
- `src/systems/unit-activation/types.ts` imports: src/game/types.ts (GameState), src/systems/combat-action/types.ts (CombatActionPreview), src/types.ts (FactionId), src/systems/warEcologySimulation.ts (SimulationTrace, TraceAiIntentEvent, TraceCombatEffect)

---

## Digest — 2026-04-18T14:46:02.835238Z

### New Files
- `src/systems/strategic-ai/rendezvous.ts` — 10 exports: RENDEZVOUS_OFFSET_HEXES, RENDEZVOUS_READY_DISTANCE, HOLD_DEFENSE_RADIUS, SquadPhase, SquadRole, ... (+5 more)
- `web/src/app/hooks/useTutorial.ts` — 3 exports: TutorialStep, TutorialState, useTutorial
- `web/src/ui/TutorialOverlay.tsx` — 1 exports: TutorialOverlay
- `web/src/ui/VictoryOverlay.tsx` — 2 exports: computeScore, VictoryOverlay

### Removed Files
- `web/src/game/types/replay.ts` — 6 exports lost: ReplayHex, ReplaySnapshot, ReplayFactionState, ReplayUnit, ReplayCity, ... (+1 more)

### Modified Files
- `src/data/registry/types.ts` — -1 exports (CapabilityDomainDef)
- `src/systems/balanceHarness.ts` — +5 exports (FactionBaseMetrics, VALIDATION_HARNESS_SEEDS, ValidationSummary, ValidationTargetCheck, runValidationComparison); ~1 signatures (FactionSeedMetrics)
- `src/systems/captureSystem.ts` — ~1 signatures (attemptCapture)
- `src/systems/factionStrategy.ts` — +1 exports (LastStandState); ~1 signatures (FactionPosture)
- `src/systems/synergyEffects.ts` — -3 exports (MovementContext, MovementResult, applyMovementSynergies)
- `src/world/map/types.ts` — -1 exports (TerrainDef)
- `web/src/game/types/clientState.ts` — ~1 signatures (ClientMode)
- `web/src/game/view-model/worldViewModel.ts` — -1 exports (getIntentSummary); ~3 signatures (buildDebugViewModel, buildHudViewModel, buildWorldViewModel)
- `web/src/ui/SynergyChip.tsx` — +1 exports (domainBenefit)

### Dependency Changes
- `src/systems/strategic-ai/rendezvous.ts` imports: src/types.ts (CityId, FactionId, HexCoord), src/game/types.ts (GameState), src/systems/factionStrategy.ts (FactionStrategy, UnitStrategicIntent), src/core/grid.ts (getHexesInRange, hexDistance, hexToKey), src/systems/strategic-ai/helpers.ts (isAggressiveAssignment)
- `web/src/app/hooks/useTutorial.ts` imports: web/src/game/types/clientState.ts (ClientState)
- `web/src/ui/TutorialOverlay.tsx` imports: web/src/app/hooks/useTutorial.ts (TutorialStep)
- `web/src/ui/VictoryOverlay.tsx` imports: src/systems/aiDifficulty.ts (DifficultyLevel), src/systems/warEcologySimulation.ts (VictoryType)
- `src/systems/balanceHarness.ts` — 17 dependencies
- `src/systems/captureSystem.ts` — 11 dependencies
- `src/systems/factionStrategy.ts` — 3 dependencies
- `src/systems/synergyEffects.ts` — 1 dependencies
- `src/world/map/types.ts` — 2 dependencies
- `web/src/game/types/clientState.ts` — 4 dependencies
- `web/src/game/view-model/worldViewModel.ts` — 60 dependencies
- `web/src/ui/SynergyChip.tsx` — 6 dependencies

---

## Digest — 2026-04-19T00:52:53.365085Z

### New Files
- `docs/RENDEZVOUS-SPEC.md` — 8 exports: UnitStrategicIntent, SquadPhase, SquadState, FactionStrategy, RENDEZVOUS_OFFSET_HEXES, ... (+3 more)

### Modified Files
- `src/systems/combat-action/helpers.ts` — +1 exports (pruneDeadUnits)
- `src/systems/fogSystem.ts` — +2 exports (isUnitCloakedByRiverStealthAura, isUnitEffectivelyStealthed)

### Dependency Changes
- `src/systems/combat-action/helpers.ts` — 16 dependencies
- `src/systems/fogSystem.ts` — 14 dependencies

---

## Digest — 2026-04-19T14:36:10.948545Z

### Modified Files
- `src/systems/villageSystem.ts` — +2 exports (countVillagesInCityTerritory, destroyVillagesInCityTerritory)

### Dependency Changes
- `src/systems/villageSystem.ts` — 17 dependencies

---

## Digest — 2026-04-20T05:00:12.352010Z

### New Files
- `POISON_DAMAGE_INVESTIGATION.md` — 1 exports: applyPoisonDoT
- `web/src/ui/TechDiscoveryModal.tsx` — 3 exports: useTechDiscoveryModal, useTechDiscoveryDetector, TechDiscoveryModalProvider

### Dependency Changes
- `web/src/ui/TechDiscoveryModal.tsx` imports: web/src/data/research.json (researchData)

---

## Digest — 2026-04-20T11:00:26.436751Z

### New Files
- `web/src/app/hooks/useUndoHandler.ts` — 1 exports: useUndoHandler
- `web/src/game/view-model/inspectors/terrainInspectorViewModel.ts` — 1 exports: buildTerrainInspectorViewModel
- `web/src/ui/TerrainPanel.tsx` — 1 exports: TerrainPanel

### Modified Files
- `src/systems/citySiteSystem.ts` — +1 exports (findBestCitySiteForFaction)
- `src/systems/sacrificeSystem.ts` — +1 exports (codifyDomainsForFaction)
- `src/systems/strategic-ai/objectives.ts` — ~3 signatures (chooseAdaptivePressureCity, choosePrimaryCityObjective, choosePrimaryEnemyFaction)
- `src/systems/villageSystem.ts` — ~1 signatures (spawnVillage)
- `web/src/game/types/clientState.ts` — +2 exports (TerrainDomainPressureEntry, TerrainInspectorViewModel)

### Dependency Changes
- `web/src/app/hooks/useUndoHandler.ts` imports: web/src/game/controller/GameController.ts (GameController)
- `web/src/game/view-model/inspectors/terrainInspectorViewModel.ts` imports: src/content/base/civilizations.json (civilizationsData), src/game/types.ts (GameState), src/data/registry/types.ts (RulesRegistry), src/systems/citySiteSystem.ts (evaluateCitySiteBonuses), src/systems/territorySystem.ts (getHexOwner)
- `web/src/ui/TerrainPanel.tsx` imports: web/src/game/types/clientState.ts (TerrainInspectorViewModel)
- `src/systems/citySiteSystem.ts` — 12 dependencies
- `src/systems/sacrificeSystem.ts` — 23 dependencies
- `src/systems/strategic-ai/objectives.ts` — 18 dependencies
- `src/systems/villageSystem.ts` — 24 dependencies
- `web/src/game/types/clientState.ts` — 6 dependencies

---

## Digest — 2026-04-21T11:00:12.230144Z

### New Files
- `docs/POISON_DAMAGE_INVESTIGATION.md` — 1 exports: applyPoisonDoT

### Dependency Changes

---

## Digest — 2026-04-27T12:52:47.265479Z

### Modified Files
- `src/systems/combat-action/apply.ts` — ~1 signatures (applyCombatAction)
- `src/systems/learnByKillSystem.ts` — ~1 signatures (tryLearnFromKill)
- `src/systems/researchSystem.ts` — ~1 signatures (createResearchState)

### Dependency Changes
- `src/systems/combat-action/apply.ts` — 95 dependencies
- `src/systems/learnByKillSystem.ts` — 15 dependencies
- `src/systems/researchSystem.ts` — 9 dependencies

---

## Digest — 2026-04-28T11:00:13.027171Z

### Modified Files
- `src/features/cities/types.ts` — ~1 signatures (CitySiteTraitKey)
- `src/systems/citySiteSystem.ts` — +1 exports (CITY_SITE_RESEARCH_BONUS)

### Dependency Changes
- `src/features/cities/types.ts` — 2 dependencies
- `src/systems/citySiteSystem.ts` — 16 dependencies

---

## Digest — 2026-05-01T19:57:51.060463Z

### Dependency Changes

No significant changes detected.

---

## Digest — 2026-05-01T20:06:09.653404Z

### New Files
- `web/src/data/faction-info.ts` — 2 exports: FactionInfo, getFactionInfo

### Modified Files
- `src/systems/productionSystem.ts` — +2 exports (canSpawnAt, reorderQueue)
- `src/systems/simulation/traceTypes.ts` — ~1 signatures (VictoryType)
- `src/systems/simulation/victory.ts` — +1 exports (isFactionEliminated)

### Dependency Changes
- `src/systems/productionSystem.ts` — 50 dependencies
- `src/systems/simulation/traceTypes.ts` — 5 dependencies
- `src/systems/simulation/victory.ts` — 9 dependencies
