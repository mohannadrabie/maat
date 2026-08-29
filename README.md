# Maat

An agentic software-engineering workflow for **Claude Code** and **GitHub Copilot**, published as the plugin **`maat`**.

Maat is a team, not a gate. It ships agents, slash commands and skills that plan, test, build, review, debug and prepare a change for merge — routing each change to the minimum correct reviewer set instead of treating every change the same way. Enforcement lives elsewhere; this repository is the loop.

---

## Overview

The plugin is built around a Manager-orchestrated loop:

```text
intake -> plan -> test-first (conditional) -> build -> review -> ship-check -> audit -> merge-handoff
```

It is intended for repositories that want:

- explicit risk-tiering, so ceremony scales with what a change can break
- reviewer routing by change type
- ADR-aware planning and review
- persistent review evidence the next session can resume from

---

## Core behavior

### 1. Orchestrated workflow

- **TRIVIAL**: docs/comments/formatting -> tests + self-review
- **STANDARD**: one domain reviewer + `fullspectrum-reviewer`
- **CRITICAL**: `redteam` + the right domain reviewer(s) + `fullspectrum-reviewer`

The **Manager (Alakazam)** is the single voice to the human in `/maat:ship`. It delegates to specialists, carries results forward, stops at approvals, and closes with a Manager Summary.

### 2. Reviewer routing

The loop routes review by what changed: infra, app, API, data, architecture, security, performance, consumer/self-service, or cross-domain seams.

### 3. ADR-aware execution

The workflow treats ADRs as real constraints, not background reading:

- builders create or refresh an ADR catalog
- domain reviewers read only their slice
- `fullspectrum-reviewer` reads the whole catalog once for seam/cross-domain conflicts
- `/maat:ship-check` reruns the whole-catalog backstop before handoff

The catalog is a compressed, lossless index — per ADR it keeps the domain tags and the verbatim MUST/SHOULD rules, not the prose — so several reviewers can share one read instead of each re-reading every ADR.

### 4. Reviewer auditing

The loop does not stop at "a review happened." It checks whether:

- the report actually exists
- the receipt matches the report shape
- checks really ran
- findings and verdicts line up
- bug issues / log rows were created when required

This is discipline, not compliance: nothing here blocks a tool call. What it does is make a shirked step visible in the run's own summary.

### 5. Claude/Copilot compatibility

The published plugin is **one package**:

- Claude surfaces are the authored sources (`agents/`, `commands/`, `hooks/`)
- Copilot surfaces (`copilot-agents/`, `skills/`, root `plugin.json`, root `hooks.json`) are generated from them

That means no separate workflow fork to maintain.

---

## Install

Two steps: install the plugin, then scaffold the repo.

### Install in Claude Code

```text
/plugin marketplace add https://github.com/mohannadrabie/maat.git
/plugin install maat@maat
```

### Install in GitHub Copilot

```text
copilot plugin marketplace add https://github.com/mohannadrabie/maat.git
copilot plugin install maat@maat
```

In both clients, the plugin exposes the same `/maat:` namespace.

> Copying files into a local plugin folder does not register the plugin. Install it through the client plugin system.

### Scaffold the repo

```text
/maat:init
```

This scaffolds the project docs and helper scripts into the current repository without overwriting the files you own. Re-run it any time to verify setup, or run `/maat:init --update` to refresh plugin-managed templates and helper scripts.

---

## Quick start

### Orchestrated

```text
/maat:ship 'add rate limiting to the login endpoint'
```

### Guided

```text
/maat:story 'add S3 bucket with encryption'
/maat:review
/maat:ship-check
```

Use the orchestrated path for normal delivery. Use the guided path when you want to pause after planning, rerun review, or run a single stage directly.

---

## Command surface

### Primary workflow

- `/maat:ship <story>` - full Manager-orchestrated loop
- `/maat:story <story>` - intake + planning + risk tiering
- `/maat:review` - run the tier's reviewers on the current diff
- `/maat:ship-check` - pre-merge verification

### Investigation and escalation

- `/maat:debug <issue>` - diagnose and minimally fix failures
- `/maat:redteam <design>` - adversarial review
- `/maat:challenge <design>` - pre-build design attack
- `/maat:council` - design-council escalation for stuck pre-build loops
- `/maat:manager` - deadlock ruling
- `/maat:audit-reviewers` - periodic reviewer quality audit

### Maintenance

- `/maat:adr-amend <ADR-ID> <reason>` - propose an ADR amendment
- `/maat:init` - scaffold or verify the project files
- `/maat:help` - quick command/menu overview

---

## Specialist roster

### Core roles

- `manager`
- `intake-refiner`
- `story-implementer`
- `debugger`
- `test-writer`
- `analyst`
- `adr-amender`

### Review roles used across the whole repo

- `code-reviewer`
- `architecture-reviewer`
- `fullspectrum-reviewer`
- `redteam`
- `challenger`

### Infra reviewers

- `network-reviewer`
- `security-reviewer`
- `consumer-reviewer`

### App reviewers

