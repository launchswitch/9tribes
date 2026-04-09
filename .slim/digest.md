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
