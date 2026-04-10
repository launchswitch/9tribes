# TOOLS.md - War-Civ V2 Tool Config

## Agent Tool Routing

### OpenCode (GLM-5-turbo, non-vision)
- **Model**: glm-5-turbo
- **Use for**: coding tasks, implementation, refactoring, balance harness runs
- **Mode**: headless serve on port 4097
- **Commands**:
  - Start: `cd C:\Users\fosbo\war-civ-v2; opencode serve --port 4097`
  - Run task: `opencode run --format json --agent orchestrator --attach http://localhost:4097 "task description"`
  - For long tasks, write task to a file first: `opencode run --format json --agent orchestrator --attach http://localhost:4097 "Read and implement tmp_task.md"`
- **Check health**: `Get-NetTCPConnection -LocalPort 4097 -ErrorAction SilentlyContinue`
- **Restart if dead**: `Get-Process opencode -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 3; cd C:\Users\fosbo\war-civ-v2; opencode serve --port 4097`
- **Timeout**: use `timeout=300` for most tasks, `timeout=600` for complex multi-file changes

#### OpenCode Peculiarities
- **⚠️ `--cwd` is NOT a valid flag** — always `cd` to the project dir first, then `opencode serve`
- **⚠️ Active TUI sessions are invisible to `session list`** — use `opencode db` queries instead
- **Always use `--agent orchestrator`** — it delegates to specialists (explorer, librarian, oracle, etc.)
- **Long prompts may fail silently** — if the inline prompt is large, write to a file and reference it
- **Port zombie sockets**: if `Stop-Process` succeeds but the port is still bound, use a different port
- **Session discovery via DB**:
  ```
  opencode db "SELECT id, title, directory, time_updated FROM session ORDER BY time_updated DESC LIMIT 5;" --format json
  ```
- **Session continuation**: `opencode run --format json --agent orchestrator --attach http://localhost:4097 --session <id> "follow-up task"`
- **Output format**: newline-delimited JSON events. Filter for `type: "text"` for agent's response

### Claude Code (GLM-5v-turbo, vision)
- **Model**: glm-5v-turbo (via z.ai proxy)
- **Use for**: UI testing, visual verification, Playwright browser tasks, screenshot analysis
- **Plugins**: playwright, typescript-lsp, frontend-design
- **Commands**:
  - One-shot: `claude -p "task" --model glm-5v-turbo --cwd C:\Users\fosbo\war-civ-v2`
  - Interactive: `claude` (but avoid — prefer headless)
- **Working directory**: cd to repo first, or pass `--cwd`

### Codex CLI (GPT-5.4, OpenAI)
- **Model**: gpt-5.4
- **Use for**: complex multi-file implementations, architecture rollouts, cross-system refactoring
- **Commands**:
  - Non-interactive: `codex exec -s workspace-write "task description"`
  - Interactive: `codex` (avoid — prefer exec for automation)
- **TTY required**: must use `pty: true` when running via exec
- **Timeout**: use `timeout=600` for complex tasks

### Routing Decision
| Task type | Tool |
|-----------|------|
| Quick implementation, single-file changes, harness runs | OpenCode |
| Complex multi-file rollouts, cross-system refactoring | Codex CLI |
| UI testing, browser automation, visual verification | Claude Code |
| Quick image analysis in conversation | image tool (myself) |
| Complex multi-step with vision needed | Claude Code |

## War-Civ-v2 Project
- **Repo**: C:\Users\fosbo\war-civ-v2
- **OpenCode serve port**: 4097
- **Balance harness**: `npx tsx scripts/runBalanceHarness.ts --stratified --random`
- **Cartography**: `~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py`

## Skill: war-civ-v2-game-ui
- **Location**: `~/.agents/skills/war-civ-v2-game-ui-1.0.0/SKILL.md`
- **Triggers**: UI, frontend, panel, modal, overlay, inspector, menu, HUD, canvas, sprite, sound, CSS, styling, layout, responsive, Phaser, React component, browser verification
- **Verification URL**: `http://localhost:5173/?mode=play&bootstrap=fresh&seed=42`
