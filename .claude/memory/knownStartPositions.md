---
name: knownStartPositions
description: Normal AI couldn't find nearby enemies — fixed with knownStartPositions parameter that reveals enemy home city locations without full fog cheat
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## Known Start Positions (2026-04-12)

**Problem:** On Normal difficulty, Druid Circle capital was 8 hexes from the player and never attacked in 19 turns. Root cause was a compound failure chain:

1. Center-biased exploration sent units in wrong direction (not toward nearby player)
2. `choosePrimaryCityObjective` had no valid target (no fog cheat, no last-seen memory, no fronts)
3. Coordinator's `getNearestEnemyCity` IS omniscient but coordinator gates (hunter floor, idleNearHome) blocked early activation
4. By the time coordinator activated, units had marched toward map center or another enemy

**Key insight:** `getNearestEnemyCity()` in `src/systems/strategic-ai/objectives.ts` bypasses fog (iterates ALL cities), but `choosePrimaryCityObjective()` does NOT — it relies on fog-gated paths. This asymmetry was the root cause.

**Fix:** New parameter `knownStartPositions: boolean` on difficulty strategy section:
- Easy: false, Normal: true, Hard: true (redundant with fogCheat)
- Two code changes (both in `src/systems/strategic-ai/objectives.ts`):
  1. `choosePrimaryCityObjective` — new fallback path finds nearest enemy home city
  2. `findDirectedExplorationWaypoint` — biases toward known enemy city positions (0.5x center bias weight)

**Why this level:** Full fogCheat (Hard) sees all units — too strong for Normal. Broader vision radius still requires units in right direction. Known start positions = "knowing Paris is the capital of France" — geographic knowledge, not military intelligence. AI still needs to scout for army composition.

**How to apply:** If Normal AI is still too passive, check whether the coordinator is actually sending hunters toward the city objective (grep strategy reasons for coordinator labels). The 0.5x enemy city bias weight in exploration can be tuned stronger.
