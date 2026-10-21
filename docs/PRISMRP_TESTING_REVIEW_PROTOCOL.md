# PrismRP Testing Branch Review Protocol v1

**Status:** Proposed  
**Target branch:** `testing`  
**Promotion target:** `main`  
**Repository:** `kur1ke/prism-rp`  
**Based on:** `docs/PRISMRP_REVIEW_PROTOCOL.md` (v1, 2026-10-15)  
**Environment reference:** `docs/TEST_MIRROR.md` and `.github/workflows/testing-mirror.yml`  
**Prepared:** 2026-10-21

---

## 1. Purpose and authority

This protocol adapts the PrismRP Review Protocol to the **testing branch** and its independent Perchance mirror. It is a **proposed review policy**, not an assertion that repository branch protections already enforce it.

The base review protocol remains authoritative for architecture, canon, prompt authority, persistence and safety invariants. This document adds stage-specific gates, evidence requirements and testing-mirror checks. In a conflict, apply the **stricter safety invariant**; experimentation may relax completeness, not safety.

**Two gates:**
1. **ENTRY TO TESTING** — Is this change safe and useful to test in the isolated environment?
2. **PROMOTION TO MAIN** — Is the tested change reliable, compatible and approved for release?

Never treat a green workflow or author report as proof of real runtime behavior.

## 2. Branch and environment model

Expected flow:

```text
feature/* -> PR (base=testing) -> testing -> testing mirror / manual validation
                                                |
                                                v
                                         release review -> main
```

Verified repository specifics at drafting time:
- `.github/workflows/testing-mirror.yml` triggers on pushes and PRs targeting `testing`, plus manual dispatch.
- CI runs `node tests/run.js`, `node tests/test-mirror.js`, then `node build.js`.
- On non-PR runs, the workflow may commit regenerated `dist/` files back to `testing`.
- The test Perchance generator loads a bundle from `testing` and is designed not to fall back to `main`.
- Test data use the separate IndexedDB database `prism-rp-testing`; production uses `prism-rp`.
- Perchance live-model behavior is **not established** by CI alone.

These are observations of current files, not guarantees of branch-protection settings or successful live tests.

## 3. Scope declaration (required for every change)

Record:
- Goal and exact expected behavior.
- Changed modules / files and related systems.
- Intended experimental status: **SPIKE**, **EXPERIMENT**, **CANDIDATE** or **RELEASE-READY**.
- Explicit non-goals and forbidden behavior changes.
- Schema, migrations, imports, exports and backup impact.
- Prompt, model-provider, context-budget and persistence impact.
- How to exercise the change in the test mirror.
- Rollback or disable procedure, especially for persisted data.

Review the actual PR diff and affected runtime paths against this declaration; report unrelated changes and future-stage work.

## 4. Protected invariants — never waived merely because this is testing

The original Review Protocol's protected invariants remain in force, especially:
- Each chat owns an independent canon/world.
- Branch ancestry and swipe provenance determine visible state; sibling branches must not leak.
- Card is a persistent tendency model, not a script; impulse is not automatically action.
- Experience is evidence, not instruction; remembering does not mean obeying.
- Scene is derived from the active branch; Prism is assembled, not stored as permanent truth.
- Context budget is strict; OVERFLOW must be explicit and must not silently bypass limits.
- Failed preflight must not call the provider or mutate the narrative tree.
- Imported/raw/external data do not gain instruction authority through preservation.
- No character-specific hacks or morality/compliance hard-coding.
- Development remains separate until intentionally implemented.

An explicit architecture-redesign PR may propose changing an invariant, but must identify it by name, show migration/compatibility effects and receive deliberate architectural approval. **Do not silently waive it.**

## 5. Entry to testing — merge gate

**Minimum required evidence:**
1. Actual PR diff reviewed against declared scope.
2. No known BLOCKER involving canon isolation, data integrity, hidden prompt authority, security, strict token budget or failed-preflight state mutation.
3. Relevant automated regression tests added/updated, or a precise explanation of why existing tests cannot yet cover the behavior.
4. CI status recorded for `node tests/run.js`, `node tests/test-mirror.js`, `node build.js`; a green GitHub workflow is acceptable as evidence **only for its observed run and commit SHA**.
5. Manual test plan for the separate test Perchance generator, including expected result and evidence to capture.
6. Persistence changes have a migration / backup / recovery test plan.
7. Experimental shortcomings are labelled, scoped and reversible; known issues are documented.

**Experimental flexibility:** non-blocking functional incompleteness, minor UI defects and technical debt can enter `testing` if risks are bounded and test goals are clear. A failing required test or a core invariant failure is **not** automatically excused by the branch name.

**Gate decision:** `ACCEPT TO TESTING`, `ACCEPT TO TESTING WITH DEBT`, `CHANGES REQUIRED`, or `DO NOT MERGE`.

