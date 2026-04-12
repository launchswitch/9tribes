# Sub-Task Progress

Total steps: 4

## Status

- Step 1: completed — Confirm `ENCIRCLEMENT_THRESHOLD = 3` and `ENCIRCLEMENT_RADIUS = 2` are the autho
- Step 2: completed — Search the full file for any call to `isCityEncircled`, `isCityVulnerable`, or s
- Step 3: pending — Check how `besieged` status is surfaced to the UI (city view, inspector panel).
- Step 4: pending — Verify the inspector panel actually displays siege status when `city.besieged ==

## Step Details
_(filled in as steps complete)_

### Step 1: COMPLETED
- **Turns used**: 1
- **Tokens**: 3717 in / 240 out
- **Files modified**: (none)
- **Summary**: Based on the code in `src/systems/territorySystem.ts`, the authoritative constants are:

- **`ENCIRCLEMENT_THRESHOLD = 3`** (line 138)
- **`ENCIRCLEMENT_RADIUS = 2`** (line 139)

The `isCityEncircled` function (lines 144–153) counts enemy units within `ENCIRCLEMENT_RADIUS` (2 hexes) of the city and requires `enemyCount >= ENCIRCLEMENT_THRESHOLD` (3) to return `true`.

**Your 2 units are below the threshold of 3.** This is not a bug — the siege system is working as designed. You need **3 or more*

### Step 2: COMPLETED
- **Turns used**: 8
- **Tokens**: 79598 in / 1507 out
- **Files modified**: (none)
- **Summary**: Here are the findings from my search:

**The web `GameSession` never runs siege detection.** This is the real bug.

Specifically:
1. `warEcologySimulation.ts` (line 1714-1727) is where `besieged = true` gets set — it calls `isCityEncircled()` and writes the flag.
2. The web `GameSession.ts` has **zero imports** of `warEcologySimulation`, `siegeSystem`, or `isCityEncircled`.
3. `GameSession.ts` only **reads** `city.besieged` (lines 861, 891) to block production — it never writes it.
4. There is *
