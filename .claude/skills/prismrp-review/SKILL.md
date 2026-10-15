---
name: prismrp-review
description: Review a PrismRP pull request, branch or stage against the project review protocol. Use when asked to review, audit or verify a PrismRP change before merge.
---

# PrismRP review

The source of truth is the code. Checklists and verdict format live in the repository documents below; this skill only sets the workflow.

## 1. Read first

- `ARCHITECTURE.md` — module ownership, dependency direction, documented contracts.
- `docs/PRISMRP_REVIEW_PROTOCOL.md` — the authoritative checklist, severities and verdict format.
- The stage task / PR description — claimed scope, forbidden scope, acceptance criteria.

## 2. Inspect the real change

- Review the actual diff of the branch or PR (`git diff main...<branch>`, the PR files), not the author's report. Runtime code wins over report text; never approve from a report alone.
- Look at: changed files, key runtime paths, tests added or changed, script load order in `index.html` and `build.js`, persistence / schema changes, prompt / context assembly changes, docs when ownership or contracts changed.
- Run the suites yourself when possible: `node tests/run.js`, `python3 tests/e2e.py <shots dir>`, `node build.js`.

## 3. Scope

- State the claimed scope and the forbidden scope.
- Flag feature creep and work from future stages.
- Do not redesign the project during a normal review.

## 4. Invariants

Walk the protocol's checklist. Pay particular attention to:

- branch / canon isolation; chat-scoped state derived from the active branch;
- authority boundaries between card, author directives, scenario, scene, experience, lore and imported metadata;
- preserved raw / source data is storage, never runtime authority; no hidden instruction fallback;
- strict token budget with explicit overflow; zero mutation when a preflight fails, where the contract requires it;
- modular dependency direction (views → controllers → services → pure modules → adapters);
- migration and persistence safety;
- no implementation of unrelated stages.

## 5. Findings and verdict

- Severities: only BLOCKER, MAJOR, MINOR, NOTE, as defined in the protocol. Do not inflate cosmetic issues.
- Output in the protocol's A–H structure: A. Scope · B. Actual Change · C. Good · D. Findings · E. Invariant Matrix · F. Test / Build · G. Debt · H. Verdict.
- Verdict: APPROVE, APPROVE WITH NON-BLOCKING DEBT, CHANGES REQUIRED or DO NOT MERGE.
- For a named stage, also state `<STAGE> CLOSED` or `<STAGE> NOT CLOSED`. A stage is not closed while any required acceptance criterion is unresolved.

## 6. Stop

After the review, do not implement fixes and do not merge unless explicitly asked.
