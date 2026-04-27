---
name: prototypeSourceRecipeId
description: sourceRecipeId is the canonical discriminator for prototype types — undefined=starting, 'settler'=settler, recipe_id=unlock. Used by isUnlockPrototype() and multiple systems.
type: project
---

`Prototype.sourceRecipeId` distinguishes prototype origin:
- `undefined` → starting prototype (created in `buildMvpScenario.ts`, identity seeds)
- `'settler'` → settler prototype (special case, also created at scenario build)
- Any other string → unlock prototype (from `hybrid-recipes.json`, created by `hybridSystem.ts`)

**Why:** The codebase needed a way to gate the domain mastery cost modifier to only affect "new technology" units, not starting units factions already know how to build. No `isStarting` boolean exists — `sourceRecipeId` presence is the existing mechanism.

**How to apply:** Use `isUnlockPrototype(prototype)` from `knowledgeSystem.ts` when gating behavior to unlock prototypes only. It checks `!!sourceRecipeId && sourceRecipeId !== 'settler'`. Do not add new boolean flags — this field already serves the purpose.
