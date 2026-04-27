---
name: Undo System
description: Single-step undo via snapshot serialization; Game menu + Ctrl+Z; snapshot in GameSession, wired through GameController
type: project
originSessionId: 0647769d-3646-4026-a17a-90423a8cce05
---
Snapshot-based single-step undo implemented in `GameSession` (added 2026-04-19). Before each undoable player action, `takeUndoSnapshot()` serializes the full `GameState` + `SessionFeedback` via `serializeGameState()` from `playState.ts`. On undo, `performUndo()` deserializes and restores via `Object.assign(this.feedback, ...)` (feedback is `readonly`, can't reassign).

**Undoable:** `move_unit`, `attack_unit` (snapshot taken in `GameController.applyPendingCombat()` before `applyResolvedCombat()`), `set_city_production`, `board_transport`, `disembark_unit`, `build_fort`, `prepare_ability`

**Not undoable:** `end_turn`, `sacrifice_unit`, `build_city` — these clear `_undoSnapshot = null`

**Guardrails:** `canUndo()` checks snapshot exists, no pending combat animation, active faction is human, not AI-processing. Snapshot also cleared in `continueAiUntilHumanTurn()`.

**UI:** `GameMenuBar` uses dynamic `buildGameMenu(canUndo)` function (not static array). `canUndo: boolean` in `ClientActionState`. Ctrl+Z via `useUndoHandler` hook (React document listener, not Phaser — modifier-key chords are simpler in React).

**Why:** `GameState` Maps are mutated in-place by systems, so holding a reference to `this.state` isn't safe — must serialize/deserialize for a true snapshot. RNG determinism is preserved because `rngState` is part of GameState.

**How to apply:** If adding new undoable actions, add `this.takeUndoSnapshot()` as first line in the `case` in `GameSession.dispatch()`. If adding new non-undoable actions, add `this._undoSnapshot = null`.
