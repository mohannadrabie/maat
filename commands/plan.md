---
description: Plan only — intake-gate the input, extract testable criteria, and set the risk tier (persisted). Stops for approval.
argument-hint: <story | requirements-doc | project>
---

Drive the work-intake workflow for: $ARGUMENTS (a story, a requirements document, a project/plan, a file path, or a ticket ID + description).

0. **Preflight.** If `maat.json` or `docs/PRINCIPLES.md` is missing, the plugin isn't set up here — recommend `/maat:init` first in one line; you may still plan if asked, but note gates/whitelist are absent until setup.
1. **Route (manager, silent).** The `manager` reads the input and routes by shape — a single story, a requirements doc, or a whole project — without narrating the classification as ceremony. (A failure/error is not new work: route to `/debug` instead.)
2. **Intake gate.** Launch `intake-refiner` on the input. Act on its verdict:
   - **CANT-PLAN** — present the one thing the human must decide/provide, and STOP.
   - **NEEDS-INFO** — present the blocking questions verbatim (grouped by requirement for a doc), and STOP. Wait for answers, then re-run. Never plan on guesses.
   - **READY** — present the clean rewrite / structured requirement list (with dependencies for a project) and continue.
3. **Plan (story-implementer).** On a READY input:
   - Single story → Phase 1 directly.
   - Requirements/project → Phase 0 first: the implementer decomposes into an ordered set of stories with dependencies and **STOPS for the human to approve the breakdown**, then plans each story (Phase 1) in order.
   Present verbatim: criteria (confirm DERIVED), risk tier + justification (challenge over/under-tiering), residual blocking questions, constraints incl. the sensitive areas touched and the reviewer reports they call for, plan. If the implementer hits a missing material fact, it STOPS with questions rather than guess-planning.
4. **Persist** the per-story decision to docs/.maat-state.json (if the file is missing, create it inline with the minimal schema — scope, tier, tierJustification, requiredReviewers, sensitiveAreasTouched, and an empty adrCatalog `{version:"", adrs:[]}` — do not read a plugin-path template): scope, tier, tierJustification, requiredReviewers, sensitiveAreasTouched, **adrCatalog** (discovered ADRs with domain tags and extracted constraints — reviewers reuse this instead of re-reading all ADRs for token efficiency), **roundsSinceLastGo** (0), **gradedVerdicts** ([]), **architectureId** (""), **councilHeld** (false), **councilVerdict** (""), **humanRulingRequired** (false), **frozenFindings** ([]), **openFindings** (0), **failingTests** (0), **unrunVerifications** ([]) — the design-council loop-exit fields, initialized fresh so `/maat:challenge` and the Manager's Role 3 have somewhere to write as the loop runs — updatedBy="story", updatedAt=today. Single source of truth /review and /verify reuse — tier decided once.
5. WAIT for answers + explicit approval; record them.
6. On approval: Phase 2 (or implement in the main session for work the project requires plan-mode on).
7. Close with the tier's review chain per docs/PRINCIPLES.md — never more ceremony than the tier requires. Point the user at `/review` (reads the persisted tier) or, for the full loop, `/ship`.
