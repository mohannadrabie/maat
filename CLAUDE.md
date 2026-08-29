# Maat — repo context

This repository **is** the `maat` plugin for Claude Code and GitHub Copilot. There is no application code here: everything is agent definitions, slash commands, hook manifests, helper scripts and doc templates.

## Authored vs generated — read this before editing

| Path | Status |
|---|---|
| `.claude-plugin/plugin.json` | authored — plugin manifest |
| `.claude-plugin/marketplace.json` | authored — marketplace entry |
| `agents/*.md` | authored — Claude agent definitions |
| `commands/*.md` | authored — slash commands |
| `hooks/hooks.json` | authored — hook manifest |
| `scripts/*.mjs` | authored — helpers `/maat:init` copies into a project |
| `templates/*` | authored — docs `/maat:init` scaffolds into a project |
| `copilot-agents/*.agent.md` | **generated** from `agents/` |
| `skills/*/SKILL.md` | **generated** from `commands/` |
| `plugin.json` (root) | **generated** from `.claude-plugin/plugin.json` |
| `hooks.json` (root) | **generated** from `hooks/hooks.json` |

Never hand-edit a generated file — the next sync run overwrites it. Edit the source, then:

```bash
node scripts/sync-copilot-format.mjs          # regenerate
node scripts/sync-copilot-format.mjs --check  # verify in sync (CI runs this)
```

## Scope

Maat is the **loop**: agentic workflow, commands and skills. It is not an enforcement layer. Nothing here intercepts or blocks a tool call, and no claim in this repo should imply otherwise.

The one hook this plugin ships is a `SessionStart` best-effort ADR-cache warm-up. If a change would add a hook that gates, blocks or audits a tool call, it belongs in a separate governance project, not here.

Human-only actions (`git merge`, `gh pr merge`, pushing the default branch, `terraform apply`, prod deploys) are a discipline the agents keep and the scaffolded `CLAUDE.md` states — they are not enforced by this plugin. Where they need to hold, they hold through credential separation, branch protection and a required CI check.

## Definition of done for a change here

- The authored source is edited, not the generated copy.
- `node scripts/sync-copilot-format.mjs --check` passes.
- Every JSON manifest parses.
- Every `agents/*.md` and `commands/*.md` still has valid frontmatter with a `description`.
- `README.md` still matches what the plugin actually does.
