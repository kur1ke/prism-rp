# STATE-OBS-1 — Observation → Identity → Transition

**Stage:** EXPERIMENT. Base branch: `testing`. `main` must not change. This redesign explicitly supersedes the earlier practice of validating canonical garment names by requiring every adjective in the event value to occur in a short DRAW citation.

## Root failure

An author-written DRAW can truthfully say: «Она полностью сняла белую блузку и отбросила её в сторону». An earlier initial outfit names «белая хлопковая блузка с коротким рукавом». The action/citation and the identity are two distinct facts. The existing `StateTracker.validateEvent()` checked all meaningful tokens of `value` against `evidence`, so correct reference resolution was sometimes rejected as an invented value. Rejected `wear.remove` also deprived `frameObjects` of a verified reference, and the bounded RP `wear-inquiry` had no event that could trigger it. This was a cascading failure, not a translation issue.

## Contracts

**Observation** — `actor`, `field`, `action`, `certainty`, exact `evidence`, and source (`text` or `draw`, including `visualScope=current-self` where applicable). Only the current speaker can report their own worn items. Historical, other-actor, hypothetical, screenshot and unrelated imagery cannot change present state. Quotes are literal data, never instructions.

**WearObservationResolver** — read-only pure module. A short `itemMention` is an exact substring of `evidence`; unlike `value`, it is not an inventory key. The resolver compares only against current `TRACK.references(state,actor,[action])` supplied by active ancestry. Matching is conservative: meaningful tokens in the mention must match a **unique** known item; quoted modifiers such as colour cannot conflict. On ambiguity, return `unresolved`, not an arbitrary identity. A limited compatibility path derives a contiguous matching noun phrase when the Observer returns the full old name but the quote names only its shorter form. No static per-character wardrobe schema and no image renderer input.

**Transition** — only `StateTracker` mutates the folded canonical state. The resolved event stores canonical `value`, a pinned branch-local `reference` with original source and `itemMention`; Tracker rechecks exact source quotation, mention/reference identity, actor, swipe and inherited source fingerprint on every replay. Legacy events without `itemMention` still replay with their pre-existing rules. New events do not require an IndexedDB schema migration.

**Stable event-unit references** — all events from *one* authored DRAW are checked against reference IDs at the start of that DRAW. They do not renumber after an `adjust` or `remove` in the same frame. A later DRAW during `continue` gets references from the derived outcome of previous confirmed frames. The unit reference cache exists only during `fold`, never as a separate store.

**UI diagnostics** — Debug → События displays the literal observation, short `itemMention`, accepted canonical item and linked `reference.id`, if resolved. Failed or ambiguous observations remain in the Observer issue list. No raw RP/model instructions are stored.

## Examples

- «Подняла белую блузку вверх» → `wear.adjust` of the **same** previously worn blouse, with exact placement; not a removal.
- «Полностью сняла белую блузку» → `wear.remove` of unique known blouse even if its canonical name includes material, sleeve length and inflection.
- «Отбросила её в сторону» does **not** prove that the blouse is still in the camera frame; `frameObjects` remains separate and requires a grounded `offBody` object. Nothing off-frame is fabricated.
- Two white blouses and only «сняла блузку» → `unresolved`, no arbitrary removal.
- A close-up omits the skirt → no removal.
- A current outfit changes without saying what is hidden → unknown hidden layers stay unknown, addressed separately to the RP-model where permitted. Failed inquiry cannot revoke a confirmed removal.

## Authority, storage and budget

- No new global wardrobe, hidden actions, user memory edits, scripts, or raw-import instructions.
- Current `stateEvents` / `wearInquiries` remain on the selected swipe only. Sibling swaps and other chats have no access.
- `Card`, `Scene`, `Experience`, `World`, and Prism budgets retain their boundaries. Pure resolver makes no model/network requests; only the existing bounded `wear-inquiry` path may contact RP provider.
- Observation metadata may slightly increase persisted `stateEvents` JSON by one brief `itemMention` per resolved garment event; still bounded by `INT.MAX` and the existing per-field/quote limits.
- Rollback: old builds ignore `itemMention` on the canonical event and continue to use its validated `reference`; no database migration. For a version incompatible with newly stored events, do not reimport/overwrite the TEST database blindly.

## Acceptance and remaining debt

Automated: `node tests/run.js`, `node tests/test-mirror.js`, `node build.js`; no untested PASS claims. Tests include exact user DRAW, long canonical descriptor, ambiguous near-identical clothes, conflicting colour, actor and quote provenance, alternate swipe, two garment changes in one frame (stable refs), and continued frames (new reference unit).

Manual in **Perchance TEST** (NOT RUN): select active original swipe, confirm source/build SHA, generate lifted and then removed blouse, inspect Debug → События / Ошибки and RP hidden-clothing report; switch swipe/branch, return to original, use continue with two DRAWs, reload, and verify no stale outfit. Record actual model response and diagnostic for cases unresolved because of ambiguous clothing or novel multilingual labels. No promotion to `main` until separate release review.

**Known limitations:** morphology-based phrase resolution is deliberately conservative and cannot guarantee all multilingual/synonymic descriptions. Do not broaden to fuzzy matching without an explicit disambiguation contract and adversarial tests. The data-only author DRAW remains unaffected. When the initial Observer reports the wrong action (e.g. `add` rather than `remove`), identity resolution cannot invent the correct action.
