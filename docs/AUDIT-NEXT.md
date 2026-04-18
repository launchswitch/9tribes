# Next Audit Targets — 2026-04-17

Content-to-code drift patterns identified from the synergy/emergent audit. Each section describes the risk, likely findings, and scope of investigation.

---

## 1. Signature Ability JSON vs Code — AUDITED

**Status:** Most params are properly consumed. 3 fallback drift bugs found + 1 documentation-only flag.

### Per-param audit of `src/content/base/signatureAbilities.json`

| Faction | JSON Property | Consumer | Status |
|---------|--------------|----------|--------|
| desert_nomads | `endlessStride` | `movementSystem.ts` — sets movement cost to 1 | ✅ |
| desert_nomads | `desertSwarmThreshold` (3) | `preview.ts` → `factionIdentitySystem.ts` | ✅ |
| desert_nomads | `desertSwarmAttackBonus` (1) | `preview.ts` → `factionIdentitySystem.ts` | ✅ |
| desert_nomads | `desertSwarmDefenseMultiplier` (1.1) | `preview.ts` → `factionIdentitySystem.ts` | ✅ |
| savannah_lions | `stampedeBonus` (0.3) | `preview.ts` line 104 | ✅ |
| frost_wardens | `summon` + `summonDuration` + `cooldownDuration` | `factionTurnEffects.ts` | ✅ |
| hill_clan | *(empty)* | N/A | ✅ |
| jungle_clan | `venomDamagePerTurn` (3) | `environmentalEffects.ts` line 120 | ✅ |
| jungle_clan | `summon` + `summonDuration` + `cooldownDuration` | `factionTurnEffects.ts` | ✅ |
| druid_circle | *(empty)* | N/A | ✅ |
| steppe_clan | `hitAndRun` (true) | `balanceHarness.ts` only | ⚠️ Docs-only — see below |
| steppe_clan | `summon` + `summonDuration` + `cooldownDuration` | `factionTurnEffects.ts` | ✅ |
| coral_people | `tidalAssaultBonus` (0.2) | `preview.ts` line 139 | ✅ |
| coral_people | `greedyBonus` (25) | `villageCaptureSystem.ts` | ✅ but ⚠️ fallback=3 |
| coral_people | `villageCaptureDestroys` (true) | `villageCaptureSystem.ts` | ✅ |
| coral_people | `villageCaptureCooldownRounds` (3) | `villageCaptureSystem.ts` | ✅ |
| coral_people | `greedyCaptureChance` (0.5) | `captureSystem.ts` line 108 | ✅ |
| coral_people | `greedyCaptureCooldown` (4) | `captureSystem.ts` line 109 | ✅ |
| coral_people | `greedyCaptureHpFraction` (0.5) | `captureSystem.ts` line 110 | ⚠️ **fallback=0.4 ≠ 0.5** |
| coral_people | `greedyNonCombatCaptureChance` (0.4) | `activateUnit.ts` line 417 | ⚠️ **fallback=0.5 ≠ 0.4** |
| coral_people | `wallDefenseMultiplier` (2) | `preview.ts` line 286 | ✅ |
| plains_riders | `sneakAttackBonus` (0.5) | `preview.ts` line 114 | ✅ |
| plains_riders | `summon` + `summonDuration` + `cooldownDuration` | `factionTurnEffects.ts` | ✅ |

### Findings

**Bug 1 — Fallback drift on `greedyBonus`:** JSON=25, `??` fallback=3. If the registry lookup fails, village capture production drops from 25 to 3. Code reads correctly when registry works; the fallback is just dangerously wrong.

**Bug 2 — Fallback drift on `greedyCaptureHpFraction`:** JSON=0.5, `??` fallback=0.4 (`captureSystem.ts` line 110). If registry fails, captured units get 40% HP instead of 50%.

**Bug 3 — Fallback drift on `greedyNonCombatCaptureChance`:** JSON=0.4, `??` fallback=0.5 (`activateUnit.ts` line 417). If registry fails, non-combat capture chance flips from 40% to 50%.

