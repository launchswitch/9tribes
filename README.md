# War-Civ V2

> ⚠️ **Active development.** Features, balance, and code are evolving. Expect breaking changes.

---

**War-Civ V2** is a turn-based strategy simulation focused on how civilizations evolve through war. It is **not** a traditional 4X game — it optimizes for conflict-driven evolution, military identity, emergent behavior, and simple systems that create complex outcomes.

## Core Pillars

- **Combat drives everything** — Technology and identity emerge from conflict, not separate economy screens
- **Military identity is earned** — Terrain, battle outcomes, and doctrines shape each faction's personality over time
- **Technology from environment + combat** — No linear tech trees; units learn from what they fight and where they fight it
- **Units are persistent** — Veterans carry history and can "learn" enemy doctrines from battle
- **Prototypes over unit tiers** — 16 chassis × 34 components x 176 domain combinations create unit variety without rigid upgrade ladders

## Factions (9)

Each faction has a home biome, unique units, signature abilities, and a native domain that shapes its research and hybrid potential.

| Faction | Biome | Identity |
|---------|-------|----------|
| Jungle Clans | Jungle | Poison attrition, stealth, venom domain |
| Druid Circle | Forest | Sustain, healing terrain control, nature domain |
| Steppe Riders | Steppe/Plains | Cavalry shock, hit-and-run, charge domain |
| Hill Engineers | Hills | Fortification, siege engines, fortress domain |
| Pirate Lords | Coast | Naval raids, village capture, pistol skirmishers |
| Desert Nomads | Desert | Camel mobility, desert endurance, heat domain |
| Savannah Lions | Savannah | Elephant charges, pride domain |
| River People | River | Transport, alligator ambush, river domain |
| Arctic Wardens | Tundra | Polar bear riders, cold endurance, frost domain |

## Terrain (12 types)

Plains, forest, jungle, hill, desert, tundra, savannah, coast, river, swamp, mountain (impassable), ocean.

Terrain is load-bearing: it determines faction identity formation, research bias, movement costs, and where signature abilities activate.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Simulation engine | TypeScript (`src/`) — pure, no framework |
| Frontend | Vite 5 + React 18 + Phaser 3 (`web/`) |
| Testing | Vitest |
| Balance optimization | Optuna (via Python harness scripts) |
| Deployment | Vercel (frontend only) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
git clone <repo-url>
cd war-civ-v2

# Install backend/test dependencies
npm install

# Install frontend dependencies
npm install --prefix web
```

### Running

```bash
# Play the game (browser UI)
npm run web:dev
# → open http://localhost:5173

# Run the headless simulation CLI (prints turn-by-turn trace)
npm run dev
```

### Build

```bash
# Type-check the backend
npm run build

# Build the frontend for production
npm run web:build
```

### Testing

```bash
# Run all tests
npm test

# Single test file
npx vitest run tests/combat.test.ts

# Architecture boundary tests
npm run test:architecture

