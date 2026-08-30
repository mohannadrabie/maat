---
description: Adversarially attack a design or change with failure scenarios (partial apply, concurrency, AZ loss, drift) and demand proof-tests.
argument-hint: <design | module | scope>
---

Launch the `red-team` agent against: $ARGUMENTS (a design, module, or the current diff; confirm scope if ambiguous).
Present attacks ranked by blast radius, verdicts verbatim (BREAKS/SURVIVES/UNPROVEN). Every BREAKS/UNPROVEN becomes a named failing proof-test or documented drill BEFORE merge. Persist to docs/reviews/<scope>-red-team-<YYYY-MM-DD>.md (+ REVIEW_LOG row). Surface "the scariest unproven assumption" unedited.
