---
description: Adversarial pre-build attack on a proposed design or ADR — ranks attacks by blast radius, verdicts BREAKS/SURVIVES/UNPROVEN, and turns each into a failing proof-test before any code is written.
argument-hint: "<design | ADR | code path | proposal>  (default: the most recent proposal)"
---

Launch the `design-challenger` agent against: $ARGUMENTS

If $ARGUMENTS is empty, challenge the most recently proposed design or ADR in the current conversation, or ask the human what to attack.

When the report returns:
1. Present the attacks ranked by blast-radius / trust / production impact, with **verbatim** verdicts (BREAKS / SURVIVES / UNPROVEN). Persist the report to `docs/reviews/<scope>-design-challenger-<YYYY-MM-DD>.md` with raw evidence (PRINCIPLES.md rule 10).
2. **Update the loop-exit counter.** Append this round's graded verdict (`go`/`no-go`) to `gradedVerdicts` and increment `roundsSinceLastGo` in `docs/.maat-state.json`; on a `go`, reset `roundsSinceLastGo: 0` instead. This is what makes rule 16(b)'s "2 graded verdicts without a `go`" trigger mechanical rather than something the Manager has to re-derive from `docs/reviews/` history.
3. Route findings by evidence tier and calibration, not uniformly:
   - **Calibrated blocking HIGH** (`demonstrated`/`code-traced` + user reach + routine or plausible + money, data, or silent divergence): `story-implementer` writes the named test as a FAILING test before the code it guards. This is the only class that blocks the build.
   - **Everything else:** the named test goes on the build's day-1 list, written alongside the feature, and the finding is logged in the residual register. It does not gate. **Exception — boundary-crossing carve-out:** a MED whose effect crosses a tenant or security boundary may never be logged to the residual register (per `design-challenger.md`'s Verdict section) — its named test still goes on the day-1 list, but the finding itself is not discharged as accepted-and-monitored.
   - **`UNPROVEN-pending-verification`:** run the named command, or schedule it with an owner. Do not re-grade the design until it has run.
   Failing tests are the record that an attack was real. A numbered conditions list is not; do not produce one.
4. If this is the 2nd graded verdict without a `go`, do NOT launch another round. Hand the Stop Brief to the Manager and run `/maat:council` (PRINCIPLES.md rule 16).
5. Log the outcome in `docs/decisions.md` if the challenge changes a design decision (the human ratifies) — cite the design-challenger report.
6. **Do NOT soften the findings.** Do NOT proceed with the design until the human has seen the **"scariest unproven assumption"** line.
