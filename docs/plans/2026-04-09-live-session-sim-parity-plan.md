# Live Session / Simulation Parity Implementation Plan

## Goal

Make live play and the simulation/replay path run the same gameplay rules wherever possible, with `GameSession` reduced to UI orchestration, animation timing, and player input handling instead of maintaining a second rules engine.

This plan is the authoritative handoff for the implementation work. It is written to be executable after context reset.

## Problem Summary

The current codebase has two materially different execution paths:

- `src/systems/warEcologySimulation.ts` is the full gameplay engine.
- `web/src/game/controller/GameSession.ts` is a separate live-play controller that reimplements only part of that engine.

The siege bug was one symptom, not the whole problem. The larger parity gaps are:

- live combat uses a simplified pipeline and omits major sim-only effects
- live end-turn upkeep omits sim-only progression, status, and war-exhaustion work
- live AI uses a bespoke turn loop instead of the shared activation path
- transport mechanics exist in simulation but not in the live action surface
- prepared abilities such as `brace` and `ambush` exist in rules/state, but the live UI cannot issue them
- several faction progression systems are only executed inside the sim phase runner

## Primary Architectural Decision

Do not keep porting mechanics one-by-one into `GameSession`.

Instead:

- extract shared rule execution out of `warEcologySimulation.ts` into reusable modules under `src/systems/`
- make `GameSession` call those shared modules
- keep only UI-specific concerns in `GameSession`:
  - input dispatch
  - pending combat / animation boundaries
  - event log text
  - human-controlled action gating

If a mechanic lives only in `GameSession`, it will drift again.

## Constraints

- Preserve the current live combat animation boundary: live play can pre-resolve combat for visuals, but state must not mutate until the animation apply step.
- Avoid whole-file rewrites of `warEcologySimulation.ts` and `GameSession.ts` in one pass. Extract in phases.
- Do not revert unrelated dirty-worktree changes.
- Prefer adding focused shared modules over growing `GameSession` further.
- Keep simulation trace output intact.

## Success Criteria

By the end of this project:

- live combat and sim combat use the same rule resolution and state-application code
- live end-turn upkeep and sim faction upkeep use the same rule execution code
- live AI faction turns use the same activation logic as sim AI, or a thin wrapper over the same activation helpers
- missing player-facing mechanics that already exist in rules are exposed in live play where appropriate
- parity tests exist for the highest-risk mechanics and compare targeted state slices across live and sim paths
- duplicated bespoke rule logic is removed from `GameSession`

## Non-Goals

- Do not make replay and live UI event logs identical.
- Do not require full-state equality between live and sim. Compare rule outcomes, not incidental ordering or presentation fields.
- Do not redesign the UI shell during this effort unless required to expose a missing mechanic.

## Known High-Value Parity Gaps

- Combat kill-capture is implemented in sim but not live.
- Sim combat applies far more doctrine, synergy, stealth, poison, frostbite, knockback, combat-healing, contact-transfer, absorption, and war-exhaustion logic than live combat.
- Sim faction phases run triple-stack resolution, emergent effects, ecology pressure, force-composition pressure, codification, environmental damage, rally, stealth refresh, prepared-ability expiry, and war-exhaustion turn ticks. Live does not.
- Sim supports transport boarding, transport movement, auto-disembark, and transport death cascades. Live state serializes `transportMap`, but the action surface does not use it.
- Live `GameAction` does not expose `brace`, `ambush`, `board transport`, or `disembark`.

## Implementation Order

The safest order is:

1. build parity tests and fixtures first
2. extract shared combat
3. extract shared faction upkeep
4. cut live AI over to shared activation helpers
5. expose missing player actions
6. remove duplicate code and refresh docs/cartography

## Phase 0: Baseline, Fixtures, and Parity Harness

### Goal

Create a test harness that can compare a targeted live session step against the simulation path so later refactors have a clear definition of parity.

### Primary Files

- `tests/webGameSession.test.ts`
- `tests/warEcologySimulation.test.ts`
- `tests/liveSessionParity.test.ts` (new)
- `web/src/game/types/playState.ts`
- `web/src/game/controller/GameSession.ts`