- `appsec-reviewer`
- `api-reviewer`
- `data-reviewer`
- `performance-reviewer`

The point of the roster is not "more agents." It is that the workflow can route a change to the minimum correct reviewer set instead of treating every change the same way.

---

## How the workflow stays honest

### Conditional test-first stage

If the plan introduces a new or changed UI/API surface, the loop inserts `test-writer` before implementation so the builder is working against failing tests, not inventing the contract as it goes.

### Persisted run state

The plugin writes and reuses repo-local state so work does not become "whatever the current chat remembers":

- `docs/.maat-state.json` - persisted tier, ADR catalog, loop state
- `docs/reviews/` - dated review evidence
- `docs/REVIEW_LOG.md` - append-only review ledger
- `docs/STATE.md` - the resume point the next session reads first

### Hooks

| Hook | Trigger | Default state | What it does | How to turn on / off |
|---|---|---|---|---|
| ADR cache warm-up | `SessionStart` | On when the plugin is enabled and `docs/adr-cache.mjs` exists | Runs `docs/adr-cache.mjs --ensure` best-effort so ADR catalog reuse starts warm instead of cold | Disable the plugin to turn it off globally. In a project, it becomes a no-op if `docs/adr-cache.mjs` is absent. |

That is the whole hook surface. Nothing in this plugin intercepts or blocks a tool call.

### Human-only actions

`git merge`, `gh pr merge`, a push to the default branch, `terraform apply` and prod deploys stay with the human. That is a discipline the agents keep and the scaffolded `CLAUDE.md` states — not something this plugin enforces at the tool boundary. If you need it enforced, wire it up where it can actually hold: credential separation, branch protection, and a required CI check.

---

## What `/maat:init` adds

Typical scaffolded project layout:

```text
your-project/
|- maat.json
|- CLAUDE.md
|- docs/
|  |- PRINCIPLES.md
|  |- STATE.md
|  |- decisions.md
|  |- decisions-archive.md
|  |- backlog.md
|  |- REVIEW_LOG.md
|  |- adr-template.md
|  |- issue-template.md
|  |- manager-summary-format.md
|  |- adr-cache.mjs
|  |- decisions-archive.mjs
|  |- dashboard.mjs
|  |- .maat-state.json
|  `- reviews/
`- adr/ or docs/adr/
```

Repo-owned configuration:

- `maat.json` — ADR locations and ADR-sync behavior
- `CLAUDE.md` — repo-specific operating context, risk tiers, hard rules, definition of done

Default fullstack ADR roots:

```json
{
  "adr": {
    "dir": ["adr/infra", "adr/app"]
  }
}
```

---

## Contributor notes for this repo

The repository **is** the plugin. Authored sources:

```text
.claude-plugin/     # plugin.json + marketplace.json
agents/             # authored Claude agents        (source of truth)
commands/           # authored slash commands       (source of truth)
hooks/hooks.json    # authored hook manifest        (source of truth)
scripts/            # helper scripts copied into projects by /maat:init
templates/          # docs scaffolded into projects by /maat:init
copilot-agents/     # GENERATED from agents/
skills/             # GENERATED from commands/
plugin.json         # GENERATED from .claude-plugin/plugin.json
hooks.json          # GENERATED from hooks/hooks.json
```

If you edit `agents/`, `commands/`, `hooks/hooks.json`, or `.claude-plugin/plugin.json`, regenerate the derived surfaces:

```bash
node scripts/sync-copilot-format.mjs
```

And verify they are still in sync (this is what CI runs):

```bash
node scripts/sync-copilot-format.mjs --check
```

---

## Examples

```text
/maat:ship 'add KMS key for S3 encryption'
/maat:ship docs/requirements/multi-region.md
/maat:redteam docs/designs/new-vpc.md
```

---

## Troubleshooting

### `/maat:*` commands do not appear

- run `/plugin list` or `copilot plugin list`
- if `maat` is missing, install it again
- restart the client if the plugin menu has not refreshed

### ADRs are not being reused

```bash
node docs/adr-cache.mjs          # prints the cache line + CACHE=HIT|MISS|NONE
node docs/adr-cache.mjs --build  # force a rebuild
```

### Re-check setup

```text
/maat:init
```

### Refresh scaffolded helper files after a plugin update

```text
/maat:init --update
```

---

## Viewing agent/project insights

`/maat:init` copies `dashboard.mjs` into the project. Run it to render a local, gitignored HTML view of review verdicts and findings from `docs/REVIEW_LOG.md` plus live `gh` data:

```bash
node docs/dashboard.mjs
```

`docs/dashboard.html` is generated, local-only and never hosted — keep it gitignored.

---

## Agent teams (experimental, opt-in)

Off by default. This only adds `/maat:review --team <scope>` on CRITICAL-tier work.

Enable it in Claude settings:

```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

A ready-to-copy example lives at [settings.json](settings.json).

---

## Requirements

- Claude Code or GitHub Copilot with plugin support
- Node.js 20+
- `gh` for the GitHub Project/Issues flows
- `jq` for ADR amendment helpers

---

**License:** MIT
