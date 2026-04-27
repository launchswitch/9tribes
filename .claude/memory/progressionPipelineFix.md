---
name: Progression Pipeline Fix
description: 3-cycle thinking-machine investigation that activated the dormant progression pipeline. 5/6 success criteria met. Only decisiveGames remains unsolved.
type: project
originSessionId: 3fc7d370-4d79-4531-87a6-9331ac362eac
---
Progression pipeline was completely dormant (avgLearnedDomainCount=1.17, 0 triple stacks, 0 decisive games). Fixed through 8 interventions across 3 cycles.

**Why:** Pipeline had 7 serial bottlenecks — gainExposure() was dead code, sacrifice destroyed units, research was too slow, triple stack gate required exactly 3 T2 domains.

**How to apply:** The key changes are:
- Exposure thresholds lowered from [100,150,200] to [10,20,35]
- Non-destructive sacrifice (unit kept, abilities stripped)
- Research speed doubled (4→8 XP/turn)
- Triple stack gate lowered from ===3 to >=2 domains
- Auto-complete T1 research when exposure learns a domain
- Learn-by-kill chances 2.5x

**Remaining gap:** decisiveGames=0 despite 40% domination threshold. 9-faction structure prevents city concentration. Future fix needs: progression-based victory condition, faction count reduction, or siege/triple-stack snowball loop.

**Battle count regression:** totalBattles dropped 25% (1233→928). Root cause: learn-loop coordinator pulls units off front for sacrifice transit. Not yet addressed.