## 6. Testing mirror validation

Before claiming the feature works in testing:

- Confirm the mirror is the **separate** Perchance generator, not the production generator.
- Verify the loaded asset corresponds to the intended `testing` commit SHA, not an old jsDelivr cache entry or `main`.
- Observe that the mirror loader resolves the testing SHA; if using its documented `@testing` CDN fallback, record the cache risk and exact bundle identity if available.
- Verify IndexedDB writes occur in `prism-rp-testing`, not `prism-rp`.
- Check that test card imports, chat creation, edits, regenerations, reloads and restores remain confined to testing.
- Verify standalone and Perchance bundle startup, script ordering, browser errors, and platform-specific dependencies.
- For generation changes, exercise at least one **live model** request in Perchance when credentials/environment permit. If not tested, mark **NOT RUN** rather than PASS.
- Verify refresh behavior after the workflow's bot-generated `dist/` commit; identify whether the current mirror is running the new bundle.

**Important:** the workflow builds/updates bundles, but does not prove that a particular browser session fetched the fresh bundle or that a live LLM responded correctly.

## 7. Canon and swipe regression fixtures

For changes involving history, Scene, Experience, World, Messenger, Relationships, deletion, regeneration, swipes or migrations, use a fixture such as:

```text
A -> B -> C
     |-> D1
     `-> D2
