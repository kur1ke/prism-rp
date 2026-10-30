# PRISM — Unified Knowledge Core: transition plan (testing)

**Status:** EXPERIMENT, isolated pure prototype. **Branch:** testing.
**Goal:** one shared store of source-grounded knowledge with multiple *read views* (current state, events, subjective memories), not parallel independent truth databases.
**Implementation today:** pure evaluator in \`js/knowledge/core.js\`, tests in \`tests/knowledge-core.js\`. **Not wired to runtime, prompts, storage, images, or legacy memory.**

## Non-negotiable constraints

- The RP model authors the narrative. Knowledge preserves what was established, not commands for characters.
- A photograph is a source/representation; it is **not** proof of the subject's present physical state. Exact pixel output from Forge is never canonical.
- Unspecified details are not negative evidence. Intent, hypothetical possibilities, old photos, current reports and objective observations are distinct.
- Every claim or later qualification is attributable to a specific chat, message, selected swipe, source kind (text or original authored draw), exact source quote and optional draw index.
- A source anchor proves *origin*, not semantic truth. The future interpreter decides subject, time, modality, relation; the core checks origin and retains uncertainty.
- A later message can qualify an earlier source without copying its text, and changing/swiping away from either source removes the dependent qualification.
- No sibling branch leakage. No duplicated mutable "truth" stores; current scene/experience/context are projections over the same recorded knowledge.
- Private/internal text remains context data, never runtime or author instructions. Failure of interpretation must remain observable as **unprocessed**, not "no changes."
- Do not amend production database or silently migrate chat history in this phase.

## Stable domain boundaries proposed

1. **Source.** An immutable reference to selected branch content: chatId, messageId, swipeIdx, kind, drawIndex (for DRAW), exact quote. In later persistence use a source revision/hash and tracked content version, so an edited source invalidates dependent conclusions.
2. **Assertion.** id, subject, predicate, JSON value, time (\`current|past|future|unknown\`), modality (\`established|reported|intended|hypothetical\`), cardinality (\`single|collection\`), source. User claims are not automatically facts about other people.
3. **Link.** Source-backed relationship to a prior assertion: \`qualifies-time\`, \`supersedes\`, \`corroborates\`, \`disputes\`. A qualification updates the **interpretation of an earlier assertion**, not the earlier text.
4. **Branch projection.** A pure read view from the selected message+swipe path. Current claims are eligible only when their time is current, modality is established/reported and no valid supersession applies. Unresolved conflicting claims remain flagged rather than picking the latest by string matching.
5. **Reading.** Context assembler will eventually receive selected current claims and relevant history under a strict budget. Experience/Reflection is a subjective reading of the same episodic evidence, not a separate competing fact ledger.

This v0.1 evaluator deliberately exposes a small interface:
\`knowledgeCore.evaluate({chatId, path, assertions, links}) -> {accepted, rejected, diagnostics, current}\`.
It neither extracts claims from language nor writes them. The whole runtime continues using the existing StateTracker and Memory service. Thus there is **no second live memory**.

## Stages and acceptance gates

| Stage | Work | Gate |
|---|---|---|
| **K0 (this change)** | Formal contract, pure evaluator, source/sibling provenance, temporal qualifications, supersession, collection and conflict tests | CI green; old runtime unchanged |
| **K1** | Test interpretation adapter with neutral schema and explicit unresolved/errors. Shadow-mode evaluation on copied test conversations; no canonical writes, no extra live-model calls | Compare factual preservation and latency; no false cross-branch promotions |
| **K2** | Single atomic journal persistence in test IndexedDB, source revisions, deduplication and idempotent processing receipts; versioned checkpoints as *derived caches* only | Reload, conflict, deletion, crash, backup/import/export and rollback tests |
| **K3** | Unified public read API for Prism/Messenger/images; selected historical image snapshots; strict context budgeting | Output parity + end-to-end image and branch tests |
| **K4** | Migrate existing StateTracker and episodic Memory/Reflection into a single evidence graph with preserved subjective provenance; stop duplicate extraction and canonical writing | Deterministic migration + live transcript tests, no loss of legacy data |
| **K5** | Remove legacy trackers and redundant stores after user approval and successful live testing | Explicit release review; production untouched until approved |

## Known limitations / no premature claims

- K0 does **not** determine whether a photo is current, repair malformed LLM JSON, or provide an observer replacement.
- K0 does **not** distinguish conflicting observations caused by perception errors vs conflicting testimony; future semantic layer must.
- The \`source.quote\` check guards selected textual/draw provenance, but long-term durable writes will require source revisions, transaction-level invariants and append-only relation receipts.
- Relationships in this prototype reference previously visible assertions; it does not cover arbitrary multi-hop referents, entity identity resolution, uncertainty probabilities, negated facts or richly time-scoped intervals.
- \`current\` is a computed view; it is not a second permanent storage structure.
- No extra inference requests. No data flows into the RP prompt before a controlled integration gate.
- Test scripts validate domain logic; a green testing mirror does **not** validate model understanding or Perchance live behavior.

## Manual K1 evaluation cases

Current outfit after change, old image, undated photo, later confirmation of an earlier photo, intended vs completed action, user corrections, swipes/branch switches, model JSON failure, two distinct same-time claims and a story where the model freely moves to another topic. Compare new and old output while observing exact source evidence and model latency. Do not accept changes based on clothing-only examples.

**Rollback:** K0 is dormant. Reverting the source+test+doc commit restores the prior tree; no DB migration, user content change or saved second source of truth has occurred.


## K1 — neutral interpreter adapter (implemented as isolated prototype)

New source file: \`js/knowledge/interpreter.js\`; tests: \`tests/knowledge-interpreter.js\`.

- \`prepare({chatId,path,messageId,priorAssertions,priorLinks})\` constructs one source-bound request for the **selected message and swipe**. Current text and each authored DRAW are separate source chunks, with exact quotes and generated T/D source IDs. Previous messages are *context*, never additional current source evidence.
- The model proposes semantic assertions and links. No regex over scene wording, outfits, photo-type labels, or actor clothing. The application supplies canonical claim IDs, source quotes, selected swipe, chat ID and draw index. Additional model-supplied IDs and source coordinates have no authority.
- \`interpret(request,raw)\` validates and returns \`status: ok|no-changes|partial|unprocessed\`, \`committable\`, candidates and issues. A malformed response is **unprocessed**, not a negative claim nor "no changes". A partial response is inspected, not automatically committed.
- \`execute(request,generator)\` calls a generator **only when explicitly supplied**. This phase is not connected to live providers, the RP engine, or IndexedDB and performs zero automatic calls.
- The core verifies that links target assertions visible on the prior selected path (or assertions proposed in this batch). Later confirmations can qualify old photo assertions without inventing a garment in the confirming message. Source provenance is not semantic validation; real-model benchmarks are required before enabling any writes.

**K1 acceptance here:** simulated model outputs plus source, error, intent, branch and provenance regression coverage; existing StateTracker, Memory/Reflection and RP prompts must remain untouched. **Live-model semantic quality: NOT RUN.** No DB migration. Rollback by reverting K1 source/test/doc commit. The eventual K2 journal is not authorized until measurements and a clear failure/retry policy are reviewed.


## K1 offline shadow replay

\`knowledgeInterpreter.replay({chatId,path,outputs})\` accepts a **copied** selected branch plus externally supplied model responses keyed by \`messageId:swipeIdx\`. Each entry must include \`revision\` from \`prepare(...)\` and raw output. It returns per-message statuses, a read-only projection and a count of malformed/partial/unprocessed cases. Any stale revision, unselected sibling or missing response is explicitly unprocessed. No LLM calls, no storage writes, no second active memory. Offline comparison is infrastructure, **not evidence that a real RP/Observer model produces the expected semantics**.

Before K2, test actual extracted responses against selected original messages, and measure: valid structured responses, missed/misattributed claims, branch/snapshot failures, extra model latency and failures after reload. Keep legacy writing as the sole live source of truth until an explicit migration.
