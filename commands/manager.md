---
description: Break a reviewer deadlock with a logged, same-day ruling (human always overrides).
argument-hint: "[conflicting reports / dispute context]"
---

Launch the `manager` agent for: $ARGUMENTS.

Two modes, auto-detected from what you pass:

**Deadlock (default).** If given conflicting reports/verdicts or a stalled decision (provide both sides' reports or their docs/reviews/ paths): the manager rules. Present the decision record verbatim: decision · rationale · dissent (fairly stated) · review-back date. Append it to docs/decisions.md with "human ratification: pending" and tell the human what was decided in one sentence. If the manager escalated a security BLOCKER instead of ruling, surface that immediately. End with the implementer's single next action.

**Orchestrate (team mode).** If invoked to coordinate a CRITICAL-tier review (typically routed here by `/review --team`): the manager confirms the risk tier, spawns the minimum reviewer set as teammates with disjoint scopes, lets them review in parallel, and collects verdicts. Reports persist per-reviewer to docs/reviews/, each ending in a `RECEIPT:` block. CRITICAL tier always means a full reopen of every report regardless of how clean its receipt reads (team mode is CRITICAL-only by definition) — never "present the synthesis + all reports verbatim" in chat; the Manager Summary cites each report's path so the human can open it themselves. If verdicts conflict, the manager falls through to deadlock mode above. This mode requires agent teams enabled (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1); if it isn't, say so and fall back to the standard `/review` chain.

In both modes the manager is read-only and cannot override hooks, waive human-only actions, or suppress a security BLOCKER. The manager also owns the **Manager Summary** that every `/review` closes with (verdict · per-reviewer line · blockers+unlocks · conditions · next action). End with the single next action.
