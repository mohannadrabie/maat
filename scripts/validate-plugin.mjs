#!/usr/bin/env node
// Structural validation for this plugin repo. Pure node, no dependencies — it runs
// anywhere CI runs and anywhere a contributor works.
//
// What it checks:
//   1. Every JSON manifest parses, and the plugin/marketplace names agree.
//   2. Every authored agent and command has terminated YAML frontmatter carrying a
//      non-empty `description` — the sync generator throws on a missing one, and a
//      command without a description produces a skill Claude Code will not surface.
//   3. Every generated skill directory maps back to an authored command, and every
//      generated Copilot agent maps back to an authored agent (no orphans left behind
//      by a rename that skipped the generator).
//   4. Every hook command named in hooks/hooks.json that points at a file in this
//      repo actually resolves.
//
// It deliberately does NOT re-derive the generated files — `sync-copilot-format.mjs
// --check` is the drift gate, and CI runs both.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [];
const fail = (msg) => errors.push(msg);

function readJson(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) { fail(`${rel}: missing`); return null; }
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { fail(`${rel}: invalid JSON — ${e.message}`); return null; }
}

function mdFiles(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) { fail(`${rel}/: missing`); return []; }
  return readdirSync(p).filter((f) => f.endsWith(".md")).sort();
}

// 1. Manifests
const plugin = readJson(".claude-plugin/plugin.json");
const marketplace = readJson(".claude-plugin/marketplace.json");
const generatedPlugin = readJson("plugin.json");
const hooks = readJson("hooks/hooks.json");
readJson("hooks.json");
readJson("settings.json");

if (plugin && !plugin.name) fail(".claude-plugin/plugin.json: no `name`");
if (plugin && !plugin.description) fail(".claude-plugin/plugin.json: no `description`");
if (plugin && generatedPlugin && plugin.name !== generatedPlugin.name) {
  fail(`plugin.json name "${generatedPlugin.name}" does not match .claude-plugin/plugin.json name "${plugin.name}" — rerun scripts/sync-copilot-format.mjs`);
}
if (marketplace && plugin) {
  const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  if (!entries.some((e) => e.name === plugin.name)) {
    fail(`.claude-plugin/marketplace.json: no plugins[] entry named "${plugin.name}"`);
  }
}

// 2. Frontmatter on every authored agent and command
function checkFrontmatter(rel, file) {
  const text = readFileSync(join(root, rel, file), "utf8").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) { fail(`${rel}/${file}: missing frontmatter`); return; }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) { fail(`${rel}/${file}: unterminated frontmatter`); return; }
  const fm = text.slice(4, end);
  const desc = fm.match(/^description:\s*(.+)$/m);
  if (!desc || !desc[1].trim()) fail(`${rel}/${file}: frontmatter has no non-empty \`description\``);
}

const agents = mdFiles("agents");
const commands = mdFiles("commands");
if (!agents.length) fail("agents/: no agent definitions found");
if (!commands.length) fail("commands/: no command definitions found");
for (const f of agents) checkFrontmatter("agents", f);
for (const f of commands) checkFrontmatter("commands", f);

// 3. Generated surfaces map back to an authored source
const commandNames = new Set(commands.map((f) => basename(f, ".md")));
const skillsDir = join(root, "skills");
if (existsSync(skillsDir)) {
  for (const d of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (!commandNames.has(d.name)) fail(`skills/${d.name}/: orphan — no commands/${d.name}.md`);
    else if (!existsSync(join(skillsDir, d.name, "SKILL.md"))) fail(`skills/${d.name}/: no SKILL.md`);
  }
} else fail("skills/: missing — run scripts/sync-copilot-format.mjs");

const agentNames = new Set(agents.map((f) => basename(f, ".md")));
const copilotDir = join(root, "copilot-agents");
if (existsSync(copilotDir)) {
  for (const f of readdirSync(copilotDir).filter((f) => f.endsWith(".agent.md"))) {
    const name = basename(f, ".agent.md");
    if (!agentNames.has(name)) fail(`copilot-agents/${f}: orphan — no agents/${name}.md`);
  }
} else fail("copilot-agents/: missing — run scripts/sync-copilot-format.mjs");

// 4. Hook commands that reference a repo file resolve
if (hooks && hooks.hooks) {
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    for (const group of groups) {
      for (const h of group.hooks || []) {
        const cmd = String(h.command || "");
        const m = cmd.match(/\$\{(?:CLAUDE_)?PLUGIN_ROOT\}\/([\w./-]+)/);
        if (m && !existsSync(join(root, m[1]))) {
          fail(`hooks/hooks.json (${event}): command references ${m[1]}, which does not exist`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`validate-plugin: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`validate-plugin: OK — ${agents.length} agents, ${commands.length} commands, manifests and generated surfaces consistent.`);
