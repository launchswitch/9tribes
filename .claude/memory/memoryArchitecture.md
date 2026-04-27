---
name: memoryArchitecture
description: Session bootstrap hook + /curate command for cross-session memory persistence on war-civ-v2
type: project
originSessionId: 64035bca-210b-45fc-be0f-52580fc47def
---
## Memory System Architecture Decision (2026-04-12)

**What we built, not what we theorized:**

Two components, both minimal and LLM-powered:

### 1. Session Bootstrap Hook (repurposed 2026-04-18)
- File: `.claude/hooks/session-bootstrap.cjs` — **now used by `/brief` command for on-demand retrieval**, NOT as automatic SessionStart hook
- SessionStart hook in `settings.json` is now `nanobot-bridge.ps1`, not `session-bootstrap.cjs`
- The automatic LLM-powered session brief described below is no longer configured

### 2. End-of-Session Curation Command
- File: `.claude/commands/curate.md` (invoked as `/curate`)
- Instructs assistant to review full conversation, extract 3-5 worth-remembering insights
- Writes to memory files in standard frontmatter format
- Updates MEMORY.md index
- Won't fabricate — says "nothing worth saving" if true

### What We Explicitly Rejected

| Idea | Why Rejected |
|------|-------------|
| Real-time mid-session LLM injection | Timing + accuracy + attention alignment = 3 hard problems. Getting all three right simultaneously is unrealistic. |
| Everything Claude Code (ECC) plugin | Overkill. 181 generic skills, 14 MCP configs, global rules rewrites would collide with custom CLAUDE.md. Generic coding rules fight domain-specific conventions. Only the session-start hook pattern was worth stealing. |
| Static keyword-match retrieval | Dumb match on "Phaser" dumps everything Phaser-related. Need semantic understanding of *what the assistant is about to do*. |
| Pure bootstrapping without curation | Bootstrap alone gives diminishing returns — same brief every session until something changes. Curation is what compounds: each session makes future sessions smarter. |

**Why:** The highest-ROI approach is **session-start brief** (cheap, reliable, no timing problem) plus **end-of-session curation** (the compounding engine). Intelligence goes into curation judgment, not retrieval timing or mid-session interruption logic.

**How to apply:** When considering any new "AI assistant memory" tool or pattern for this project, evaluate against these two questions: (1) Does it compound across sessions? (2) Is the curation quality good enough to be trusted? If either answer is no, it won't outperform this simple system.
