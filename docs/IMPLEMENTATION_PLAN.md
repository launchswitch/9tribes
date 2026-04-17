# War-Civ V2 Implementation Plan

Last updated: 2026-04-16
Repo root: `C:\Users\fosbo\war-civ-v2`

## Purpose

This document is the durable implementation plan for the current cleanup and refactor effort. It is written so a fresh Codex session can pick up the work without needing prior conversation history.

This is not a speculative roadmap. It is based on a concrete local repo review, current build/test behavior, and the architecture data in `.slim/`.

## Current Snapshot

### What is healthy

- The repo has meaningful architectural indexing in `.slim/`.
- The project already has architecture boundary tests in `tests/architectureBoundaries.test.ts`.
- `npm test` currently passes.
- `npm run test:architecture` currently passes.
- The codebase is already trending toward system extraction rather than growing everything inside one file.

### What is not healthy

- `npm run build` fails immediately because `tsconfig.json` sets `rootDir` to `src` while also including `tests/**/*` and `vitest*.ts`.
- `npm run web:build` fails.
- The replay/combat event contract exists in multiple competing forms.
- The web layer and the engine layer are drifting apart on shared types.
- There is no repo-level `.github/` CI workflow enforcing build plus web build plus tests.
- Checked-in compiled `.js` files exist under `tests/`, which increases drift surface and repository noise.

### Commands checked during analysis

- `npm test`
- `npm run test:architecture`
- `npm run build`
- `npm run web:build`

### Observed command results

- `npm test`: passing
- `npm run test:architecture`: passing
- `npm run build`: failing with `TS6059` due to `rootDir` / `include` mismatch
- `npm run web:build`: failing with multiple TypeScript errors

## Critical Findings

### 1. Build pipeline is not trustworthy

Root build is defined in `package.json` as:

- `build`: `tsc --noEmit`

But root `tsconfig.json` currently contains:

- `rootDir: "src"`
- `include: ["src/**/*", "tests/**/*", "vitest*.ts", "vitest*.d.ts"]`

That is internally inconsistent. Any future refactor should assume the current root build command is broken until Phase 0 is completed.

### 2. Combat and replay contracts are duplicated

There are at least three relevant representations of combat/replay event data:

- Engine replay contract: `src/replay/types.ts`
- Web replay mirror: `web/src/game/types/replay.ts`
- Live session bridge output built manually in `web/src/game/controller/GameSession.ts`

This has already caused breakage:

- `web/src/ui/CombatDetailModal.tsx` expects a rich `breakdown` shape.
- `web/src/game/types/replay.ts` currently defines a reduced `breakdown` shape.
- `web/src/game/controller/GameSession.ts` constructs an even more reduced live combat event.

This seam is currently the most delicate in the codebase.

### 3. Several files are true monoliths

These are the main candidates for decomposition:

- `web/src/styles.css` (~5004 lines)
- `src/systems/strategicAi.ts` (~2542 lines)
- `src/systems/warEcologySimulation.ts` (~1727 lines)
- `src/systems/unitActivationSystem.ts` (~1542 lines)
- `src/systems/combatActionSystem.ts` (~1344 lines)
- `web/src/game/view-model/worldViewModel.ts` (~1285 lines)
- `web/src/game/controller/GameSession.ts` (~1174 lines)

Not all large files need to be split at once. The order matters.

### 4. Web orchestration is carrying too much responsibility

The following files currently combine multiple roles:

- `web/src/game/controller/GameSession.ts`
  - session bootstrap
  - command execution
  - combat preview/apply flow
  - AI turn progression
  - fog refresh
  - save snapshot handling

- `web/src/game/view-model/worldViewModel.ts`
  - play-mode world projection
  - replay-mode world projection
  - HUD composition
  - inspector view-model building
  - sprite selection helpers

- `web/src/app/GameShell.tsx`
  - React/Phaser bridge
  - combat animation handoff
  - audio triggering
  - overlay state coordination
  - global keyboard handling

### 5. There is already CSS duplication

`web/src/styles.css` contains multiple versions of research-window styling blocks. This is already a warning sign that the file is too large to manage safely as one global stylesheet.

