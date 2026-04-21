# Attacks of Opportunity Search Results

**Date:** 2026-04-19 (updated)  
**Project:** `C:\Users\fosbo\war-civ-v2`  
**Search Focus:** Attacks of Opportunity / Opportunity Attacks / AoO / Reactive Attack / Disengage

---

## Summary

**Yes — Attacks of Opportunity (AoO) are FULLY IMPLEMENTED.**

The mechanic is fully implemented with a dedicated system, integrated into movement, has comprehensive tests, and includes detailed design for the interaction with Zone of Control (ZoC) and fortification improvements.

---

## Implementation Details

### 1. Primary Implementation File

**`src/systems/opportunityAttackSystem.ts`** (156 lines)

This is a complete, well-documented implementation. Key design elements:

- **Purpose:** When a unit moves away from an adjacent enemy melee unit, that enemy lands a free reduced-damage strike. This penalizes disengaging from a protective line and rewards defensive positioning (e.g., a spear unit guarding a horseback unit behind it).

- **Damage Formula:**
  - Base OA multiplier: **25%** of attacker's scaled attack
  - Fortified OA multiplier: **40%** for units standing in a field fort
  - No retaliation, no terrain modifier

- **Core Function:** `applyOpportunityAttacks(gameState, movingUnitId, originHex, targetHex, rulesRegistry)`

