---
name: prismrp-implementation
description: Implement a PrismRP stage, batch or fix within the project architecture and scope rules. Use when asked to build, change or fix PrismRP code.
---

# PrismRP implementation

Contracts and ownership live in the repository documents; this skill sets the workflow. The current task prompt defines scope and acceptance criteria.

## 1. Read first

- `ARCHITECTURE.md` — module ownership, dependency direction, documented contracts.
- The current task / stage prompt.
- The existing modules the task touches.
- `docs/PRISMRP_REVIEW_PROTOCOL.md` when the task affects established invariants (branches, authority, budget, transactions, import, persistence).

## 2. Before coding

- Inspect the current implementation; do not assume.
- Write a short plan.
- Name the owning modules and the boundaries involved.
- Note state, persistence and prompt / context implications.
- List the acceptance tests before writing code.

## 3. Scope

- Implement only the requested stage or batch. Never start the next stage.
- Do not clean up accepted architecture debt or refactor unrelated code unless the task requires it; record debt instead.

## 4. Architecture

Direction: UI views → controllers → application services → pure domain modules → adapters (storage, providers, files).

- Pure modules: no DOM, storage, network or global `S`; they receive explicit slices.
- Providers carry transport only: no card, scene, experience, world or Prism semantics.
- Views and controllers hold no domain rules.
- `js/ui/app.js` stays the composition root.
- New scripts go into `index.html` in dependency order (`build.js` concatenates that order).

## 5. Authority

Keep these distinct: card, author directives, scenario, first message, scene, experience, lore / world knowledge, raw / source / imported metadata. Preserved data never becomes executable authority unless the current stage explicitly maps it.

## 6. Transactions

For generation and persistence flows: prepare → validate / preflight → external or model call → parse → commit. Where the contract requires atomic behaviour, a failed preflight, provider error or abort leaves no partial persistent state.

## 7. Tests

Test the changed contract, not only the happy path. As applicable: unit, branch behaviour, migration / import, overflow, provider-not-called, persistence, E2E, build and smoke.

- Unit: `node tests/run.js`
- E2E: `python3 tests/e2e.py <shots dir>` (mock model on port 8766, headless Chromium)
- Build: `node build.js` (regenerates `dist/*`; commit it with runtime changes)

## 8. Completion

- Run the relevant tests and the build.
- Update `ARCHITECTURE.md` only if ownership or contracts actually changed.
- Work on a branch; open or update the PR if asked. Never merge to `main` without explicit approval: `main` deploys to GitHub Pages and Perchance.
- Report changed files, semantics, tests, debt, PR number and head SHA, then stop.