## Fragile Areas To Protect

These areas should be treated as high-risk during refactor work.

### Replay and combat event shapes

Do not change these casually:

- `src/replay/types.ts`
- `web/src/game/types/replay.ts`
- `web/src/game/controller/GameSession.ts`
- `web/src/ui/CombatDetailModal.tsx`
- `web/src/ui/CombatLogPanel.tsx`

Any contract adjustment here must be done as a deliberate shared-type migration.

### React/Phaser combat bridge

Be careful with:

- `web/src/app/GameShell.tsx`
- `web/src/game/phaser/scenes/MapScene.ts`
- `web/src/game/controller/GameController.ts`
- `web/src/game/controller/GameSession.ts`

This flow coordinates preview, animation, apply, audio, and cleanup. Ordering bugs here will be subtle.

### AI behavior

Be careful with:

- `src/systems/strategicAi.ts`
- `src/systems/unitActivationSystem.ts`
- `src/systems/aiTactics.ts`
- `src/systems/factionPhaseSystem.ts`

This area is highly test-covered, but regression risk is still real because heuristics interact nonlinearly.

### Simulation core

Be careful with:

- `src/systems/warEcologySimulation.ts`
- `src/systems/combatActionSystem.ts`
- `src/systems/productionSystem.ts`
- `src/systems/economySystem.ts`

Keep the public behavior stable while reshaping internals.

## Execution Rules

These rules should govern the work in every phase.

1. Stabilize build and contracts before doing major structural splits.
2. Prefer extracting modules behind existing public APIs instead of rewriting behavior.
3. Do not perform multiple high-risk refactors in the same commit unless they are tightly coupled.
4. Keep architecture tests passing throughout.
5. Add guardrail tests before or during refactors when a seam is already known to be brittle.
6. After each substantial refactor, refresh `.slim/` data.
7. Do not rely on `npm test` alone as proof of health. Always run build commands too.

## Cartography Refresh Commands

Run these after meaningful code changes:

```bash
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py changes --root ./
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py extract --root ./ --changed-only
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py digest --root ./ --output .slim/digest.md
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py update --root ./
```

## Phase Overview

The work should proceed in this order:

1. Phase 0: Build and CI stabilization
2. Phase 1: Shared contract cleanup
3. Phase 2: Web orchestration decomposition
4. Phase 3: AI strategy decomposition
5. Phase 4: Simulation core decomposition
6. Phase 5: Combat and activation internals cleanup
7. Phase 6: CSS and UI surface cleanup
8. Phase 7: Hardening and guardrails

Phases 2 and 6 can overlap after Phases 0 and 1 are complete.

Phases 3, 4, and 5 should not be done concurrently unless the work is carefully partitioned, because they all affect gameplay orchestration.

## Phase 0: Build and CI Stabilization

### Objective

Make the repo truthfully buildable and enforce that state automatically.

### Why this phase comes first

Right now the repo passes tests while failing its nominal build commands. Refactoring on top of that is unsafe because type drift can hide behind the broken pipeline.

### Tasks

- Fix root TypeScript config separation.
- Introduce distinct configs for:
  - root source typecheck/build
  - tests
  - scripts if needed
- Update `package.json` scripts so each command does one coherent job.
- Ensure `npm run build` works.
- Ensure `npm run web:build` works.
- Ensure `npm test` still works.
- Remove or stop checking in generated `tests/*.js` artifacts.
- Add repo-level CI under `.github/workflows/`.

### Likely file targets

- `package.json`
- `tsconfig.json`
- possibly `tsconfig.build.json`
- possibly `tsconfig.test.json`
- possibly `tsconfig.scripts.json`
- `web/tsconfig.json`
- `.gitignore`
- new `.github/workflows/*.yml`

### Specific known fixes to account for

- Root `rootDir` / `include` mismatch causing `TS6059`
- `web/src/game/phaser/scenes/MapScene.ts` camera API typing issue
- `web/src/ui/CombatDetailModal.tsx` type mismatches
- `src/systems/combatActionSystem.ts` undefined faction access warning

