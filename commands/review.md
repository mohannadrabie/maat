---
description: Run the risk tier's reviewers on the current diff — across BOTH infra and app domains, by what the change touches — and close with the Manager Summary.
argument-hint: "[net|infrasec|appsec|arch|ux|api|data|perf|code] [scope]  (default: current diff vs main)"
---

Run the review chain for: $ARGUMENTS (default: current diff vs main).

**Cache first.** Run `node docs/adr-cache.mjs --ensure` once now (it builds the ADR catalog if stale or absent) so the reviewers you fan out all reuse it instead of each rebuilding. Surface the `📊 ADR cache …` line.

**Tier first.** Read docs/.maat-state.json if present and reuse its `tier` and `requiredReviewers` — /plan already decided them; don't re-derive and risk disagreeing. If absent, derive the tier from the diff per PRINCIPLES.md and write it so downstream steps agree.

**Reviewer selection** (from the tier + the paths actually touched — the paths tell you the domain; this plugin spans both infrastructure and application code, so a single change may need one reviewer from each side):
- TRIVIAL: no agent — verify checks pass, note it in the PR, done.
- STANDARD: the ONE right reviewer, chosen by what changed —
  - **Infra:** `network-reviewer` (VPC/subnets/SGs/routing/DNS) · `infra-security-reviewer` (IAM/KMS/secrets/exposure, `modules/(iam|security)/**`) · `usability-reviewer` (self-service ADR / onboarding flows).
  - **App:** `app-security-reviewer` (authn/authz, injection, secrets-in-code, deps) · `api-reviewer` (public interface / contract / versioning) · `data-reviewer` (schema / migrations / persistence) · `performance-reviewer` (hot paths / queries / concurrency).
  - **Either:** `architecture-reviewer` if new modules/services or cross-cutting design; else `code-reviewer`.
  - If the diff spans **both** infra and app (e.g. a Terraform module *and* the service that consumes it), pick the one most-relevant reviewer **per side** and run them in parallel — but never more than the risk tier warrants.
- CRITICAL: `red-team` + the one or two most-relevant domain reviewers from the lists above, in parallel.
- **Always also:** `cross-domain-reviewer` — every tier above TRIVIAL, run in parallel with the domain reviewer(s). It reads the WHOLE ADR catalog (no domain filter) and hunts the seams between the domain reviewer(s)' lanes; it doesn't count against the "never more than two reviewers" cap since it's the standing cross-domain pass, not a domain pick.
Explicit override always wins: `/maat:review net|infrasec|appsec|arch|ux|api|data|perf|code <scope>` forces that reviewer (`cross-domain-reviewer` still runs alongside it).

**Team mode (opt-in): `/maat:review --team <scope>`.** CRITICAL-tier only. Routes to the `manager` agent to run reviewers as parallel agent-team teammates. Requires agent teams enabled (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1); if unset, say so and run the standard subagent chain.

When reports return: each reviewer self-persists its own report verbatim to docs/reviews/<scope>-<agent>-<YYYY-MM-DD>.md with raw command/test output appended, via Bash, before ending its turn — that's the primary path; you persist as the backstop only if a reviewer's claimed `report=` path doesn't actually exist. **Each reviewer also appends its own `docs/REVIEW_LOG.md` row and files any `[ISSUE][HIGH]`/`[ISSUE][MED]` finding as its own bug Issue, same self-persist turn** (CLAUDE.md "Review Verdicts → Issue Status" / "Review Findings → Bug Issues") — you backstop both the same way as the report itself: verify they exist, add/file only if they don't. Each reviewer ends its turn with a `RECEIPT:` block (verdict, a **complete terse list of every finding** — `[ISSUE]`/`[SUSPICION]`/`[CLEAN]` with a `[HIGH|MED|LOW]` severity on each issue/suspicion — a `counts` checksum, checks, ADR cache state, report path). On STANDARD tier, synthesize the Manager Summary from those receipts — every per-reviewer line cites that reviewer's report path (`docs/manager-summary-format.md`) so the human can open it regardless; run `node docs/receipt-check.mjs --scope <scope>` and open the full report for every `REOPEN`/`UNREAD` row it returns (it owns the mechanical triggers — checksum, verdict enum, contradicted verdict, `[HIGH]`/`[SUSPICION]`, unrun or failing checks under a clean verdict, derived-only blockers, missing `REVIEW_LOG` row or bug Issue, stale `HEAD:`, `humanRulingRequired`), plus the four it cannot decide and you must: a terse line reading worse than its severity tag, a claimed ADR violation, zero findings on a non-trivial diff, a `[HIGH]` whose stated exposure looks wrong. On CRITICAL tier, open every full report regardless. The cheap path only greenlights — a blocker/rework is declared only after a full read. This check is discipline (did the reviewer really do the work), not paperwork for its own sake.

**Cross-domain gap check (every path, before the summary) is `cross-domain-reviewer`'s report, not a manual step.** It already ran alongside the domain reviewer(s) above, reading the compressed `adrCatalog.adrs` whole and unfiltered and checking the **diff's changed files against every applicable ADR OUTSIDE the lanes the domain reviewer(s) covered** — plus the non-ADR gaps at the seams between those lanes. Fold its `RECEIPT:` into the synthesis like any other reviewer's; any ADR collision it flags is a BLOCKER. `/verify` re-runs a whole-catalog-vs-diff ADR pass as the pre-merge backstop regardless.

**Always close with the Manager Summary** (every mode, every tier above TRIVIAL) using the EXACT format in `docs/manager-summary-format.md`. Synthesize inline only for ONE domain reviewer + `cross-domain-reviewer` (its standing partner, not a second pick) + both clean + no BLOCKERS + no ADR violations; otherwise spawn the `manager`.
