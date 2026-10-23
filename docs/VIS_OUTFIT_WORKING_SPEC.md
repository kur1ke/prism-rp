# VIS-OUTFIT-1 — authoritative current outfit and compositional wear state

**Status:** WORKING CONTRACT / NOT CLOSED. Derived from the user-supplied earlier discussion (“VIS-OUTFIT-1 — AUTHORITATIVE VISUAL OUTFIT STATE”), revisited 2026-10-23 after the recurring Orihime clothing-removal bug. Not a claim that every part is implemented.
**Target:** isolated `testing` branch; `main` stays stable until explicit approval.

## The failure we must actually fix

- A character repeatedly removes an item in narration, but the tracker only keeps an outer garment (e.g. nightgown). Without a persisted absence fact, the RP model and image generator may treat the item as worn again.
- Existing tracker `wear.remove` returned unchanged when prior `wear` was unknown; when known, it removed only a string from a positive list. No negative item persisted. Image prompt currently receives `wear` but no item-specific explicit absence.
- The user's issue is both *RP causal continuity* and *visual continuity*. A passing state-unit test alone cannot close the latter.

## Ownership boundaries (non-negotiable)

| Question | Owner |
|---|---|
| What authored outfits are known? | Card wardrobe dictionary (`outfitTags` / current image-wardrobe equivalent); templates, not current facts |
| Which established outfit is currently active? | Scene/StateTracker current outfit: a named wardrobe reference **or** inline description |
| Which garment pieces are worn, removed, displaced? | Scene/StateTracker derived WearState, with precise branch/swipe/evidence provenance |
| What garments have been purchased/received and remain owned? | Future separate Wardrobe/Inventory registry, not part of VIS-OUTFIT-1 |
| How/why did an outfit appear in story? | Experience is evidence, not exact canonical current clothing |
| Which objects/body parts does the camera show? | Character-authored `[draw:]` determines its own image; the same description can supply *validated* visual observations to StateTracker without directly writing Scene |
| What identity/LoRA applies? | Card image configuration; never inferred from absent/worn facts |

No character-specific rules. No fixed clothing vocabulary or guessing from untrusted raw imported data. Do not duplicate storage of the same physical facts in a new global registry.

## Desired semantic contract

Conceptual (not yet a persisted schema):

```js
CurrentOutfit = {
  baseRef?: string,              // exact, unambiguous named wardrobe ID/label
  inlineItems?: string[],        // when no safe named entry exists
  wearState: {
    worn: ItemFact[],
    removed: ItemFact[],
    partiallyWorn: ItemFact[]    // explicit, not derived from position guesses
  }
};
ItemFact = {
  item: string,
  certainty: "established" | "reported",
  source: {messageId: string, swipeIdx: number, role: string, evidence: string}
};
```

- **Unknown** is not **removed**. An isolated established removal persists even when the rest of the outfit is unknown. Never fabricate remaining items.
- Intentions and futures do not mutate current WearState.
- Putting the same item back changes removed -> worn. Partial adjustment changes worn -> partiallyWorn without pretending the item is entirely removed. Explicit full outfit replacements may retire old facts; ambiguous descriptions must not be treated as replacements.
- Normalization must match demonstrably the same garment; fuzzy substring/semantic merging that combines separate items is not allowed. Explicit item identity is preferable to names in future.
- Later corrections update the same branch; alternate swipe and sibling branches must not share these facts.
- State survives raw-history eviction by being folded from the relevant events, not by model memory or summaries. No hindsight rewrite of old nodes; legacy history may contain old valid `stateEvents` and should be read compatibly.
- In Messenger physical evidence from a message is `reported`, not objective. In RP a performed action can be `established` if supported by the speaker's actual text. This epistemic distinction persists into Prism and images.

## Establishing an initial outfit

Priority by explicit evidence: scene state/direction -> clear narrative established wear event -> unequivocal first-message outfit -> explicitly configured default (if such configuration exists) -> unknown. Do not select the first wardrobe mapping merely by list order. A raw or compiled image does not automatically write Scene, but a current self-photo's source-bound `[draw:]` may establish item-level WearState via Observer and the existing selected-swipe `stateEvents`. For a named Card wardrobe entry, use exact normalized label before any safe rule; ambiguous entries must not guess.

## Same-turn ordering

