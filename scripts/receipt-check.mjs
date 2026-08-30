#!/usr/bin/env node
// maat receipt check — evaluates the MECHANICAL half of the Manager's reopen-trigger list against
// what is already on disk, so the Manager spends its judgement on the half that needs judgement.
// Copied into a project as docs/receipt-check.mjs by /maat:init.
//
// WHY THIS EXISTS.
// Stage 5 of /maat:ship gives the Manager 15 conditions that force it to reopen a persisted report
// instead of trusting its RECEIPT. Eleven of them are arithmetic and file joins: does `counts` equal
// the finding lines listed above it, is this verdict that agent's clean value, is there a [HIGH]
// under a clean verdict, does a REVIEW_LOG row exist for this report. A model does that by holding N
// reports in context and counting — the one thing it is worst at, and the one failure that passes
// silently. A checksum off by one does not look wrong. This does those eleven mechanically and hands
// back a table.
//
// It is ADVISORY. It never returns a verdict, never blocks, and exits 0 on every path including its
// own failure — this plugin carries the loop, not an enforcement layer (see the repo's CLAUDE.md
// "Scope"). REOPEN means "open this file before you trust it", not "this is rejected". The Manager
// still rules, and the four triggers no script can decide are printed at the bottom of every run so
// they are never quietly dropped.
//
// It is LOUD ABOUT WHAT IT COULD NOT READ. The real risk here is the opposite of the one it fixes: a
// Manager that treats a clean table as proof. A report it cannot parse is reported as UNREAD, never
// as OK, and UNREAD counts as "you must read this yourself".
//
// Usage (the Manager calls this via Bash):
//   node docs/receipt-check.mjs                      -> every report in docs/reviews/
//   node docs/receipt-check.mjs --scope <scope>      -> only reports for one scope
//   node docs/receipt-check.mjs --since YYYY-MM-DD   -> only reports dated on/after
//   node docs/receipt-check.mjs --issues             -> also cross-check bug Issues via gh (slow)
//   node docs/receipt-check.mjs --json               -> same result as JSON
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REVIEWS = "docs/reviews";
const LOG = "docs/REVIEW_LOG.md";
const STATE = "docs/.maat-state.json";

// Each agent's verdict enum, first value = clean. This is the same table as
// docs/manager-summary-format.md "Reviewer verdict vocabularies"; if that table changes, this
// changes with it. An agent absent here has its verdict reported but not judged, because inventing
// a clean value for an unknown agent would produce confident nonsense.
const VOCAB = {
  "code-reviewer":           ["SHIP", "SHIP-AFTER-FIXES", "DO-NOT-SHIP"],
  "performance-reviewer":    ["SHIP", "SHIP-AFTER-FIXES", "DO-NOT-SHIP"],
  "infra-security-reviewer": ["APPROVE", "APPROVE-WITH-CONDITIONS", "REWORK"],
  "app-security-reviewer":   ["APPROVE", "APPROVE-WITH-CONDITIONS", "REWORK"],
  "network-reviewer":        ["APPROVE", "APPROVE-WITH-CONDITIONS", "REWORK"],
  "api-reviewer":            ["APPROVE", "APPROVE-WITH-CONDITIONS", "REWORK"],
  "data-reviewer":           ["APPROVE", "APPROVE-WITH-CONDITIONS", "REWORK"],
  "architecture-reviewer":   ["APPROVE", "APPROVE-WITH-CONDITIONS", "REWORK"],
  "cross-domain-reviewer":   ["APPROVE", "APPROVE-WITH-CONDITIONS", "REWORK"],
  "red-team":                ["go", "no-go"],
  "design-challenger":       ["go", "no-go"],
  "usability-reviewer":      ["go", "no-go"],
  "impact-analyst":          ["SAFE-TO-PATCH", "PATCH-WITH-CONDITIONS", "REDESIGN-REQUIRED"],
  "debugger":                ["FIXED", "UNREPRODUCIBLE", "BLOCKED"],
  "story-implementer":       ["BUILD-COMPLETE", "BLOCKED"],
  "test-writer":             ["RED-CONFIRMED", "NOT-APPLICABLE", "BLOCKED"],
};

