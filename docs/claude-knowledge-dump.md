# Claude Code Knowledge Dump — war-civ-v2

> **Purpose:** Feed this document to a fresh Claude Code instance to restore accumulated project knowledge. Generated 2026-04-12.
>
> **Note:** CLAUDE.md (checked into the repo) covers architecture, build commands, conventions, and navigation. This document covers *additional* context learned across sessions — decisions, pitfalls, in-progress work, and user preferences that are NOT in CLAUDE.md.

---

## 1. Critical Architectural Insight: Dual Combat Paths

### The WarEcology / GameSession Split

The AI simulation loop (`warEcologySimulation.ts`) and the player-facing controller (`GameSession.ts`) are **two separate combat resolution paths**.

**Why this matters:** The sim loop is the "god function" that handles all unit activations end-to-end in one pass. GameSession breaks this into two phases:
1. `resolveAttack()` — pure math, no mutation
2. `applyResolvedCombat()` — state mutation after animation completes

`applyResolvedCombat()` rebuilds unit state from scratch and has historically missed features that exist in the sim loop.

**Rule for adding combat features:** When implementing a new combat mechanic (hit-and-run retreat, learn-by-kill, sacrifice, capture-on-retreat, etc.):
1. Implement in `warEcologySimulation.ts` (AI/autonomous path)
2. Implement in `GameSession.applyResolvedCombat()` (player path)
3. Wire feedback through the UI chain: `SessionFeedback` → `GameController` → `clientState.ts` → `sfxManager.ts`

**Debugging rule:** If a player reports a combat feature "doesn't work" but the AI uses it fine, check `applyResolvedCombat()` — it's probably missing there.

---

## 2. Difficulty Reshuffle (In Progress)

### Context

User played Hard mode and dominated by turn 13 with zero resistance. Paired harness data confirmed Normal and Hard were nearly identical (0 delta on 8/9 factions at 20 turns). "Hard" was fake — just weight tweaks within the same passive behavioral envelope.

### Plan

| Slot | Source | Status |
|------|--------|--------|
| **Easy** | Old HARD_PROFILE (passive weights) | Done |
| **Normal** | Rebuilt from scratch — aggressive, battle-focused, max supply push | Done |
| **Hard** | Normal + more aggression, single-target focus | Done |

### Key Profile Parameters (Normal)

- `rushTurns: 2` (was 10), `aggressionFloor: 0.9` (was 0.7)
- `commitAdvantageOffset: -0.15` (was 0)
- `coordinatorMinActiveArmy: 2` (was 4), `coordinatorHunterShare: 0.8` (was 0.5)
- `underCapUtilizationFloor: 0.95`, target 1.0 — maxed supply push
- `settlerGateStrength: 2.0` — military first

### Key Profile Parameters (Hard)

- `rushTurns: 1`, `aggressionFloor: 0.95`, `commitAdvantageOffset: -0.2`
- `coordinatorHunterShare: 0.9`, `focusTargetLimit: 1` (single-target focus)
- `settlerGateStrength: 2.5`

### Harness Results (10 seeds)

| Metric | Easy (20T) | Normal (20T) | Normal (60T) |
|--------|-----------|-------------|-------------|
| Battles | 7 | 55 | 1113 |
| Kills | 2 | 21 | 393 |
| Sieges | 0 | 0 | 12 |
| City captures | 0 | 0 | 25 |
| Avg living units | 55.8 | 53.7 | 93.1 |

### Bug Fixes Included in This Work

**Bug 1 — City capture without siege (walls 100/100):**
- Root cause: `combatActionSystem.ts` `maybeAbsorbFaction()` transfers all cities to victor when last unit dies — bypasses `captureCity()`, no wall reduction, no production clear.
- Fix: Units garrisoned inside a walled city cannot be targeted until walls breach to 0 HP. Prevents faction elimination via sniping the last defender.
- Two locations: `combatActionSystem.ts` `canAttackTarget()` and `GameSession.ts` `getAttackTargets()`.

**Bug 2 — Captured city 2x production cost:**
- Root cause: `knowledgeSystem.ts` `PROTOTYPE_COST_MODIFIERS: {0: 2.0, 1: 1.5, 2: 1.2, 3: 1.0}` — captured cities start at 0 mastery.
- Fix: `aiProductionStrategy.ts` uses `getPrototypeQueueCost()` (base chassis cost) instead of `calculatePrototypeCost()` (includes domain mastery "cultural shock" multiplier) for auto-queue cost.
- Cultural shock still used for AI *scoring decisions* (what to prefer building), just not actual production cost.

