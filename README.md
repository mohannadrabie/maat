<div align="center">

# Maat

**An agentic software-engineering team for Claude Code and GitHub Copilot.**

Plans, tests, builds, reviews, debugs and prepares your change for merge — routing each change to the minimum correct reviewer set instead of treating everything the same way.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-informational.svg)](CHANGELOG.md)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-8b5cf6.svg)](https://docs.claude.com/en/docs/claude-code)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-plugin-24292e.svg)](https://github.com/features/copilot)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](https://nodejs.org)

[Quick start](#quick-start) · [The loop](#the-loop) · [Commands](#commands) · [Agents](#agents) · [How it works](#how-it-works) · [What `/maat:init` adds](#what-maatinit-adds) · [Configuration](#configuration) · [Non-goals](#non-goals) · [Contributing](#contributing)

</div>

---

## What it is

Install one plugin, run one command, and a Manager agent conducts a full delivery loop for you, from a half-formed story to a change that is ready for you to merge.

```text
/maat:ship 'add rate limiting to the login endpoint'
```



## Quick start

**1. Install the plugin**

<table>
<tr><th>Claude Code</th><th>GitHub Copilot</th></tr>
<tr><td>

```text
/plugin marketplace add https://github.com/mohannadrabie/maat.git
/plugin install maat@maat
```

</td><td>

```text
copilot plugin marketplace add https://github.com/mohannadrabie/maat.git
copilot plugin install maat@maat
```

</td></tr>
</table>

Both clients expose the same `/maat:` namespace.

> [!NOTE]
> Copying files into a local plugin folder does **not** register the plugin. Install it through the client's plugin system.

**2. Scaffold your repo**

```text
/maat:init
```

Interactive. Creates the project docs and helper scripts, never overwriting a file you own. Re-run any time to verify setup; `/maat:init --update` refreshes plugin-managed files after a plugin upgrade.

**3. Ship something**

```text
/maat:ship 'add rate limiting to the login endpoint'
```

Prefer to drive it yourself? Run the stages one at a time:

```text
/maat:plan 'add S3 bucket with encryption'
/maat:review
/maat:verify
```

---

## The loop

The Manager (**Osiris**) is the single voice to you. It delegates to specialists, carries results forward, and stops at every point where a human decision is needed.

```mermaid
flowchart LR
    A(["Intake"]) --> B(["Plan"]) --> C{"UI / API<br/>surface?"}
    C -- yes --> T(["Test-first"])
    C -- no --> D(["Build"])
    T --> D
    D --> E(["Review"]) --> F(["Verify"]) --> G(["Audit"]) --> H(["Merge handoff"]) --> Y(["you merge"])

    style A fill:#a5d8ff,stroke:#4a9eed,color:#1e1e1e
    style B fill:#fff3bf,stroke:#f59e0b,color:#1e1e1e
    style C fill:#ffffff,stroke:#06b6d4,color:#1e1e1e
    style T fill:#c3fae8,stroke:#06b6d4,color:#1e1e1e,stroke-dasharray: 5 5
    style D fill:#d0bfff,stroke:#8b5cf6,color:#1e1e1e
    style E fill:#ffd8a8,stroke:#f59e0b,color:#1e1e1e
    style F fill:#b2f2bb,stroke:#22c55e,color:#1e1e1e
    style G fill:#eebefa,stroke:#ec4899,color:#1e1e1e
    style H fill:#a5d8ff,stroke:#4a9eed,color:#1e1e1e
    style Y fill:#ffc9c9,stroke:#ef4444,color:#1e1e1e
```

<sub>Dashed = conditional. You decide at three points: **Plan** (approve it), **Review** (a REWORK or BLOCKER stops the loop), and the **merge** itself, which is always yours. The diagram is the shape; the table below is the complete stage list.</sub>

| Stage | What happens | Where it stops for you |
|---|---|---|
| **Intake** | `intake-refiner` extracts real requirements without inventing any | A story too vague to plan comes back as questions, not guesses |
| **Plan** | `story-implementer` (Phase 1) plans and proposes a risk tier the Manager ratifies | You approve the plan before anything is built |
| **Test-first** | `test-writer` writes black-box acceptance tests and confirms them red | Conditional — runs only when the plan introduces a new or changed UI/API surface |
| **Build** | `story-implementer` (Phase 2) implements against those failing tests | — |
| **Review** | The tier's reviewers run in parallel and persist dated reports | REWORK, a BLOCKER or an ADR violation stops the loop with its named unlock. Narrow findings are triaged first, so not every HIGH stops you |
| **Verify** | Real checks, ADR compliance, fresh reports read in full, clean tree | SHIPPABLE or NOT SHIPPABLE, with the exact unlock per blocker |
| **Audit** | Verifies every agent actually did the work its receipt claims | A shirked step is a blocker, named in the summary |
| **Pre-merge read** | Every report the loop only trusted by its receipt gets one full read before anything is called shippable | A body-vs-receipt discrepancy is a blocker, not a nit |
| **Merge handoff** | Manager Summary + session handoff + a commit | **You** merge. Always. |

### Ceremony scales with risk

Who reviews is decided by the risk tier, ratified by the Manager. You can challenge over- or under-tiering.

| Tier | Reviewers | Typical change |
|---|---|---|
| 🟢 **TRIVIAL** | tests + self-review | Docs, comments, formatting |
| 🟡 **STANDARD** | 1 domain reviewer + `cross-domain-reviewer` | Most feature work, refactors, config |
| 🔴 **CRITICAL** | `red-team` + the right domain reviewer(s) + `cross-domain-reviewer` | Auth, payments, migrations, public API, IAM/network, prod-facing |

`cross-domain-reviewer` joins every tier above TRIVIAL and does not count against the reviewer cap. It is the standing cross-domain pass that reads the **whole** ADR catalog and catches what falls in the seams between reviewer lanes.

**Who decides the tier.** `story-implementer` proposes one in its plan with a one-line justification, and the Manager ratifies it, challenging over- or under-tiering. It is persisted once to `docs/.maat-state.json`, and `/maat:review` and `/maat:verify` reuse it rather than re-deriving, so they cannot disagree with the plan. Reviewers calibrate to the tier; they do not re-litigate it. You can overrule it at any point.

**The tier table is yours to extend.** The definitions live in your project's `CLAUDE.md`, and you can add tiers, rename them, or name classes of change that always land in one. For a rule that binds rather than advises, write it as an **ADR**: an accepted ADR outranks `CLAUDE.md` (rule 9), so `MUST: any change under payments/ is CRITICAL` in an ADR's `Rules for agents` binds the Manager's ratification. A project rule may raise ceremony, never lower it, and security, data-integrity, legal and safety changes never drop out of review.

### When a review stalls

Most of a run is the happy path above. When a reviewer flags something, it doesn't go straight to you:

- **Evidence gates severity.** Only something that ran and failed, or that's traced to `path:line` in shipped code, can block. A finding reasoned from a document alone caps at MEDIUM and becomes a failing test instead.
- **Blast radius ranks findings.** Every HIGH has to state roughly what share of users, requests or runs it touches, and how that number was reached. Findings are ranked by that exposure, not by how alarming they sound.
- **Triage decides who sees what first.** Security, data-integrity, legal and safety go straight to you, always. Everything else gets a mechanical exposure check before it's confirmed as a blocker or downgraded to a condition on the ship.
- **A stuck disagreement escalates to a design council**, not to you, first. Three specialists review the same packet in parallel and reach GO or NO-GO against a fixed checklist. Only a NO-GO, or a second stall on the same issue, reaches you, and it arrives as a brief: business impact, root cause, options, and a recommendation.

The full mechanics (the evidence filters, the exposure thresholds, and exactly what the design council checks) are in [ARCHITECTURE.md](ARCHITECTURE.md#when-a-review-stalls).

---

## Commands

### Primary workflow

| Command | Does |
|---|---|
| `/maat:ship <story \| requirements-doc \| ticket>` | Full Manager-orchestrated loop |
| `/maat:plan <story \| requirements-doc \| project>` | Intake, planning and risk tiering only |
| `/maat:review [lane] [scope]` | Run the tier's reviewers (default: current diff vs `main`) |
| `/maat:verify [branch]` | Pre-merge verification (default: current branch) |
| `/maat:tldr` | Plain-English status (Seshat): what's happening now, and how far the whole roadmap has come |

### Investigation and escalation

| Command | Does |
|---|---|
| `/maat:debug <failure \| error output \| path>` | Reproduce, isolate, minimal fix — never guess-and-patch |
| `/maat:red-team <design \| module \| scope>` | Adversarial attack on a built change |
| `/maat:challenge <design \| ADR \| code path>` | Attack a design or ADR **before** it is built |
| `/maat:council [artifact]` | Design-council escalation when a pre-build loop stalls |
| `/maat:resolve [dispute context]` | Break a reviewer deadlock |
| `/maat:audit [sample \| since]` | Periodic reviewer and manager quality audit (default: last month) |

### Maintenance

| Command | Does |
|---|---|
| `/maat:adr-amend <ADR-ID> <reason>` | Propose an ADR change when the ADR is wrong rather than your code. Org-tier ADRs get a PR to the ADR repo; project-tier ADRs amend in place |
| `/maat:init` | Scaffold or verify this project (`--update` to refresh) |
| `/maat:help` | Command menu and setup status |

Each command is also generated as a **skill**, so the same capability is reachable in GitHub Copilot as well as Claude Code. Run `/maat:help` for the menu plus this project's setup status.

---

## Agents

19 specialists. The point is not "more agents", it's that the loop can route a change to the *minimum correct* reviewer set. Each one announces itself with its glyph and call sign, so a transcript reads as a team at work rather than a wall of undifferentiated output.

<table>
<tr><th align="left">Core</th><th align="left">Cross-cutting review</th></tr>
<tr valign="top"><td>

| Agent | Call sign | Role |
|---|---|---|
| `manager` | 🧠 Osiris | Conducts the loop, single voice to you |
| `intake-refiner` | 🔮 Sia | Extracts requirements, never invents them |
| `story-implementer` | 💪 Ptah | Decomposes, plans, builds |
| `test-writer` | 🔑 Khnum | Black-box acceptance tests, written red first |
| `debugger` | 🔄 Serqet | Reproduce, isolate, minimal fix |
| `impact-analyst` | 🔭 Wepwawet | Structural findings and path options |
| `adr-amender` | 📜 Seshat | Proposes ADR changes |

</td><td>

| Agent | Call sign | Role |
|---|---|---|
| `code-reviewer` | ⚖️ Anubis | Correctness, tests, maintainability |
| `architecture-reviewer` | 🏛️ Imhotep | Design, coupling, cost, evolution |
| `cross-domain-reviewer` | ☀️ Ra | Whole-catalog cross-domain seam pass |
| `red-team` | 🌪️ Sutekh | Failure scenarios, mandates proof-tests |
| `design-challenger` | 🗡️ Apep | Attacks a design before it is built |

</td></tr>
<tr><th align="left">Infrastructure</th><th align="left">Application</th></tr>
<tr valign="top"><td>

| Agent | Call sign | Role |
|---|---|---|
| `network-reviewer` | ⚡ Shu | Topology, segmentation, exposure |
| `infra-security-reviewer` | 🐍 Wadjet | IAM, secrets, encryption, supply chain |
| `usability-reviewer` | 💗 Hathor | Usability and decision quality |

</td><td>

| Agent | Call sign | Role |
|---|---|---|
| `app-security-reviewer` | 🛡️ Horus | Authn/authz, injection, deps, secrets |
| `api-reviewer` | ⚙️ Aker | Contracts, versioning, breaking changes |
| `data-reviewer` | 🗄️ Geb | Schema, migration safety, integrity |
| `performance-reviewer` | 💨 Khepri | Budgets, complexity, caching, concurrency |

</td></tr>
</table>

---

## How it works

Four mechanisms make the loop cheap enough to run on every change, and honest enough to trust:

- **A shared ADR cache.** Reviewers don't each re-read the whole ADR catalog. A fingerprinted, compressed cache is built once per session and reused across every parallel reviewer, HIT or MISS reported on every pass.
- **Receipts, not re-reads.** Every specialist persists a dated report to `docs/reviews/` and closes with a structured `RECEIPT:` block. The Manager works from the receipt and only reopens the full report when a mechanical check flags something off, or the tier is CRITICAL.
- **An audit that checks the paperwork against reality.** `/maat:audit` doesn't confirm a review happened, it confirms the receipt matches the report, the checks that were claimed actually ran, and findings and verdicts line up.
- **State that survives the session.** `docs/STATE.md` is the resume point the next session reads first; `docs/.maat-state.json` holds the ratified tier and ADR catalog; `docs/reviews/` is the dated evidence trail.

One hook does all of this housekeeping: a single best-effort `SessionStart` entry that warms the ADR cache and prints one line of resume context. It never blocks, and it never fails a session.

Claude sources are authored once, and the Copilot surfaces (`copilot-agents/`, `skills/`) are generated from them, so there's no second workflow to keep in sync.

Full mechanics, including the ADR cache's invalidation rule, the exact receipt checks, and the audit's evidence tagging, are in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## What `/maat:init` adds

```text
your-project/
├── maat.json                    # ADR locations + sync behavior (you own this)
├── CLAUDE.md                    # your operating context, risk tiers, hard rules
├── docs/
│   ├── PRINCIPLES.md            # the working charter — anti-kafka rules
│   ├── STATE.md                 # the resume point, read first every session
│   ├── decisions.md             # active decision log
│   ├── decisions-archive.md     # swept automatically at session handoff
│   ├── backlog.md               # or a GitHub Project, if you bootstrap one
│   ├── REVIEW_LOG.md            # append-only review ledger
│   ├── adr-template.md
│   ├── issue-template.md        # portable Issue schema + gh query cookbook
│   ├── manager-summary-format.md
│   ├── adr-cache-check.md       # how to read the cache line, for humans and agents
│   ├── adr-cache.mjs            # the ADR token-cache
│   ├── decisions-archive.mjs    # atomic decision-log sweeper
│   ├── dashboard.mjs            # local insights dashboard
│   ├── run-log.mjs              # appends the Manager's judgements to run-log.jsonl
│   ├── run-log.jsonl            # append-only record of those judgements (committed)
│   ├── receipt-check.mjs        # mechanical reopen triggers — advisory, never a gate
│   ├── session-brief.mjs        # what the SessionStart hook runs
│   ├── maat-ci.yml.example      # opt-in report-only PR check; you move it, or don't
│   ├── .maat-state.json         # tier, ADR catalog, loop state
│   └── reviews/                 # dated review evidence
└── adr/  or  docs/adr/
```

All five `.mjs` scripts are plain Node, read-only or append-only, and exit 0 on every path including their own failure. None of them gates anything. See [ARCHITECTURE.md](ARCHITECTURE.md#the-five-scripts) for what each one does.

`/maat:init` also bootstraps a GitHub Project board and label taxonomy when `gh` is installed with the `repo` and `project` scopes, and can migrate an existing `docs/backlog.md` into Issues, resume-safe, idempotent, and never without asking first.

---

## Configuration

Everything lives in `maat.json` at your repo root:

```json
{
  "adr": {
    "dir": ["adr/infra", "adr/app"],
    "autoSync": false,
    "upstreamBranch": "main"
  }
}
```

| Key | Default | Purpose |
|---|---|---|
| `adr.dir` | `["adr", "docs/adr"]` | One path or an array. Use an array for per-domain ADR folders so each root is covered visibly, the cache reports a per-root count, and a `…:0` tells you a folder is empty or misnamed. |
| `adr.autoSync` | `false` | Fast-forward the ADR submodule (`git merge --ff-only`) before each build so newly published ADRs land without updating the plugin. Fails soft, skipped when `$CI` is set. Off by default because an auto-advance dirties the working tree. |
| `adr.upstreamBranch` | `"main"` | The branch `autoSync` fast-forwards to. |
| `reportStyle` | `"full"` | Set to `"lean"` for shorter review reports: less prose per finding, no narrative preamble. The `RECEIPT:` block (verdict, every finding, severities, evidence tags, checks) is full-fidelity in both modes; nothing that gates ever shrinks. See PRINCIPLES.md rule 10. Toggle any time, no re-init needed. |

---

## The dashboard

`/maat:init` copies `dashboard.mjs` into your project. It renders one self-contained HTML file with no CDN, no web fonts and no external calls, so nothing about your project leaves the machine:

```bash
node docs/dashboard.mjs                    # writes docs/dashboard.html
node docs/dashboard.mjs --out /tmp/x.html
```

It reads from `docs/reviews/*.md`, `docs/run-log.jsonl`, `docs/REVIEW_LOG.md` and live `gh` queries to show feature progress, per-agent quality (clean-run rate, evidence quality, ADR hit rate), audit highlights, and Manager decisions. None of it grades anyone; it surfaces the candidate and a human decides. Full panel-by-panel detail is in [ARCHITECTURE.md](ARCHITECTURE.md#the-dashboard).

---

## Agent teams (experimental, opt-in)

Off by default. Enabling it adds `/maat:review --team <scope>` for CRITICAL-tier work, running reviewers as parallel teammates with disjoint scopes.

```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" },
  "teammateMode": "in-process"
}
```

Copy that into **your** settings (`~/.claude/settings.json` or the project's `.claude/settings.json`) and restart. A plugin's own `settings.json` is not auto-loaded. A ready-to-copy example lives at [settings.json](settings.json). `in-process` means no split panes and no session resume unless you are in tmux or iTerm2.

---

## Non-goals

Maat carries the **loop**. It is deliberately not an enforcement layer:

- **No tool-call gating.** The entire hook surface is one best-effort `SessionStart` brief that warms the ADR cache and prints a resume line. There is no pre-tool-use guard, no protected-path check, no report or team gate.
- **The scripts inform, they never decide.** `receipt-check.mjs` prints `REOPEN` rows and the Manager rules on them; `run-log.mjs` records judgements nothing reads back to block anything. Both exit 0 on every path, including their own failure. `/maat:init` scaffolds a CI workflow as `docs/maat-ci.yml.example` and deliberately does **not** put it in `.github/workflows/`; moving it there, and deciding whether it becomes a required check, is yours.
- **Human-only actions are a discipline, not a boundary.** `git merge`, `gh pr merge`, pushing the default branch, `terraform apply` and prod deploys stay with you because the agents are told to leave them alone, not because something stops them. Where that needs to be genuinely enforceable, enforce it with credential separation, branch protection and a required CI check.
- **Review reports are evidence, not keys.** A dated report is what the Manager and the next reviewer work from. It does not unlock a path, because no path is locked.

---

## Requirements

- Claude Code or GitHub Copilot with plugin support
- Node.js ≥ 20
- `gh` — for the GitHub Project and Issues flows
- `jq` — for the ADR amendment helpers

---

## Contributing

The repository **is** the plugin. Some of it is authored; some is generated.

| Path | Status |
|---|---|
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | authored |
| `agents/*.md` | authored — Claude agent definitions |
| `commands/*.md` | authored — slash commands |
| `hooks/hooks.json` | authored — hook manifest |
| `scripts/*.mjs` | authored — helpers `/maat:init` copies into a project |
| `templates/*` | authored — docs `/maat:init` scaffolds into a project |
| `copilot-agents/*.agent.md` | **generated** from `agents/` |
| `skills/*/SKILL.md` | **generated** from `commands/` |
| `plugin.json`, `hooks.json` (root) | **generated** from their `.claude-plugin/` and `hooks/` sources |

> [!IMPORTANT]
> Never hand-edit a generated file — the next sync overwrites it. Edit the source, then regenerate.

```bash
node scripts/sync-copilot-format.mjs          # regenerate the derived surfaces
node scripts/sync-copilot-format.mjs --check  # verify no drift (CI runs this)
node scripts/validate-plugin.mjs              # manifests, frontmatter, orphans
```

CI runs all three on every push and pull request, so a change that edits a source without regenerating fails before it ships a plugin whose two clients disagree.

---

## Troubleshooting

<details>
<summary><b><code>/maat:*</code> commands do not appear</b></summary>

Run `/plugin list` (or `copilot plugin list`). If `maat` is missing, install it again. If it is listed but the commands are not showing, restart the client so the plugin menu refreshes.
</details>

<details>
<summary><b>ADRs are not being reused</b></summary>

```bash
node docs/adr-cache.mjs          # what state is the cache in?
node docs/adr-cache.mjs --build  # force a rebuild
```

`CACHE=NONE` means no ADRs were found — check `adr.dir` in `maat.json` points at the right folder(s). A per-root count of `…:0` means that specific folder is empty or misnamed.
</details>

<details>
<summary><b>Re-check or repair setup</b></summary>

```text
/maat:init            # verify, and scaffold anything missing
/maat:init --update   # refresh plugin-managed files after a plugin upgrade
```

`--update` backs up any file it would overwrite to `<file>.bak` first, and never touches files you own.
</details>

<details>
<summary><b>The GitHub board bootstrap was skipped</b></summary>

It needs `gh` on PATH with both the `repo` and `project` scopes:

```bash
gh auth refresh -s project
```

Then re-run `/maat:init`. Nothing else in an init run depends on it.
</details>

---

## Learn more

**[ARCHITECTURE.md](ARCHITECTURE.md)** covers the internals this README only summarizes: the ADR cache's fingerprinting and invalidation rules, exactly what `receipt-check.mjs` checks, the design-council's GO/NO-GO checklist, every dashboard panel, and the run log's event schema.

## License

[MIT](LICENSE) © Mohannad Rabie