### Tasks

- Add a new parity-oriented test file, `tests/liveSessionParity.test.ts`.
- Create helper utilities that:
  - build a small scenario or serialize a curated scenario
  - run one live step via `GameSession`
  - run the equivalent sim step or faction phase via shared entry points
  - compare targeted state slices instead of full state equality
- Compare these slices at minimum:
  - unit hp, morale, routed status, prepared ability, stealth, poison, frostbite, position
  - city siege fields and wall HP
  - faction research progress and learned domain outputs
  - war exhaustion values
  - `transportMap`, `poisonTraps`, `contaminatedHexes`
  - faction capability / triple-stack outputs where relevant
- Add initial parity scenarios for:
  - kill-capture
  - poison/environment tick
  - siege progression
  - war exhaustion morale penalty
  - retreat capture

### Validation

- `npm run test -- tests/liveSessionParity.test.ts`
- `npm run test -- tests/webGameSession.test.ts`
- `npm run test -- tests/warEcologySimulation.test.ts`

### Exit Criteria

- A failing test can demonstrate a concrete live-vs-sim divergence before code changes begin.
- The harness is ready to protect every later phase.

## Phase 1: Shared Combat Pipeline

### Goal

Eliminate the separate live combat rules path.

### Primary Files

- `src/systems/warEcologySimulation.ts`
- `web/src/game/controller/GameSession.ts`
- `src/systems/combatSystem.ts`
- `src/systems/captureSystem.ts`
- `src/systems/warExhaustionSystem.ts`
- `src/systems/abilitySystem.ts`
- `src/systems/signatureAbilitySystem.ts`
- `src/systems/transportSystem.ts`
- `src/systems/combatActionSystem.ts` (new)

### Shared Module To Introduce

Create a new shared combat module, for example `src/systems/combatActionSystem.ts`, with two explicit layers:

- `previewCombatAction(...)`
  - pure or near-pure rule resolution
  - computes combat result, replay breakdown, and any delayed consequences needed for animation
  - does not mutate live state
- `applyCombatAction(...)`
  - applies the full post-combat rule set to `GameState`
  - returns the updated state plus structured feedback describing what happened

### Tasks

- Move the combat rule authority out of `GameSession.resolveAttack(...)` and the sim combat block inside `activateUnit(...)`.
- Preserve the live pending-combat animation flow by making `GameSession` use `previewCombatAction(...)` when a player attacks.
- Make `GameSession.applyResolvedCombat(...)` call `applyCombatAction(...)` instead of maintaining its own rule mutations.
- Make the sim path also call the same shared apply function.
- Port the currently missing sim-only combat behaviors into the shared combat application path, including:
  - kill-capture via `attemptCapture(...)`
  - retreat capture parity
  - contact transfer
  - faction absorption
  - war-exhaustion-on-loss handling
  - transport destruction cascade
  - stealth / poison / frostbite / contamination aftermath
  - knockback and combat-healing effects
  - prepared ability effects such as `brace` and `ambush`
  - flank / rear / fortification interactions
- Ensure replay event / combat breakdown generation comes from the shared combat result rather than duplicated live-only formatting logic where possible.

### Validation

- Extend parity tests for:
  - kill-capture on defender death
  - defender flee / retreat capture
  - rear attack and brace interactions
  - poison / frostbite / contamination aftermath
  - transport death cascade
- Run:
  - `npm run test -- tests/liveSessionParity.test.ts tests/webGameSession.test.ts tests/combat.test.ts`

### Exit Criteria

- Live and sim combat mutate state through the same rule-application function.
- `GameSession` no longer owns a simplified parallel combat engine.

## Phase 2: Shared Faction Upkeep and End-Turn Parity

### Goal

Eliminate the separate live upkeep path.

### Primary Files

