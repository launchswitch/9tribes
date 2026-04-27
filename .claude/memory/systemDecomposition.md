---
name: System Decomposition Map
description: Major system monoliths decomposed into sub-directories (Phases 2-6 of implementation plan). Barrel re-exports preserve backward-compatible import paths.
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## System Decomposition (2026-04-16 through 2026-04-17)

Five monoliths were decomposed into focused sub-modules. The implementation plan is at `docs/IMPLEMENTATION_PLAN.md`.

**UPDATE 2026-04-18:** Only 4 `src/systems/` sub-directories confirmed: `combat-action/`, `simulation/`, `strategic-ai/`, `unit-activation/`. The CSS decomposition (`web/src/styles/`) is the 5th but is not in `src/systems/`. No barrel re-export `index.ts` files were found in any subdirectory — the "barrel" column in the table above refers to the original monolith file re-exporting from sub-modules, not `index.ts` files.

### Decomposed Files

| Original | Sub-directory | Barrel? | What moved |
|----------|-------------|---------|------------|
| `src/systems/combatActionSystem.ts` | `src/systems/combat-action/` | Pure barrel | apply.ts, factionAbsorption.ts, helpers.ts, labeling.ts, preview.ts, types.ts |
| `src/systems/unitActivationSystem.ts` | `src/systems/unit-activation/` | Pure barrel | activateUnit.ts, fieldFort.ts, helpers.ts, movement.ts, targeting.ts, transport.ts, types.ts |
| `src/systems/strategicAi.ts` | `src/systems/strategic-ai/` | Partial (orchestrator) | types.ts, helpers.ts, fronts.ts, posture.ts, objectives.ts, assignments.ts, difficultyCoordinator.ts, learnLoopCoordinator.ts, debugReasons.ts, rendezvous.ts |
| `src/systems/warEcologySimulation.ts` | `src/systems/simulation/` | Partial (orchestrator) | traceTypes.ts, traceRecorder.ts, environmentalEffects.ts, factionTurnEffects.ts, victory.ts, summarizeFaction.ts |
| `web/src/styles.css` | `web/src/styles/` | CSS @import barrel | 11 feature CSS files (base, combat, command-tray, game-shell, help, inspector, layout, menu, overlays, research, synergy) |

### Partial Web Decompositions (Phase 2)

| Original | Extracted modules |
|----------|------------------|
| `web/src/game/controller/GameSession.ts` | combatSession.ts (PendingCombat, buildPendingCombat), moveQueueSession.ts, movementExplorer.ts, sessionUtils.ts |
| `web/src/game/view-model/worldViewModel.ts` | inspectors/cityInspectorViewModel.ts, inspectors/researchInspectorViewModel.ts, spriteKeys.ts |
| `web/src/app/GameShell.tsx` | hooks/useCombatBridge.ts, hooks/useEscapeHandler.ts, hooks/useSessionAudio.ts |

**Why:** Phase-by-phase decomposition following the implementation plan. Each monolith was too large to reason about; decomposition separates by responsibility while preserving public APIs.

**How to apply:** When referencing functions that lived in these monoliths, prefer the specific sub-module path (e.g., `combat-action/apply.ts`) over the barrel re-export. The barrels exist for backward compatibility but the sub-modules are the canonical locations. When adding new combat or activation logic, add it to the appropriate sub-module, not to the barrel.