If the assistant removes/adds/adjusts a garment and requests `[draw:]` in the same reply:
1. Interpret both the text and the character-authored `[draw:]` as distinct evidence surfaces and commit the validated `stateEvents` / legacy Scene operations to the particular message swipe. Apply text evidence before newer current-photo evidence; do not let lexical fallback undo a confirmed visual removal.
2. Fold state for that exact origin path/swipe (never the current leaf or another branch).
3. Compose the image using updated current wear state and the shot-local camera metadata.
4. Cache by snapshot-relevant inputs; editing/retrying/swiping may not reuse an image computed against a different active ancestor.

## Image-positive and image-negative outputs

- The image compiler must receive current **known worn** and **known removed/partially worn** items as separate typed data, not rely on absence of a positive tag.
- `worn` may become positive description/tags (when visible in the shot).
- `removed` has to become an explicit item-specific absence constraint; negative tags in the A1111 prompt are a **candidate translation**, not a guarantee that the model will obey. Ensure the negative label actually names the established item, not a guess.
- `partiallyWorn` needs its own visual state; not identical to `removed`.
- **Visibility is independent of physical state.** Removing underclothes beneath an opaque nightgown does not automatically make covered body parts visible. No speculative `nude`, `bare hips` or revealing shot merely because one item was removed.
- Conflict resolution must be explicit: a character-authored `[draw:]` controls the image it actually sends, including visible outfit changes, and can update current WearState only through evidence-grounded Observer events. Older Tracker facts must not silently rewrite a correctly authored shot. Manual image generation without a current authored draw may use canonical Tracker reconciliation. Preserve exact source diagnostics.
- LoRA/trigger/appearance of a card remains the separate authorized identity layer. Do not delete it when adjusting clothes.

## Visibility and debugging

Use existing Debug/Visual State Inspector; do not build another debug UI. Future entries should expose `currentOutfit`, source, `worn`, `removed`, `partiallyWorn`, wardrobe lookup, shot garment mentions, conflict treatment, positive tags, negative constraints and final backend prompt.

## Minimal regression matrix (acceptance, not a pass claim)

1. Unknown initial outfit stays unknown, no invented clothes.
2. Explicitly established outfit is stored and available in RP and image contexts.
3. Named wardrobe entry resolves exactly; no fuzzy wrong match.
4. Natural-language inline outfit stays intact.
5. Outfit persists unchanged over many turns even with no repeated mention.
6. Raw history containing establishment falls outside context: current state persists.
7. Draw omits clothes: known clothes still applied correctly if visible.
8. Draw repeats compatible clothes: no duplicate garment.
9. Draw conflicts with known outfit: explicit precedence and diagnostics.
10. Same-turn wear change reflected in same-turn auto-image.
11. Sibling branch isolation.
12. Regen/alternate swipe isolation.
13. Same-ID edits and cache invalidation.
14. Two characters with independent wear state.
15. Unknown/ambiguous wardrobe label never resolves by guess.
16. Renamed card / SCENE-ID canonical identity stays attached.
17. Inspector shows source and resolved tags/constraints.
18. Long-context Orihime-style continuity in final image prompt.
19. **Added after the reported regression:** removal without known prior worn list persists as item-specific absence and appears in RP factual context.
20. Partial removal then full removal then rewear: three distinct states with provenance.
21. Absence under concealing outerwear doesn't hallucinate visible nudity.
22. Backend negative constraints contain only actual removed items; no broad removal of unrelated garments.
23. Live-model observer returns valid evidence-grounded actions on representative Russian utterances; record misses separately from fold bugs.

Test A1111/Forge with controlled model/seed/shot settings and compare **prompt correctness** as primary acceptance, not pixel similarity. Recheck Scene ID, strict budget, branch provenance, image origin, retry and provider compatibility. Nothing in this design authorizes main promotion.

## WS-1 canonical WearState consolidation (testing candidate)

This batch is deliberately narrower than VIS-OUTFIT-1 closure. StateTracker now
folds garment events into one derived `wearState` with `known` (some
positive garment knowledge), `complete` (explicit full outfit), `worn`,
`removed` and `partiallyWorn`. `fields.wear` is rebuilt only
from this state for legacy consumers. Each item has explicit certainty and
source; `wear.adjust` includes a verbatim `placement` excerpt from
current-message evidence. There is no new persisted inventory or schema
migration: the original `stateEvents`, corrections, and legacy Scene remain
the source of truth, replayed on each selected path/swipe.

