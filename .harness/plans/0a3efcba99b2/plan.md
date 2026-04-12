# Plan for: Explain why city is not showing as under siege with 2 units within 2 hexes

## Context
- Relevant files: `src/systems/territorySystem.ts`, `src/systems/siegeSystem.ts`, `src/systems/warEcologySimulation.ts`, `web/src/game/controller/GameSession.ts`, `web/src/game/view-model/worldViewModel.ts`
- What I found: The siege/encirclement detection lives in `territorySystem.ts` function `isCityEncircled()`. It requires **at least 3 enemy units** within 2 hexes (`ENCIRCLEMENT_THRESHOLD = 3`, `ENCIRCLEMENT_RADIUS = 2`). The user has only 2 units, which is below the threshold. Additionally, the web `GameSession.ts` only *reads* `city.besieged` to block production — it may not *run* siege detection at end-of-turn, meaning the flag may never get set in the live web game regardless of unit count.

## Steps
1. [src/systems/territorySystem.ts] — Action: Confirm `ENCIRCLEMENT_THRESHOLD = 3` and `ENCIRCLEMENT_RADIUS = 2` are the authoritative constants. Explain to user that 2 units is below the threshold of 3. | Why: This is the root cause — the encirclement check on line 138 requires `enemyCount >= 3`. | Done when: User understands they need 3+ units, not 2.

2. [web/src/game/controller/GameSession.ts] — Action: Search the full file for any call to `isCityEncircled`, `isCityVulnerable`, or siege detection logic during end-of-turn processing. | Why: The grep showed only *reads* of `city.besieged` (blocking production), never *writes* setting it to `true`. If siege detection is missing from the web game loop, sieges would never start regardless of unit count. | Done when: Confirmed whether web GameSession runs siege detection or delegates to `warEcologySimulation.ts` (which appears to be backend-only).

3. [web/src/game/view-model/worldViewModel.ts] — Action: Check how `besieged` status is surfaced to the UI (city view, inspector panel). | Why: Even if siege detection runs, the UI might not be rendering the siege state. | Done when: Confirmed the view model passes `besieged` through to React components.

4. [web/src/ui/ContextInspector.tsx] — Action: Verify the inspector panel actually displays siege status when `city.besieged === true`. | Why: If the UI never renders a "besieged" indicator, the user wouldn't see it even if it were set. | Done when: Confirmed siege visual indicator exists or documented its absence.

## Risks
- **Primary cause (high confidence):** The user has only 2 units. The encirclement threshold is 3. This alone explains the behavior — it is NOT a bug, it's working as designed.
- **Secondary concern (needs verification):** The web `GameSession.ts` may not implement siege detection at all — `warEcologySimulation.ts` (where siege detection lives) appears to be the backend balance simulation, not the live game. If true, sieges would never trigger in the web game regardless of how many units surround a city. This would be a real bug.
- **Defending units are irrelevant to siege triggering:** The enemy's 2 units near the city do NOT prevent the siege from starting. `isCityEncircled` only counts enemy units of the city owner. Defending units only matter for `hasDefendingGarrison()`, which blocks *capture* (when walls breach), not *siege declaration*.

## Executor Input
Original task: Explain why a city with 2 friendly units within 2 hexes of an enemy city is not showing as under siege, and whether this is a bug.

Execution plan:
1. Explain to user: The encirclement threshold is 3 enemy units within 2 hexes (`ENCIRCLEMENT_THRESHOLD = 3` in `territorySystem.ts` line 117). With only 2 units, the siege does not trigger. This is by design, not a bug.
2. Investigate whether `web/src/game/controller/GameSession.ts` actually calls siege detection during end-of-turn — if it doesn't, sieges may be completely non-functional in the web game, which would be a separate bug.
3. Check `worldViewModel.ts` and `ContextInspector.tsx` to confirm siege status is surfaced in the UI.