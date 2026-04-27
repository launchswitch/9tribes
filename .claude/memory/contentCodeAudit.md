---
name: content-code-audit
description: 2026-04-17 audit phases 3-5 done. 23 dead synergies wired, 5 emergent rules wired, orphan frost/bear types removed, applyMovementSynergies removed
type: project
originSessionId: aaddf224-d5b9-4dce-8363-dd16a1d3f70f
---
## Content-to-Code Audit (2026-04-17)

Full audit file at `AUDIT-2026-04-17.md` in project root.

### Completed Phases

- **Phase 1** (bugs): E6 rough terrain fix, R5 phantom ZoC, S25 nativeFaction — done prior
- **Phase 2** (dead research): 4 doctrine flags — done prior
- **Phase 3** (23 dead synergies): All wired with case handlers in `applySynergyEffect()`, tested in `tests/synergyEffects.test.ts`
- **Phase 4** (5 emergent rules): All wired — see below
- **Phase 5** (cleanup): `applyMovementSynergies()` removed, 17 orphan frost/bear types removed from `SynergyEffect` union and handlers, dead checks removed from `synergyRuntime.ts`

### Phase 4 Emergent Rule Wiring

| Rule | Properties Wired | Location |
|------|-----------------|----------|
| **Anchor** (zone_of_control) | +defense, antiDisplacement, healPerTurn (+3 HP/turn to all faction units in healing system) | `synergyEffects.ts`, `healingSystem.ts` |
| **Terrain Assassin** (permanent_stealth) | terrain types passed through preview.details, checked in `apply.ts` stealth-break logic | `synergyEffects.ts`, `apply.ts` |
| **Slave Empire** (slave_empire) | captureChanceBonus (+0.20) passed to `attemptCapture()`, slaveProductionBonus (+50%) in `factionTurnEffects.ts` production | `synergyEffects.ts`, `apply.ts`, `captureSystem.ts`, `factionTurnEffects.ts` |
| **Desert Raider** (desert_raider) | desertCaptureBonus (+0.30) passed to `attemptCapture()`, alliedDesertMovement (cost=1 on desert) in `movementSystem.ts` | `synergyEffects.ts`, `apply.ts`, `captureSystem.ts`, `movementSystem.ts` |
| **Paladin** (sustain) | healPercentOfDamage (50% heal), minHp floor (survive lethal at 1 HP) | `synergyEffects.ts`, `apply.ts` |

Tests: `tests/emergentRules.test.ts` (10 tests)

### Remaining Work

- Phase 1 bugs (E6 rough terrain, R5 phantom ZoC, S25 nativeFaction) may still need attention
- Phase 2 dead research flags still need wiring or JSON updates
- `research.json` effect values remain documentation-only (long-term: code should read from JSON)

**Why:** Content was written ahead of code implementation. All synergy handlers and emergent rule mechanics are now wired.

**How to apply:** When adding new content effects, add case handler in `applySynergyEffect()` AND consume the CombatResult fields in `apply.ts`. Follow the pattern: set fields on CombatResult in synergyEffects → pass through CombatActionPreviewDetails → consume in apply.ts.
