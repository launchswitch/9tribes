---
name: frontendDataDuplication
description: content JSON files duplicated in web/src/data/; domain names scattered across 5+ UI files; rename requires touching all
type: project
originSessionId: 64035bca-210b-45fc-be0f-52580fc47def
---
## Frontend Data File Duplication Pattern

Content JSON files from `src/content/base/` are **copied** (not imported) into `web/src/data/`. The web build has its own `package.json` and cannot import from `src/`.

**Confirmed duplicates:**
- `ability-domains.json` → `web/src/data/ability-domains.json`
- `pair-synergies.json` → `web/src/data/pair-synergies.json`
- `emergent-rules.json` → `web/src/data/emergent-rules.json`
- `research.json` → `web/src/data/research.json`
- `terrains.json` → `web/src/data/terrains.json`
- `civilizations.json` → referenced via help-content.ts static data

**Domain display name scattering:** A single ability domain's human-readable name appears in at least 5 places:
1. `src/content/base/ability-domains.json` (source of truth for backend)
2. `web/src/data/ability-domains.json` (frontend copy)
3. `web/src/ui/SynergyChip.tsx` (`DOMAIN_NAMES` record)
4. `web/src/ui/SynergyEncyclopediaTab.tsx` (`DOMAIN_NAMES` record, duplicated)
5. `web/src/ui/ResearchTree.tsx` (separate `{ id, name }` mapping — may differ intentionally, e.g., "Hit & Run" for research tree vs domain name)
6. `web/src/data/help-content.ts` (prose descriptions referencing the domain by name)
7. `web/src/app/routes/MenuClient.tsx` (faction picker blurbs)

**Why:** The monorepo has two independent build pipelines with no shared module boundary between `src/` and `web/`. Vite cannot resolve imports across this boundary.

**How to apply:** When renaming a domain or changing its description, grep for the old name across all of `web/src/` — don't just update the JSON copy. The SynergyChip and SynergyEncyclopediaTab have **duplicated** DOMAIN_NAMES/DOMAIN_COLORS/DOMAIN_ICONS records (not shared/exported), so both must be updated. ResearchTree.tsx uses its own name mapping that may intentionally differ (it shows research tree node names, not domain names).
