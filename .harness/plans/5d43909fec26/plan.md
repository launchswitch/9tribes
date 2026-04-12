Mode: analysis

# Plan for: Ensure that when a city is surrounded by 3 or more units it is placed "under siege" in the backend and frontend

## Context
- Relevant files:
  - `src/systems/territorySystem.ts` (encirclement detection: `isCityEncircled`, threshold=3, radius=2)
  - `src/systems/siegeSystem.ts` (wall degradation, capture logic, `degradeWalls`, `repairWalls`, `captureCity`)
  - `src/features/cities/types.ts` (`City.besieged: boolean`, `City.turnsUnderSiege: number`)
  - `web/src/game/controller/GameSession.ts` (`updateSiegeState()` at line 1191, called after turn advance at line 851)
  - `web/src/game/types/worldView.ts` (`CityView.besieged?: boolean`)
  - `web/src/game/view-model/worldViewModel.ts` (maps `city.besieged` to view model at lines 217, 402, 922)
  - `web/src/ui/ContextInspector.tsx` (shows "Besieged: Yes/No" in city overview tab at line 396)
  - `web/src/game/phaser/systems/SettlementRenderer.ts` (renders city sprites — **no siege visual indicator**)
  - `web/src/game/types/clientState.ts` (`HudViewModel` has siege-related fields)
  - `web/src/app/audio/sfxManager.ts` (sound classification — siege mentioned but no specific siege-start/break sound)

- What I found: **The backend siege system is fully implemented and correct.** `isCityEncircled()` counts enemy units within radius 2 (excluding the city hex itself), threshold 3. `GameSession.updateSiegeState()` sets `besieged=true/false` after each turn advance. Downstream effects (wall damage, production lock, economy halt, war exhaustion) all respect the flag. **The frontend has two significant gaps:**

  1. **No map-level visual siege indicator.** `SettlementRenderer.ts` draws city sprites with faction-colored backing ellipses and name labels, but completely ignores `city.besieged`. A player must click the city and read the inspector to discover siege status.

  2. **No proactive notification.** There is no `EventToast` or sound when a city becomes besieged or when a siege breaks. The `sfxManager` classifies combat sounds but has no siege-state-change trigger. The `EventToastStack` is not wired to siege events.

## Steps

1. [web/src/game/phaser/systems/SettlementRenderer.ts] — Action: Add a visual siege overlay (e.g., red-tinted semi-transparent ellipse, pulsing chain-links icon, or "⚔ SIEGE" text label) rendered on top of the city sprite when `city.besieged === true`. Use `--danger` color variable equivalent (#f2643d) with alpha. | Why: Players need at-a-glance siege awareness on the map canvas without clicking. | Done when: Besieged cities are visually distinct from non-besieged cities on the hex map.

2. [web/src/game/view-model/worldViewModel.ts] — Action: Verify `CityView.besieged` field is populated for both play-mode (line ~402) and replay-mode (line ~217). Add `turnsUnderSiege` to `CityView` if not present, to support richer siege display (e.g., "Under Siege (3 turns)"). | Why: Frontend needs siege duration data for display. | Done when: `CityView` carries complete siege state for both modes.

3. [web/src/game/types/worldView.ts] — Action: Add `turnsUnderSiege?: number` to `CityView` type definition (currently only has `besieged?: boolean`). | Why: Type must match the view model data contract. | Done when: TypeScript compiles without errors after view model change.

4. [web/src/ui/ContextInspector.tsx] — Action: Enhance the siege display in city overview (line ~396). When besieged, show a prominent warning banner (e.g., red background bar reading "UNDER SIEGE — production locked, walls degrading") and display turns under siege count. | Why: Current "Besieged: Yes" is easy to overlook; a prominent banner matches the severity. | Done when: Besieged cities show a visually distinct warning in the inspector.

5. [web/src/app/audio/sfxManager.ts] — Action: Add delta-detection for siege state changes (city becomes besieged → play warning sound; siege breaks → play relief sound). Add `siege_started` and `siege_broken` to the sound classification logic, referencing existing sound assets or new ones in `web/public/assets/audio/sfx/`. | Why: Audio feedback is critical for events the player might not be watching on-map. | Done when: Sound plays when a player's city enters or leaves siege state.

6. [web/src/ui/EventToastStack.tsx / EventToast.tsx] — Action: Wire siege-start and siege-break events to the toast notification system. When any city belonging to the human player's faction becomes besieged or has its siege broken, show a toast (e.g., "⚠ Ironhold is under siege!" / "✓ Siege of Ironhold broken!"). | Why: Proactive notification ensures the player is alerted even if not looking at the city. | Done when: Toasts appear for siege state changes on player-owned cities.

## Risks
- **Siege sound assets may not exist.** The `sfxManager.ts` references sound files in `web/public/assets/audio/sfx/`. If no `siege_started.wav` or `siege_broken.wav` exists, a placeholder or existing sound (e.g., `city_captured` or `move`) must be aliased until assets are created.
- **`SettlementRenderer` render order.** Adding a siege overlay must respect the existing layer z-order in `MapScene` (9 container layers). The siege indicator must render above the city sprite but below selection/hover highlights. The renderer currently adds objects to `this.layer` — the siege indicator should be added after the sprite so it appears on top.
- **Performance with many cities.** Adding per-frame pulse animations for besieged cities could impact performance if many cities are sieged simultaneously. Prefer static overlays or use Phaser's tween system sparingly.
- **Replay mode fidelity.** The replay mode (`buildReplayWorldViewModel`) at line ~217 also maps `city.besieged`, but the replay data (`ReplayTurn.citySnapshots`) must include `besieged` and `turnsUnderSiege` fields. Verify `src/replay/exportReplay.ts` (line ~139) captures these fields — it does capture `besieged` but may not capture `turnsUnderSiege`.
- **Fog of war interaction.** A city's siege status should only be visible if the city is visible to the active faction (not hidden). The `CityView.visible` field already gates this at line 400, but the `SettlementRenderer` should check `city.visible` before rendering any siege indicator.

## Executor Input
Original task: Ensure that when a city is surrounded by 3 or more units it is placed "under siege" in the backend and frontend. Use "C:\Users\fosbo\war-civ-v2\.claude\commands\war-civ-v2-game-ui.md" to help you understand the frontend code.

Execution plan:
1. [web/src/game/types/worldView.ts] — Add `turnsUnderSiege?: number` to `CityView` type
2. [web/src/game/view-model/worldViewModel.ts] — Populate `turnsUnderSiege` in both play-mode and replay-mode city view builders; verify `besieged` is populated
3. [web/src/game/phaser/systems/SettlementRenderer.ts] — Add a red-tinted overlay or "SIEGE" label on besieged cities, checking `city.besieged && city.visible`
4. [web/src/ui/ContextInspector.tsx] — Add a prominent siege warning banner with duration in city overview tab
5. [web/src/app/audio/sfxManager.ts] — Add siege-start/siege-break sound detection and playback
6. [web/src/ui/EventToastStack.tsx] — Wire siege events to toast notifications for player-owned cities

Execution rules:
- Follow this plan as the default path
- Verify each completed step before moving to the next
- If the codebase contradicts the plan, explain the adjustment before proceeding