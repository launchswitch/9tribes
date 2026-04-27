# /brief - Targeted Project Memory Retrieval

Retrieve only the War-Civ memory relevant to the current task, then continue the work.

## What To Do

1. Build a short enriched query:
   - One to three terse lines of current session context: files touched, topics discussed, current task state.
   - A separator line: `---`
   - The user's `/brief` query.
2. Run:
   ```bash
   node .claude/hooks/session-bootstrap.cjs --query "$ENRICHED_QUERY"
   ```
3. Read the returned brief and use it as context.
4. Proceed with the user's task.

## War-Civ Discipline

- Use `.slim/` first for current code shape:
  - `.slim/symbols.json` for exports and signatures.
  - `.slim/imports.json` for dependencies and blast radius.
  - `.slim/digest.md` for recent architectural changes.
- Use `.claude/memory/` only for durable project knowledge:
  - design intent
  - prior decisions
  - recurring implementation workflows
  - known traps
  - user preferences
- If memory conflicts with `.slim` or source, the current code wins. Flag the memory as stale.

## Behavior

- If no relevant memories are found, say so briefly and continue normally.
- If memories are found, use them silently unless the user asks what was retrieved.
- Do not manually dump every memory file into context after running retrieval.
- Do not treat memory as proof. It is a pointer to judgment and past decisions.

## Example

User:
```text
/brief add a sound for city capture
```

Enriched query:
```text
Current session: discussing sound effect architecture and repo memory. No source files changed yet.
---
add a sound for city capture
```

Expected use:
- Retrieval may surface SFX routing rules and feedback-flow traps.
- `.slim` is still used to locate current exports and dependencies before editing.