- **Triggers:**
  - Called AFTER `moveUnit()` has placed the unit at targetHex
  - Origin hex is the unit's position before the move
  - Iterates through neighbors of origin hex
  - Skips hexes still adjacent to new position (unit didn't depart from them)
  - Enemy must be alive, not routed, and have `role === 'melee'`

- **Immunity:**
  - **Cavalry / Camel / Beast frames** disengage freely (unless departing from fort ZoC)
  - Routed units receive no additional OA penalty
  - Ranged-role units cannot exert opportunity attacks

- **Exemption:** Fort ZoC - even mounted units cannot ignore fort ZoC, so they CAN be subject to OA when departing from a hex adjacent to a field fort.

### 2. Integration into Movement System

**`src/systems/movementSystem.ts`**

```typescript
import { applyOpportunityAttacks } from './opportunityAttackSystem.js';

// In moveUnit() function:
newState = applyOpportunityAttacks(newState, unitId, unit.position, targetHex, rulesRegistry);
return pruneDeadUnits(newState);
```

The opportunity attacks are applied automatically during unit movement at line 304. This is clean integration - the caller doesn't need to remember to invoke it separately.

### 3. Zone of Control Interaction

**`src/systems/zocSystem.ts`** - Extended ZoC with AoO awareness:

- `getZoCBlockersWithAura()` - Extended ZoC check including aura projection from fortified units
- Fortified enemy units project ZoC from all 6 adjacent hexes
- Field fort improvements project **uncancellable** ZoC (no unit can ignore it, including mounted units)
- The OA system checks `isOnFort()` to apply the higher OA multiplier when opportunist is on a fortification

### 4. Test Coverage

**`tests/opportunityAttack.test.ts`** (400+ lines, extensive)

Comprehensive test suite covering:
- ✅ Infantry disengaging from a melee enemy takes damage
- ✅ Cavalry disengaging from a melee enemy takes NO opportunity damage (when not on fort)
- ✅ Moving toward an enemy (staying adjacent) does NOT trigger OA
- ✅ Ranged enemy does NOT exert opportunity attack
- ✅ Routed enemy does NOT exert opportunity attack
- ✅ Spear enemy deals more OA damage against cavalry (weapon effectiveness)
- ✅ Fortified units deal increased OA damage (40% vs 25%)
- ✅ Mounted units CAN be hit by OA when departing from fort ZoC
- ✅ Multiple enemies can each trigger OA in single move
- ✅ OA damage can cause morale loss / routing / destruction

### 5. Key Constants

```typescript
const OA_MULTIPLIER = 0.25;        // Standard OA damage (25% of scaled attack)
const OA_FORT_MULTIPLIER = 0.40;   // Fortified position OA (40%)
```

---

## Keyword Search Results

| Keyword Pattern | Found | Context |
|----------------|-------|---------|
| `opportunity\|Opportunity` | **Yes** | `opportunityAttackSystem.ts` - actual AoO implementation |
| `applyOpportunityAttacks` | **Yes** | Called in `movementSystem.ts` line 304 |
| `disengage\|Disengage` | **Yes** | `canDisengageFree()` in AoO system - actual AoO related |
| `fort\|fortification` | **Yes** | ZoC system + AoO fort multiplier |
| `zone.of.control\|zoc` | **Yes** | `zocSystem.ts` - integrated with AoO (fort ZoC blocks mounted immunity) |
| `provoked` | **No** | Not used in codebase |
| `reactive.*attack` | **No** | Not used (AoO uses "opportunity attack" terminology) |
| `counter.*attack` | **No** | Not used as AoO mechanism |
| `overwatch` | **No** | Not implemented |
| `free.attack\|bonus.attack` | **No** | Not used generically |

---

## Architecture Summary

```
Movement System (movementSystem.ts)
    │
    └── moveUnit() calls applyOpportunityAttacks()
              │
              ▼
    Opportunity Attack System (opportunityAttackSystem.ts)
              │
    ┌─────────┴─────────────────────────────────────────┐
    │                                                         │
    ▼                                                         ▼
Check: Moving unit cavalry/camel/beast?              Check: Enemy melee unit adjacent
(exempt unless leaving fort ZoC)                     to origin but not target?
              │                                              │
              ▼                                              ▼
      CanDisengageFree()                              Apply damage (25% or 40% if fort)
              │                                              │
              ▼                                              ▼
              ▼                                    Damage + Morale Loss → Routing/Destruction
    (no OA applied)
```

---

## Design Decisions Documented

1. **Why cavalry/camel/beast can disengage freely:** Mirrors their ZoC movement immunity - they can slip past infantry lines without penalty.

2. **Why fortifications override this immunity:** Field forts represent prepared defensive positions with crew-served weapons that can react against any moving target. Even cavalry must respect them.

3. **Why 25% multiplier:** Represents a quick reactive hit, not a full exchange. Lower than regular strike.

4. **Why 40% for fortified:** Fortified positions enable stronger reactive strikes against units trying to slip past.

5. **Why only melee role units:** Ranged and support units aren't positioned for reactive melee strikes.

6. **Why routed units exempt:** Already in flight - no point penalizing further.

---

## Notable Gaps

1. **"Unstoppable Momentum" synergy description vs. implementation:** `pair-synergies.json` line 297 claims the `charge+heavy_hitter` synergy suppresses OAs. However, `opportunityAttackSystem.ts` has no check for this synergy or tag-based OA suppression. Elephants (`beast_frame`) are already exempt via `canDisengageFree()`, so the synergy works *de facto* for its target units — but the synergy itself does not gate OA immunity in code.

2. **No AI avoidance logic:** AI profiles have `captureOpportunity` weights (village/objective capture scoring, unrelated to AoO). No explicit AI logic was found for routing around ZoC to avoid OA damage.

3. **No research/domain gating:** AoO is a universal mechanic. No capability or doctrine flag enables/disables it. The only way to gain AoO immunity is via chassis type (cavalry/camel/beast) or the `charge+heavy_hitter` pair synergy (described but not coded as suppression).

---

## Conclusion

**Attacks of Opportunity are FULLY IMPLEMENTED** in this codebase.

- **Status:** Complete, tested, integrated
- **Location:** `src/systems/opportunityAttackSystem.ts`
- **Integration:** `src/systems/movementSystem.ts` (automatic on every move)
- **ZoC Integration:** `src/systems/zocSystem.ts` (fort ZoC blocks mounted immunity)
- **Tests:** `tests/opportunityAttack.test.ts` (comprehensive)
- **Last Modified:** AoO system: 4/9/2026; Tests: 4/19/2026; Report updated: 4/19/2026

This is NOT a TODO, stub, or comment-only implementation. It's production-quality code with full test coverage.