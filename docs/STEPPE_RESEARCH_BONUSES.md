# Steppe Clan Research Bonuses

## Faction Overview
- **Faction ID:** `steppe_clan`
- **Signature Ability Domain:** `hitrun` (Skirmish Pursuit)
- **Native Domain Tags:** `["skirmish"]`

---

## Signature Domain Base Effect

The Steppe clan's native domain is **Skirmish Pursuit**. This ability is unlocked automatically when the faction enters the game:

| Property | Value |
|----------|-------|
| **Type** | `on_combat_end` |
| **Effect** | Pursuit |
| **Bonus Damage** | +2 |
| **Condition** | When unit deals more damage than it receives |
| **Description** | Presses the advantage after winning a skirmish |

---

## Research Tier Bonuses

### T1: Hit & Run Foundation
| Property | Value |
|----------|-------|
| **Research Node ID** | `hitrun_t1` |
| **XP Cost** | 0 (free/starting) |
| **Prerequisites** | None |
| **Doctrine Flag** | `marchingStaminaEnabled: true` |
| **Description** | Reduces war exhaustion by 1 per turn |

**Effect:** Units gain +1 movement after attacking (allows repositioning after combat)

---

### T2: Hit & Run Mastery
| Property | Value |
|----------|-------|
| **Research Node ID** | `hitrun_t2` |
| **XP Cost** | 60 |
| **Prerequisites** | `hitrun_t1` |
| **Doctrine Flag** | `hitAndRunEnabled: true` |
| **Description** | Cavalry can attack then retreat in same turn |

**Effect:** Mounted units (role: `mounted`) can perform hit-and-run tactics — attack an enemy and retreat in the same turn without being attacked back.

---

### T3: Hit & Run Transcendence
| Property | Value |
|----------|-------|
| **Research Node ID** | `hitrun_t3` |
| **XP Cost** | 100 |
| **Prerequisites** | `hitrun_t2` |

#### Native Faction Effect (Steppe Clan is native):
| Property | Value |
|----------|-------|
| **Doctrine Flag** | `universalHitAndRunEnabled: true` |
| **Native Description** | All units can attack then retreat |

**Effect:** ALL unit types (not just cavalry) gain the ability to attack then retreat in the same turn. This is the native T3 transcendence bonus — no zone-of-control constraints.

#### Foreign Faction Effect (if another faction researches hitrun):
| Property | Value |
|----------|-------|
| **Doctrine Flag** | `hitrunZocIgnoreEnabled: true` |
| **Effect Key** | `hitAndRunIgnoresZoc: true` |
| **Description** | Units with hitrun ignore zone of control |

**Effect:** Units that have hitrun abilities can ignore zone-of-control penalties when retreating after attacking.

---

## Summary Table

| Tier | Node ID | XP Cost | Doctrine Flag | Primary Effect |
|------|---------|---------|---------------|---------------|
| T1 | `hitrun_t1` | 0 | `marchingStaminaEnabled` | +1 movement after attacking |
| T2 | `hitrun_t2` | 60 | `hitAndRunEnabled` | Cavalry can attack then retreat same turn |
| T3 (Native) | `hitrun_t3` | 100 | `universalHitAndRunEnabled` | ALL units can attack then retreat same turn |
| T3 (Foreign) | `hitrun_t3` | 100 | `hitrunZocIgnoreEnabled` | Hitrun units ignore zone of control |

---

## Implementation References

- **Domain Definition:** `src/content/base/ability-domains.json` → `hitrun` entry
- **Research Nodes:** `src/content/base/research.json` → `hitrun_t1`, `hitrun_t2`, `hitrun_t3`
- **Doctrine Resolution:** `src/systems/capabilityDoctrine.ts` → `resolveResearchDoctrine()` function
- **Hit & Run Usage:** `src/systems/balanceHarness.ts` → line 330 (`prototype.derivedStats.role === 'mounted'`)