### Known Remaining Issues

- **Villages razed = 0:** AI not destroying enemy villages in harness. Village raiding behavior not triggered.
- **3 skipped tests:** Two in `strategicAi.test.ts`, one in `adaptiveAiPhase2.test.ts` — may need updates for new profiles.

### Files Modified (Uncommitted as of 2026-04-12)

All in working tree, not yet committed:
- `src/systems/aiDifficulty.ts` — All three profiles rewritten
- `src/systems/territorySystem.ts` — Encirclement tuning (verify current values)
- `src/systems/warEcologySimulation.ts` — Post-activation siege check
- `src/systems/aiProductionStrategy.ts` — Captured city production cost fix
- `src/systems/combatActionSystem.ts` — Wall protection for garrisoned units
- `web/src/game/controller/GameSession.ts` — UI wall protection check
- `tests/adaptiveAiPhase2.test.ts` — Test updates for difficulty swap
- `tests/strategicAi.test.ts` — Focus target test + difficulty swap updates
- Plus ~50+ other files with minor changes (test cleanup, config updates)

---

## 3. Git History Narrative

Key milestones visible in recent commits:

1. **Help system** — 5-tab help UI with curated player content
2. **UI cleanup** — Removed Controls menu, fixed tribe-card display
3. **Combat sound variants** — Sound system for combat events
4. **Normal AI tuning** — Aggressive Normal difficulty profile
5. **Game state refactor** — Separated feedback handling from state
6. **Siege system + combat animation** — Live-play siege, animation overhaul
7. **System extraction** — Combat action, faction phase, unit activation split into dedicated systems
8. **Architecture guardrails** — Shared sim and live rules
9. **Hard AI multi-phase tuning** — Fog supremacy, multi-axis attacks, emergent rules, signature exploits
10. **Queued movement** — Movement across turns with path rendering
11. **Difficulty reshuffle** — Easy/Normal/Hard rebuild (current work, uncommitted)

---

## 4. User Profile

- **Role:** Solo developer / designer of war-civ-v2
- **Workflow:** Uses Claude Code for implementation, debugging, and tuning. Uses the balance harness (Optuna) for data-driven difficulty tuning.
- **Testing:** Relies on Vitest test suite + paired balance harness. Prefers deterministic, seeded tests.
- **Communication style:** Prefers terse, direct responses. No trailing summaries of work already done — can read the diff.

---

## 5. Session Survival Guide

Things to remember when starting a new session on this repo:

### Before making changes
- Read CLAUDE.md first — it has the authoritative architecture overview
- Check `codemap.md` for per-system contracts if doing system work
- Check `.slim/symbols.json` and `.slim/imports.json` for structured code navigation
- Run `git status` and `git diff --stat HEAD` to see what's in-flight

### When working on combat
- Always check both paths: `warEcologySimulation.ts` AND `GameSession.ts`
- Run the full test suite after combat changes — `warEcologySimulation` has 31 import dependencies

### When tuning AI difficulty
- Use the balance harness: `npm run balance:harness`
- Profile definitions are in `src/systems/aiDifficulty.ts`
- The harness runs seeded simulations; compare across seeds
- Paired harness (`npm run balance:harness:stratified`) compares Normal vs Hard

### When working on the frontend
- Separate build pipeline: `npm run web:dev` / `npm run web:build`
- Sprite naming: `{faction}_{unit}.png` in `web/public/assets/playtest-units/`
- Sound effects: centralized in `web/src/app/audio/sfxManager.ts`
- New gameplay feedback: add field in `GameSession.ts` → `GameController.ts` → `clientState.ts` → `sfxManager.ts`

### When adding sound effects
1. Put browser-loadable asset in `web/public/assets/audio/sfx/`
2. Register in `web/src/app/audio/sfxManager.ts`
3. Combat sounds: trigger from React/Phaser bridge in `GameShell.tsx` using pending attacker
4. Non-combat sounds: prefer state-delta detection in `sfxManager.ts` over scattered `new Audio()` calls