### Verification

Run:

```bash
npm run build
npm run web:build
npm test
npm run test:architecture
```

### Exit criteria

- All four commands pass locally
- CI runs all four commands
- There are no checked-in test output `.js` siblings left in active use

## Phase 1: Shared Contract Cleanup

### Objective

Create one canonical combat/replay event contract and make both engine and web consume it.

### Why this phase comes next

The current type drift is already causing build failures and will make later refactors much riskier.

### Desired end state

- `src/replay/types.ts` is the canonical source for replay bundle and replay combat event shapes.
- The web layer imports those types directly or through a thin re-export, not a hand-maintained mirror.
- Live session combat events and replay combat events use the same structural contract.

### Tasks

- Decide whether the web app should import from `src/replay/types.ts` directly or through a shared barrel file.
- Remove schema duplication in `web/src/game/types/replay.ts`.
- Update `web/src/ui/CombatDetailModal.tsx` to compile against the canonical contract.
- Update `web/src/ui/CombatLogPanel.tsx` to use the same contract.
- Replace the hand-built partial event in `web/src/game/controller/GameSession.ts` with:
  - a canonical builder, or
  - a typed adapter that fills the full replay contract
- Check whether any other web consumers rely on the reduced shape.

### Likely file targets

- `src/replay/types.ts`
- `src/replay/exportReplay.ts`
- `web/src/game/types/replay.ts`
- `web/src/game/controller/GameSession.ts`
- `web/src/ui/CombatDetailModal.tsx`
- `web/src/ui/CombatLogPanel.tsx`
- `web/src/game/view-model/worldViewModel.ts`

### Verification

- `npm run web:build`
- `npm test`
- targeted replay/UI tests if added

### Exit criteria

- One combat event shape exists
- Live and replay combat views compile against the same structural type
- No partial duplicate replay contract remains in web

## Phase 2: Web Orchestration Decomposition

### Objective

Reduce responsibility concentration in the web layer without changing user-visible behavior.

### Subphase 2A: Decompose `GameSession`

#### Target

`web/src/game/controller/GameSession.ts`

#### Suggested extraction seams

- session bootstrap and initial state creation
- combat preview/build/apply queue logic
- AI turn runner
- command handlers for player actions
- save/load snapshot helpers
- fog refresh and session feedback helpers

#### Recommended end state

Keep `GameSession` as the façade class, but move logic into focused helpers or submodules.

### Subphase 2B: Decompose `worldViewModel`

#### Target

`web/src/game/view-model/worldViewModel.ts`

#### Suggested extraction seams

- `buildPlayWorldViewModel`
- `buildReplayWorldViewModel`
- HUD builders
- city inspector builder
- research inspector builder
- sprite/improvement helper utilities

#### Recommended end state

Keep a small top-level entry module that delegates to:

- `playWorldViewModel.ts`
- `replayWorldViewModel.ts`
- `hudViewModel.ts`
- `inspectors/cityInspectorViewModel.ts`
- `inspectors/researchInspectorViewModel.ts`
- `spriteKeys.ts` or equivalent helper file

### Subphase 2C: Thin `GameShell`

#### Target

`web/src/app/GameShell.tsx`

#### Suggested extraction seams

- combat bridge hook
- session delta audio hook
- overlay state coordination hook
- keyboard shortcut handling hook

#### Recommended end state

Leave `GameShell` as composition, not orchestration.

### Verification

- `npm run web:build`
- `npm test`
- existing web controller/session/view-model tests

### Exit criteria

- `GameSession` is materially smaller and focused
- `worldViewModel` is split by responsibility
- `GameShell` mostly composes hooks/components

## Phase 3: AI Strategy Decomposition

### Objective

Break `src/systems/strategicAi.ts` into modules aligned with decision responsibilities, not file size.

### Current responsibilities mixed in one file

- threat assessment
- front detection
- posture determination
- primary target selection
- unit assignment
- difficulty coordination
- learn/sacrifice coordination
- debug reason generation

### Suggested module structure

