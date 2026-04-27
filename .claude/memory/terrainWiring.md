---
name: Terrain Wiring Pattern
description: Adding a new terrain type requires coordinated changes across data, render, and generation layers
type: project
originSessionId: 69cefc19-2865-4ee0-964a-0004c8e3ed7b
---
## Terrain Type Addition Checklist

When adding a new terrain type (e.g., "mountain" added 2026-04-13), **7+ files must be updated across 3 layers**:

### Data Layer (3 files)
1. **`src/content/base/terrains.json`** — full terrain definition (movementCost, defenseBonus, passable, ecologyTags, capabilityPressure)
2. **`src/world/map/types.ts`** — add string literal to `TerrainType` union
3. **`src/world/map/terrain.ts`** — add entry to `TERRAIN_DEFINITIONS` Record (used by movement/pathfinding validation)

### Render Pipeline (2 files)
4. **`web/src/game/phaser/assets/keys.ts`** — add TEXTURES key + `case` in `getTerrainRenderSpec()` (baseTexture + overlayTexture or fallbackColor)
5. **`web/src/game/phaser/assets/assetManifest.ts`** — add sheet/image load entry with correct frameConfig dimensions

### Map Generation (2 paths, 2+ files)
6. **`src/world/generation/generateMvpMap.ts`** — add `carveXxx()` function + call it after other carving
7. **`src/world/generation/generateClimateBandMap.ts`** — same, add carving function + call in pipeline

### Assets
8. Copy sprite PNG + .spec file to `web/public/assets/freeland/medium/terrains/`

**Why:** Each layer has its own registry/union/type that must stay in sync. Missing any one causes either a TS error (types.ts/terrain.ts), silent fallback rendering (keys.ts), or the terrain never appearing on maps (generation).

**How to apply:** Follow this checklist verbatim for any new terrain. The TERRAIN_DEFINITIONS Record is the one most commonly forgotten — it causes a frontend-only build error (`Property 'X' missing in type`).

## Current Terrain State (as of 2026-04-18)

| Terrain | Passable | Move Cost | Def Modifier | Notes |
|---------|----------|-----------|-------------|-------|
| plains | yes | 1 | 0 | default |
| forest | yes | 2 | 0.25 | |
| jungle | yes | 3 | 0.25 | |
| hill | yes | 2 | 0.5 | |
| desert | yes | 2 | -0.1 | |
| tundra | yes | 2 | 0.05 | |
| savannah | yes | 1 | 0 | |
| coast | yes | 2 | 0.1 | naval only deep water |
| river | yes | 2 | 0.05 | |
| swamp | yes | 3 | 0.25 | **aligned with jungle** |
| **mountain** | **no** | **999** | **0.75** | **impassable, rare clusters** |
| ocean | no (navalOnly) | 1 | 0 | |

### Swamp Design Decision (2026-04-13)
Swamp movement/defense now matches jungle exactly: cost 3, defenseModifier 0.25, passable true. Previously had defenseModifier 0 which made it weaker than jungle for no clear reason.

### Mountain Design Decisions (2026-04-13)
- Impassable to all land units (passable: false, movementCost: 999)
- High defensive value (defenseBonus: 2, modifier: 0.75) — good for units already stationed there
- Rare generation: ~1 cluster per 500-600 map tiles, radius 1-2 hexes
- Avoids water tiles and known start position areas
- Renders as grass base + mountain overlay (96x66 frame, Freeland 3.0 alpha spritesheet with directional neighbor blending tags)
