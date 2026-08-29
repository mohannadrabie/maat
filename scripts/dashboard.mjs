#!/usr/bin/env node
// Local agent/project insights dashboard — reads reviewer verdicts + round counts and renders ONE
// self-contained static HTML file. Never hosted, never phones home: no CDN, no web fonts, no
// analytics, no external URLs are written into the output. Run it, open the file, done.
//
// DATA SOURCE PRIORITY (deliberate, stated once here): docs/REVIEW_LOG.md is PRIMARY, not a
// fallback. It already carries 40+ real dated rows (Date/Scope/Agent/Verdict/Report) with a working
// Agent column, self-appended by every reviewer at the end of its own turn (CLAUDE.md). GitHub
// Issues/Milestones (queried live via `gh`) are layered in for what they usefully add on top —
// bug-issue counts by severity, open/closed ratio, tracking-issue status, milestone count — because
// right now there are zero Milestones and the Issue set doesn't carry round-count/verdict data at
// all. If a future project's Issue/Milestone data becomes the richer source, swap the priority in
// STORY_SOURCE comments below; don't assume this ordering is universal.
//
// Modes:
//   node docs/dashboard.mjs             -> generate docs/dashboard.html (default path)
//   node docs/dashboard.mjs --out FILE  -> generate to a custom path (still your job to gitignore it)
//
// Fails soft: if `gh` isn't installed/authenticated, or REVIEW_LOG.md is missing/malformed, the
// dashboard still renders with whatever data it has and says plainly what's missing — it never
// throws out of the render.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REVIEW_LOG = "docs/REVIEW_LOG.md";
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 && process.argv[outIdx + 1] ? process.argv[outIdx + 1] : "docs/dashboard.html";

// ---------- helpers ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function cellsOf(line) {
  let c = line.split("|");
  if (c.length && c[0].trim() === "") c = c.slice(1);
  if (c.length && c[c.length - 1].trim() === "") c = c.slice(0, -1);
  return c.map(s => s.trim());
}
const isTableRow = l => /^\s*\|/.test(l);
const isSeparator = l => isTableRow(l) && /^[\s|:-]+$/.test(l) && l.includes("-");

