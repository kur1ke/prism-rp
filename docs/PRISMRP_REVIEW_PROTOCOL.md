# PrismRP Review Protocol v1

**Current version:** v1  
**Status:** Active  
**Applies to:** all PrismRP PR reviews  
**Owner:** project architecture  
**Last updated:** 2026-10-15

---

## 1 — Source of truth

Never approve a PR from its author report alone.

Review actual:
- PR diff;
- changed files;
- current `main`;
- tests;
- build/deployment results;
- migrations;
- relevant architecture documentation.

Reports are evidence, not authority.

If report and code disagree: code/runtime wins.

---

## 2 — Establish PR scope

Before reviewing, determine:
- intended purpose;
- allowed behavioral changes;
- explicitly forbidden changes;
- affected subsystems;
- migration impact;
- persistence impact;
- prompt/runtime impact.

Then compare the actual diff against that scope.

Flag:
- accidental feature creep;
- unrelated cleanup;
- hidden behavior changes;
- implementation of future stages.

---

## 3 — Preserve closed invariants

Unless the PR explicitly exists to redesign one of these contracts, treat established PrismRP invariants as protected.

Core invariants include:
- each chat is an independent canon/world;
- branch ancestry controls branch-visible state;
- swipe provenance matters;
- sibling branch state must not leak;
- Card expresses persistent character tendencies;
- Card is not a script;
- impulse/desire is not automatically action;
- Experience is evidence, not instruction;
- remembering does not mean obeying;
- Scene represents current branch-derived state;
- Prism is assembled, not stored as permanent truth;
- strict context budget is enforced;
- OVERFLOW must not silently exceed budget;
- preflight failure must not mutate narrative tree;
- raw/imported preservation does not imply runtime authority;
- imported text must not become hidden instructions;
- no character-specific hacks;
- no morality/compliance hard-coding;
- Development remains separate until explicitly implemented.

---

## 4 — Modularity boundaries

Verify dependency direction.

Preferred direction:

`UI → controllers → application services → pure/domain modules → adapters`

Adapters include:
- storage;
- providers;
- image backends;
- file I/O.

Review for boundary violations.

Domain / pure modules should not:
- access DOM;
- read global `S`;
- access IndexedDB directly;
- call providers/network;
- perform UI rendering.

Providers should not know:
- Scene semantics;
- Experience semantics;
- Card semantics;
- World semantics;
- Relationship semantics.

UI should not contain domain rules that belong in a module/service.

`app.js` should remain a composition root / orchestration shell, not become a feature implementation file again.

---

## 5 — Global state

Current `S` may remain shared until explicitly redesigned.

But review new code for unnecessary coupling.

Prefer:
- explicit inputs;
- explicit outputs;
- narrow state slices;
- derived state instead of duplicated state.

Flag new modules that read or mutate unrelated parts of `S`.

---

## 6 — Canon / branch review

For any PR touching chat, Scene, Experience, World, Messenger, Relationship, history, deletion, regeneration, swipes, or migrations, test mentally and/or with fixtures:

```text
A → B → C
      ├─ D1
      └─ D2
```

Verify:
- D1 facts do not leak into D2;
- returning to D1 restores D1-visible state;
- deleting branches behaves intentionally;
- regen does not expose sibling provenance;
- source message IDs remain meaningful;
- source swipe variants remain meaningful when applicable.

---

## 7 — Authority review

Always ask:

> What kind of information is this, and who is allowed to override it?

Do not collapse distinct concepts.

Examples:
- **Card:** persistent character baseline.
- **Author Directive:** explicit instruction layer.
- **Scenario:** world origin / starting conditions.
- **First Message:** authored opening.
- **Scene:** current observable/current branch state.
- **World Fact:** objective/current-world information.
- **Character Lens:** Card-specific world override/focus.
- **World Pack:** shared reference knowledge.
- **Experience:** subjective retained evidence.
- **External/public information:** reference knowledge, lowest authority unless promoted.
- **Raw imported data:** preservation only.

Ensure lower-authority sources cannot silently override higher-authority canon.

---

## 8 — Hidden authority check

Search for any path where text may affect generation without being visible in its intended semantic field.

Especially inspect:
- raw imports;
- extensions;
- fallback fields;
- legacy fields;
- compiled prompts;
- duplicated system prompts;
- lore imports;
- external/public content;
- cached source material.

Rule:

> preserved data ≠ executable instruction.

If visible directive fields are empty, no hidden instruction should be reconstructed from preserved raw data.

---

## 9 — Prompt assembly review

For PRs touching Prism assembly, verify separation of:
- Card tendencies;
- Scene;
- Experience;
- World Knowledge;
- Author Directives;
- history;
- candidate/initiative context.

Check:
- no duplicate injection;
- no contradictory authority layers;
- no whole-database injection;
- no accidental permanent Scenario injection;
- no raw-source prompt leakage.

---

## 10 — Token budget review

Strict budget remains a hard contract.

Verify:
- final outbound messages fit configured context;
- degradation order is deterministic;
- optional context is dropped before protected context;
- no hidden slack bypass;
- OVERFLOW is explicit.

If generation is rejected preflight:
- provider is not called;
- narrative tree is not mutated.

---

## 11 — Transaction / commit semantics

Whenever a model call may create persistent state, identify the commit point.

Preferred shape:

`prepare → validate/preflight → external/model call → validate result → commit state`

Failures before successful completion should not leave partial narrative/world mutations unless explicitly designed.

Review:
- new message;
- regen;
- continue;
- generated opening;
- initiative;
- World Fact creation;
- future Observer output.