**Design note — `hitAndRun` flag:** The `hitAndRun: true` on steppe_clan is only read by `balanceHarness.ts` for metrics classification. The actual hit-and-run combat behavior is driven by the doctrine flag `hitAndRunEnabled` (from `hitrun_t2` research), not by this JSON flag. This is not a bug but could confuse future developers.

**Action:** Fix the 3 fallback values to match the JSON definitions. Consider whether `hitAndRun` should be removed from `signatureAbilities.json` or given a mechanical role.

**Scope:** `src/content/base/signatureAbilities.json`, `src/systems/captureSystem.ts` (line 110), `src/systems/unit-activation/activateUnit.ts` (line 417), `src/systems/villageCaptureSystem.ts` (line 125).

---

## 2. Component Property Consumption

**Risk:** Medium-High. Components define combat-relevant properties that may not all reach the systems that need them.

Component JSON includes fields like `captureChance`, `captureCooldown`, `captureHpFraction`, `poisonDamagePerStack`, `accuracyBonus`, `armorPenetration`, etc. Need to verify each field is read by the appropriate system (`captureSystem.ts`, `combatSystem.ts`, `capabilitySystem.ts`).

**Likely findings:** Some component properties are read correctly, others may be declared but never switched on in combat resolution.

**Scope:** `src/content/base/components.json`, `src/systems/captureSystem.ts`, `src/systems/combatSystem.ts`, `src/systems/combat-action/preview.ts`, `src/systems/capabilitySystem.ts`.

---

## 3. ~~Dead Doctrine Flags~~ — RESOLVED

**Status:** ✅ All four flags are now wired into game systems and tested.

| Flag | Node | Consumer |
|------|------|----------|
| `forcedMarchEnabled` | charge_t1 | `preview.ts` — charge triggers without prior movement |
| `poisonBonusEnabled` | venom_t3 (foreign) | `environmentalEffects.ts` — 1.5× poison tick damage |
| `toxicBulwarkEnabled` | venom_t3 (native) | `apply.ts` (poison on hit) + `environmentalEffects.ts` (1 dmg aura to adjacent enemies) |
| `permanentStealthEnabled` | camel_adaptation_t2 | `apply.ts` — preserves stealth after attacking from desert |

**Drift note:** `toxicBulwarkEnabled` has an undocumented environmental aura (1 dmg to adjacent enemies per turn) not described in `research.json`. Consider updating the description.

**Test coverage:** `tests/doctrineFlagEffects.test.ts` (renamed from `deadDoctrineFlags.test.ts`).

---

## 4. Research Descriptions vs Hardcoded Values

**Risk:** Medium. Latent bug factory — JSON descriptions can silently drift from what the code actually does.

`resolveResearchDoctrine()` maps research node completion to boolean flags via `hasNode()`. The actual numeric values are hardcoded in game systems. Only the `description` string is consumed (by the UI). This means a researcher reading `research.json` sees one set of values while the game uses another.

**Action:** For each research node, compare the JSON `qualitativeEffect.effect` values and `description` against the hardcoded values in the consuming system. Flag any mismatches.

**Scope:** `src/content/base/research.json` (30 nodes, 10 domains), all systems that read doctrine flags.

---

## 5. Capability Domain Registry API

**Risk:** Low-Medium. The registry API is defined but never called.

`capability-domains.json` defines 13 domains. The registry API (`getCapabilityDomain`, `getAllCapabilityDomains`) is defined but never invoked anywhere. The domain IDs are only used as string keys in `capabilityPressure` maps on terrain/chassis/components. Three domains (`shock_resistance`, `desert_survival`, `endurance`) accumulate passively from terrain exposure and have no combat signal wiring.

**Action:** Decide whether the registry API should be consumed (e.g., for UI display or validation), or if it's over-engineering and should be simplified to just the string-key pattern.

**Scope:** `src/data/registry/` (registry types and loaders), `src/content/base/capability-domains.json`, any system that references capability domain IDs.

---

## Implementation Order Suggestion

1. ~~Phase 2 (dead doctrine flags)~~ — ✅ RESOLVED
2. ~~Signature abilities audit~~ — ✅ AUDITED, 3 fallback bugs fixed
3. **Research descriptions audit** — catches latent description drift
4. **Component properties audit** — medium scope, important for correctness
5. **Capability domain API** — lowest priority, architectural question
