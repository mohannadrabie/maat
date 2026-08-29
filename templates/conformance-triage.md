# Conformance Triage — <YYYY-MM-DD>
_Produced when ADRs are adopted or amended: rank how existing code/infra must realign so drift is remediated **deliberately** (PRINCIPLES.md rule 9), not silently. Adoption aligns the docs; this triage sequences the code. Rulings that need a human are marked and logged in `docs/decisions.md`._

## Conflicts (existing code/infra vs the ADRs)
| # | Item (what violates) | ADR | Severity | Effort | Cheap now / dear later? |
|---|----------------------|-----|----------|--------|-------------------------|
| 1 | <what and where> | ADR-NNNN | High / Med / Low | High / Med / Low | Yes/No — why |

## Sequence
| Phase | When | Work | Gated on |
|-------|------|------|----------|
| 1 | <when> | <the remediation unit> | <prereqs> |

## Rulings needed from the human
- <the calls only a person makes: exceptions, priority, spend, migrate-now-vs-later> → log each in `docs/decisions.md` once ruled.

## Notes
- Group tightly-coupled items into ONE workstream (things that can only be done together — e.g. tagging + IAM land inside the same rewrite).
- Move retrofits that compound every change (layering, tagging, idempotency) **earliest** — cheap near-greenfield, dear later.
- A conflict you cannot resolve without a decision is a blocker for the human, named — not a silent deviation.