# Balance harness (Optuna, requires Python setup)
npm run balance:harness
```

## Project Structure

```
war-civ-v2/
├── src/                       # Simulation engine (TypeScript)
│   ├── core/                 # Hex math, grid, deterministic RNG, enums, IDs
│   ├── content/base/         # JSON data: chassis, components, factions, terrains,
│   │                         #   synergies, signature abilities, hybrid recipes, research
│   ├── data/                 # Registry types, content loaders, effectiveness tables
│   ├── features/             # Domain entities: units, factions, cities, villages, prototypes
│   ├── systems/              # ~50 rule-execution modules (see below)
│   │   ├── combat-action/    # Combat action types, preview, application helpers
│   │   ├── simulation/       # Victory, environment effects, faction-turn effects, trace
│   │   ├── strategic-ai/     # Front management, objectives, posture, difficulty coordinator
│   │   └── unit-activation/  # Per-unit activation logic
│   ├── game/                 # GameState types, scenario builders, game loop
│   ├── world/                # Map generation, terrain types
│   ├── balance/              # Optuna objective function, harness integration
│   └── replay/               # Replay recording/export
│
├── web/                       # Frontend (Vite + React + Phaser 3)
│   ├── src/
│   │   ├── app/              # React shell, audio (sfxManager), GameShell
│   │   ├── game/
│   │   │   ├── controller/   # GameSession.ts (player actions), GameController.ts
│   │   │   ├── phaser/       # MapScene, UnitRenderer, FogRenderer, CombatAnimator
│   │   │   └── view-model/   # worldViewModel — UI state + sprite key resolution
│   │   └── ui/               # HUD panels, unit inspector, modals, tutorial overlay
│   └── public/assets/
│       ├── playtest-units/   # 86 unit sprites (48×64px, faction_unit.png naming)
│       └── audio/sfx/        # ~20 gameplay sound effects
│
├── tests/                     # Vitest tests (~40 files)
├── docs/                      # Implementation plans, difficulty reference
├── scripts/                   # Balance harness, replay export
└── .slim/                     # Auto-generated architecture indexes (symbols, imports, digest)
```

## Key Systems

### Core gameplay
- **`combatSystem.ts`** — Attack resolution, counter-attacks, multi-axis attacks, kill-shot bonuses
- **`movementSystem.ts`** — Path execution, Zone of Control (Civ-style: entry costs all remaining moves), opportunity attacks
- **`siegeSystem.ts`** — Wall degradation, city capture
- **`productionSystem.ts`** — City production queues, unit and city project creation
- **`warEcologySimulation.ts`** — Central orchestrator; runs one complete turn across all factions (31 import dependencies)

### Identity & progression
- **`factionIdentitySystem.ts`** — Emergent identity from terrain + combat outcomes
- **`veterancySystem.ts`** / **`xpSystem.ts`** — 4 veteran tiers; combat XP gain
- **`learnByKillSystem.ts`** — Units absorb enemy ability domains on kill
- **`sacrificeSystem.ts`** — Units encode learned abilities into faction research at home city
- **`signatureAbilitySystem.ts`** — Faction signature powers (Frost Nova, Desert Swarm, etc.)
- **`synergyEngine.ts`** — 55 pair-based faction synergies

### AI
- **`strategicAi.ts`** / **`strategic-ai/`** — High-level production, research, front management
- **`aiTactics.ts`** — Tactical flanking and positioning
- **`aiDifficulty.ts`** — Difficulty scaling (Normal vs Hard vs Easy profiles)

### World & support
- **`fogSystem.ts`** — Per-faction fog of war (explored/visible/hidden)
- **`transportSystem.ts`** — Naval transport of land units via galleys
- **`hybridSystem.ts`** — 18 hybrid recipes for late-game unit creation
- **`captureSystem.ts`** — Slaver mechanic: capture enemy units instead of killing

## Architecture Notes

### Dual Combat Paths ⚠️

**Critical:** Any combat mechanic must be implemented in **both** paths or they silently diverge:

| Path | File | Used By |
|------|------|---------|
| AI / autonomous simulation | `src/systems/warEcologySimulation.ts` | All AI turns, headless sim |
| Player-facing live-play | `web/src/game/controller/GameSession.ts` | Player actions via browser UI |

What commonly drifts: siege gating, retreat/hit-and-run, learn-by-kill, sacrifice, capture behavior, multi-axis attacks, kill-shot bonuses.

### Feedback Chain

Route all UI/audio feedback through this chain — do not scatter `new Audio()` calls:

```
GameSession.ts → GameController.ts → clientState.ts → sfxManager.ts
```

### External State

`FogState` and `TransportMap` are **not** part of `GameState`. Callers manage them separately.

### History Arrays

Capture cooldowns and many other transient states are tracked via `unit.history[]` / `faction.history[]` entries, not dedicated counters.

## Balance Optimization

```bash
npm run balance:harness              # Run Optuna optimization loop
npm run balance:harness:stratified   # Stratified variant
npm run balance:evaluate             # Score a candidate
npm run balance:validate             # Validate a candidate
```

Optuna runs Python-side and calls back into the TypeScript harness via `balanceHarness.ts`.

---

**Version:** 0.1.0-mvp  
**Status:** Active development
