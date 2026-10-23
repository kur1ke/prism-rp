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
| Which objects/body parts does the camera show? | `[draw:]` shot metadata only; never updates outfit canon |
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

Priority by explicit evidence: scene state/direction -> clear narrative established wear event -> unequivocal first-message outfit -> explicitly configured default (if such configuration exists) -> unknown. Do not select the first wardrobe mapping merely by list order and do not promote a `[draw:]` description to Scene state. For a named Card wardrobe entry, use exact normalized label before any safe rule; ambiguous entries must not guess.

## Same-turn ordering

If the assistant removes/adds/adjusts a garment and requests `[draw:]` in the same reply:
1. Commit the accepted `stateEvents` / legacy Scene operations to the particular message swipe.
2. Fold state for that exact origin path/swipe (never the current leaf or another branch).
3. Compose the image using updated current wear state and the shot-local camera metadata.
4. Cache by snapshot-relevant inputs; editing/retrying/swiping may not reuse an image computed against a different active ancestor.

## Image-positive and image-negative outputs

- The image compiler must receive current **known worn** and **known removed/partially worn** items as separate typed data, not rely on absence of a positive tag.
- `worn` may become positive description/tags (when visible in the shot).
- `removed` has to become an explicit item-specific absence constraint; negative tags in the A1111 prompt are a **candidate translation**, not a guarantee that the model will obey. Ensure the negative label actually names the established item, not a guess.
- `partiallyWorn` needs its own visual state; not identical to `removed`.
- **Visibility is independent of physical state.** Removing underclothes beneath an opaque nightgown does not automatically make covered body parts visible. No speculative `nude`, `bare hips` or revealing shot merely because one item was removed.
- Conflict resolution must be explicit: established current state should not be silently overridden by `[draw:]` hallucinations; however a specific explicit shot may describe visibility, camera position and body parts. Preserve diagnostic explanation when a conflict is suppressed.
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
