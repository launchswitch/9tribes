---
name: Fog Visibility Render Gap
description: All entity renderers gate on entity.visible; view model distinguishes friendly (explored+) vs enemy (visible-only) using playerFactionId not activeFactionId
type: feedback
---

**Rule:** Every map renderer that draws entities MUST gate on `entity.visible` from the WorldViewModel. The view model computes `visible` with faction awareness: friendly entities show on `'visible'` or `'explored'` hexes, enemy entities show ONLY on `'visible'` (currently in LOS) hexes. The friendly/enemy determination MUST use `playerFactionId`, never `state.activeFactionId`.

**Why:** Three layers of fog bugs, each fixed in sequence:
1. Renderers ignored the `visible` flag entirely (fixed 2026-04-13)
2. `buildHexVisibilityMap` used `activeFactionId` instead of `playerFactionId` for fog data lookup (fixed 2026-04-15)
3. The friendly/enemy branch in visibility check used `state.activeFactionId` instead of `source.playerFactionId` (fixed 2026-04-16) — this was the "enemies gradually appear through fog" bug

Bug #3 was subtle: the fog map was correctly built from `playerFactionId`, but the ternary `unit.factionId === state.activeFactionId` used the cycling AI faction ID. During AI turns, AI units matched `activeFactionId`, were treated as "friendly", and appeared on explored hexes. More hexes become explored over time → more enemy units leaked through.

**How to apply:** If entities show through fog:
1. Check the renderer has `if (!entity.visible) continue;`
2. Check the view model uses `source.playerFactionId` (NOT `state.activeFactionId`) for the friendly/enemy ternary
3. Check `buildHexVisibilityMap` receives `playerFactionId` as second arg
4. All four entity types (units, cities, villages, improvements) must use the same pattern
5. Affected files: `worldViewModel.ts` (4 visibility checks), `UnitRenderer.ts`, `SettlementRenderer.ts`, `ImprovementRenderer.ts`

**Fix history:**
- 2026-04-13 — renderer guards + faction-aware visibility
- 2026-04-15 — `buildHexVisibilityMap` uses `playerFactionId`
- 2026-04-16 — visibility ternary uses `source.playerFactionId` instead of `state.activeFactionId`; added `onAiComplete` callback so UI re-renders when AI turns finish (was missing `emit()` after setTimeout chain)
