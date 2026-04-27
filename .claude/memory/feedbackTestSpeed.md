---
name: feedbackTestSpeed
description: User requires fast test iteration; balance harness and other slow suites must be opt-in
type: feedback
---

`npm test` must complete in under 2 minutes for rapid iteration. Heavy simulation tests (balance harness, etc.) must be excluded from the default run and invokable via explicit scripts like `npm run test:balance`.

**Why:** User said "testing took 40 minutes, that's not sustainable as I rapidly iterate this game." The balance harness alone was 15 minutes.

**How to apply:** When adding new test files that run full game simulations, put them in the vitest.config.ts exclude list and add a dedicated npm script. Reduce simulation sizes (seeds × turns) to the minimum needed for the assertion being tested.