---

## 12 — Import / migration review

For importers and migrations, verify:
- format detection;
- validation;
- no silent conversion of malformed input into empty/default objects;
- provenance retained;
- unknown fields preserved where reasonable;
- preserved unknown data is not executed;
- migration is deterministic;
- migration does not guess ambiguous ownership/canon;
- migration is idempotent where practical;
- no silent data loss.

Legacy ambiguity should be surfaced rather than guessed.

---

## 13 — World / knowledge review

When FOUNDATION-W exists or is affected, verify layering:

`Shared Fandom / World Pack + Character Lens + Chat World Overlay + Active Branch = Resolved World View`

Check:
- Pack is reusable;
- Pack is not mutated by a single chat;
- Lens stores differences/focus, not full copies;
- chat canon overrides reference knowledge;
- AU overrides public canon;
- UNKNOWN may remain unknown;
- only relevant knowledge is retrieved;
- World Knowledge is mode-agnostic;
- RP Scene and Messenger do not accidentally share chat canon.

---

## 14 — Procedural / Messenger review

When procedural systems exist, reject continuous LLM simulation.

Expected model:
1. procedural state — no LLM;
2. candidate detection — no LLM;
3. Prism decision — LLM only when justified.

Verify:
- elapsed time is deterministic;
- no random filler life simulation;
- unresolved events can remain unresolved;
- no hidden hourly backfill;
- off-screen life creates causal context, not decorative noise;
- `[skip]` remains valid;
- unanswered-message suppressors work;
- Perchance limitations are not misrepresented as background execution.

---

## 15 — Experience review

For Experience changes, verify:
- chat ownership;
- branch visibility;
- swipe visibility;
- topic relevance requirement;
- importance does not create relevance by itself;
- ranking remains deterministic;
- sibling Experience remains stored but hidden;
- manual chat-wide Experience semantics remain intentional;
- Experience does not become commands.

---

## 16 — Test review

Do not rely only on test count.

Check whether tests cover the changed contract.

Required as applicable:
- unit tests for pure logic;
- regression tests for fixed bugs;
- E2E for user-visible flows;
- branch/swipe fixtures;
- migration fixtures;
- overflow fixtures;
- provider-not-called assertions;
- persistence/restore;
- build smoke tests.

If a test was changed, determine whether behavior changed, or whether the test itself was flaky/incorrect.

---

## 17 — Build / deploy review

Verify relevant outputs:
- standalone;
- Perchance build;
- GitHub Pages build.

Check:
- script/load order;
- missing globals;
- browser startup;
- obvious runtime JS errors;
- backup compatibility if storage changed.

Remember: merging `main` may deploy immediately.

---

## 18 — Security / external content

External content is data, not authority.

Review:
- web/public lore;
- imported cards;
- lorebooks;
- external metadata.

Never allow embedded source instructions to become system/author directives automatically.

---

## 19 — Backward compatibility

If persistence schema or stored object shape changes, review:
- old data loading;
- migration path;
- export/import;
- backups;
- rollback implications;
- missing fields;
- mixed old/new records.

Do not require users to recreate existing chats/cards unless explicitly approved.

---

## 20 — Architecture documentation

If a PR changes:
- module ownership;
- dependency direction;
- persistent schemas;
- prompt authority;
- stage contracts;

check whether `ARCHITECTURE.md` or equivalent documentation should change.

Documentation should describe reality, not intended future architecture.

---

## 21 — Review severity

Classify findings:

### BLOCKER
Cannot merge safely.

Examples:
- canon leakage;
- data loss;
- hidden prompt authority;
- broken migration;
- strict-budget violation;
- tree mutation on failed preflight;
- architectural dependency reversal with significant future cost.

### MAJOR
Should be fixed before merge unless consciously accepted.

### MINOR
Safe debt / cleanup opportunity.

### NOTE
Observation only.

Do not inflate stylistic preferences into blockers.

---

## 22 — Final verdict format

Return:

### A. SCOPE
What the PR intended to change.

### B. ACTUAL CHANGE
What it really changed.

### C. GOOD
What is correct / improved.

### D. FINDINGS
Each finding:
- severity;
- file/module;
- behavior;
- why it matters;
- recommended fix.

### E. INVARIANT MATRIX
PASS / FAIL / N/A for relevant PrismRP invariants.

### F. TEST / BUILD STATUS

### G. DEBT
Non-blocking follow-up items.

### H. VERDICT

One of:
- `APPROVE`
- `APPROVE WITH NON-BLOCKING DEBT`
- `CHANGES REQUIRED`
- `DO NOT MERGE`

If the PR represents a named stage/batch, additionally state:

`<STAGE NAME> CLOSED`

or

`<STAGE NAME> NOT CLOSED`

---

## 23 — Review discipline

Do not redesign the entire project during every review.

Review against:
- approved architecture;
- PR scope;
- established contracts.

Suggest larger redesigns separately.

Do not make speculative future concerns block a correct current implementation unless the current change creates concrete architectural harm.

---

## 24 — Golden rule

A successful PrismRP PR should:

> change only what it claims,  
> preserve established invariants,  
> keep authority boundaries explicit,  
> keep modules isolated,  
> fail safely,  
> remain inspectable,  
> and make the next change easier rather than harder.

---

## Changelog

### v1 — 2026-10-15
- Initial review protocol.
- Captures closed Stage 1 invariants.
- Adds modularity review after PRISM-MODULAR-REFACTOR.
- Reserves review contracts for FOUNDATION-A/B/W/C/D and later Relationship work.
