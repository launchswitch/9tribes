# MEMORY.md — War-Civ V2 Project Memory

## Architecture

### Stack
- TypeScript + Vite + Phaser 3 (hex map canvas) + React 18 (HUD/menus)
- Single `styles.css` (~5,600 lines), CSS variables throughout
- Theme: dark warm brown fantasy — Cinzel/Fraunces/Inter fonts

### Data Flow
```
GameSession → GameController.dispatch(GameAction) → emit → ClientState
  ├── MapScene (Phaser canvas)
  └── GameShell (React DOM)
```
- **GameSession**: authoritative game state, rule execution
- **GameController**: UI state (selection, hover, targeting, zoom)
- **React local**: presentation-only state

### Combat Animation
Two-phase async: pre-resolve in GameSession → Phaser animation via pending combat listener → final state mutation.

---

## Key Files

### Content
- `src/content/base/research.json` — research tree (tiers T1–T3 per domain)
- `src/content/base/pair-synergies.json` — dual-domain synergy definitions
- `src/systems/synergyEffects.ts` / `synergyEngine.ts` / `synergyRuntime.ts`

### Frontend
- `web/src/app/GameShell.tsx` — root orchestrator, overlay state, combat animation bridge
- `web/src/ui/` — all React components (GameMenuBar, ContextInspector, CommandTray, ResearchWindow, etc.)
- `web/src/game/controller/GameController.ts` — mediator
- `web/src/game/view-model/` — view model layer (worldViewModel.ts, hudViewModel.ts, etc.)

### Build / Dev
- `dist/` — compiled output
- `.tmp-test-run/` / `.tmp-test-dist/` — pre-build test artifacts
- `scripts/runBalanceHarness.ts` — balance testing harness

### URLs
- **Play:** `http://localhost:5173/?mode=play&bootstrap=fresh&seed=42`
- **Replay:** `http://localhost:5173/?mode=replay`
- **Legacy layout:** `?layout=legacy`

---

## Research System
Each node has: `id`, `name`, `domain`, `tier`, `xpCost`, `prerequisites`, `codifies`, `unlocks`, `qualitativeEffect{type, description, effect}`.

Effect types map to game engine hooks (e.g., `roughTerrainDefenseBonus`, `chargeMultiplier`, etc.). New effect types require engine implementation.

### camel_adaptation Domain
- **T1**: Camel Adaptation Foundation
- **T2**: Camel Adaptation Mastery
- **T3**: Camel Adaptation Transcendence (+20% defense in rough terrain)

### Synergy Tag Gate System
Units have tags (`camel`, `poison`, `elephant`, `druid`, etc.). Synergies require matching tags. Synergies are defined by `domains[]` and `requiredTags[]`.

**Known camel-related synergies**: `venom+camel_adaptation`, `fortress+camel_adaptation`, `charge+camel_adaptation`, `hitrun+camel_adaptation`, `tidal_warfare+camel_adaptation`, `nature_healing+camel_adaptation`, `camel_adaptation+slaving`, `camel_adaptation+heavy_hitter`, `camel_adaptation+camel_adaptation`, `river_stealth+camel_adaptation`.

---

## Tools Configured

### OpenCode (GLM-5-turbo, port 4097)
- **Use for**: quick coding tasks, harness runs
- **Start**: `cd C:\Users\fosbo\war-civ-v2; opencode serve --port 4097`
- **Run**: `opencode run --format json --agent orchestrator --attach http://localhost:4097 "task"`
- **Restart if dead**: `Get-Process opencode -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 3; cd C:\Users\fosbo\war-civ-v2; opencode serve --port 4097`

### Claude Code (GLM-5v-turbo)
- **Use for**: UI testing, browser automation, visual verification, screenshots
- **One-shot**: `claude -p "task" --model glm-5v-turbo --cwd C:\Users\fosbo\war-civ-v2`
- **Interactive**: `claude` (avoid — prefer headless)

### Codex CLI (GPT-5.4)
- **Use for**: complex multi-file implementations, architecture work
- **Non-interactive**: `codex exec -s workspace-write "task description"`
- Must use `pty: true` via exec tool

### agent-browser
- Chrome/Chromium CDP automation
- Screenshots land in: `C:\Users\fosbo\.agent-browser\tmp\screenshots\` — copy to workspace before reading

### Routing Decision
| Task type | Tool |
|-----------|------|
| Quick implementation, single-file changes, harness runs | OpenCode |
| Complex multi-file rollouts, cross-system refactoring | Codex CLI |
| UI testing, browser automation, visual verification | Claude Code |
| Quick image analysis in conversation | image tool (myself) |
| Complex multi-step with vision needed | Claude Code |

---

## Lessons Learned

### Unit Range Balance (2026-04-10)
- Range is computed as `chassis.baseRange + component.rangeBonus`
- **Design rule**: Only Catapult (and naval frames) should have range 3 without component bonuses
- Changes made:
  - `ranged_frame` baseRange: 2 → 1 (so bowman = 2)
  - `musket` rangeBonus: 2 → 1 (so musketeer = 2)
  - `catapult_arm` rangeBonus: 1 → 0 (catapult stays 3)
  - `ship_cannon` rangeBonus: 1 → 0 (naval frames stay 3)
- All standard ranged units (bowman, cavalry archer, etc.) now have range 2

### Development
- Test behavior before describing implementation — don't assume
- PowerShell: `&&` chaining fails; use `;` or run commands separately; quote refs like `"@e1"`
- `Select-String` in PowerShell does NOT take `-Recurse`; use `-Path "*.ts"` pattern instead
- `flatMovement` as a T3 camel effect was proposed and reverted — it would have made 3 dual-domain synergies redundant

### Memory System
- Local GGUF retrieval model (`v5-small-retrieval-Q4_K_M.gguf` via KoboldCpp)
- Hybrid mode: dense vector search + keyword matching
- `memory_search` → `memory/*.md` + `MEMORY.md`
- `memory_get` → pull specific line ranges
- **Reading does NOT auto-write — must explicitly write after learning things worth keeping**
- Session transcripts ≠ memory files; sessions are raw, memory is curated distillation
