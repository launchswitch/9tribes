---
name: ClientState Extension Pattern
description: Pattern for adding new game-state-backed UI panels: type in clientState.ts → compute in GameController → consume in component
type: project
originSessionId: ccffe703-e2e9-4c48-8837-12db3ba7f1a6
---
When adding a new panel that shows game-derived data (not pure UI state), follow this pipeline:

1. **`web/src/game/types/clientState.ts`** — add the view model type + field to `ClientState` + action(s) to `GameAction`
2. **`web/src/game/view-model/inspectors/`** — add a view model builder function that takes `GameState + RulesRegistry + position + playerFactionId`
3. **`web/src/game/controller/GameController.ts`** — add private position/key tracking, handle new actions in `dispatch()`, call builder in `getPlayState()`
4. **`web/src/game/phaser/scenes/MapScene.ts`** — dispatch the new action from the right input event
5. **`web/src/ui/`** — React component reads from `state.xxx`; close via `controller.dispatch()`
6. **`web/src/app/GameShell.tsx`** — render the component inside `KnowledgeGainedShellContent` (no ShellContentProps threading needed — state and controller already flow through)

**Why:** `ClientState` is the single source of truth for all data the React layer needs. Putting computed view models there keeps components pure readers. The GameController is the only place that calls expensive builders; components never touch GameState directly.

**Example:** `TerrainInspectorViewModel` — Ctrl+Click dispatches `inspect_terrain` → GameController stores position → `buildTerrainInspectorViewModel` runs in `getPlayState()` → `TerrainPanel` reads `state.terrainInspector`.

**How to apply:** Use this pattern for any feature where the data requires access to `GameState` or `RulesRegistry`. Only use React `useState` + prop threading (see `gameShellPropThreading.md`) for pure UI flags.
