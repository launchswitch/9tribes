---
name: GameShell Prop Threading
description: GameShell has two-layer component structure; adding state requires threading through both layers — BUT only for React useState, not ClientState
type: feedback
originSessionId: ccffe703-e2e9-4c48-8837-12db3ba7f1a6
---
When adding new **React `useState` variables** used by panels rendered inside `KnowledgeGainedShellContent`, you must update **four places** or get TS errors:

1. **Outer `GameShell`** — add `useState`
2. **`ShellContentProps` interface** — add the prop type + setter
3. **Inner `KnowledgeGainedShellContent`** — destructure in function signature
4. **Outer render of `<KnowledgeGainedShellContent>`** — pass the prop

**Why:** GameShell wraps everything in a `KnowledgeGainedModalProvider`, creating an inner component (`KnowledgeGainedShellContent`) that receives all state via props. State lives in the outer component but is consumed by the inner one. Examples: `helpOpen`, `researchOpen`, `inspectorOpen`, `combatLogOpen`, `activeOverlay`.

**Exception — ClientState-backed panels skip all 4 steps:**

If the panel's data lives in `GameController` (emitted via `ClientState`), add it to `ClientState` and compute it in `GameController.getPlayState()`. The inner component already receives `state: ClientState` and `controller: GameController` as props, so:
- Read data from `state.xxx` directly
- Close via `controller.dispatch({ type: '...' })`
- No new props to `ShellContentProps`, no 4-place threading needed

Example: `TerrainPanel` uses `state.terrainInspector` and dispatches `close_terrain_inspector` — zero new ShellContentProps entries required.

**How to apply:** Ask "is this UI-only state or game state?" If game state (affects simulation, serializable, needed across components), put it in ClientState. If pure UI state (panel open/closed flag, tab selection), use `useState` + prop threading.
