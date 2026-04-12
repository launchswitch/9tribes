# Codex Rehydration Memory - war-civ-v2

> Generated 2026-04-12.
> Purpose: if Codex is reset, feed this file back in to recover the practical repo knowledge that matters for working effectively in `war-civ-v2`.
> Scope: combines stable repo conventions, architectural map, accumulated implementation lessons, AI tuning context, and current in-flight work visible in the working tree.

## 1. What This Project Is

War-Civ V2 is a turn-based strategy simulation centered on war as the driver of civilization evolution. It is intentionally not a traditional economy-first 4X. The design rule is: if a system does not materially affect war, it should be cut or simplified.

Core design pillars:

- Combat drives progression.
- Military identity emerges from terrain, combat outcomes, doctrines, and faction rules.
- Technology is learned from environment and combat, not a linear tech tree.
- Units are persistent entities with history.
- Production is prototype-based rather than tier-ladder unit upgrades.

## 2. Read These First In A Fresh Session

If rehydrating on a fresh install, the fastest useful sequence is:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/codex-rehydration-memory.md` (this file)
4. `docs/difficulty-reference.md`
5. `.slim/digest.md`
6. `git status --short`

Important repo-specific navigation rule from `AGENTS.md`:

- Use `.slim/symbols.json`, `.slim/imports.json`, and `.slim/digest.md` before reading source.
- Only move to source files after narrowing the target from structured metadata.

The repo may not always have `codemap.md` files. In practice, the `.slim/` data is the primary structured navigation source here.

## 3. Top-Level Architecture

This repo has two main execution surfaces:

- `src/`: the TypeScript simulation/game engine.
- `web/`: the frontend app built with React + Phaser + Vite.

High-level structure:

- `src/core/`: primitives like hex/grid math, enums, IDs, RNG.
- `src/content/base/`: JSON content defining chassis, components, civs, terrains, research, synergies, abilities, and related game data.
- `src/data/`: registry loaders and tables.
- `src/features/`: domain entities and feature-specific types.
- `src/systems/`: gameplay and AI rule systems.
- `src/game/`: `GameState`, scenarios, and loop-level types.
- `src/world/`: world generation and terrain.
- `src/balance/`: balance harness and evaluation.
- `src/replay/`: replay support.
- `web/src/app/`: app shell, routing, audio, page composition.
- `web/src/game/controller/`: live play controller layer.
- `web/src/game/view-model/`: state shaping for the UI.
- `web/src/game/phaser/`: rendering scenes, sprite systems, fog, combat animation.
- `web/src/ui/`: React HUD/panels/modals.

## 4. Central Architectural Truths

### 4.1 Dual Combat Paths

This is the single most important implementation trap in the repo.

There are two distinct combat resolution paths:

- `src/systems/warEcologySimulation.ts`: the autonomous simulation/AI path.
- `web/src/game/controller/GameSession.ts`: the player-facing live-play path.

The simulation path is the main orchestrator that runs a full faction/unit activation pipeline. The live path often splits combat into stages, including pure resolution and later mutation after animation timing.

Practical rule:

- Any combat mechanic added to one path usually must also be added to the other.

If the AI uses a feature correctly but player combat does not, the missing logic is often in `GameSession` rather than the backend system layer.

Examples of features that must be mirrored carefully:

- siege gating
- retreat / hit-and-run behavior
- learn-by-kill
- sacrifice feedback
- capture behavior
- combat-triggered audiovisual feedback

### 4.2 Feedback Chain For UI/SFX

Gameplay feedback should flow through a narrow pipe rather than ad hoc frontend hacks:

`GameSession.ts` -> `GameController.ts` -> `web/src/game/types/clientState.ts` -> `web/src/app/audio/sfxManager.ts`

If the UI does not expose enough information for a sound or frontend feedback effect, add a small feedback field in the controller layer instead of sprinkling direct browser audio calls around the app.

### 4.3 Deterministic Simulation Matters

The engine is deliberately deterministic. Tests and balance harness work rely on seeded execution and reproducibility. When changing combat, movement, AI, or world rules, assume that nondeterministic behavior is a regression unless explicitly intended.

### 4.4 Some State Is Intentionally Outside `GameState`

Known example from `CLAUDE.md`:

- fog state and transport state are treated externally rather than as canonical `GameState` fields in some flows.

Do not casually merge those concerns into `GameState` without checking call sites and tests.

### 4.5 History Arrays Are Important State

A lot of gameplay state is encoded as history events on units/factions rather than dedicated scalar counters. Before inventing a new top-level field, check whether the surrounding system expects to infer state from history entries.

## 5. Hot Files And Why They Matter

These are the files that repeatedly matter during changes:

- `src/systems/warEcologySimulation.ts`
  - The main orchestration hotspot. Changes here have wide blast radius.
- `web/src/game/controller/GameSession.ts`
  - The live-play controller and the usual mirror point for backend combat mechanics.
- `src/systems/strategicAi.ts`
  - High-level AI pipeline: posture, focus targets, assignments, coordinator behavior.
- `src/systems/aiDifficulty.ts`
  - Difficulty profile source of truth.
- `src/systems/aiProductionStrategy.ts`
  - Production pressure and army composition behavior.
- `src/systems/aiTactics.ts`
  - Tactical scoring and engagement heuristics.
- `web/src/app/audio/sfxManager.ts`
  - Centralized gameplay SFX routing.
- `web/src/app/GameShell.tsx`
  - Important bridge point for combat-timed UI/audio behavior.

## 6. AI Difficulty Architecture

Difficulty is layered, not monolithic:

1. `src/systems/aiDifficulty.ts`
   - Pure profile data per difficulty.
2. `src/systems/aiPersonality.ts`
   - Blends faction baseline personality, difficulty floors/offsets, and live state.
3. `src/systems/strategicAi.ts`
   - Actual decision pipeline using the above inputs.

Useful mental model for the turn pipeline:

`computeFactionStrategy()`
-> personality snapshot
-> enemy visibility / memory
-> front detection
-> posture choice
-> city objective choice
-> focus target choice
-> unit intent assignment
-> coordinator override
-> ally waiting / aggression gates

Important implication:

- `aiDifficulty.ts` should stay parameteric.
- New behavioral logic usually belongs in `strategicAi.ts`, `aiTactics.ts`, or personality computation, not in the difficulty data file itself.

## 7. Difficulty Rebuild Context

Recent major design direction:

- Easy is effectively the more passive/older behavior envelope.
- Normal was rebuilt to be significantly more aggressive and combat-forward.
- Hard is intended to be Normal-plus rather than fake difficulty via minor weight changes.

The motivating problem was that Hard previously felt fake: paired harness runs showed little meaningful difference from Normal over early turns.

Specific remembered goals from the current tuning effort:

- reduce passive openings
- push army utilization higher
- make the AI commit to conflict earlier
- make Hard focus more sharply and pressure one target harder
- avoid spending too much of the early game on settlers or soft economic drift

Useful companion file:

- `docs/difficulty-reference.md`

That file is the detailed AI tuning reference and should be treated as the current difficulty-focused source of truth.

## 8. Known Gameplay / Architecture Pitfalls

### 8.1 City Capture Bypass Bug

A historically important bug:

- faction elimination could transfer cities without going through proper siege/capture mechanics when the last defender died.

Lesson:

- city possession changes must respect siege/walls/capture rules, not just faction death cleanup.
- garrisoned units inside defended walled cities should not be targetable in ways that bypass wall attrition logic.

When working on combat targeting or faction absorption logic, explicitly verify city-wall behavior.

### 8.2 Captured City Production Cost Trap

A historical AI bug came from using a production cost path that included mastery/cultural-shock multipliers when the AI needed the raw queue cost for auto-production comparisons.

Lesson:

- distinguish between "what something should score as" and "what it literally costs in queue terms."
- AI scoring logic and actual production accounting are not interchangeable.

### 8.3 Frontend Feature Drift

The backend and live controller can diverge because new features land in simulation code first. This is especially likely around:

- combat side effects
- per-turn feedback fields
- replay/live parity
- audio triggers

Whenever a backend mechanic changes, check whether any of these also need updates:

- `GameSession`
- `GameController`
- `clientState`
- `worldViewModel`
- Phaser animation code
- SFX manager

## 9. Sound Effect Rules

Sound effects are centralized in:

- `web/src/app/audio/sfxManager.ts`

Required flow for new SFX:

1. Put the browser-loadable asset in `web/public/assets/audio/sfx/`.
2. Register path and playback mapping in `sfxManager.ts`.
3. For combat-initiation sounds, trigger from `web/src/app/GameShell.tsx` using the pending attacker.
4. For non-combat gameplay sounds, prefer state-delta detection inside `sfxManager.ts`.
5. If required data is missing, extend the controller feedback chain rather than scattering `new Audio(...)`.

Current gameplay audio pattern:

- combat sounds are selected from the attacking unit during the battle animation window
- non-combat sounds are inferred from state changes like movement, founding, capture, sacrifice, learned domains, research completion, and victory/defeat

## 10. Testing And Validation Habits

Primary commands:

- `npm test`
- `npx vitest run tests/<file>.test.ts`
- `npm run balance:harness`
- `npm run balance:harness:stratified`
- `npm run balance:evaluate`
- `npm run balance:validate`

Expected testing style:

- deterministic
- seeded
- regression-focused when tuning AI or systemic rules

When changing AI difficulty or strategic behavior:

- paired harness comparisons matter more than anecdotes
- early-turn metrics can reveal "fake difficulty"
- long-horizon runs can reveal whether aggression produces actual captures or just noise

When changing combat:

- check both backend sim behavior and live-session parity
- prioritize combat, siege, replay, and web-controller tests

## 11. Repo Navigation Workflow That Works

When entering a new task:

1. inspect `.slim/digest.md` for recent architecture changes
2. inspect `.slim/symbols.json` for exports in target files
3. inspect `.slim/imports.json` for blast radius and callers
4. only then read source

Refresh commands after major code changes:

```bash
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py changes --root ./
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py extract --root ./ --changed-only
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py digest --root ./ --output .slim/digest.md
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py update --root ./
```

## 12. Frontend / Asset Notes

The frontend stack is React 18 + Phaser 3 + Vite.

Useful remembered conventions:

- gameplay rendering and HUD state are split across Phaser render systems and React UI
- sprite naming convention is `{faction}_{unit}.png`
- gameplay unit sprites live under `web/public/assets/playtest-units/`
- combat animation timing and pending combat state are important bridge concepts between backend logic and visible feedback

Frontend work often touches several layers at once:

- controller
- client state types
- world view model
- Phaser scene/system code
- React UI

Avoid solving a frontend issue in only one layer if the bug is actually a contract mismatch between them.

## 13. Current In-Flight State On 2026-04-12

The working tree is dirty. Do not assume a clean checkout.

Visible active areas include:

- AI difficulty
- AI production
- AI tactics
- faction strategy
- combat action system
- siege system
- knowledge / learn-by-kill / sacrifice
- war ecology simulation
- many associated tests
- web controller and audio files

There are also many untracked generated `.js` siblings under `tests/` and `web/src/`, plus additional config files. Treat them as existing working-tree context, not as permission to clean aggressively.

Practical rule:

- never revert broad working-tree changes without explicit user approval
- assume some local files are user work, generated artifacts, or in-progress tuning support

## 14. User / Collaboration Preferences

Working assumptions from prior repo usage:

- the user prefers terse, direct collaboration
- they care about diffs and behavior more than long narrative summaries
- they use tests and harness data to tune AI rather than relying only on subjective feel
- they are actively iterating on balance and gameplay identity, especially AI pressure and combat clarity

Good default behavior:

- inspect before changing
- make the change end-to-end instead of stopping at analysis
- preserve uncommitted work
- verify with focused tests when feasible

## 15. Stable Mental Checklist Before Editing

Before changing anything substantial, ask:

1. Is this in sim only, live only, or both?
2. Does the controller -> client-state -> UI/audio pipeline also need an update?
3. Is there a deterministic test or harness path that should guard this?
4. Is there a history-based state convention already in use?
5. Does the change alter AI data, AI logic, or both?
6. Does `.slim/imports.json` show a wider blast radius than expected?

## 16. Suggested Rehydration Prompt For Future Codex

If using this file to restore context, a good short prompt is:

> Read `AGENTS.md`, `CLAUDE.md`, `docs/codex-rehydration-memory.md`, and `docs/difficulty-reference.md`. Treat the rehydration file as accumulated practical memory for war-civ-v2. Use `.slim/` metadata before source reads, preserve dirty working-tree changes, and remember that combat features often require mirrored changes in both `warEcologySimulation.ts` and `web/src/game/controller/GameSession.ts`.

## 17. Relationship To Other Memory Docs

This file supersedes `docs/claude-knowledge-dump.md` as the better all-in-one rehydration document because it merges:

- stable repo architecture from `CLAUDE.md`
- repo-specific workflow rules from `AGENTS.md`
- previous knowledge dump content
- current AI difficulty reference direction
- current dirty working-tree context

If there is ever a conflict:

- source code and tests win over docs
- `AGENTS.md` and `CLAUDE.md` win over older memory dumps
- `docs/difficulty-reference.md` wins for detailed AI parameter specifics