- `src/systems/warEcologySimulation.ts`
- `web/src/game/controller/GameSession.ts`
- `src/systems/factionPhaseSystem.ts` (new)
- `src/systems/healingSystem.ts`
- `src/systems/warExhaustionSystem.ts`
- `src/systems/fogSystem.ts`
- `src/systems/researchSystem.ts`
- `src/systems/siegeSystem.ts`
- `src/systems/territorySystem.ts`

### Shared Module To Introduce

Create a shared faction upkeep runner, for example `src/systems/factionPhaseSystem.ts`, that owns the non-activation portion of faction progression.

This runner should be responsible for:

- fog refresh
- strategy recomputation and storage if needed by downstream systems
- triple-stack / emergent activation
- ecology pressure
- force-composition pressure
- codification / research progression
- hybrid unlock refresh
- capture-timer advancement
- economy / production advancement
- supply-deficit handling
- environmental damage
- healing / morale refresh / rally / status cleanup
- siege evaluation and capture
- village expansion
- war-exhaustion ticking and morale penalties

### Tasks

- Extract the shared upkeep logic currently embedded inside `processFactionPhases(...)`.
- Replace the live trio of:
  - `resolveFactionEconomyAndProduction(...)`
  - `resolveFactionResearch(...)`
  - `resolveFactionSiege(...)`
  - plus the extra `applySupplyDeficitPenalties(...)` and `applyHealingForFaction(...)`
  with a single shared upkeep call from `GameSession`.
- Keep `advanceTurn(...)` as turn-order plumbing only. Do not keep growing it into a rules engine.
- Use the new shared upkeep runner in the sim path before unit activation continues.

### Validation

- Add parity tests for:
  - poison and environmental damage ticking once per faction phase
  - research progress and hybrid unlock changes
  - siege start / wall damage / siege break / capture
  - war-exhaustion turn tick plus morale penalty
  - learned-ability sacrifice / codification outcomes
- Run:
  - `npm run test -- tests/liveSessionParity.test.ts tests/warEcologySimulation.test.ts tests/webGameSession.test.ts tests/warExhaustion.test.ts tests/siege.test.ts`

### Exit Criteria

- Live end-turn no longer manually reimplements research, economy, siege, and status work.
- The sim and live upkeep phases share one rule executor.

## Phase 3: Shared AI Activation and Live AI Cutover

### Goal

Replace the bespoke live AI loop with shared activation logic so AI behavior stops diverging between play mode and simulation.

### Primary Files

- `src/systems/warEcologySimulation.ts`
- `web/src/game/controller/GameSession.ts`
- `src/systems/turnSystem.ts`
- `src/systems/strategicAi.ts`
- `src/systems/aiTactics.ts`
- `src/systems/unitActivationSystem.ts` (new, extracted)

### Shared Module To Introduce

Extract the unit-activation logic from `warEcologySimulation.ts` into a reusable `unitActivationSystem.ts`.

The extracted surface should support:

- activating a single AI unit from current state
- returning either:
  - an updated state if activation completes without a visual boundary
  - or a structured pending-combat boundary that live `GameSession` can queue for animation

### Tasks

- Extract the following out of `warEcologySimulation.ts` into shared helpers:
  - target selection
  - strategic movement selection
  - fort / dug-in decisions
  - ranged vs melee attack selection
  - transport-aware movement
  - activation completion bookkeeping
- Rework `GameSession.runAiTurn(...)` to use:
  - shared activation queue logic from `turnSystem.ts`
  - shared AI unit activation helpers
  - the shared combat preview / apply pipeline from Phase 1
- Preserve `_aiCombatQueue` semantics for visual playback.
- Ensure the AI does not fall back to the old `tryAiAttack(...)` / `tryAiMove(...)` rule fork once cutover is complete.

### Validation

- Extend `tests/aiTactics.test.ts` and `tests/webGameSession.test.ts` to compare a fixed AI scenario in:
  - sim
  - live AI turn processing
- Add parity checks for:
  - siege-force movement
  - ranged target choice
  - fort build behavior
  - transport-aware AI movement if transports are available

### Exit Criteria

- AI behavior in live play and simulation is driven by the same activation logic.
- The old bespoke `GameSession` AI decision code is either removed or reduced to animation wrapper code only.

