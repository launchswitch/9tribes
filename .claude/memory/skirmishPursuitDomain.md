---
name: skirmishPursuitDomain
description: hitrun domain redesigned from dead retreat to pursuit bonus; full progression chain documented
type: project
originSessionId: 5d6c69cc-f122-4352-8aeb-3399948fdedc
---
## Skirmish Pursuit Domain (2026-04-15)

The hitrun ability domain was redesigned from a dead "retreat" baseEffect to an active "pursuit" combat bonus.

**What changed:** Base domain "Skirmish Retreat" → "Skirmish Pursuit". Old effect ("after combat, unit retreats to safest adjacent hex") was never wired into code — no `on_combat_end` handler existed anywhere in `src/systems/`. New effect: when a unit whose faction has hitrun (native or learned) deals more damage than it receives, deals **+2 bonus damage** to defender.

**Why:** The old baseEffect duplicated T2 research ("cavalry can attack then retreat") and overlapped with cavalry's 50% HP auto-withdrawal. User chose "press the advantage" direction — offensive damage bonus when winning exchanges — as distinct from all existing mechanics.

**Full hitrun progression (after this change):**
| Tier | Effect | Scope |
|------|--------|-------|
| Base domain | +2 pursuit damage when `defenderDamage > attackerDamage` | Any unit whose faction has hitrun |
| T1 research | +1 movement after attacking (`marchingStaminaEnabled`) | All units |
| T2 research | Cavalry can attack then retreat, 1 MP cost (`hitAndRunEnabled`) | Cavalry + skirmish tags |
| T3 research | All units can retreat + ignore ZoC (`universalHitAndRunEnabled` + `hitrunZocIgnoreEnabled`) | All units |

**Implementation location:** `src/systems/combat-action/apply.ts` `applyCombatAction()`, after faction/doctrine resolution. Checks `attackerFaction.nativeDomain === 'hitrun' || attackerFaction.learnedDomains?.includes('hitrun')`. Since it's inside `applyCombatAction()` (shared by both paths), it automatically applies to both GameSession and warEcologySimulation.

**How to apply:** If adjusting pursuit balance, change `PURSUIT_BONUS` constant (currently 2). The guard requires both attacker and defender alive after initial damage exchange (`nextAttacker.hp > 0 && nextDefender.hp > 0`) so pursuit can be the killing blow.