- `src/systems/strategic-ai/posture.ts`
- `src/systems/strategic-ai/fronts.ts`
- `src/systems/strategic-ai/objectives.ts`
- `src/systems/strategic-ai/assignments.ts`
- `src/systems/strategic-ai/difficultyCoordinator.ts`
- `src/systems/strategic-ai/learnLoopCoordinator.ts`
- `src/systems/strategic-ai/debugReasons.ts`
- `src/systems/strategicAi.ts` as the orchestration entrypoint

### Important constraint

Preserve `computeFactionStrategy` as the public entrypoint during this phase so callers do not need to change at the same time.

### Tasks

- Extract pure/helper logic first
- Extract assignment logic second
- Extract difficulty-specific coordinators third
- Add focused tests where existing tests are too broad to catch module regressions cleanly

### Verification

- `npm test`
- especially:
  - `tests/strategicAi.test.ts`
  - adaptive AI phase tests
  - any debug AI tests

### Exit criteria

- `strategicAi.ts` becomes a top-level coordinator
- behavior remains stable under current AI tests

## Phase 4: Simulation Core Decomposition

### Objective

Reduce the blast radius of changes inside `src/systems/warEcologySimulation.ts`.

### Current responsibilities mixed in one file

- trace schema
- trace recording helpers
- environmental damage
- faction phase processing
- healing and war exhaustion side effects
- summon/aura logic
- victory logic
- simulation entrypoint
- summary helpers

### Suggested extraction order

1. Move trace/event interfaces and record helpers first
2. Move end-of-turn and environmental effects second
3. Move victory/summarization helpers third
4. Keep the top-level round runner in `warEcologySimulation.ts`

### Suggested module structure

- `src/systems/simulation/traceTypes.ts`
- `src/systems/simulation/traceRecorder.ts`
- `src/systems/simulation/environmentalEffects.ts`
- `src/systems/simulation/factionTurnEffects.ts`
- `src/systems/simulation/victory.ts`
- `src/systems/simulation/summarizeFaction.ts`

### Important constraint

Do not simultaneously redesign simulation behavior and refactor file structure. Refactor shape first. Behavior changes, if any, should be isolated.

### Verification

- `npm test`
- especially:
  - `tests/warEcologySimulation.test.ts`
  - `tests/combat.test.ts`
  - `tests/siege.test.ts`
  - `tests/villageDestruction.test.ts`
  - replay-related tests

### Exit criteria

- `warEcologySimulation.ts` remains the simulation entrypoint only
- trace schema no longer lives inside the main turn runner file

## Phase 5: Combat and Activation Internals Cleanup

### Objective

Improve the structure of the combat and activation systems after shared contracts and high-level orchestration are stable.

### Do not start this phase early

These files are large, but they are central. Splitting them too early before contracts are fixed would create unnecessary churn.

### Suggested `combatActionSystem` seams

- preview construction
- combat effect labeling/humanization
- aftermath resolution
- XP/history/capture side effects

### Suggested `unitActivationSystem` seams

- movement evaluation
- field fort / dug-in logic
- transport embark/disembark logic
- combat choice helpers
- AI activation helper vs generic activation helper

### Likely file targets

- `src/systems/combatActionSystem.ts`
- `src/systems/unitActivationSystem.ts`

### Verification

- `npm test`
- architecture tests
- targeted combat and parity tests

### Exit criteria

- public APIs remain stable
- internal modules are separated by responsibility

## Phase 6: CSS and UI Surface Cleanup

### Objective

Reduce stylesheet sprawl and feature-style duplication.

### Current issue

`web/src/styles.css` is a 5000+ line global stylesheet with repeated feature blocks and multiple generations of styling coexisting.

### Tasks

- Split styles by feature:
  - layout shell
  - research
  - inspectors
  - combat
  - overlays
  - menus
- Remove duplicate research-window definitions
- Keep the existing visual language unless intentionally redesigning
- Prefer colocated feature CSS or a clear segmented structure over one global dump

### Likely file targets

- `web/src/styles.css`
- new style partials or feature CSS files
- components that import those styles if needed

### Verification

- `npm run web:build`
- visual smoke pass in browser

### Exit criteria

