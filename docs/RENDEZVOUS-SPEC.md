# Squad Rendezvous System — Technical Spec

**Status:** Proposed
**Supersedes:** Phase 1 squad-wait behavior in `applyWaitForAlliesGate()`
**Related:** [NORMAL-DIFFICULTY-PLAN.md](NORMAL-DIFFICULTY-PLAN.md)

---

## Problem Recap

Normal difficulty's Phase 1 overhaul (multi-axis + squadSize=3) is causing **arrival-timing deadlock**:

1. Coordinator splits 4 hunters into 2 groups of 2 (or 3 groups of any size).
2. First unit to arrive near the target sees `committedAllies = 0`.
3. `applyWaitForAlliesGate()` demotes it to `reserve` + redirects to a regroup anchor (backward).
4. Second unit arrives alone next turn — same demotion.
5. Units never converge; the squad chases its own tail.

**Current measured impact (Phase 4 harness, 20 seeds):**
- City captures: 0 (vs Easy's 17, targeting +40% over Easy)
- Sieges started: 35 (down 57% from Easy's 81)
- Battles: 1374 (up 43%) — units bump into contact but never close.

The parameter fix (`multiAxisMinGroupSize: 3`) recovered 4 captures. Still ~76% below target.

---

## Root Cause

`applyWaitForAlliesGate()` ([src/systems/strategic-ai/assignments.ts:214](src/systems/strategic-ai/assignments.ts#L214)) and `computeLocalEngagementSnapshot()` ([src/systems/strategic-ai/assignments.ts:138](src/systems/strategic-ai/assignments.ts#L138)) compute `committedAllies` as:

```
count of aggressive-assignment allies within 2 hex of the TARGET
```

This is a **snapshot** check. It answers "are my allies already at the objective?" — which is only `true` when units move together, same turn, from adjacent starting positions. The moment units are spread (different cities, different movement speeds, different paths, exploration legacy), the snapshot is `0` for the leader, and the demotion path sends them backward to a regroup anchor — away from the allies still en route.

The demotion path is particularly corrosive:

```typescript
// assignments.ts:249-257
const fallback = nearestHex(unit.position, [local.squadAnchor, ...regroupAnchors]);
intents[unitId] = {
  ...intent,
  assignment: 'reserve',
  waypointKind: 'regroup_anchor',
  waypoint: fallback,
  anchor: fallback,
  reason: `${intent.reason}; wait_for_allies=holding_for_squad`,
};
```

The unit doesn't just wait — it **marches backward** to a regroup anchor that's often farther from the objective than the inbound allies. The gap widens every turn.

---

## Proposed Design: Squad Identity + Rendezvous Assembly

Model the AI's assault the way a real military staff does: **assemble first, attack second.** The coordinator designates a staging hex outside the objective. All squad members converge on the rendezvous. Once the squad is ready (trailing member close to rendezvous OR lead), it unlocks as a unit and flows to the target together.

### Core concepts

1. **Squad** — A group of units assigned by the coordinator to the same objective. Currently exists as `SquadPlanEntry` but is only used for engagement snapshot support.

2. **Rendezvous hex** — A staging position 3–4 hexes outside the objective on the friendly-facing side. Squad members move here *before* engaging.

3. **Squad state machine** — Each squad progresses through `assembling → ready → engaging → disbanded`.

4. **Hold-don't-retreat policy** — First-arriving units at the rendezvous stop moving and defend. They do NOT get demoted to `reserve` or redirected to a regroup anchor. They wait for the squad.

### Why this beats parameter tuning

- **Solves the root cause.** The convergence assumption is made explicit (rendezvous), not implicit (squadSize threshold).
- **Keeps Phase 1 intent.** Decisive 3-unit waves without the deadlock.
- **Legible to the player.** Visible staging = "oh shit" moment before assault. Exactly the pressure you want.
- **Composes with future work.** Asymmetric group roles (primary = siege, flank = raider) drop in cleanly — each squad gets its own rendezvous tuned to its mission.
- **Self-healing.** Staleness timeout prevents permanent freeze if a member dies mid-approach.

---

## Data Model Changes

### New fields on `UnitStrategicIntent`

File: [src/systems/factionStrategy.ts:57](src/systems/factionStrategy.ts#L57)

```typescript
export interface UnitStrategicIntent {
  // ...existing fields...
  squadId?: string;              // stamped by coordinator
  rendezvousHex?: HexCoord;      // assembly position (if squad has one)
  squadRole?: 'primary' | 'flank' | 'harass' | 'solo';
}
```

### New squad-level state (transient, per-turn)

File: `src/systems/strategic-ai/types.ts` — add:

```typescript
export type SquadPhase = 'assembling' | 'ready' | 'engaging' | 'disbanded';

export interface SquadState {
  squadId: string;
  phase: SquadPhase;
  role: 'primary' | 'flank' | 'harass' | 'solo';
  memberIds: UnitId[];
  rendezvous: HexCoord;
  objectiveHex: HexCoord;
  objectiveCityId?: CityId;
  objectiveUnitId?: UnitId;
  createdOnRound: number;
  readyOnRound?: number;
  staleOnRound: number;          // createdOnRound + SQUAD_STALE_TURNS
}
```

`SquadState` is built per turn from the coordinator's decisions and the previous turn's strategy. It is NOT persisted on `GameState` — it's recomputed each strategy pass. Persistence is achieved by reading the intents stamped on units the previous turn and reconstructing the squad map.

### Extension to `FactionStrategy` (optional, for debug)

```typescript
export interface FactionStrategy {
  // ...existing fields...
  squads?: SquadState[];  // debug/telemetry only
}
```

---

## Constants

```typescript
// In src/systems/strategic-ai/types.ts or a new rendezvous.ts
export const RENDEZVOUS_OFFSET_HEXES = 4;        // distance from objective
export const RENDEZVOUS_READY_DISTANCE = 2;      // trailing member within this of rendezvous
export const SQUAD_STALE_TURNS = 6;              // abort if not ready in this many turns
export const HOLD_DEFENSE_RADIUS = 1;            // first-arrivers defend within this radius
```

Tunable later via difficulty profile if needed — start hardcoded.

---

## Algorithm

### 1. Rendezvous selection

New helper: `computeRendezvousHex()` in `src/systems/strategic-ai/rendezvous.ts`

```
Input: objectiveHex, friendlyAnchorHex (home city or primary front), state, factionId
Output: HexCoord

Steps:
1. Draw vector from objectiveHex → friendlyAnchorHex; normalize.
2. Candidate hex = objectiveHex + normalized_vector * RENDEZVOUS_OFFSET_HEXES.
3. Snap to nearest valid hex on the grid.
4. Score candidates in a radius-1 ring around the initial candidate:
   - +2 if on defensible terrain (forest, hills)
   - -3 if in enemy ZoC
   - -2 if adjacent to enemy city
   - -5 if impassable
   - +1 per friendly unit/city within 3 hex (supply/retreat safety)
5. Return highest-scoring valid hex. If none, fall back to the initial candidate.
```

### 2. Squad construction (coordinator hook)

File: [src/systems/strategic-ai/difficultyCoordinator.ts](src/systems/strategic-ai/difficultyCoordinator.ts)

In `assignObjectiveGroup()` and its multi-axis equivalents (~lines 407–474), after selecting hunters for an objective:

```
1. Generate squadId: `sq_${factionId}_${round}_${roleTag}_${objectiveId}`
2. Compute rendezvous via computeRendezvousHex(objectiveHex, homeCity.position, ...)
3. Stamp each hunter's intent with:
   - squadId
   - rendezvousHex
   - squadRole ('primary' | 'flank' | 'harass')
   - waypoint = rendezvousHex  (NOT objectiveHex — this is the key inversion)
   - objectiveCityId / objectiveUnitId still point to the final target
   - reason: `${label} rendezvous at (${hex}) for ${objectiveId}`
```

**Critical:** `waypoint` is the rendezvous while assembling. The final objective is preserved in `objectiveCityId`/`objectiveUnitId` so the engage phase knows where to go.

### 3. Squad state reconstruction

New function: `reconstructSquads(state, factionId, previousStrategy, currentIntents)` in `src/systems/strategic-ai/rendezvous.ts`

```
1. Group current intents by squadId (from this turn's coordinator output).
2. For each group:
   a. Collect member positions.
   b. Compute `leadPos` (member closest to rendezvous) and `trailPos` (farthest).
   c. Determine phase:
      - If previousStrategy had this squad in 'engaging' → 'engaging'
      - Else if all members are dead/missing → 'disbanded'
      - Else if hexDistance(trailPos, rendezvous) <= RENDEZVOUS_READY_DISTANCE → 'ready'
      - Else if round > staleOnRound → 'disbanded' (abort)
      - Else → 'assembling'
3. Return SquadState[] keyed by squadId.
```

### 4. Replace `applyWaitForAlliesGate()` with `applySquadGate()`

New function in assignments.ts, replaces the existing wait gate:

```
For each unit with an aggressive assignment AND a squadId:
  Look up squad state.

  Case 'assembling':
    - Preserve waypoint = rendezvousHex (already stamped).
    - Do NOT demote to 'reserve'.
    - If hexDistance(unit.position, rendezvousHex) <= RENDEZVOUS_READY_DISTANCE:
        Mark unit as 'holding at rendezvous' — waypointKind = 'front_anchor', waypoint = unit.position.
        Set a defensive posture flag on the intent so activateUnit prefers hold-position behavior.
    - Else: unit continues moving toward rendezvous normally.

  Case 'ready':
    - Promote all members: waypointKind = 'enemy_city' (or 'enemy_unit'), waypoint = objectiveHex.
    - Transition squad phase to 'engaging' (stored in this turn's strategy).

  Case 'engaging':
    - Proceed normally. Optionally still check commitAdvantage per unit (but squadSize check is no longer needed — arrival was the gate).

  Case 'disbanded' (staleness abort):
    - Clear squadId from intents, reset to default assignment-driven waypoint.
    - Coordinator will re-plan next turn with fresh squad IDs.

For units WITHOUT a squadId (solo, defender, recovery, etc.):
  Apply original wait-for-allies logic (or skip entirely — these aren't squad members).
```

**This removes the pathological "demote first-arriver to reserve and march backward" path entirely for squad members.**

### 5. Activation-time hold behavior

File: `src/systems/unit-activation/activateUnit.ts` (or similar)

When a unit's intent has `squadId` AND the unit is within `RENDEZVOUS_READY_DISTANCE` of `rendezvousHex`:

- Do not move forward unless the squad phase is 'engaging'.
- Allow defensive combat if attacked (existing behavior).
- Do not pursue beyond `HOLD_DEFENSE_RADIUS` from the rendezvous.

This is a small behavior tweak in the activation pipeline — probably ~10 lines guarded on the presence of `squadId` + proximity check.

---

## Integration Points

| Concern | File | Change |
|---|---|---|
| Intent data shape | [src/systems/factionStrategy.ts](src/systems/factionStrategy.ts) | Add 3 optional fields |
| Squad types & constants | `src/systems/strategic-ai/rendezvous.ts` (NEW) | `SquadState`, `SquadPhase`, constants, `computeRendezvousHex`, `reconstructSquads` |
| Coordinator stamps squad data | [src/systems/strategic-ai/difficultyCoordinator.ts:407-474](src/systems/strategic-ai/difficultyCoordinator.ts#L407) | Add squadId + rendezvous stamping in `assignObjectiveGroup` callsites (single-axis, double-axis, triple-axis paths) |
| Wait gate replaced | [src/systems/strategic-ai/assignments.ts:214](src/systems/strategic-ai/assignments.ts#L214) | Replace `applyWaitForAlliesGate` with `applySquadGate`; keep original logic as fallback for non-squad units |
| Activation hold | `src/systems/unit-activation/activateUnit.ts` | Hold-position guard when at rendezvous and squad not ready |
| Debug telemetry | [src/systems/strategic-ai/debugReasons.ts](src/systems/strategic-ai/debugReasons.ts) | Emit `squad_phase=assembling\|ready\|engaging` per squad |

---

## Edge Cases

### Member dies mid-approach
Squad phase check sees member list shrink. If remaining members still meet `multiAxisMinGroupSize`, continue. If not, mark 'disbanded' and coordinator re-plans next turn.

### Rendezvous becomes untenable (enemy ZoC captures it)
Check on each turn: if the rendezvous hex is now in enemy ZoC, recompute. If recomputation fails three turns in a row, disband.

### Unit drawn into opportunistic combat en route
Allowed. Intent preserves `squadId` through combat resolution. Next strategy pass reconstructs squad state from surviving members.

### Staleness (assembly never completes)
Hard cap at `SQUAD_STALE_TURNS = 6`. On turn 7 without 'ready', mark 'disbanded' and clear intents. Coordinator plans a fresh assault next turn.

### Player intercepts at rendezvous
The first-arriving holder gets attacked alone. It defends with the `shouldEngageFromPosition` existing threat-assessment logic. If it dies, squad loses a member — see "Member dies mid-approach."

This is also *good emergent behavior* — a clever player can scout and break up stagings. Feels fair.

### Squad size < `multiAxisMinGroupSize` due to losses
Disband. Remaining units fall back to solo assignment rules next turn.

### Coordinator splits don't perfectly divide
Coordinator already handles unequal shares (primary gets the remainder). Squad spec doesn't care — any `memberIds.length >= 1` is valid.

### Single-axis (non-multi-axis) objectives
Still get a squadId and rendezvous. The rendezvous system is agnostic to the number of groups — it applies to any coordinator-assigned push.

---

## Rollout Plan

### Phase A — Foundation (0.5 day)
- Add `SquadState` types and constants in `rendezvous.ts`
- Add optional fields to `UnitStrategicIntent`
- Implement `computeRendezvousHex()` with terrain scoring
- Unit tests for rendezvous selection in varied terrain

### Phase B — Coordinator integration (0.5 day)
- Stamp squadId + rendezvous in single/double/triple-axis paths in `difficultyCoordinator.ts`
- Verify via debug reasons that every hunter gets a squadId
- Integration test: 4-hunter army → 2 squads of 2 with valid rendezvous hexes

### Phase C — Gate replacement (0.5 day)
- Implement `reconstructSquads()` and `applySquadGate()`
- Replace `applyWaitForAlliesGate()` callsite
- Keep old gate as fallback for non-squad intents (solo units, defenders)

### Phase D — Activation hold (0.25 day)
- Add rendezvous-hold guard in `activateUnit.ts`
- Verify units actually stop at rendezvous and don't drift into enemy ZoC

### Phase E — Validation (0.25 day)
- Run `npm run balance:validate-normal` — expect city captures ≥ Easy baseline
- Paired harness: Normal-parameter vs Normal-rendezvous across 20 seeds
- Acceptance targets:
  - City captures: +40% over Easy baseline
  - Sieges started: ≥ Easy baseline
  - Games with visible staging behavior: all seeds should show `squad_phase=assembling` logs before `squad_phase=engaging`
  - No regressions in game length (target unchanged from Phase 3)

**Total estimate: ~2 days of focused work.**

---

## Telemetry & Debugging

Each strategy pass should emit per-squad debug reasons:

```
squad=sq_red_42_primary_city_3 phase=assembling members=3 rendezvous=(12,8) objective=city_3 stale_in=4
squad=sq_red_42_flank_city_7 phase=ready members=2 rendezvous=(18,4) objective=city_7 engaging_next
```

This makes harness output legible and lets us diagnose arrival patterns quickly.

---

## Out of Scope for This Spec

Deferred work that composes naturally on top of the rendezvous system but should NOT be part of the initial build:

- **Asymmetric group roles** (primary = siege force → city, flank = raider → village). The rendezvous system makes this a 1-line change later: just vary `objectiveHex` by `squadRole`.
- **Rendezvous feints** (AI stages at a rendezvous near city A to draw defenders, then pivots to city B). Interesting but speculative.
- **Cross-squad coordination** (primary waits for flank to engage first). Tempting but adds a coupling layer; revisit after playtest feedback.
- **Persistent squad state across turns** (storing `SquadState[]` on `GameState`). Reconstructing from intents each turn is simpler and handles faction death/merge cleanly.

---

## Acceptance Criteria

The rendezvous system ships when:

1. Paired harness shows Normal city captures ≥ Easy city captures (17 in current baseline).
2. No seed produces `0` city captures over 50 turns.
3. Average `squad_phase=ready` transition occurs within 5 turns of coordinator activation.
4. No regression in game length beyond Phase 3's target (+8–12 turns).
5. Playtest report confirms visible staging behavior ("I saw them massing outside my city").
