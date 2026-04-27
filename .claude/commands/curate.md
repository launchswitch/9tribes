# /curate - Disciplined War-Civ Memory Curation

Update `.claude/memory/` with only durable knowledge that will help future sessions work better.

## Phase 1: Scope This Session

Identify the files, systems, and decisions touched in this session.

Prefer concrete names:
- files: `web/src/app/audio/sfxManager.ts`, `src/systems/aiTactics.ts`
- systems: combat, AI, fog, terrain, SFX, UI state, serialization
- decisions: "feedback should flow through GameSession", "do not bypass deterministic sim path"

If no implementation or durable decision happened, say that no memory update is needed.

## Phase 2: Check Current Code Shape

Before reading source, use `.slim/`:

1. Read `.slim/digest.md` for recent architectural changes.
2. Use `.slim/symbols.json` to check exports and signatures for files involved.
3. Use `.slim/imports.json` to check dependency and blast-radius claims.
4. Read source files only after `.slim` narrows the target.

Memory must not duplicate `.slim`. If the fact can be regenerated from symbols/imports, do not save it unless it encodes a workflow or trap.

## Phase 3: Targeted Staleness Verification

Only verify memories that might be stale.

1. Scan `.claude/memory/` for memories referencing this session's touched files or systems.
2. For flagged memories:
   - Check whether referenced files changed after the memory was written.
   - Spot-check specific claims such as function names, fields, rules, or file paths.
   - If a claim conflicts with `.slim` or source, current code wins.
3. Outcomes:
   - Still accurate: leave it alone.
   - Partially stale: update the memory with the current rule.
   - Obsolete: mark it stale or remove it from the index.

Do not run a repo-wide audit unless the user explicitly asks.

## Phase 4: Extract New Durable Knowledge

Add or update memory only when it would change a future implementation decision.

Capture:
- Architecture decisions: "X owns state; Y only derives view data."
- Cross-path requirements: "Feature A must be wired into GameSession and simulation."
- Repeated traps: "Map fields must be serialized explicitly."
- Testing workflows: "Use paired normal-vs-hard fixtures for difficulty tuning."
- User preferences that affect work: "Prefer practical, repo-specific fixes over generic frameworks."
- Failed approaches that are likely to be retried.

Skip:
- Export lists, import lists, file inventories, and line maps.
- Temporary debugging status.
- Completed one-off bugs unless the bug reveals a reusable trap.
- Generic statements like "combatSystem handles combat."
- Notes that merely restate `.slim/digest.md`.

## File Format

Each memory file must use this format:

```markdown
---
name: short-kebab-or-camel-name
description: one-line explanation of why this memory matters
type: user|project|architecture|workflow|trap|reference
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Fact Or Decision
State the durable rule in direct language.

## Why
Explain why future work would get this wrong without the note.

## How To Apply
Describe the practical behavior expected in future sessions.

## Staleness Triggers
List files or systems that should cause this memory to be rechecked.
```

## Index Rules

Update `.claude/memory/MEMORY.md` whenever adding, renaming, deleting, or marking a memory stale.

Keep index entries short:

```markdown
- [Title](file.md) - durable reason this matters
```

Prefer updating an existing memory over creating a new one. If a category has many tiny files, merge them.

## Quality Bar

- Maximum 3 new memories per curation.
- Prefer 0 new memories when nothing durable happened.
- Every memory must pass this test: "Would this prevent a future wrong edit or save a meaningful investigation?"
- Stale memory is worse than missing memory. Flag uncertainty clearly.

## Output

End with:

```text
Session Curation Complete
Staleness check: N checked, N updated, N stale, N skipped
Memories added: N
Memories updated: N
Details: ...
```
