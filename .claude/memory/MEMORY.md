# Memory Index

## Combat & AI
- [WarEcology vs GameSession Split](warEcologyGameSessionSplit.md) — player-facing GameSession and AI warEcologySimulation are two separate combat paths; features must be wired into both (except shared applyCombatAction)
- [ZoC Cross-Domain Fix](zoCCrossDomain.md) — naval and land units do not exert ZoC on each other; sameMovementDomain gate added to getZoCBlockers
- [ZoC Civ-Style Model](zoCCivModel.md) — ZoC no longer adds +1 movement cost; always allows entry, consumes all remaining moves (like Civilization); cost-based model blocked melee approach
- [Melee Advance After Kill](meleeAdvanceAfterKill.md) — melee attackers occupy defender hex on kill; ranged/capture excluded; in shared applyCombatAction()
- [Defender City Movement](garrisonLockFix.md) — garrison lock removed from aiTactics.ts; defenders use only threatenedCityDistance proximity bonus
- [Post-Movement Attack Fix](postMoveAttackFix.md) — AI attacks after strategic movement through shouldEngageFromPosition gate; movesRemaining gate removed
- [AI Threat Assessment](aiThreatAssessment.md) — retreat risk considers target's nearby support and city defense; post-move attacks gated by engagement check
- [Ranged AI Free Shot Fix](rangedAiFreeShotFix.md) — +12 bonus in findBestRangedTarget so AI archers attack equal-type enemies; engagement gate was too strict for risk-free ranged attacks

## Difficulty & Balance
- [Difficulty Reshuffle](difficultyReshuffle.md) — Easy=old Hard (done), Normal=rebuilt, Hard=Normal+. Bug fixes for siege bypass + captured city 2x cost. Mastery modifier now unlock-only.
- [Known Start Positions](knownStartPositions.md) — Normal AI finds enemy home cities via knownStartPositions without full fog cheat
- [Combat Lethality Investigation](combatLethalityInvestigation.md) — 5 harness-verified interventions ALL failed; avgLivingUnits doubles every time due to snowball feedback. Per-combat tuning absorbed by production loop. Needs anti-snowball mechanics.
- [Pirate Pistol Mechanic](piratePistolMechanic.md) — Pirates use pistol (+5 atk, range 1, no retaliation) instead of basic_bow; musket is +4 infantry gun
- [Synergy System Dormant](synergySystemDormant.md) — factions avg 1 domain (native only), 0 triples at 150 turns. Only ~7 kills/faction/game — combat too non-lethal for synergy pipeline to work. Core loop broken.
- [Progression Pipeline Fix](progressionPipelineFix.md) — 3-cycle investigation: exposure thresholds [10,20,35], non-destructive sacrifice, researchPerTurn=8, triple gate >=2. 5/6 criteria met (avgDomains 2.38, 91 triple stacks, 124 codifications). decisiveGames still 0.

## Prototype System
- [Prototype Cost Paths](prototypeCostPaths.md) — costs unified via Prototype.productionCost override; content JSON costOverride threads through all paths
- [Prototype SourceRecipeId](prototypeSourceRecipeId.md) — sourceRecipeId is the canonical discriminator: undefined=starting, settler=settler, recipe_id=unlock

## Test Infrastructure
- [Test Failure Patterns](testInfrastructurePatterns.md) — prototype injection for changed starting units, web imports in node vitest, buildMvpScenario size overrides, content data drift
- [Test Speed Feedback](feedbackTestSpeed.md) — npm test must run in <2min; heavy sim tests excluded and opt-in

## Build & Dev
- [Stale JS in web/src](staleJsInWebSrc.md) — compiled .js files shadow .ts sources in Vite; delete them if "Failed to resolve import" appears
- [Vite HMR Cache Trap](viteHmrCacheTrap.md) — editing src/ modules consumed by web/ code may not propagate due to HMR cache; touch import chain or add log to force recompile
- [Map Field Serialization Trap](serializationMapFields.md) — Map-type GameState fields must be in playState.ts serialize/deserialize cycle or they become {} on save load, causing "not iterable" crashes

## Terrain & Map
- [Terrain Wiring Pattern](terrainWiring.md) — adding terrain type requires 7+ files across data/render/generation layers; current terrain table with mountain (impassable, added 2026-04-13) and swamp (aligned to jungle)
- [Fog Visibility Render Gap](fogVisibilityRenderGap.md) — all renderers gate on entity.visible; view model distinguishes friendly (explored+) vs enemy (visible-only); all entity types covered

## Architecture
- [Memory Architecture Decision](memoryArchitecture.md) — session bootstrap hook + /curate command; rejected real-time injection and ECC as overkill
- [GameShell Prop Threading](gameShellPropThreading.md) — 4-place threading for React useState only; ClientState-backed panels bypass it entirely
- [ClientState Extension Pattern](clientStateExtensionPattern.md) — pipeline for new game-state UI panels: type → builder in inspectors/ → GameController.getPlayState() → component reads state.xxx
- [System Decomposition Map](systemDecomposition.md) — 5 monoliths decomposed into sub-directories (combat-action, unit-activation, strategic-ai, simulation, styles); re-export via original monolith file (not index.ts barrels)

## Content & Balance
- [Content-Code Audit](contentCodeAudit.md) — phases 1-3 done (bugs, dead research, 23 dead synergies wired + tested); phase 4 (emergent rules) and 5 (cleanup) remain
- [Unique Starting Units](uniqueStartingUnits.md) — all 9 factions have faction-identity names, costs, and components; no generic "Infantry Frame" names remain. Mid-game hybrid must strictly upgrade over starter.
- [Component Slot System](componentSlotSystem.md) — 4 slot types (weapon/armor/training/utility), one per chassis; use utility for non-conflicting bonuses like movement
- [Skirmish Pursuit Domain](skirmishPursuitDomain.md) — hitrun redesigned from dead retreat to +2 pursuit damage when winning exchange; full T1→T3 progression chain documented

## Frontend Architecture
- [Frontend Data Duplication](frontendDataDuplication.md) — content JSONs copied to web/src/data/; domain names scattered across 5+ UI files; rename requires grep across all web/src/
- [Undo System](undoSystem.md) — single-step undo via snapshot serialization in GameSession; Game menu + Ctrl+Z; dynamic buildGameMenu(canUndo) pattern

## User Preferences
- [User Pragmatism](userPragmatism.md) — prefers practical, project-specific solutions; pushes back on overengineering
