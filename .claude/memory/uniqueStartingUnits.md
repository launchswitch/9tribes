---
name: uniqueStartingUnits
description: All 9 factions have unique faction-identity starting units; no generic spear+simple_armor/bow+simple_armor loadouts remain. Design principle: mid-game hybrid must strictly upgrade over starter.
type: project
originSessionId: 69cefc19-2865-4ee0-964a-0004c8e3ed7b
---
## Unique Starting Units Overhaul (2026-04-15)

**What changed:** Every faction's `startingUnits` in `civilizations.json` now uses faction-specific components instead of the generic `basic_spear + simple_armor` / `basic_bow + simple_armor` that 7 of 9 factions shared.

### Faction-by-Faction Loadouts

| Faction | Melee Components | Ranged Components | Identity Theme |
|---------|-----------------|-------------------|----------------|
| Jungle Clan | spear + **venom_rites** | bow + **poison_arrows** | Fragile poison attrition |
| Druid Circle | spear + **druidic_rites** | bow + simple_armor (unchanged) | Tanky sustain (+2 HP) |
| Steppe Riders | spear + **skirmish_drill** | bow + skirmish_drill + **light_mount** | Speed raiders (melee MOV 3, ranged MOV 4) |
| Hill Engineers | spear + **fortress_training** | bow + simple_armor (unchanged) | Immovable object (DEF 5) |
| Pirate Lords | **pirate_collar** + armor | pistol + armor (already unique) | Capture over kill (50% capture) |
| Desert Nomads | spear + **desert_forged** | bow + simple_armor (unchanged) | Hardened camel (+1 all stats) |
| Savannah Lions | spear + **shock_drill** | bow + simple_armor (unchanged) | Glass cannon shock (ATK 7) |
| River People | spear + **rivercraft_training** | naval + spear (already unique) | Amphibious speed (both MOV 3) |
| Arctic Wardens | spear + **frost_forge** | bow + **cold_provisions** | Protoss elite (best-in-class stats) |

### Faction-Specific Names & Costs (2026-04-15 update)

Starting units now have **custom names** and **cost overrides** in `civilizations.json`:

```json
{ "chassisId": "infantry_frame", "componentIds": ["basic_spear", "frost_forge"],
  "name": "Frost Guard", "costOverride": 12, "positionOffset": { "q": 0, "r": 1 } }
```

These thread through: `buildMvpScenario.ts` → `assemblePrototype(options.name, options.productionCost)` → stored on Prototype entity. The UI shows the custom name (not auto-generated "Infantry Frame [Basic Spear] [Frost Forge]") and the override cost (not chassis default).

**Full name/cost table (verified 2026-04-18):**

| Faction | Unit | Name | Cost |
|---------|------|------|------|
| Jungle Clans | infantry+spear+venom | Venom Spearman | 20 |
| Jungle Clans | ranged+bow+poison | Venom Archer | 23 |
| Druid Circle | infantry+spear+druidic | Druid Guardian | 20 |
| Druid Circle | ranged+bow+armor | Druid Archer | 20 |
| Steppe Riders | infantry+spear+skirmish | Steppe Warrior | 17 |
| Steppe Riders | ranged+bow+skirmish+light_mount | Horse Archer | 23 |
| Hill Engineers | infantry+spear+fortress | Hill Defender | 21 |
| Hill Engineers | ranged+bow+armor | Hill Archer | 20 |
| Pirate Lords | infantry+collar+armor | Boarding Party | 20 |
| Pirate Lords | ranged+pistol+armor | Pistol Gunner | 23 |
| Desert Nomads | ranged+bow+armor | Desert Archer | 20 |
| Desert Nomads | camel+spear+desert | Camel Warrior | 23 |
| Savannah Lions | infantry+spear+shock | Shock Infantry | 21 |
| Savannah Lions | ranged+bow+armor | Lion Scout | 20 |
| River People | infantry+spear+rivercraft | River Infantry | 20 |
| River People | naval+spear+armor | River Galley | 16 |
| Arctic Wardens | infantry+spear+frost | Frost Guard | 23 |
| Arctic Wardens | ranged+bow+cold | Ice Archer | 15 |

**Files modified (naming pass):** `src/content/base/civilizations.json`, `src/features/prototypes/types.ts`, `src/design/assemblePrototype.ts`, `src/game/buildMvpScenario.ts`, `web/src/game/controller/GameSession.ts`, `web/src/game/view-model/worldViewModel.ts`

**Files modified this session (hybrid costs):** `src/content/base/hybrid-recipes.json` (all 19 recipes), `src/data/registry/types.ts`, `src/systems/hybridSystem.ts`

**Why:** User wanted cultural identity on units. Generic loadouts made factions feel samey despite distinct passives/summons/hybrids.

**How to apply:** When adding a new faction, its starter components should preview its hybrid progression and passive mechanics. Don't default to basic_spear/simple_armor.

### Design Principle Discovered: Mid-Game Must Upgrade Over Starter

While implementing Arctic Wardens, we caught that their mid-game hybrid (`ice_defenders`: bow + cold_provisions) produced **identical stats** to the proposed starter ranged (bow + cold_provisions). Zero progression = broken.

**Fix:** Renamed to "Frost Reaver", added `frost_forge` armor component for +1 ATK upgrade over starter.

**Rule:** When designing a faction's starting units alongside their mid-game hybrid, verify the hybrid is a strict stat or capability upgrade. If they're identical, the hybrid needs another component or the starter needs to be toned down.

### User Preference: Protoss-Style Elite Design

For Arctic Wardens specifically, user explicitly requested "Protoss from StarCraft" design: slow, expensive to produce, strong individual units. This meant:
- Best raw stats across the board (not just tanky)
- Both starters upgraded (melee AND ranged, not just melee)
- Mid-game adds elite component (`frost_forge`) rather than sidegrade
- No gimmick rules — pure stat superiority is the identity

### Full Progression Audit (2026-04-15)

After starting unit overhaul was complete, ran full Start→Mid→Late audit across all 9 factions. Computed final stats as `chassis base + sum(component bonuses)` for HP/ATK/DEF/MOV/RNG.

**4 issues found and fixed:**

| Faction | Unit | Problem | Fix |
|---------|------|---------|-----|
| Jungle Clans | Serpent Priest (late) | 3 ATK < starter Poison Archer's 5 ATK | Replaced blowgun+druidic_rites → druidic_missiles+venom_grenades+jungle_mask (6 ATK / 5 DEF) |
| Arctic Wardens | Polar Priest (late) | ≤ Frost Reaver (mid), lost frost_forge | Changed chassis to heavy_infantry_frame + spear+frost_forge+cold_provisions (16 HP / 6 ATK / 7 DEF) |
| Savannah Lions | War Chariot (mid) | 6 ATK < starter Shock Infantry's 7 ATK | Bumped chariot_bow attackBonus 2→3 |
| Desert Nomads | Camel Lancers (mid) | All stats below starter camel (-1 HP/-1 ATK/-1 DEF) | Swapped simple_armor→desert_forged |

**5 factions passed cleanly:** Steppe Riders, Hill Engineers, Pirate Lords, River People, Druid Circle.

**Audit method:** For each faction, compute final stats of every tier unit using chassis base + component sums. Compare late vs mid vs start on ATK primary, then HP/DEF secondary. A late unit must not be weaker than a mid or start unit in its primary role. Role changes (e.g., melee→siege, land→naval) are acceptable if the new capability is genuinely stronger for its purpose.

**Files modified this pass:** `src/content/base/hybrid-recipes.json` (3 recipes), `src/content/base/components.json` (chariot_bow)