// Report filenames carry the agent's name minus its `-reviewer` suffix. Same map as dashboard.mjs
// and run-log.mjs; agents whose slug already IS their name need no entry.
const SLUG_TO_AGENT = {
  code: "code-reviewer", architecture: "architecture-reviewer",
  "infra-security": "infra-security-reviewer", "app-security": "app-security-reviewer",
  api: "api-reviewer", data: "data-reviewer", network: "network-reviewer",
  performance: "performance-reviewer", usability: "usability-reviewer",
  "cross-domain": "cross-domain-reviewer",
  "impact-analyst-exposure": "impact-analyst", debug: "debugger",
};
const agentOf = s => SLUG_TO_AGENT[s] || s;

// Report filenames are `<scope>-<slug>-<YYYY-MM-DD>.md`, and BOTH halves can contain hyphens
// ("auth-rotation" reviewed by "infra-security"). A greedy `(.*)-([a-z-]+)-<date>` split therefore
// hands back the SHORTEST slug it can get away with — "security" for infra-security, "domain" for
// cross-domain — which silently falls out of the slug map and gets attributed to an agent that does
// not exist. So match the slug against the known set, longest first, and only fall back to the
// generic split for a slug this build has never heard of.
const KNOWN_SLUGS = [
  "impact-analyst-exposure", "design-challenger", "infra-security", "app-security",
  "cross-domain", "impact-analyst", "architecture", "performance", "test-writer",
  "red-team", "usability", "network", "debug", "verify", "code", "data", "api",
].sort((a, b) => b.length - a.length);

function parseReportName(file) {
  const m = file.match(/^(.*)-(\d{4}-\d{2}-\d{2})\.md$/);
  if (!m) return null;
  const [, stem, date] = m;
  for (const slug of KNOWN_SLUGS) {
    if (stem === slug) return { scope: "", slug, date };
    if (stem.endsWith(`-${slug}`)) return { scope: stem.slice(0, -(slug.length + 1)), slug, date };
  }
  const g = stem.match(/^(.*?)-([a-z]+(?:-[a-z]+)*)$/);
  return g ? { scope: g[1], slug: g[2], date } : { scope: stem, slug: "unknown", date };
}

// The four this cannot decide, printed on every run so they are never lost by being automated
// around. Three of them are why a REOPEN table is not a substitute for reading.
const JUDGEMENT_ONLY = [
  "a terse finding line that reads worse than its own severity tag",
  "whether a claimed ADR violation is real, and whether the diff breaks a MUST rule",
  "whether zero findings is honest for the size of this diff",
  "blast-radius triage: is this HIGH's stated exposure the real one (PRINCIPLES rule 21)",
];

const soft = (msg) => { process.stdout.write(`receipt-check: ${msg}\n`); process.exit(0); };
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };

// ---------- inputs that are read once, not per report ----------
function reviewLogPaths() {
  // A REVIEW_LOG row is expected per persisted report. We join on the report filename appearing
  // anywhere in the row rather than parsing the markdown table, because projects reformat that
  // table and a brittle column parse would produce false REOPENs — the expensive kind of wrong.
  const t = read(LOG);
  return t === null ? null : t;
}

function state() {
  const t = read(STATE);
  if (t === null) return {};
  try { return JSON.parse(t) || {}; } catch { return {}; }
}

function headSha() {
  // stdio stderr:"ignore" matters: outside a git repo git writes "fatal: not a git repository" to
  // the parent's stderr, which would corrupt --json output and leak into the SessionStart hook.
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}

