---
name: prototypeCostPaths
description: Production costs are now unified via Prototype.productionCost override — single source of truth replacing the old 3-path split
type: architecture
originSessionId: 64035bca-210b-45fc-be0f-52580fc47def
---
## Cost Unification via productionCost Override (2026-04-15)

**Old problem:** Three disconnected cost systems produced different numbers:
- UI displayed `UNIT_COSTS` table values (infantry=20)
- GameSession used hardcoded switch (infantry=8)
- AI used calculatePrototypeCost with mastery modifier

**Solution:** Added `productionCost?: number` to `Prototype` interface. Now all cost consumers check this first:

| Consumer | File | Priority |
|----------|------|----------|
| Human queue | `GameSession.getPrototypeCost()` in `sessionUtils.ts` | `prototype.productionCost ?? switch(chassisId)` |
| AI queue | `aiProductionStrategy.ts` `getProductionCostForPrototype()` | Uses `calculatePrototypeCost()` reading base from `getUnitCost()` — **does NOT check `prototype.productionCost`** (missing from Pick type) |
| UI display | `cityInspectorViewModel.ts` (moved from worldViewModel.ts) | `prototype.productionCost ?? getUnitCost()` then mastery modifier |

**Where overrides come from:**
- Starting units: `civilizations.json` → `startingUnits[].costOverride` → threaded through `buildMvpScenario.ts` → `assemblePrototype(options.productionCost)`
- Unlock prototypes: `hybrid-recipes.json` → `recipe.costOverride` → threaded through `hybridSystem.ts` → `assemblePrototype(options.productionCost)`
- No override: falls back to `UNIT_COSTS[chassisId]` table (for display) or hardcoded switch (for human queue)

**Cost scale established this session:**
- Early (starting): 9–14 prod (faction-specific, stronger = more expensive)
- Mid (unlock): 14–22 prod (2 components, mid chassis)
- Late (unlock): 18–34 prod (3+ components, late/heavy chassis)
- Culture shock still applies 2.0x/1.5x/1.2x on first few builds of unlock prototypes

**Why:** User wanted faction-specific costs so powerful factions (Arctic Wardens, Savannah Lions) pay more for their strong units. Also fixed the UI showing wrong costs entirely.

**How to apply:** When adding a new unit (starter or hybrid), always set `costOverride` in the content JSON. Don't rely on chassis defaults. Check both `GameSession.getPrototypeCost()` AND `cityInspectorViewModel.ts` production display — they must agree. Note: AI cost path (`aiProductionStrategy.ts`) does NOT see `productionCost` overrides — only human player and UI do.
