---
description: Diagnose a failure (trace, failed plan/apply, drift, flaky test) — reproduce, isolate root cause, propose the minimal fix.
argument-hint: <failure description | error output | file path>
---

Launch the `debugger` agent against: $ARGUMENTS (a stack trace, failed terraform/tofu plan or apply, drift report, flaky test, or incident symptom; confirm scope if ambiguous).
The debugger reproduces, isolates root cause from symptom, and proposes the minimal fix with a named regression check (before/after output). It is gate-bound: it assigns a risk tier so the right reviewer still gates the fix, persists its finding to docs/reviews/<scope>-debug-<YYYY-MM-DD>.md as evidence, and never bypasses a hook or merges.
Present verbatim: reproduction (or honest "could not reproduce") → root cause with evidence → minimal fix → regression check → risk tier + required reviewers. An unreproducible bug is UNPROVEN, not fixed. A security BLOCKER goes to the human. End with the single next action — usually `/review` at the assigned tier, or `/ship` to drive the fix through.