Observer prompting is deliberately unchanged in WS-1: automatic
`wear.adjust` extraction needs exact item identity via branch-local
references and real-provider evaluation before it can be enabled.
Tracker can replay verified `wear.adjust` events; this does NOT establish
live Observer support. Contextual `referenceId` remains restricted to
`wear.remove`.

StateResolver can expose typed partial facts without making Image Compiler
interpret them. The composer does not yet implement positive partial-placement
tags or garment-specific negative constraints; same-turn A1111/Forge and
Perchance validation remain outstanding. Do not mark VIS-OUTFIT-1B/1C/D closed
from this batch alone.

### VIS-REF-2 — bounded action-specific adjust references (testing candidate)

Observer now receives both remove and adjust references derived from the
same active-path `worn + partiallyWorn` garment facts (at most 12 garments,
with distinct action-qualified IDs). Existing `wear:actor:index` remove
IDs retain their legacy format and meaning. A new `wear:actor:index:adjust`
reference only supports `wear.adjust`; the model supplies a verbatim
`placement` from its **current** message, while the application substitutes
the exact item name and validates the referenced source during each fold.
Both natural-language names and pronouns may use the same prior fact without
copying a second item into WearState. Wrong actor/action/swipe, stale sources
and ungrounded placement are rejected; ambiguous pronouns must be unresolved.
This uses the existing StateTracker + Interpreter contract, not another
matching engine or new canonical fact store.

The WS-1 paragraph above records the state at that PR; this later candidate
enables Observer extraction experimentally and DOES NOT assert successful
live-provider sampling. No changes to Image Compiler, A1111 negative
constraints or `[draw:]` authority are included. Validate manual Perchance
and live Russian dialogue separately.

## VIS-OUTFIT-1C-1 — canonical image input contract (testing candidate)

The image service must derive one StateResolver projection from the **frozen image
origin path/swipe**. StateResolver supplies `worn`, `removed`, and
`partiallyWorn` facts for each actor; `imgCompose` uses only the `char`
slice if that actor is the visible owner or owns the camera. Other actors'
facts are not transferred as this character's outfit. Card wardrobe presets
are *not* current facts: when canonical absence/displacement is present, a
full-outfit preset may not silently reintroduce a removed garment.
The same holds for optional Card NSFW look presets: a camera-shot keyword
alone cannot elevate them above established clothing changes.

The compiler sees compact canonical physical facts as **data**, not hidden
instructions, and reconciles a shot's clothing claims with these facts.
`[draw:]` continues to own composition, framing, pose, and visibility. It
never writes state. Canonical clothing changes force compiler reconciliation
even if the shot is already English or general translation is disabled.
When that reconciliation fails, backend generation does not run.

The existing Image Compiler uses **one model request** to translate the
camera shot and, if a removed item is known, return a strict structured JSON
response with the English positive `prompt` and source-indexed English
`absent` garment tags. These two outputs are checked and cached **together**
against the same canonical wear input; there is no second translation mechanism
or per-garment model call. The response must map precisely one syntactically
valid garment tag to each known removed item. Malformed or missing mappings
fail before backend generation. Global garment negatives apply only in
single-character shots; multi-character shots use canonical scene reconciliation
without globally forbidding other people's clothing. `partiallyWorn` is
positive placement information, not a removed garment. Existing lexical
wardrobe filtering is bypassed for successfully canonical-compiled clothing.
Image persistence revalidates the selected ancestor swipe/text/scene/state event
fingerprints after asynchronous calls; stale origin facts never silently attach
to the current branch, and an invalid image is marked for retry.
No new canonical state store, parser or inventory is created.

The semantic correctness of model-produced English garment tags and the
compiler's ability to remove all contradictory positive tokens are **NOT
provable by schema validation alone**. Perchance, real text provider and
A1111/Forge checks remain mandatory; until then this is a scoped candidate,
not a claim of visual consistency or VIS-OUTFIT-1 closure.

## VIS-DRAW-SOURCE — photographic evidence and image authority correction (testing candidate)

**Motivation:** A Messenger character may write only “Вот фото” while its authored
`[draw:]` describes current clothes or a garment being lowered/removed. Requiring
the character to repeat the details as ordinary chat text left Tracker blind,
while forcing prior text-only WearState into the valid shot corrupted the image.

