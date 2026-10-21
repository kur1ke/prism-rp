# PrismRP Agent Instructions

This file applies to repository-based AI coding agents working on PrismRP.

## Start of every task

1. Determine the checked-out branch and the intended PR base. **Never assume** that the current branch is `testing`.
2. Read `docs/PRISMRP_REVIEW_PROTOCOL.md` before modifying code.
3. If the current branch or target PR base is `testing`, also read `docs/PRISMRP_TESTING_REVIEW_PROTOCOL.md` and `docs/TEST_MIRROR.md`.
4. Read relevant architecture documents and inspect the actual files, tests and diff affected by the task. If a required file cannot be accessed, report that instead of claiming compliance.
5. State the task scope, expected behavior, prohibited changes and potential impacts on canon, branch/swipe provenance, persistence, prompt authority and budget.

## During implementation

- Preserve the protected invariants in the base review protocol.
- Keep domain and adapter boundaries explicit; do not turn `app.js` into a feature module.
- Never promote imported/raw/external data into hidden directives.
- Never mutate the narrative tree on failed generation preflight.
- Treat `testing` as an isolated experimental environment, not a reason to waive safety contracts.
- Do not modify or merge into `main` without explicit user authorization.

## Validation and handoff

- Review actual changes, not the implementer's summary.
- Run appropriate tests and builds, including `node tests/run.js`, `node tests/test-mirror.js` and `node build.js` for changes targeting `testing`, when the environment permits.
- Do not claim that CI proves the Perchance browser mirror or a live model request works; record unrun checks as **NOT RUN**.
- For `testing` follow the **ENTRY TO TESTING** review gate; for release follow **PROMOTION TO MAIN**.
- Report files changed, test outcomes, risks and remaining debt. Use the verdict and evidence format from the relevant protocol.

These instructions guide agents that load repository instructions. They do **not** automatically configure ordinary ChatGPT chats; use ChatGPT Project instructions separately for that environment.
