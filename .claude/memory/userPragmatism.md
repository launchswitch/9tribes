---
name: userPragmatism
description: User prefers practical, project-specific solutions; pushes back on overengineering and optimistic complexity estimates
type: user
---

**User values practical, targeted solutions over generic frameworks.**

When presented with a complex multi-phase system (e.g., real-time LLM-powered memory injection with context window monitoring), user's instinct is to ask "is this overkill?" and push toward the minimal version that solves the actual problem. User correctly identified that ECC (everything-claude-code) would be too much for this project — 181 skills, 14 MCP configs, global rule rewrites fighting against an already-customized CLAUDE.md.

**User gives honest difficulty assessments.** When I said real-time injection "is buildable," user pushed back: "timing and accuracy, along with you actually listening to it, would be extremely hard to get right, and perhaps a pipe dream." This was correct — three independent failure modes (timing, relevance judgment, attention capture) that all need to work is genuinely unrealistic.

**User stays focused on THIS project.** Multiple times redirected conversation from general AI agent architecture ("what if we had a memory layer") back to "what would be most helpful for war-civ-v2." General frameworks (ECC, universal memory systems) are evaluated against whether they move the needle for this specific codebase.

**How to apply:** When proposing solutions, lead with the minimal viable version that solves the stated problem. Don't upsell complex architectures unless there's a clear, demonstrated need. If something sounds hard, say so — user respects honest difficulty assessment more than confident over-promising.