**Ownership and trust:** `sw.draws[0].prompt` is the *author-generated visual
assertion*, not the backend image, rewritten prompt, user-supplied manual image,
Card preset or provider instruction. It can be source evidence for the character's
**current own photograph**. The one existing Observer interprets both caption
and original shot; only supported `wear` events with
`evidenceType: "draw"`, `visualScope: "current-self"`, and a quote exactly
present in the selected swipe's original draw are accepted. Messenger visual
self-reports retain `certainty: "reported"`. Non-current, fantasy, old photos,
screenshots, other actors, and absent/out-of-frame garments do not establish
new current garment facts by default. When no entire outfit is known, `wear.add`
establishes the particular visible item without inventing the rest. A visual
source cannot issue a full outfit `set` or `clear`: even a full-body image does
not prove hidden layers. An explicitly described current absence (e.g. `no shorts`)
can establish that exact removed item, while simply failing to show an item
cannot. An actual removal or displacement is `remove` or `adjust`, never inferred
merely from the camera not showing an item. `stateEvents` remain the only recorded facts.

**Actor/item provenance:** `StateTracker.fold` revalidates `draw` event
evidence against the original authored prompt on each active path and swipe;
visual facts are not shared with siblings. Existing action-specific
`referenceId` resolves already-known garments across languages and inflections
without a hardcoded vocabulary or new fuzzy matching layer. A later visual
change is applied after text assertions of the same swipe. Text-only lexical
fallback cannot re-add uncorrelated garments over a confirmed visual change.
This is a conservative fallback policy; the Observer remains responsible for
correctly identifying all nonconflicting independently evidenced garments.

**Image contract:** The character-authored shot is authoritative for the
generated frame. Retain Card trigger, identity and LoRA but do not inject
old Card wardrobe, optional NSFW preset or text-only Tracker corrections
to rewrite a current authored `[draw:]`. English tagged authored shots
must not need a second model translation; `drawPromptMode: "intent"` uses its
single intent-to-shot conversion. Image origin guards continue to protect
message/ancestor/swipe/draw provenance; unrelated Observer updates do not
invalidate a previously authored shot. Manual/non-authored images may still
use typed state reconciliation from VIS-OUTFIT-1C-1.

**Remaining verification:** tests prove parsing/routing and branch replay,
not real LLM identification of old versus current images or English/Russian
reference success rate. Test the separate Perchance Messenger auto-photo path,
backend prompt, next-turn Prism, regeneration and source editing. No separate
visual inventory, no raw image OCR, no change to `main`. VIS-OUTFIT-1 remains
NOT CLOSED without live model and Forge evidence.

## Staged implementation / CURRENT STATUS

- **VIS-OUTFIT-1A (this PR):** reliable first-class `removed` facts with provenance despite unknown prior outfit; add/rewear cancellation and budgeted RP facts. CI tests only, real browser NOT RUN.
- **VIS-OUTFIT-1B (not yet implemented):** `partiallyWorn` plus non-lossy, exact safe item identity and actor-specific corrections; check observer action extraction quality under real provider.
- **VIS-OUTFIT-1C (not yet implemented):** named/inline current outfit and Card wardrobe resolver (no inventory ownership), same-turn shot precedence and per-item negatives via a supported compiler contract, not raw untranslated Russian tags.
- **VIS-OUTFIT-1D (not yet implemented):** complete acceptance matrix, Debug inspectability and controlled Forge/live Perchance comparison.

**VERDICT:** VIS-OUTFIT-1 NOT CLOSED until every required invariant, especially final negative image prompt and branch-consistent visual result, is verified.


### VIS-REF-1 — reference-aware Observer (testing, pending live validation)

- Observer sees only bounded recent messages of the active lineage and typed candidates derived from the current path snapshot. Prior messages are context data, not fresh actions.
- For clothing `wear.remove`, the model may return `referenceId` to a *known worn item*. Code resolves the exact original item + original source, preserves the action quote from the current message, and validates the same reference again during every path fold. Unknown/foreign/edited/reassigned references are rejected, never silently guessed.
- `state/service` protects the entire observed ancestry (text, swipes, state events and corrections) from changes during asynchronous analysis, including speculative preparsing.
- Pronoun ambiguity is not deterministically decidable in all cases: the model must report `unresolved`, rather than invent an item. This is a safety contract and requires real model sampling. Other domains and `partiallyWorn` are not implemented by this batch.
