# Changelog

All notable changes to the `maat` plugin are recorded here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-08-29

First release of `maat` as a standalone agentic-workflow plugin, in a fresh repository.

### Added

- **19 agents** — `manager` (Osiris), `intake-refiner`, `story-implementer`, `test-writer`, `debugger`, `impact-analyst`, `adr-amender`, `design-challenger`, `red-team`, and the reviewer set: `code-reviewer`, `architecture-reviewer`, `cross-domain-reviewer`, `network-reviewer`, `infra-security-reviewer`, `usability-reviewer`, `app-security-reviewer`, `api-reviewer`, `data-reviewer`, `performance-reviewer`.
- **13 slash commands** under the `/maat:` namespace — `ship`, `plan`, `review`, `verify`, `debug`, `red-team`, `challenge`, `council`, `resolve`, `audit`, `adr-amend`, `init`, `help`.
- **13 generated skills** and **19 generated Copilot agents**, produced from the same authored sources by `scripts/sync-copilot-format.mjs`, so Claude Code and GitHub Copilot ship from one package.
- **ADR token-cache** (`scripts/adr-cache.mjs`) — builds a compressed, lossless catalog of the project's ADRs (domain tags + verbatim rules, not prose) so a fan-out of reviewers shares one read. Warmed by the plugin's single `SessionStart` hook.
- **Decision-log sweeper** (`scripts/decisions-archive.mjs`) and a **local insights dashboard** (`scripts/dashboard.mjs`), both copied into a project by `/maat:init`.
- **Receipt check** (`scripts/receipt-check.mjs`) — evaluates the eleven mechanical reopen triggers (checksum, verdict enum, contradicted verdict, HIGH/SUSPICION, unrun or failing checks under a clean verdict, derived-only blockers, missing exposure line, missing `REVIEW_LOG` row, missing bug Issue, stale `HEAD:`, outstanding human ruling) so the Manager stops counting findings by hand. Advisory; prints the four judgement-only triggers on every run; exits 0 always.
- **Session brief** (`scripts/session-brief.mjs`) — what the `SessionStart` hook now runs. Warms the ADR cache as before, then prints one line: in-flight scope and tier, an outstanding human ruling, reviews that predate the current HEAD, decisions due to archive.
- **Opt-in CI example** (`templates/maat-ci.yml.example`) — a report-only PR workflow that reruns the receipt check. Scaffolded to `docs/`, never to `.github/workflows/`.
- **Project templates** scaffolded by `/maat:init` — `PRINCIPLES.md`, `STATE.md`, `decisions.md`, `decisions-archive.md`, `backlog.md`, `REVIEW_LOG.md`, `adr-template.md`, `issue-template.md`, `manager-summary-format.md`, `conformance-triage.md`, `adr-cache-check.md`, and a project `CLAUDE.md`.
- **CI** — manifest/frontmatter validation and a `sync-copilot-format.mjs --check` drift gate.

### Not included, deliberately

Maat carries the loop only. The governance engine that used to ship alongside it — the pre-tool-use guard, the report and team gates, protected-path enforcement, attestation, waivers, mutation checks and the `.governance.json` config surface — is not part of this plugin and is not planned for it.

Consequences worth stating plainly:

- The plugin's whole hook surface is one best-effort `SessionStart` ADR-cache warm-up. Nothing here intercepts or blocks a tool call.
- Human-only actions (merge, push to default, `terraform apply`, prod deploys) are a discipline the agents keep, not a boundary this plugin enforces. Where that needs to hold, it holds through credential separation, branch protection and a required CI check.
- Per-project config is `maat.json` (ADR locations and sync behavior) and loop state is `docs/.maat-state.json`.
