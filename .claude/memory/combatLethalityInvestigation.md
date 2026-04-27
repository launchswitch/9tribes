---
name: Combat Lethality Investigation
description: 5 harness-verified interventions to increase kill rate ALL failed with the same pattern — avgLivingUnits doubles every time due to snowball feedback loop
type: project
originSessionId: e218181d-0f66-491f-aeff-c799a5c30c65
---
## Investigation Results (2026-04-18)

**Problem**: 26% kill rate (293 kills / 1129 battles) too low for learn-by-kill → sacrifice → synergy pipeline.

**5 interventions tested, all FALSIFIED:**
1. Reduce MORALE_DAMAGE_FACTOR 12→6: kill rate 28.6%, avgLivingUnits 104.2
2. Defense divisor 3→5: kill rate 27.5%, avgLivingUnits 101.8
3. Defense divisor + ROUT_THRESHOLD=0: kill rate 29.2%, avgLivingUnits 105
4. Remove unsafeAfterMove + HP engage floor: kill rate 22.8%, avgLivingUnits 104.6
5. Raise unit costs 50%: kill rate 28.8%, avgLivingUnits 97.1

**Why**: avgRoutedUnits was near-zero at baseline — morale rout was already rare. The real escape is AI strategic retreat (shouldEngageFromPosition). ANY parameter perturbation breaks the fragile combat-production equilibrium: weak factions die faster, survivors inherit territory, production scales with territory. Rich-get-richer snowball dominates.

**Why this matters for future tuning**: Per-combat lethality tuning (damage, morale, HP) will NOT increase kill rate. The system needs anti-snowball mechanics (territory assimilation delay, diminishing returns on cities, production caps) before any combat parameter changes can be effective.

**Bug found**: combatSystem.ts:244-245 hardcodes `<= 25` for rout check instead of using MORALE_CONFIG.ROUT_THRESHOLD. **FIXED as of 2026-04-18** — now uses `MORALE_CONFIG.ROUT_THRESHOLD`. However, `opportunityAttackSystem.ts` line 128 still has hardcoded `<= 25` for the same rout check.

**How to apply**: If asked to tune combat lethality, explain that parameter changes are absorbed by the production feedback loop. The fix requires structural anti-snowball mechanics first, then engagement/lethality tuning can work.
