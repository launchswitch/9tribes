---
name: staleJsInWebSrc
description: Stale compiled .js files in web/src/ shadow .ts sources and break Vite dev server with import resolution errors. Root cause and fix documented.
type: feedback
---

Never run `tsc` from inside `web/` — it leaves compiled `.js` files that Vite picks up instead of the `.ts` sources, causing "Failed to resolve import" errors. The web build runs `tsc -b && vite build` (from `web/package.json`), but `web/tsconfig.json` has `"noEmit": true` so tsc only type-checks. If `noEmit` is ever bypassed or removed, compiled `.js` files land in-place (no `outDir` was set), shadowing `.ts` sources.

**Preventive fix applied (2026-04-13):** Added `"outDir": "../dist-web"` to `web/tsconfig.json` so even if `noEmit` is removed, output goes to `dist-web/` at repo root instead of `web/src/`. Root `.gitignore` already has `*.js` (with `!*.config.js` exception) so stray `.js` files won't be committed.

**Why:** Vite resolves imports to the first matching file. A `GameController.js` next to `GameController.ts` wins, but the compiled `.js` has imports that don't resolve in the Vite dev server context (e.g., `../../../../src/systems/warEcologySimulation.js` points to the source `.ts`, not a compiled output).

**How to apply:** If `npm run web:dev` fails with "Failed to resolve import" for a path that clearly exists as `.ts`, check for stale `.js` files in `web/src/` and delete them: `find web/src -name '*.js' -type f -delete`.
