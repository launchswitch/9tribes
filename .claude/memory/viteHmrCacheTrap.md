---
name: viteHmrCacheTrap
description: Vite HMR can cache stale versions of src/ modules imported by web/ code; edit deeper in dependency chain to force recompile
type: feedback
---

## Vite HMR Cross-Boundary Cache Trap

**What happened:** Edited `assemblePrototype.ts` (in `src/design/`) to add `productionCost` field to returned Prototype objects. The edit was correct, verified by reading the file. But the browser kept showing `productionCost: undefined` on all prototypes. Names (which use the same path) worked fine.

**Root cause:** Vite's HMR caches compiled modules. When `web/src/game/controller/GameSession.ts` imports from `src/game/buildMvpScenario.ts` which imports from `src/design/assemblePrototype.ts`, an edit to the deepest module (`assemblePrototype.ts`) doesn't always trigger a full recompile of the chain. The browser ran a cached version that lacked the new field.

**How it resolved itself:** Adding debug console.log statements at multiple levels of the call chain (`buildMvpScenario.ts`, `GameSession.ts bootstrap()`, `worldViewModel.ts`) forced Vite to invalidate and recompile the entire dependency tree. After that, `productionCost` flowed correctly.

**Why:** This is a dev-server-only issue. Production builds (`npm run web:build`) won't have this problem. But during development, it can waste significant debugging time chasing phantom bugs.

**How to apply:** If you edit a file in `src/` that's consumed by `web/` code and the change doesn't appear in the browser despite the source being correct:
1. First verify with debug logging at the point of return (like `[assemble-debug]`) that the data is correct
2. If return is correct but consumer sees stale data, it's a Vite HMR cache issue
3. Fix by either: touching any file in the import chain, adding/removing any log, or hard-refreshing the browser
4. Don't waste time re-checking type definitions, serialization, or Map operations — those aren't the problem
