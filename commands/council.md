---
description: Convene the design council (design-challenger + architecture-reviewer + impact-analyst) when a pre-build loop has stalled — produces a business-and-technical path-forward brief, and either unblocks the build autonomously or hard-stops for a human ruling.
argument-hint: "<artifact or scope>  (default: the stalled artifact in .maat-state.json)"
---

Convene the **design council** on: $ARGUMENTS

## When this fires

Automatically, conducted by the Manager, the moment PRINCIPLES.md rule 16 trips — from EITHER loop, pre-build or post-build:
- **16(a)** a round's fix demonstrably reverses something an earlier round's CLEAN/SURVIVES established, or
- **16(b)** (pre-build `design-challenger` loop) 2 graded verdicts pass without a `go`, counted by verdict, never by filename, or
- **16(c)** (post-build review loop — `/maat:review` / `/maat:ship` stage 3) 2 consecutive REWORK/BLOCKED-class verdicts land on the same review target without an intervening clean/conditional-clean verdict, counted the same way.

Whichever trigger fired, name it verbatim in the Path-Forward Brief's `**Trigger:**` line. A 16(c) council still seats the same three specialists — the review deadlock is reframed as "should this shape exist as reviewed, and what does each fix path cost" rather than re-litigated finding by finding; that reframing is exactly why council, not another review round, breaks the loop.

**The council runs ONCE per artifact per architecture.** Read `docs/.maat-state.json`:
- `councilHeld` is false → convene.
- `councilHeld` is true and the architecture is unchanged → **do not convene a second council.** This is an automatic hard stop: set `humanRulingRequired: true` and post the Path-Forward Brief with verdict `NO-GO (second stall on the same shape)`. A council that has to sit twice on one shape has already answered the question.
- The architecture was replaced wholesale since the last council (a new shape, ratified) → reset `councilHeld` to false and the round counter to 0. A new shape earns one council.

## Who sits

Spawn all three in parallel. Each persists its own dated report and returns a receipt.

| Seat | Agent | The question it answers |
|---|---|---|
| **What actually breaks** | `design-challenger` (Apep), in **Stop Brief** mode | What is proven safe, what is genuinely open, what has never been run |
| **Whether the shape should exist** | `architecture-reviewer` | Topology, blast radius, evolution path, cost shape — the question the design-challenger is forbidden to ask |
| **What each fix does to everything else** | `impact-analyst` (Wepwawet) | Upstream and downstream impact of every candidate path; CONTAINS / RELOCATES / WIDENS |

Give all three the same packet: the Stop Brief's candidate paths, the full frozen set, the residual register, and the unrun-verification list. The impact-analyst prices the candidates; the architect rules on shape; the design-challenger states what is actually open. **No seat may write the fix.**

## The council verdict — computed, not negotiated

**GO** requires all four:
1. No OPEN calibrated blocking HIGH from the design-challenger (`demonstrated`/`code-traced` + user reach + routine/plausible + money, data, or silent divergence).
2. The architect's verdict is `APPROVE` or `APPROVE-WITH-CONDITIONS` on at least one candidate path.
3. The impact-analyst's verdict on that same path is `SAFE-TO-PATCH` or `PATCH-WITH-CONDITIONS`, and it is **not** `WIDENS`.
4. The artifact's own gating verification is either already run, or is scheduled as build task #1.

Anything else is **NO-GO**.

**On GO:** the loop continues autonomously. No human is woken. Set `roundsSinceLastGo: 0`, `councilHeld: true`, `councilVerdict: "GO"`, record the chosen path and every open finding as day-1 failing tests, and hand straight to `story-implementer`. Build task #1 is always the unrun gating verification. Post the Path-Forward Brief anyway, as the record.

**On NO-GO:** **stop.** Set `humanRulingRequired: true`, `councilHeld: true`, and `councilVerdict: "NO-GO"`. Do not spawn another design-challenger round, another fix batch, or a second council. Post the Path-Forward Brief to the human with the decision needed stated as a single question with lettered options. The unlock is a ratified row in `docs/decisions.md` recording the human's ruling, and the block message must say so.

## The Path-Forward Brief — the Manager authors this, always

This is the artifact a human reads in 90 seconds and rules on. Never longer than one page. Business first, because that is what the human is deciding.

```markdown
## Path-Forward Brief — <artifact> — <YYYY-MM-DD>

**Council verdict:** GO | NO-GO   ·  **Rounds spent:** <n>  ·  **Feature code written so far:** <n> lines
**Trigger:** rule 16(<a|b>) — <one line>

### Business impact
- **What users cannot do today:** <one line, in user terms, not system terms>
- **Cost of the stall:** <n> rounds / <n> days of review with <n> lines of code produced.
- **Deadline pressure:** <the date that makes this expire, or "none">
- **Exposure if we ship with the current residuals:** ~<N>% of <runs|users>, basis <measured|counted|assumption>
- **Exposure if we keep reviewing:** <what continues not to exist>

### The problem, technically
- <bullet — what the design does>
- <bullet — where it is genuinely unproven, with the evidence tier>
- <bullet — what has never been run, and for how many rounds>

### Root cause
<ONE sentence naming the causal assumption, not the symptom. "The design's shape rests on an unmeasured figure X" beats "round 12 had a bug." If the root cause is that the loop is attacking a document instead of a system, say exactly that.>

### Options
| | Path | Cost | Risk | Analyst verdict | Architect verdict |
|---|---|---|---|---|---|
| **A** | <one line> | <days / files> | <exposure %> | CONTAINS/RELOCATES/WIDENS | APPROVE/REWORK |
| **B** | <one line> | | | | |
| **C** | Ship with residuals, findings become day-1 failing tests | | | | |

### Council recommendation
<one option, one sentence why, and the strongest argument against it>

### Dissent
<any seat that disagreed, in its own words, one line — PRINCIPLES.md rule 7>

### If NO-GO — the decision needed from you
<a single question with lettered options. Nothing else. No homework.>

**Reports:** `docs/reviews/<scope>-design-challenger-<date>.md` · `<scope>-architecture-<date>.md` · `<scope>-impact-analyst-<date>.md`
```

## Rules

- **The council decides a path, it does not review.** No seat opens a new attack surface, and no seat writes a fix. If a seat wants to attack something new, that is a finding for the next round, not council input.
- **Evidence policy applies in full.** A council that produces a NO-GO on `derived` findings alone is invalid; re-run it with the verification executed.
- **Everything is logged** (PRINCIPLES.md rules 7 and 10): three persisted reports, the brief, the verdict, the dissent, and the state change.
- **One page.** A council that produces its own long document has reproduced the disease it was convened to cure.
