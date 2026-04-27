---
name: testInfrastructurePatterns
description: Common test failure patterns in war-civ-v2: prototype injection for changed starting units, web imports in node vitest, buildMvpScenario size overrides
type: reference
originSessionId: 64035bca-210b-45fc-be0f-52580fc47def
---
## Test Infrastructure Patterns (2026-04-13)

### 1. Missing prototypes after starting unit changes

When `civilizations.json` starting units change (e.g., steppe_clan lost `cavalry_frame`), tests that call `buildMvpScenario` and then `getPrototypeByChassis(state, factionId, 'cavalry_frame')` will fail because prototypes are only created from starting units.

**Fix pattern:** Use `assemblePrototype` to inject missing prototypes:
```typescript
import { assemblePrototype } from '../src/design/assemblePrototype';
// If prototype doesn't exist, create and register it
const prototype = assemblePrototype(factionId, 'cavalry_frame', ['basic_bow', 'skirmish_drill'], registry);
state.prototypes.set(prototype.id, prototype);
```

**Affected test files:** adaptiveAiPhase2.test.ts, economy.test.ts, movementSystem.test.ts, production.test.ts, productionSystem.test.ts

### 2. Web imports fail in node vitest

Tests that import from `../web/src/` (GameSession, serializeGameState, worldViewModel, etc.) fail at module resolution in node environment because they pull in React/Phaser/browser APIs.

**Current fix:** Excluded in `vitest.config.ts` exclude array. These tests would need a separate vitest config to run, but the balance test config (`vitest.config.test.ts`) uses `environment: 'node'` (not jsdom):
- webGameSession.test.ts, webGameController.test.ts, webWorldViewModel.test.ts, curatedPlaytest.test.ts, liveSessionParity.test.ts

`balanceHarness.test.ts` is also excluded from `npm test` (takes ~34s standalone). Run via `npm run test:balance` which uses `vitest.config.test.ts` (inclusive config with `globals: true`).

### 3. buildMvpScenario size override quirk

`buildMvpScenario` defaults `mapSize` to `'medium'` (50x38), which overrides `balanceOverrides.scenario` dimensions via the `??` fallback chain. Fixed: when `balanceOverrides.scenario` is present, `mapSize` is left undefined so scenario dimensions are used.

### 4. Content data vs test expectations

When chassis/content JSON values change (e.g., `ranged_frame.baseRange` 2→1), test expectations must be updated in:
- `tests/prototype.test.ts` (calculatePrototypeStats)
- `tests/content.test.ts` (registry content checks)
- `tests/territory.test.ts` (getHexesInRange uses Chebyshev = 25 at radius 2, not hex = 20)