// ---------- 1. REVIEW_LOG.md (primary source) ----------
function readReviewLog() {
  let text;
  try { text = readFileSync(REVIEW_LOG, "utf8"); }
  catch { return { rows: [], note: `${REVIEW_LOG} not found — no review data.` }; }

  const lines = text.split(/\r?\n/);
  let headerIdx = -1, dateI = -1, scopeI = -1, agentI = -1, verdictI = -1, reportI = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!isTableRow(lines[i]) || isSeparator(lines[i])) continue;
    const cells = cellsOf(lines[i]).map(c => c.toLowerCase());
    dateI = cells.findIndex(c => c.includes("date"));
    scopeI = cells.findIndex(c => c.includes("scope"));
    agentI = cells.findIndex(c => c.includes("agent"));
    verdictI = cells.findIndex(c => c.includes("verdict"));
    reportI = cells.findIndex(c => c.includes("report"));
    if (dateI >= 0 && scopeI >= 0 && agentI >= 0 && verdictI >= 0) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return { rows: [], note: `${REVIEW_LOG} found but no parseable Date/Scope/Agent/Verdict table.` };

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!isTableRow(l)) continue;
    if (isSeparator(l)) continue;
    const cells = cellsOf(l);
    if (cells.length <= Math.max(dateI, scopeI, agentI, verdictI)) continue;
    rows.push({
      date: cells[dateI] || "",
      scope: cells[scopeI] || "",
      agent: cells[agentI] || "",
      verdict: cells[verdictI] || "",
      report: reportI >= 0 ? (cells[reportI] || "").replace(/`/g, "") : "",
    });
  }
  return { rows, note: null };
}

// ---------- 2. GitHub Issues + Milestones (secondary, layered in) ----------
function sh(args) {
  return execFileSync(args[0], args.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function readGitHub() {
  // `available` means "gh CLI is reachable and this is a GitHub repo" — NOT "every query below
  // succeeded". `milestonesOk` tracks that specific query's success so a failed milestone query
  // surfaces as "couldn't check", never as a false-confident zero (see the note on the call below
  // for why `-f` cannot be used on this particular endpoint).
  const out = { available: false, note: "", repo: "", issues: [], milestones: [], milestonesOk: false };
  try {
    out.repo = sh(["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
  } catch {
    out.note = "gh CLI not available/authenticated or not run inside a GitHub repo — Issue/Milestone panel skipped.";
    return out;
  }
  out.available = true;
  try {
    const json = sh(["gh", "issue", "list", "--state", "all", "--limit", "500", "--json",
      "number,title,state,labels,milestone"]);
    out.issues = JSON.parse(json);
  } catch { out.note += " Issue query failed."; }
  try {
    // NOTE: `-f state=all` makes `gh api` default to POST for this endpoint (any `-f`/`-F` flag
    // flips the implicit method), which always 422s against a read-only GET-only route. Force
    // GET explicitly — this is a read, never a write.
    const json = sh(["gh", "api", "--method", "GET", `repos/${out.repo}/milestones`, "-f", "state=all"]);
    out.milestones = JSON.parse(json);
    out.milestonesOk = true;
  } catch { out.note += " Milestone query failed."; }
  return out;
}

// ---------- 3. Derive stats from REVIEW_LOG rows ----------
function deriveStats(rows) {
  const verdictMix = new Map();     // verdict string (case-folded) -> count
  const perAgent = new Map();       // agent -> count
  const perStory = new Map();       // story key -> { rows, fixRounds, scopes:Set }

  for (const r of rows) {
    const v = (r.verdict || "unknown").trim();
    const vKey = v.toUpperCase() || "UNKNOWN";
    verdictMix.set(vKey, (verdictMix.get(vKey) || 0) + 1);

    const a = (r.agent || "unknown").trim().toLowerCase() || "unknown";
    perAgent.set(a, (perAgent.get(a) || 0) + 1);

    const m = r.scope.match(/^(story\d+)/i);
    const storyKey = m ? m[1].toLowerCase() : "(non-story scope)";
    if (!perStory.has(storyKey)) perStory.set(storyKey, { rows: 0, fixRounds: 0, scopes: new Set() });
    const s = perStory.get(storyKey);
    s.rows += 1;
    s.scopes.add(r.scope);
    if (/fixes?-?reconfirm|fix-cycle|rework/i.test(r.scope)) s.fixRounds += 1;
  }

  return { verdictMix, perAgent, perStory };
}

function deriveGitHubStats(gh) {
  const bySeverity = new Map(); // severity:x -> count (from bug-labeled issues)
  let open = 0, closed = 0, bugCount = 0;
  const tracking = [];
  for (const iss of gh.issues || []) {
    if (iss.state === "OPEN") open++; else closed++;
    const labelNames = (iss.labels || []).map(l => l.name);
    if (labelNames.includes("bug")) {
      bugCount++;
      const sev = labelNames.find(n => n.startsWith("severity:")) || "severity:unlabeled";
      bySeverity.set(sev, (bySeverity.get(sev) || 0) + 1);
    }
    if (labelNames.includes("current-focus")) tracking.push({ number: iss.number, title: iss.title, state: iss.state });
  }
  return { bySeverity, open, closed, bugCount, tracking };
}

// ---------- 4. Render ----------
function bar(count, max) {
  const pct = max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 0;
  return `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}

function render({ generatedAt, reviewLogNote, rows, stats, gh, ghStats }) {
  const totalRows = rows.length;
  const maxVerdict = Math.max(1, ...[...stats.verdictMix.values()]);
  const maxAgent = Math.max(1, ...[...stats.perAgent.values()]);

  const verdictRows = [...stats.verdictMix.entries()].sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `<tr><td>${esc(v)}</td><td class="num">${n}</td><td>${bar(n, maxVerdict)}</td></tr>`).join("\n");

  const agentRows = [...stats.perAgent.entries()].sort((a, b) => b[1] - a[1])
    .map(([a, n]) => `<tr><td>${esc(a)}</td><td class="num">${n}</td><td>${bar(n, maxAgent)}</td></tr>`).join("\n");

  const storyRows = [...stats.perStory.entries()]
    .sort((a, b) => {
      const na = parseInt((a[0].match(/\d+/) || ["999999"])[0], 10);
      const nb = parseInt((b[0].match(/\d+/) || ["999999"])[0], 10);
      return na - nb;
    })
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.rows}</td><td class="num">${v.fixRounds}</td><td>${v.scopes.size}</td></tr>`)
    .join("\n");

  const recentRows = [...rows].slice(-25).reverse()
    .map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.scope)}</td><td>${esc(r.agent)}</td><td>${esc(r.verdict)}</td><td class="mono">${esc(r.report)}</td></tr>`)
    .join("\n");

  const ghSevRows = [...ghStats.bySeverity.entries()].sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `<tr><td>${esc(s)}</td><td class="num">${n}</td></tr>`).join("\n");

  const trackingRows = ghStats.tracking
    .map(t => `<tr><td>#${t.number}</td><td>${esc(t.title)}</td><td>${esc(t.state)}</td></tr>`).join("\n");

  const milestoneSection = gh.milestonesOk
    ? (gh.milestones.length
        ? gh.milestones.map(m => `<tr><td>${esc(m.title)}</td><td class="num">${m.open_issues}</td><td class="num">${m.closed_issues}</td><td>${esc(m.state)}</td></tr>`).join("\n")
        : `<tr><td colspan="4">No Milestones exist yet.</td></tr>`)
    : `<tr><td colspan="4">${gh.available ? "Milestone query failed — couldn't check, not confirmed zero." : "GitHub data unavailable this run."}</td></tr>`;
  const milestoneTileValue = gh.milestonesOk ? String(gh.milestones.length) : "?";

  const ghNote = gh.available
    ? `Source: <span class="mono">gh issue list</span> / <span class="mono">gh api repos/${esc(gh.repo)}/milestones</span>, queried locally at generation time. Nothing here was fetched by the page itself.`
    : esc(gh.note || "gh CLI unavailable.");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Agent / Project Insights Dashboard</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root{
    --bg:#0f1115; --panel:#171a21; --border:#2a2f3a; --text:#e6e9ef; --muted:#9aa3b2;
    --accent:#5b8cff; --ok:#3fbf7f; --warn:#e0b84a; --bad:#e0605a;
  }
  *{box-sizing:border-box;}
  body{
    margin:0; padding:2rem; background:var(--bg); color:var(--text);
    font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif; font-size:14px; line-height:1.5;
  }
  h1{font-size:1.4rem; margin:0 0 .25rem;}
  h2{font-size:1.05rem; margin:2rem 0 .75rem; border-bottom:1px solid var(--border); padding-bottom:.4rem;}
  .meta{color:var(--muted); font-size:.85rem; margin-bottom:1.5rem;}
  .tiles{display:flex; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;}
  .tile{
    background:var(--panel); border:1px solid var(--border); border-radius:8px;
    padding:1rem 1.25rem; min-width:150px; flex:1;
  }
  .tile .n{font-size:1.8rem; font-weight:700;}
  .tile .l{color:var(--muted); font-size:.8rem; text-transform:uppercase; letter-spacing:.03em;}
  table{width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--border); border-radius:8px; overflow:hidden;}
  th,td{padding:.5rem .75rem; text-align:left; border-bottom:1px solid var(--border); vertical-align:middle;}
  th{color:var(--muted); font-weight:600; font-size:.78rem; text-transform:uppercase; letter-spacing:.03em;}
  tr:last-child td{border-bottom:none;}
  td.num{text-align:right; font-variant-numeric:tabular-nums; width:4rem;}
  .mono{font-family:ui-monospace,Consolas,monospace; font-size:.82rem; color:var(--muted);}
  .bar-track{background:#000; border-radius:4px; height:10px; width:120px; overflow:hidden;}
  .bar-fill{background:var(--accent); height:100%;}
  .note{color:var(--muted); font-size:.82rem; margin:.5rem 0 1rem;}
  .badge{
    display:inline-block; padding:.15rem .5rem; border-radius:999px; font-size:.72rem;
    background:#22262f; border:1px solid var(--border); color:var(--muted); margin-left:.5rem;
  }
  footer{margin-top:3rem; color:var(--muted); font-size:.78rem; border-top:1px solid var(--border); padding-top:1rem;}
</style>
</head>
<body>
  <h1>Agent / Project Insights Dashboard <span class="badge">local-only</span></h1>
  <div class="meta">Generated ${esc(generatedAt)} by <span class="mono">docs/dashboard.mjs</span> — data embedded at generation time, nothing on this page calls out.</div>

  ${reviewLogNote ? `<div class="note">⚠ ${esc(reviewLogNote)}</div>` : ""}

  <div class="tiles">
    <div class="tile"><div class="n">${totalRows}</div><div class="l">Review-log rows</div></div>
    <div class="tile"><div class="n">${stats.verdictMix.size}</div><div class="l">Distinct verdicts</div></div>
    <div class="tile"><div class="n">${stats.perAgent.size}</div><div class="l">Agents represented</div></div>
    <div class="tile"><div class="n">${stats.perStory.size}</div><div class="l">Stories / scopes tracked</div></div>
    <div class="tile"><div class="n">${ghStats.bugCount}</div><div class="l">Bug issues (all severities)</div></div>
    <div class="tile"><div class="n">${milestoneTileValue}</div><div class="l">Milestones</div></div>
  </div>

  <h2>Verdict mix (from docs/REVIEW_LOG.md)</h2>
  <table><thead><tr><th>Verdict</th><th class="num">Count</th><th></th></tr></thead>
  <tbody>${verdictRows || `<tr><td colspan="3">No rows.</td></tr>`}</tbody></table>

  <h2>Per-agent finding counts</h2>
  <table><thead><tr><th>Agent</th><th class="num">Rows</th><th></th></tr></thead>
  <tbody>${agentRows || `<tr><td colspan="3">No rows.</td></tr>`}</tbody></table>

  <h2>Round / fix-cycle counts per story</h2>
  <p class="note">"Fix rounds" = scopes matching <span class="mono">*-fixes-reconfirm</span> / <span class="mono">*rework*</span> naming — derived from the scope column text, not hand-counted.</p>
  <table><thead><tr><th>Story</th><th class="num">Review rows</th><th class="num">Fix rounds</th><th>Distinct scopes</th></tr></thead>
  <tbody>${storyRows || `<tr><td colspan="4">No rows.</td></tr>`}</tbody></table>

  <h2>Recent reviews (last 25)</h2>
  <table><thead><tr><th>Date</th><th>Scope</th><th>Agent</th><th>Verdict</th><th>Report</th></tr></thead>
  <tbody>${recentRows || `<tr><td colspan="5">No rows.</td></tr>`}</tbody></table>

  <h2>GitHub Issues &amp; Milestones <span class="badge">layered in, live-queried</span></h2>
  <p class="note">${ghNote}</p>
  <div class="tiles">
    <div class="tile"><div class="n">${ghStats.open}</div><div class="l">Open issues</div></div>
    <div class="tile"><div class="n">${ghStats.closed}</div><div class="l">Closed issues</div></div>
  </div>

  <table><thead><tr><th>Bug severity label</th><th class="num">Count</th></tr></thead>
  <tbody>${ghSevRows || `<tr><td colspan="2">No bug-labeled issues found.</td></tr>`}</tbody></table>

  <h2>Current-Focus tracking issues</h2>
  <table><thead><tr><th>#</th><th>Title</th><th>State</th></tr></thead>
  <tbody>${trackingRows || `<tr><td colspan="3">None found.</td></tr>`}</tbody></table>

  <h2>Milestones</h2>
  <table><thead><tr><th>Title</th><th class="num">Open issues</th><th class="num">Closed issues</th><th>State</th></tr></thead>
  <tbody>${milestoneSection}</tbody></table>

  <footer>
    Local-only, gitignored artifact. No GitHub Pages, no external host, no analytics, no CDN, no web fonts.
    Regenerate any time: <span class="mono">node docs/dashboard.mjs</span>.
  </footer>
</body>
</html>
`;
}

// ---------- main ----------
function main() {
  const { rows, note: reviewLogNote } = readReviewLog();
  const stats = deriveStats(rows);
  const gh = readGitHub();
  const ghStats = deriveGitHubStats(gh);

  const html = render({
    generatedAt: new Date().toISOString(),
    reviewLogNote,
    rows, stats, gh, ghStats,
  });

  const tmp = OUT + "." + process.pid + ".tmp";
  writeFileSync(tmp, html);
  renameSync(tmp, OUT);

  process.stdout.write(`📈 dashboard: wrote ${OUT} — ${rows.length} review-log row(s), ${stats.perAgent.size} agent(s), ${ghStats.bugCount} bug issue(s), ${gh.milestones.length} milestone(s). Open the file directly (file://) — nothing is hosted.\n`);
  if (reviewLogNote) process.stdout.write(`   note: ${reviewLogNote}\n`);
  if (!gh.available) process.stdout.write(`   note: ${gh.note}\n`);
}

main();