```

Verify D1/D2 isolation, state restoration when switching branches, deletion/regeneration semantics, source message IDs and swipe variants, and persistence after reload. Check imported legacy records when the persistence shape changes.

## 8. Prompt and authority checks

Keep Card, Author Directives, Scenario, First Message, Scene, World Facts, Character Lens, World Pack, Experience, chat history and candidate/initiative context distinct.

Specifically reject:
- hidden instructions restored from raw/legacy/import fields;
- external/public lore promoted into author or system directives;
- duplicate prompt injection or unintended whole-database context;
- accidental permanent injection of Scenario;
- stored, cached or imported prompt data overriding active branch canon.

If visible directive fields are empty, no hidden directive may be reconstructed from preserved raw data.

## 9. Architecture and state checks

Preferred direction:

`UI -> controllers -> application services -> domain/pure modules -> adapters`

- Domain logic does not access DOM, global `S`, IndexedDB or providers directly without an intentionally reviewed exception.
- Providers do not own Scene/Card/Experience/World/Relationship semantics.
- UI does not become a dumping ground for domain rules.
- `app.js` stays a composition/orchestration layer.
- Newly shared state is narrow, intentional and avoids duplicated or unrelated slices of `S`.
- Any architectural exception is recorded with an owner and removal criterion before release.

## 10. Token budget and commit safety

Verify the actual outgoing payload fits the configured budget. Optional context is dropped in deterministic order before protected context, and OVERFLOW is explicit.

Expected sequence:

`prepare -> validate/preflight -> provider call -> validate result -> commit`

On preflight failure, there is **no provider call** and **no narrative-tree mutation**. Other failures must not leave undesigned partial state. Apply to new message, continue, regen, generated opening, initiative and derived/persisted world facts.

## 11. Persistence, import and migration

- Test format detection, invalid input handling, preservation of unknown fields, provenance, export/import and backups.
- Never execute preserved unknown/raw content.
- Migrations must be deterministic; ideally idempotent; ambiguity must be reported, not guessed.
- Old and mixed-version records must load or fail transparently without silent data loss.
- Do not test destructive migrations against production IndexedDB or the production Perchance generator.
- Save a representative backup/fixture and test reload/restore/rollback before promotion.

## 12. Feature-specific coverage

Apply the base protocol's specialized reviews when relevant:
- **World knowledge:** Pack + Lens + Chat Overlay + Active Branch resolution; AU and branch canon trump external reference; retrieve only relevant knowledge.
- **Experience:** chat ownership, branch/swipe visibility, topic relevance, deterministic ranking, stored-but-hidden siblings; Experience never becomes instructions.
- **Procedural/Messenger:** procedural state and candidate detection without continuous LLM simulation; LLM decisions only when justified; deterministic time; valid `[skip]`; no fake background execution.
- **Security:** external cards, lorebooks, web content and metadata are untrusted data, not privileged instructions.

## 13. Test evidence matrix

For each applicable category record **PASS / FAIL / NOT RUN / N/A** and a link/log/screenshot/fixture:

| Category | Evidence |
| --- | --- |
| PR scope and actual diff | File-level inspection |
| Unit / regression | `node tests/run.js` |
| Mirror isolation | `node tests/test-mirror.js` + browser verification |
| Build | `node build.js` |
| Testing bundle identity | Tested SHA / asset URL / cache observation |
| Browser startup | Perchance mirror and standalone where relevant |
| Live model generation | Provider/model + scenario or NOT RUN |
| Branch/swipe/canon isolation | Fixture or reproduction steps |
| Strict budget / preflight | Budget fixtures, provider-not-called assertion |
| Persistence / migration | Backup, reload, legacy fixture |
| Prompt authority/security | Input-to-prompt inspection |
| Compatibility | Import/export, old records, rollback |

Never equate **NOT RUN** with **PASS**. Never equate a large test count with adequate contract coverage.

## 14. Workflow-specific review hazards

- A PR targeting `testing` runs CI but does **not** perform the workflow's `dist/` update step because that step is excluded for pull_request events.
- On push, CI may add a **bot commit** updating bundles. Review/test the **post-build SHA**, not only the original merge SHA, before concluding what is deployed in the mirror.
- A `[skip ci]` commit message is not evidence that the mirror is up to date; inspect the files and observed asset identity.
- Do not assume testing is protected: as observed on 2026-10-21, GitHub reported `testing` as unprotected. Treat status checks and review discipline as process requirements unless branch rules are configured.
- The existence of a workflow does not prove its latest run succeeded. Check the actual run before verdict.
- Preserve production isolation; no workflow, loader or fallback should silently switch to `main` for the test mirror or write test data to production storage.

## 15. Promotion to main — stronger release gate

A feature already accepted into `testing` is **not automatically release-ready**.

Before promoting to `main`:
1. Freeze or identify the exact tested source SHA and resulting bundle SHA.
2. Compare the candidate with **current `main`** and review all changes being promoted, not just the original feature PR.
3. Resolve all BLOCKER findings and normally all MAJOR findings; explicitly document any consciously accepted exception with owner and impact.
4. Require successful applicable automated tests and builds on the candidate.
5. Complete relevant manual Perchance + live-model tests and branch/swipe, budget, import/migration, backup/restore and browser checks.
6. Verify release outputs and relevant compatibility (standalone, Perchance, GitHub Pages if affected).
7. Document schema changes, roll-forward/rollback plan and any data migration limits.
8. Update architecture documentation if module ownership, dependencies, persistent schema, authority or stage contracts changed.
9. Confirm the proposed merge does not include unrelated work that happened to accumulate in `testing`.
10. Obtain an explicit human/project-authorized release decision; no automatic promotion solely because CI is green.

**Gate decision:** `PROMOTE TO MAIN`, `PROMOTE WITH APPROVED NON-BLOCKING DEBT`, `CHANGES REQUIRED`, or `DO NOT PROMOTE`.

## 16. Severity

- **BLOCKER:** canon or sibling-branch leakage; data loss; hidden prompt authority; broken migration; strict budget violation; preflight mutation; test/production storage contamination; unsafe dependency reversal with concrete impact.
- **MAJOR:** significant functional regression, incomplete compatibility, critical flow not adequately validated, or nontrivial architecture debt needing explicit acceptance.
- **MINOR:** bounded UI issue, localized cleanup, or noncritical optimization.
- **NOTE:** observation, suggestion or future idea.

Severity measures impact, not style preference. Never block a safe, scoped experiment solely because a broader redesign might someday be useful.

## 17. Required review output

Use this format for both gates:

```text
A. TARGET GATE: ENTRY TO TESTING | PROMOTION TO MAIN
B. BASE/HEAD SHA + TESTED MIRROR BUNDLE SHA
C. SCOPE: intended behavior, forbidden changes, experiment maturity
D. ACTUAL CHANGE: files, modules, migrations, prompt/persistence impact
E. GOOD: verified improvements
F. FINDINGS: severity, file:line, reproducible behavior, risk, fix
G. INVARIANT MATRIX: PASS / FAIL / NOT RUN / N/A + evidence
H. TEST / BUILD / MIRROR: CI run, commands, mirror SHA, browser/live-model result
I. COMPATIBILITY / MIGRATION / ROLLBACK
J. NON-BLOCKING DEBT: owner or condition for closure
K. VERDICT: one of the four decisions for the selected gate
```

For a named stage, additionally report `<STAGE NAME> CLOSED` or `<STAGE NAME> NOT CLOSED`. Never mark a stage CLOSED without satisfying the agreed stage contract.

## 18. Golden rule

**Testing is a place to prove hypotheses safely, not a place to waive PrismRP's core contracts.**

A change may be incomplete and still be worth testing; it must be isolated, inspectable, reproducible, reversible where feasible, and honest about what was not verified. Promotion to `main` demands stronger evidence and a separate release decision.

---

## Changelog

### v1 — 2026-10-21
- Added independent **entry-to-testing** and **promotion-to-main** review gates.
- Added actual PrismRP Perchance testing-mirror and IndexedDB isolation checks.
- Added SHA/bundle/cache evidence and GitHub Actions bot-commit caveats.
- Kept original protected architecture, canon, prompt-authority and safety contracts.
- Added test-status accounting, migration recovery, and stage-specific verdicts.