function filedIssueTitles(enabled) {
  // Off by default: `gh issue list` is a network round trip and gh is not always installed or
  // authenticated. When unavailable the bug-Issue trigger reports UNKNOWN rather than passing,
  // because "I could not check" and "it is fine" must never look the same in this output.
  if (!enabled) return { available: false, text: "" };
  try {
    const out = execFileSync("gh", ["issue", "list", "--state", "all", "--limit", "300", "--json", "title,body"],
      { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"] });
    return { available: true, text: out };
  } catch { return { available: false, text: "" }; }
}

// ---------- per-report evaluation ----------
function evaluate(file, text, ctx) {
  const nm = parseReportName(file);
  const r = {
    file,
    scope: nm ? nm.scope : file.replace(/\.md$/, ""),
    agent: nm ? agentOf(nm.slug) : "unknown",
    date: nm ? nm.date : "",
    verdict: "", reopen: [], unknown: [], status: "OK",
  };

  const at = text.search(/RECEIPT:/i);
  if (at < 0) {
    // Not a REOPEN but an UNREAD: there is no receipt to trust in the first place, so the cheap
    // path does not apply to this file at all.
    r.status = "UNREAD";
    r.reopen.push("no RECEIPT block in the persisted report (rule 10: a chat-only receipt is a claim)");
    return r;
  }
  const body = text.slice(at);

  // A definition file or template caught by a glob would otherwise poison every count.
  if (/<n>|<scope>|<SHIP\|/.test(body.slice(0, 500))) {
    r.status = "SKIP";
    r.reopen.push("placeholder receipt (template or agent definition, not a real report)");
    return r;
  }

  const vm = body.match(/RECEIPT:\s*(?:mode=\S+\s+)?verdict=([^\s|,]+)/i);
  r.verdict = vm ? vm[1].replace(/[<>`]/g, "").trim() : "";
  if (!r.verdict) r.reopen.push("malformed receipt: no verdict= on the RECEIPT line");

  // --- trigger: counts checksum. The listed lines are between the findings header and the counts
  // line; counting tags after the counts line would double-count the counts line's own text.
  const countsAt = body.search(/^\s*counts\b/im);
  const listed = countsAt > 0 ? body.slice(0, countsAt) : body;
  const tally = (tag) => (listed.match(new RegExp(`\\[${tag}\\]`, "g")) || []).length;
  const listedIssues = tally("ISSUE"), listedSusp = tally("SUSPICION"), listedClean = tally("CLEAN");

  const cm = body.match(/counts[^\n]*?issues=(\d+)\s+suspicions=(\d+)\s+clean=(\d+)/i);
  if (!cm) {
    r.reopen.push("malformed receipt: no `counts (CHECKSUM): issues= suspicions= clean=` line");
  } else {
    const [ , ci, cs, cc ] = cm.map(Number);
    if (ci !== listedIssues || cs !== listedSusp || cc !== listedClean) {
      r.reopen.push(`checksum: counts say issues=${ci} suspicions=${cs} clean=${cc}, ` +
                    `but ${listedIssues}/${listedSusp}/${listedClean} lines are listed`);
    }
  }

  const high = (listed.match(/\[HIGH\]/g) || []).length;
  const med  = (listed.match(/\[MED\]/g)  || []).length;

  // --- trigger: verdict is not this agent's clean value / is not in its enum at all
  const enums = VOCAB[r.agent];
  if (r.agent === "verify") {
    // /maat:verify writes a report the same way an agent does, but it is a command with its own
    // SHIPPABLE/NOT-SHIPPABLE vocabulary, not one of the reviewer enums. Everything else below
    // still applies to it.
  } else if (!enums) {
    r.unknown.push(`no verdict vocabulary known for agent "${r.agent}" — verdict not judged`);
  } else {
    const known = enums.some(v => v.toLowerCase() === r.verdict.toLowerCase());
    const clean = enums[0].toLowerCase() === r.verdict.toLowerCase();
    if (!known && r.verdict) r.reopen.push(`verdict "${r.verdict}" is not in ${r.agent}'s enum (${enums.join(" | ")})`);
    else if (!clean && r.verdict) r.reopen.push(`verdict "${r.verdict}" is not ${r.agent}'s clean value`);

    // --- trigger: verdict contradicts the findings
    if (clean && listedIssues > 0) r.reopen.push(`clean verdict "${r.verdict}" with ${listedIssues} [ISSUE] line(s)`);
    if (clean && high > 0) r.reopen.push(`[HIGH] finding under a clean verdict`);
  }

  // --- trigger: any [HIGH] or any [SUSPICION] present at all
  if (high > 0) r.reopen.push(`${high} [HIGH] finding(s) — always read`);
  if (listedSusp > 0) r.reopen.push(`${listedSusp} [SUSPICION] finding(s) — unconfirmed by their author`);

  // --- trigger: a failed or skipped check under a claimed-clean verdict; and `checks=n/a` while
  // carrying a blocking finding (a reviewer that ran nothing cannot block).
  const ck = body.match(/checks\s*=\s*"?([^\n"]*)"?/i);
  const checks = ck ? ck[1].trim() : "";
  const ranNothing = /^n\/?a\b/i.test(checks) || checks === "";
  const pfs = checks.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
  if (pfs) {
    const failed = +pfs[2], skipped = +pfs[3];
    const cleanVerdict = enums && enums[0].toLowerCase() === r.verdict.toLowerCase();
    if (cleanVerdict && (failed > 0 || skipped > 0)) {
      r.reopen.push(`checks=${checks} under a clean verdict (skipped is not passed)`);
    }
  } else if (!ranNothing && checks) {
    r.unknown.push(`checks="${checks}" is not in passed/failed/skipped form — not judged`);
  }
  if (ranNothing && (listedIssues > 0 || high > 0)) {
    r.reopen.push("checks=n/a while carrying a blocking finding — nothing was run");
  }

  // --- trigger: a blocking finding resting only on derived evidence. The receipt carries evidence
  // as a tier tally, not per finding, so the sound conservative rule is: a [HIGH] exists and NOTHING
  // in this report was demonstrated or code-traced. PRINCIPLES rule 10 caps derived at MED.
  const ev = body.match(/evidence:\s*demonstrated=(\d+)\s+code-traced=(\d+)\s+derived=(\d+)/i);
  if (!ev) {
    if (listedIssues > 0) r.unknown.push("no `evidence:` tier line — evidence policy not checkable");
  } else if (high > 0 && +ev[1] === 0 && +ev[2] === 0 && +ev[3] > 0) {
    r.reopen.push("a [HIGH] rests on derived evidence only (rule 10 caps derived at MED)");
  }

  // --- trigger: every [HIGH] states its blast radius (PRINCIPLES rule 21). Presence is mechanical;
  // whether the number is honest is not, which is why that stays in JUDGEMENT_ONLY.
  if (high > 0) {
    const exposures = (text.match(/Exposure:\s*~?[^\n]*basis:\s*(measured|counted-in-code|assumption)/gi) || []).length;
    if (exposures === 0) r.reopen.push("[HIGH] present with no `Exposure: … basis:` line anywhere in the report (rule 21)");
    else if (exposures < high) r.reopen.push(`${high} [HIGH] finding(s) but only ${exposures} Exposure line(s) (rule 21)`);
  }

  // --- trigger: no REVIEW_LOG row for this persisted report
  if (ctx.log === null) {
    r.unknown.push(`${LOG} not found — REVIEW_LOG row not checkable`);
  } else if (!ctx.log.includes(file)) {
    r.reopen.push(`no ${LOG} row references this report`);
  }

  // --- trigger: a [HIGH]/[MED] [ISSUE] with no bug Issue filed
  if (listedIssues > 0 && (high > 0 || med > 0)) {
    if (!ctx.issues.available) {
      r.unknown.push("bug-Issue cross-check not run (pass --issues, and have gh installed and authed)");
    } else if (!ctx.issues.text.includes(file)) {
      // Every agent is told to link its persisted report from the Issue body, so the report path is
      // the join key. An Issue that does not name it is not evidence this finding was filed.
      r.reopen.push(`[HIGH]/[MED] issue(s) but no GitHub Issue body links ${file}`);
    }
  }

  // --- trigger: report is stale against the commit being shipped
  if (ctx.head) {
    const hm = text.match(/^HEAD:\s*([0-9a-f]{7,40})/im);
    if (hm && !ctx.head.startsWith(hm[1]) && !hm[1].startsWith(ctx.head.slice(0, hm[1].length))) {
      r.reopen.push(`report states HEAD ${hm[1].slice(0, 8)} but HEAD is now ${ctx.head.slice(0, 8)} — reviewed an older tree`);
    }
  }

  if (r.reopen.length && r.status === "OK") r.status = "REOPEN";
  return r;
}

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
const onlyScope = val("--scope");
const since = val("--since");

let files = [];
try { files = readdirSync(REVIEWS).filter(f => f.endsWith(".md") && !/^meta-audit-/.test(f)).sort(); }
catch { soft(`${REVIEWS}/ not found — nothing to check. Run a review first.`); }

const st = state();
const ctx = { log: reviewLogPaths(), head: headSha(), issues: filedIssueTitles(flag("--issues")) };

const results = [];
for (const f of files) {
  const nm = parseReportName(f);
  if (onlyScope && !(nm ? nm.scope : f).startsWith(onlyScope)) continue;
  if (since && nm && nm.date < since) continue;
  const text = read(`${REVIEWS}/${f}`);
  if (text === null) { results.push({ file: f, scope: "", agent: "", date: "", verdict: "", status: "UNREAD", reopen: ["unreadable file"], unknown: [] }); continue; }
  results.push(evaluate(f, text, ctx));
}

// A hard stop recorded in state outranks any per-report result: if the loop was told a human must
// rule and kept going, that is the finding, and it is about the run rather than about one file.
const runLevel = [];
if (st.humanRulingRequired === true || st.humanRulingRequired === "true") {
  runLevel.push("`.maat-state.json` has humanRulingRequired:true — a graded verdict here means the loop ran through a hard stop");
}
if (!ctx.head) runLevel.push("git HEAD unavailable — report-vs-commit staleness not checked");

const live = results.filter(r => r.status !== "SKIP");
const summary = {
  reports: live.length,
  ok: live.filter(r => r.status === "OK").length,
  reopen: live.filter(r => r.status === "REOPEN").length,
  unread: live.filter(r => r.status === "UNREAD").length,
  runLevel,
  results: live,
  judgementOnly: JUDGEMENT_ONLY,
};

if (flag("--json")) {
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exit(0);
}

if (!live.length) soft(`no reports matched${onlyScope ? ` scope=${onlyScope}` : ""}${since ? ` since=${since}` : ""}.`);

const w = Math.min(46, Math.max(...live.map(r => r.file.length)));
process.stdout.write(`receipt-check: ${summary.reports} report(s) — ${summary.ok} OK, ${summary.reopen} REOPEN, ${summary.unread} UNREAD\n`);
for (const r of live) {
  const mark = r.status === "OK" ? "OK    " : r.status === "REOPEN" ? "REOPEN" : "UNREAD";
  process.stdout.write(`  ${mark}  ${r.file.padEnd(w)}  ${(r.verdict || "-").padEnd(24)}\n`);
  for (const why of r.reopen)  process.stdout.write(`          → ${why}\n`);
  for (const why of r.unknown) process.stdout.write(`          ? ${why}\n`);
}
for (const why of runLevel) process.stdout.write(`  RUN     ${why}\n`);
process.stdout.write("\n  Not machine-checkable — these stay yours to judge on every report:\n");
for (const j of JUDGEMENT_ONLY) process.stdout.write(`    · ${j}\n`);
process.stdout.write("  OK means the mechanical triggers passed, not that the report is right.\n");
process.exit(0);