- no duplicated style blocks for the same feature
- no single global CSS file acting as the only stylesheet dump

## Phase 7: Hardening and Regression Guardrails — COMPLETED (2026-04-17)

### Objective

Make future drift difficult.

### Tasks

- [x] Add tests or assertions for canonical replay/combat event shape
- [x] Expand architecture boundary tests to cover shared contract usage where practical
- [x] Add tests around the React/Phaser combat bridge if the harness permits
- [x] Ensure CI covers root build, web build, test suite, architecture tests (CI already existed from Phase 0)

### Guardrails implemented

- `tests/architectureBoundaries.test.ts` expanded from 3 to 7 tests:
  - Web replay types must re-export from canonical `src/replay/types.ts` only (no local interface definitions)
  - `combatSession.ts` must construct all required `ReplayCombatEvent` fields
  - `GameSession.applyResolvedCombat` must patch post-apply fields (`attackerHpAfter`, `defenderHpAfter`, nested `hpAfter`, `triggeredEffects`)
  - `CombatDetailModal` and `CombatLogPanel` must import from canonical re-export path
- `tests/combatEventContract.test.ts` created (6 tests):
  - Simulation trace combat events: all fields present with correct types (top-level, breakdown, modifiers, morale, outcome, triggeredEffects)
  - Exported replay combat events match trace events structurally
  - `buildPendingCombat` produces a valid `ReplayCombatEvent` when called with real preview data
  - Trace–replay type parity: `TraceCombatEvent` ↔ `ReplayCombatEvent`, `TraceCombatBreakdown` ↔ `ReplayCombatBreakdown`, `TraceCombatModifiers` ↔ `ReplayCombatModifiers` must have identical field names

### Additional fix

- Fixed unclosed CSS comment in `web/src/styles/synergy.css` (line 653) that was blocking web build

### Exit criteria

- [x] Future contract drift would fail fast in CI

## Recommended Work Breakdown

### First implementation slice

Do these together:

- Phase 0 build stabilization
- Phase 1 shared combat/replay contract cleanup

Reason: these are prerequisites for everything else.

### Second implementation slice

Do these after the repo builds cleanly:

- GameSession decomposition
- worldViewModel decomposition
- GameShell thinning

### Third implementation slice

Do these after web-side seams are stable:

- strategic AI decomposition
- simulation core decomposition

### Fourth implementation slice

Do these after orchestration layers are healthy:

- combat/activation internal split
- stylesheet cleanup
- hardening

## Suggested Validation Matrix

Run this matrix after each phase:

```bash
npm run build
npm run web:build
npm test
npm run test:architecture
```

For gameplay-heavy phases, also pay attention to:

- AI tests
- combat tests
- replay tests
- web session/controller/view-model tests

For UI-heavy phases, also perform a manual smoke pass in the browser.

## Anti-Patterns To Avoid

- Do not combine contract redesign and behavioral redesign in the same step.
- Do not split files purely by arbitrary line count.
- Do not leave duplicate type definitions in place "temporarily" without a removal ticket in the same phase.
- Do not rely on passing tests if `npm run build` or `npm run web:build` is still broken.
- Do not rewrite AI heuristics while trying to only refactor file structure.
- Do not push CSS cleanup ahead of build and contract stabilization.

## Session Startup Checklist For Future Codex Runs

At the start of a fresh session:

1. Read this file first.
2. Check `.slim/digest.md`, `.slim/imports.json`, and `.slim/symbols.json` before opening large source files.
3. Re-run the baseline command set:
   - `npm run build`
   - `npm run web:build`
   - `npm test`
   - `npm run test:architecture`
4. Confirm which phase is currently active.
5. Do not skip unfinished prerequisite phases.

## Definition of Success

This effort is successful when all of the following are true:

- The repo has one healthy build path for root and web.
- Shared replay/combat contracts are canonical and non-duplicated.
- Web orchestration files are meaningfully smaller and cleaner.
- AI and simulation monoliths are decomposed without behavior regressions.
- CSS is organized by feature instead of living in one global dump.
- CI prevents the repo from sliding back into a test-pass/build-fail state.