## Phase 4: Expose Missing Player Actions

### Goal

Expose mechanics that already exist in the rules/state model but are not available from the live UI.

### Primary Files

- `web/src/game/types/clientState.ts`
- `web/src/game/controller/GameSession.ts`
- `web/src/game/view-model/worldViewModel.ts`
- `web/src/game/controller/GameController.ts`
- `web/src/ui/ContextInspector.tsx`
- `web/src/app/GameShell.tsx`
- `src/systems/abilitySystem.ts`
- `src/systems/transportSystem.ts`

### Tasks

- Add live `GameAction` variants for:
  - `prepare_ability` with at least `brace` and `ambush`
  - `board_transport`
  - `disembark_unit`
- Update view-models to expose:
  - whether a unit can brace or ambush
  - adjacent boardable transports
  - valid disembark hexes for embarked units / transports
- Add UI affordances in the inspector / command surface for those actions.
- Implement action dispatch in `GameSession` using shared rule helpers rather than local custom logic.
- Confirm `serializeGameState` / `deserializeGameState` already cover the necessary fields:
  - `transportMap`
  - `poisonTraps`
  - `contaminatedHexes`
  - prepared ability fields on units

### Validation

- Add live tests for:
  - player prepares brace, then receives brace bonus in combat
  - player prepares ambush, attacks from prepared state, then prep clears correctly
  - player boards a transport
  - player disembarks and spends the correct moves
- Run:
  - `npm run test -- tests/webGameSession.test.ts tests/webWorldViewModel.test.ts tests/movementSystem.test.ts`

### Exit Criteria

- Mechanics no longer exist only in state / sim code; they are actually playable in live mode.

## Phase 5: Cleanup, Deletion, and Documentation Refresh

### Goal

Remove the duplicated rule paths and leave behind a maintainable architecture.

### Primary Files

- `web/src/game/controller/GameSession.ts`
- `src/systems/warEcologySimulation.ts`
- `docs/plans/2026-04-09-live-session-sim-parity-plan.md`
- `.slim/digest.md`

### Tasks

- Delete or collapse obsolete `GameSession` methods once their responsibilities are fully shared:
  - simplified combat resolution logic
  - bespoke faction upkeep methods
  - bespoke AI tactical loops
- Keep `GameSession` focused on:
  - dispatch
  - animation boundary management
  - event log feedback
  - human-faction control rules
- Re-run cartography after code changes:

```bash
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py changes --root ./
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py extract --root ./ --changed-only
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py digest --root ./ --output .slim/digest.md
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py update --root ./
```

- Update this plan doc with a short "completed work" appendix if the implementation is split across multiple sessions.

### Validation

- Full targeted test sweep:

```bash
npm run test -- tests/liveSessionParity.test.ts
npm run test -- tests/webGameSession.test.ts
npm run test -- tests/warEcologySimulation.test.ts
npm run test -- tests/combat.test.ts
npm run test -- tests/siege.test.ts
npm run test -- tests/warExhaustion.test.ts
npm run test -- tests/aiTactics.test.ts
npm run build
npm --prefix web run build
```

### Exit Criteria

- The remaining differences between live and sim are intentional presentation differences, not missing game rules.

## Recommended Commit Boundaries

- Phase 0: parity harness and failing coverage
- Phase 1: shared combat extraction and live cutover
- Phase 2: shared faction upkeep extraction and live cutover
- Phase 3: shared AI activation cutover
- Phase 4: player action surface for missing mechanics
- Phase 5: cleanup and deletion

## Execution Notes For The Next Session

- Start by reading this file, then inspect `.slim/digest.md`, `.slim/symbols.json`, and `.slim/imports.json`.
- Do not begin by editing `GameSession.ts` directly. First identify the shared extraction target for the current phase.
- Use the parity tests to prove the current divergence before changing rules.
- Preserve pending-combat animation semantics while replacing the live combat rule path.
- If time is limited, complete Phases 0 through 2 before Phase 3. Those phases remove the highest-risk rule divergence first.
