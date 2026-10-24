# VIS-CONSISTENCY — единый контракт состояния и изображения

**Status:** Adopted architecture; incremental implementation in `testing`.  
**Scope:** Observer → StateTracker → StateResolver → transient VisualPlan → ImageCompiler → ImageService/A1111.  
**Out of scope:** new wardrobe inventory, character-specific rules, physics simulation, Card/World/Experience/Prism semantics, CTX-BUDGET-1 changes, `main` promotion.

## 1. Existing mechanisms and authoritative data

- `chat.initialWear` is the Messenger-only exhaustive origin fact (`known=true, complete=true`). A failed origin leaves wear unknown, never naked. Omission in a complete origin is **not worn**, but is not proof of a removal event.
- `swipe.stateEvents`, manual `stateCorrections`, and compatible RP `sceneOps` are replayed in selected-path order by `state/tracker.js`; the resulting `wearState` is **derived**, never an independently persisted wardrobe. Keep `worn`, `partiallyWorn`, and `removed` disjoint; `fields.wear` is only a compatibility projection.
- `state/interpreter.js` is the single semantic Observer. Source text and current assistant-authored `[draw:]` are distinct evidence surfaces; evidence, actor, action, references and branch provenance are validated. Image-model pixels, rewritten prompt tags, manual image prompts, unrelated photos, imports and memories never become canonical wardrobe events.
- `state/resolver.js` exposes an immutable projection for an exact branch/swipe. `Card` stores stable identity and wardrobe dictionaries, not today's outfit; `World` and `Experience` cannot dress a character by implication.
- `images/service.js` freezes the source path before asynchronous work. Automatic Draw normally runs after `state.track()` in `generation/service.js`; it must **not** be assumed that all image requests are automatic or that a successful Observer response contains all visual facts.
- `images/compose.js` supplies identity, frame/camera metadata, optional Card/LoRA/fixed prompt tags and backdrop; `images/compile.js` translates an image intent. The final A1111 positive and negative, not an intermediate description, are executable instructions.

## 2. Semantic distinctions (normative)

**Wear status:** UNKNOWN (no fact), WORN, PARTIAL (still on body, displaced), REMOVED (not worn). Neither UNKNOWN nor a hidden/off-camera garment implies removal. `complete=true` makes initial worn list exhaustive, without generating fictitious `removed` events for every omitted garment.

**Visibility:** ON_BODY_VISIBLE, OFF_BODY_VISIBLE (held / lying nearby), NOT_SHOWN / OUT_OF_FRAME. Visibility is not physical state. A removed shirt can be visible in the hands; a worn sock may be outside a head-and-shoulders shot. **WORN does not imply MUST_RENDER; REMOVED does not imply NOT_IN_IMAGE.**

**Time:** PRE-TURN → accepted message/scene operations → validated Observer events → END-OF-TURN. At the latter point the same-turn image is composed. Explicit future/conditional intent does not change wear; an immediately executable action may be inferred from conversation time/context only by Observer, not by an image compiler.

**Authority / chronology:** `initialWear / sceneInit / legacy baseline` → selected `sceneOps` → validated text events → validated current-self authored-photo events → manual corrections. A later shot can contradict an earlier shot only on facts it actually establishes; silence and crops do not erase earlier facts. In legacy RP, `.wear` means full replacement; `.add` and `.remove` must preserve item-level absence, not silently turn into full-set replacement.

## 3. Transient VisualPlan

A pure, immutable, bounded, **non-persisted** projection prepared for each image from the selected source's END-OF-TURN `wearState`, actor/frame ownership, source `draw`, and validated shot-local facts. It is **not** a second StateTracker and must not apply state transitions.

Conceptual contract:

```js
VisualPlan {
  actor: "char", // only when card owner/current camera actually depicted
  source: { chatId, messageId, swipeIdx, pathFingerprint },
  wear: { known, complete, worn, partiallyWorn, removed },
  visibility: {
    onBody: [],            // visually relevant worn/partial items, not all worn items
    offBody: [],           // explicitly shown objects not worn on the body
    absentFromBody: []     // asserted absence, never universal absence from image
  },
  conflicts: []            // diagnostic, not canonical state updates
}
```

An off-body item requires grounded, typed evidence from **the current image**. Do not guess it merely from `REMOVED`; do not add a lexicon of character-specific clothes. ImageCompiler may translate a verified visual role but must not independently decide `remove` vs `adjust` or change state.

The plan is immutable and never sent to RP generation as new hidden authority. Relevant source references are bounded and respect `CTX-BUDGET-1`.

## 4. Compilation and authority contract

- Positive garment tags describe what **is to be depicted**, not all nouns in narration. `remove shirt` must **not** turn into `lifting shirt, white shirt`. `holding removed shirt` may produce `holding white shirt` when that appearance is grounded.
- Negative garment tags are optional reinforcement for an item **absent from the rendered frame**. Do not globally negative a garment shown off-body or worn by another depicted character.
- Observer's typed END-OF-TURN wear state is authoritative for whether the owner wears each garment. The authored Draw determines the current shot, not a competing permanent outfit. If Observer failed on a material action, do not silently pretend the earlier `partial` is the completed `removed` state.
- ImageCompiler should output typed, index/source-bound garment roles and scene tags with a verifiable structure. Its success flag must distinguish parse/translation success from semantic validation. Arbitrary image-model tags cannot become state evidence.
- Finalisation must reconcile **all** positive sources (identity / Card / LoRA / fixed prompt / compiled scene), without quietly erasing explicit user directives. On a material irreconcilable conflict, report it and do not call the backend.
- An unsupported ambiguous action should fail closed for that **material shot**, not block unrelated landscape/screenshot generation. An image already drawn is not proof the tags matched reality.

## 5. Source, history and transactional contract

Read selected path and active source swipe once at image start; use END-OF-TURN resolved state for that source, not current leaf state when redrawing history. Apply canonical facts only to the correct actor (camera owner != extra full figure). Before backend submission and before image commit, check frozen chat, ancestor/swipe selections, text/Draw and any state events/corrections on which the plan depends. A stale image is discarded without mutating events or resurrecting deleted messages.

`A → B → C1 / C2` must reproduce `B`'s outfit independently of the later chosen branch. Manual image generation is not a canon change. Continued swipes/multiple photos need their own bounded evidence/version contract; do not treat a later cropped photo as undressing or re-dressing.

## 6. Incremental implementation

**VC-01 — Read-only plan and image intent reconciliation.** Build a transient plan from canonical selected-path wear. Route authored `intent` through the same wear compiler contract instead of bypassing `wearState`. Keep one translation-model call, branch identity, camera semantics, and fail-closed on unusable structured outputs. Preserve the legitimate off-body garment scenario; do not introduce indiscriminate negative tags. Add source-aware tests including Russian `remove` vs `lift` sample.

**VC-02 — Typed frame visibility facts.** Reuse Observer's current-message evidence to carry bounded off-body/on-body roles for the shot; verify role evidence and origin, with no new persisted current-outfit store. Distinguish renderable removed objects from on-body garments. Revisit multiple-Draw behavior.

**VC-02 implementation slice (2026-10-24, candidate):** Observer may return optional `frameObjects` entries with `role=offBody`, exact current Draw `evidence`, and either an index into a validated same-shot `wear.remove` event or a branch-local `referenceId` for a previously removed garment. The normalized objects are stored only in the existing swipe `stateStatus.frameObjects` diagnostic metadata (not in `stateEvents`, Card, or an outfit registry); `VisualPlan` consumes them only if status matches current swipe text and exact authored Draw, and the item is still in canonical `removed`. ImageCompiler receives these as shot-local objects within its existing single-model-call translation contract, with no global garment negative for authored shots. Compiler cache keys include visible-object roles. Changes to these role facts invalidate the image-source fingerprint. This slice does **not** claim deterministic English tag semantic validation, covering previous multiple-Draw photographs, or robust absence-specific negatives: those remain VC-03/04. Plain image output cannot create garment facts.


**VC-03 — Typed compiler and final-prompt validation.** Translate semantic roles into tagged sections; validate index/mapping, no contradictory worn garment instructions, and sources injected after translation. One compiler model call, no second interpreter. Failed semantic validation prevents A1111 submission. User fixed-prompt conflicts are explicit.

**VC-03 incremental scope (2026-10-24, candidate):** Both author-owned `intent` and English `tags` paths now use the selected-swipe END-OF-TURN canonical garment facts, never the old bypass. For removed garments the single ImageCompiler reply supplies `absent` index mappings; for any verified visible off-body objects it must additionally supply `offBody` index-to-positive-tag mappings. A deterministic pure audit checks that no unaccounted removed garment name appears as an executable positive tag, including weighted tags. It uses the trailing lexical garment noun of the compiler's English index tag as a **conservative collision signal**, not proof of unrestricted semantic equivalence. A second audit checks the actual final prompt after fixed prompt / Card / LoRA additions, and conflicts fail closed before backend submission. Source state/events/roles remain unchanged on failure. The compilation result exposes `semanticValidated` separately from `compiled` / `wearValidated`, and the saved successful image records `semanticAudit` scope. For multiple people, the audit returns `scope=multi-subject, validated=false` rather than silently prohibiting the other actor's garment: full actor-scoped semantic certification remains outstanding. Also outstanding: synonyms with no shared lexical garment head, comprehensive partial-position semantic certification, legacy Scene delta transport, semantic attribution across heterogeneous frame objects, and live A1111 verification. Do **not** claim full visual semantic correctness from the current deterministic audit.


**VC-04 — RP Scene compatibility and complete regression matrix.** Map legacy structured garment deltas correctly without retroactively rewriting history. Test historical draws, multiple subjects, unknown vs removed, manual redraw, corrections during async render, swipe/branch changes, budget and cache behavior. Add Visual Inspector provenance and exact final prompt conflict diagnostics.

**VC-04 Visual Inspector slice (2026-10-24, candidate):** A read-only `Debug → Изображения` view enumerates up to five successful images in the SELECTED active path/swipes. It displays exact saved backend positive/negative (escaped), origin message/swipe, actor, drawn-mode, absence/off-body facts, translated garment mappings and the semantic audit's scope/result. Historical/legacy images without `promptSources.semanticAudit` show "not run" instead of claiming validation; sibling swipe images are never exposed. No prompt interpretation occurs in UI, and Debug does not mutate state. Further per-tag provenance and rejected-image diagnostics remain future work.

**VC-04 continued-photo referent slice (2026-10-24, candidate):** For a newly appended author photo in the same swipe, the Observer's REFERENCES now may include verified wear facts from earlier indexed photos of that exact swipe. This is derived from a temporary, read-only fold of ancestors plus ONLY earlier authenticated Draw events (no later text, no imported memory, no future Scene directives); it neither adds persistent state nor expands the bounded reference budget. This lets "holding it" map to an earlier `wear.remove` object role and "putting it on" map to the same item via `wear.add` while preserving exact origin. The snapshot is computed before the existing single Observer model call. A changed/deleted earlier photo, missing previous status, mismatched source text, sibling swipe or nonvalidated event contributes zero inherited references. The current shot and its frameObjects still require exact evidence and are revalidated at StateTracker fold time. Note: because old text/Scene operations inside the same swipe are intentionally not replayed into this intermediate projection, same-swipe referents established **only by old text**, without a prior verified photo event, remain unsupported rather than guessed.

**VC-04 continued-swipe Draw provenance slice (2026-10-24, candidate):** Each accepted author Draw event may carry `drawIndex` bound to an exact index in the same swipe's `draws`. An unindexed legacy event continues to validate **only against the final Draw**, protecting older imported/edited unindexed facts from accidental promotion. When a continued reply appends a new Draw, Observer examines the latest image only. It retains earlier **already-interpreted** visual events only if the previous `stateStatus` positively matches the preceding author photo, the previous full text is a prefix of the extended message, and each event's evidence still occurs in its precise indexed source Draw. Events replay in photo order, so an unrelated cropped photo does not erase earlier factual wear transitions; newer explicit garment changes supersede older ones. The bounded archive is 32 prior photo events, with a partial diagnostic if truncated; there is no new outfit store. Earlier Draws cannot be re-rendered using the final photo's outfit snapshot: the service rejects such requests without creating an image entry. The message-level "draw this" action targets the **latest** photo. Saved images may carry `sourceDrawIndex` for traceability and repeated redraw safety; older saved images without such metadata retain compatibility where the original source is unambiguous. This slice does not claim full intra-swipe chronology for **text narration between photographs**, nor automated per-photo historical VisualPlan reconstruction. Those cases remain future work and must not be approximated by the last known outfit.

**VC-04 legacy Scene delta slice (2026-10-24, candidate):** `StateTracker.fold()` preserves the Scene domain's own resulting `SC.fold` projection but replays each successfully applied Scene directive in chronological order. Explicit legacy `.remove` records a `removed` garment fact rather than resetting the entire worn set, and `.add` restores a previously removed item. `.wear` remains exhaustive replacement; `.pose` continues as an established scalar. Current `SC.sameItem` matching is reused to carry original item labels across abbreviated Scene directives; no second string-matching registry is introduced. `sceneInit` uses the same delta replay so explicit removals at initialization are represented correctly. The derived canonical `wearState` has no schema migration; archived Scene directives and backups remain untouched. The origin `{messageId,swipeIdx,kind}` is preserved for image-source and branch checks. This is one slice of VC-04; multiple-Draw history semantics, multi-actor rendering certification, richer Visual Inspector and live A1111 tests remain separate work.


**VC-05 — Verified historical authored Draw replay (2026-10-24, CANDIDATE).** Previously, ImageService rejected all earlier photographs inside a continued swipe to avoid drawing them with final-photo outfit facts. A pure `StateTracker.historicalDrawPath(path, drawIndex)` now creates a transient *clone* of the selected source path restricted to indexed, exact-evidence wearable events no later than the chosen photo. It requires a matching final `stateStatus` receipt (`sourceText`, `sourceDraw`, `sourceDrawIndex`), no unsequenced text events, `sceneOps`, `stateCorrections`, or oversized event history (32-event cap), and at least one indexed observation belonging to the target photo. Any ambiguity rejects rendering *before* adding an image entry. `ImageService` folds only this cloned path for VisualPlan and compilation while retaining the **full** original path as the transactional source version; concurrent source/ancestor changes still invalidate the result before backend call and attachment. Final canon, stored messages, and legacy backups remain unchanged. Successful images record `historicalDrawState: true` and `sourceDrawIndex` in promptSources. Unobserved old photos, overlapping or interleaved same-swipe text/Scene, legacy unindexed evidence, and absent per-photo frameObjects remain unsupported: do not silently approximate with latest state. No new model calls, no alternate wardrobe store, no migration. Roll back by reverting VC-05 PR; new properties are optional image diagnostics.

**VC-06 — Source-scoped multi-participant image audit (2026-10-24, CANDIDATE).** The original `ICP.auditFinal` inferred the number of people only from positive count tags (e.g. `2girls`). A second participant can instead be explicitly named in a Draw without count tags. Now ImageService passes `subjectScope.otherActorPresent` derived from the **source** `IC.frameActors` and the composed subject metadata into both the existing single ImageCompiler call and the final check. The translation cache distinguishes single-owner from multi-actor scope. A removed garment visible on another actor is not misclassified as a positive violation of the owner's wearState, and no global garment negative is generated for an attributable companion. The audit deliberately returns `scope=multi-subject, validated=false`: a flat Danbooru-style tag string cannot independently prove WHICH subject wears a garment. This change does **not** assert actor-scoped semantic certification, invent clothing for anyone, or create an additional model/interpreter or stored inventory. When a precise actor-to-garment relationship is required, it remains unresolved rather than guessing. Tests cover an explicitly named companion with no person-count tags, opposite single-owner behavior, cache separation, and an A1111 boundary mock.

**VIS-HYBRID — Minimal visual translation of authored Draw (2026-10-24, EXPERIMENT).** An additional opt-in image setting `drawPromptMode=hybrid` produces the SAME concise [draw:] *visual intent* as the existing `intent` mode; the LLM is not asked to plan or infer another scene. The one existing ImageCompiler call translates only camera-visible composition to one or two English sentences (max 55 words); stable identity, LoRA and pinned/default quality remain separate tags in `images/compose.finalise`. Canonical wear is **constraint data**, not a list to enumerate in positive. The translator must not invent garments, choose specific bra/panties for ambiguous `бельё`, repeat hidden layers, invent exposure, or append wardrobe details missing from the authored shot. Physical transitions still belong solely to Observer/StateTracker, with source-indexed VisualPlan and VC-03 final positive/negative audit; in owner-camera hybrid shots finalise prepends `pov` without passing a natural-language sentence through the old tag-only embodiedShot tokenizer. Same-swipe source and historical provenance are unchanged. Existing `drawPromptMode=tags` and `intent` modes and their saved settings remain unchanged; redraw retains the image's original mode when known (stored per image). JSON absent/offBody index mappings are still required when canonical removals need reconciliation; a malformed, excessively long or non-English hybrid output fails compilation instead of reaching the image backend. No additional provider request, classifier, persistent wardrobe/coverage registry, context-budget change, or migration.

**Limitations:** this is an **experimental output format**, not a proof that the model semantically preserves arbitrary Russian descriptions. The source-visible facts rely on the model following the translation instruction; syntax validation and existing lexical garment checks cannot detect every synonym, deliberate model hallucination, complex layered garment exposure or multi-actor attribution. `compiled:true` still means successful compilation, and `semanticAudit.validated:false` (for `no-removal` / multi-subject cases) is NOT positive semantic certification. Keep Visual Inspector's exact final backend strings and compare matched seeds. To test on the isolated mirror: set `Настройки → Изображения → Формирование [draw:] → Краткий замысел → гибрид`, then generate (a) shirt hem lifted to show belly without undergarment mention, (b) removed shirt with confirmed visible underlayer, (c) two named characters wearing different clothes. Record the source `draw`, final Forge positive/negative, `promptSources.drawPromptMode=hybrid`, and actual source/build SHA. Unavailable live calls are **NOT RUN**. Rollback: switch the setting to `intent` or `tags`; no historical chats or save migration required.

Each phase enters `testing` only with scoped diff review, `node tests/run.js`, `node tests/test-mirror.js`, `node build.js`, and source-commit CI evidence. Real Perchance + A1111 verification is **NOT RUN** until manually exercised. Do not merge `main` without explicit approval.

## 7. Acceptance examples

| Shot and END-OF-TURN wear | Positive | Garment negative |
|---|---|---|
| Shirt PARTIAL, hem raised | raised hem, shirt still on body | none for shirt |
| Shirt REMOVED, not otherwise depicted | no on-body shirt tag | only if single-owner and not visible elsewhere |
| Shirt REMOVED, held in hands | holding shirt (object role) | **no global shirt negative** |
| Shirt WORN, close-up face | shirt not necessarily included | none |
| Shirt UNKNOWN | no invented presence or absence | none |
| Shirt REMOVED + explicit deferred promise | remains removed | as dictated by current composition |
| Two people, one removes jacket | only target's on-body jacket absent | never globally ban other person's jacket |

**No source event/plan state should be inferred from A1111 output pixels.**

## 8. Known pre-implementation contradictions

1. `images/service.js` has `const canonicalWear = drawAuthored ? null : composed.physicalWear`, bypassing garment reconciliation exactly for authored images; `VIS-DRAW-SOURCE-5` tests this obsolete contract.
2. ImageCompiler accepts a syntactically valid `lifting shirt` translation of `сняла футболку`. `compiled: true` is **not** proof of semantic equivalence.
3. `images/compose.js` can introduce independently configured tags **after** translation; no final semantic authority check covers all sources.
4. `js/prism/scene.js` represents legacy `.remove` by a reduced outfit list; `state/tracker.js` may re-encode it as full `wear.set` and lose explicit removal.
5. A removed garment visible off-body is incompatible with a naive global garment negative. `VIS-DRAW-SOURCE-4` currently protects this case by bypass, which must be replaced by typed visibility rather than discarded.
6. `state/interpreter.js` checks exact evidence provenance; semantic correctness of the model's inferred action is still an LLM responsibility requiring stronger typed contracts and regression fixtures.

## 9. Reversibility

No canonical schema migration in VC-01. Revert the isolated code PR on `testing` to restore the prior image prompt pipeline. Saved chat events and Card are unchanged. Later opt-in typed shot metadata must remain backward compatible with existing swipes and backups.

## 10. VIS-FF-01/02 — frame-first source ownership (experimental testing slice)

For **authored `hybrid` Draw**, camera ownership and camera perspective are distinct:

- `camera=owner;` remains readable as **metadata** identifying whose own-body shot is being described and which END-OF-TURN wear facts apply. It does not by itself request `pov`, a top-down angle, a separate portrait, or a perspective negative.
- The authored Draw describes the **finished image**. The translator preserves any explicitly described viewpoint, framing, action and visible garment placement instead of inventing camera geometry from ownership. Absence of a viewpoint is not a reason to manufacture one.
- For authored `intent` **and** `hybrid` Draw, `ImageService` resolves frame actors from the **original source Draw before translation**. `ImageCompose.compose()` accepts that frozen resolution and may not re-infer Card or persona presence from translator output. A verified current-self selfie is source evidence for the owner even if the Draw omits the Card name.
- Legacy `tags` mode retains its `embodiedShot()` handling for backward compatibility in this slice. No migration of saved Draw, `cameraRole`, promptSources, or stateEvents is introduced.
- Persisted ImageCompiler cache keys for `hybrid` use the new `v10-frame-first-hybrid` contract version, so previously translated third-person/POV-coerced shots are not silently reused after deployment. Legacy tag/intent cache keys stay unchanged; no destructive cache migration is required.
- `StateTracker`, selected-path provenance, off-body roles, FinalAudit, and immutable VisualPlan remain authoritative within their existing boundaries. They do not infer state from generated pixels.
- This slice intentionally **does not** redesign Card identity/LoRA injection for crops; that is a separate VIS-FF-03 experiment requiring controlled backend comparisons. `cfg.extra` final-prompt overrides are also a separate hardening issue.

Test in the `testing` mirror before treating visual accuracy as established. Unit/CI results do not prove first-person imagery or framing fidelity in Forge/Perchance.

## 11. VIS-FF-03A — explicit Card identity versus appearance (testing experiment)

There is already a separate Card data channel for activation and appearance:

- `Card.image.trigger` is an **unconditional** identity/LoRA trigger for frames attributed to the Card owner. Its entire configured string is inserted before the variable shot; a legacy multi-tag trigger is **not** automatically split, filtered or migrated.
- `Card.image.look` is the existing appearance map. `base:` entries attach to an explicitly pictured external Card actor; keyword entries remain user-configured optional associations. For `camera=owner`, `compose()` does not treat the camera holder as an additional external figure, so it does not automatically add those external appearance tags.
- Card authors may **explicitly** keep only essential activation words in `trigger` and place further visible identity descriptors in `look`. This is a manual Card configuration choice, **not** a hidden image-framing decision, not an instruction to RP Model and not a change to stored chat canon.
- No recognition table for body parts, clothing, crop type or `if X then negative Y` is introduced. The same Card configuration is used regardless of the kind of image requested.
- Changing an existing Card is optional; legacy cards retain exact positive prompt behaviour until their owner edits them. Activation requirements are model/LoRA-specific; never assume one trigger token always suffices.

**Scope of VIS-FF-03A:** UI wording, contract documentation and regression coverage for the established Card fields. **No runtime image behaviour change** for existing data; no migration or new persisted fields. A controlled Forge/Perchance comparison of two explicit Card configurations is still required before claiming improved visual outcomes.

## 12. Deferred UI: structured LoRA activation and contextual associations (VIS-LORA-UX, NOT IMPLEMENTED)

**Product decision (2026-10-24):** Replace the rough multiline `loraAdvanced.rules` textarea in a **future, separate** UI stage with editable, repeatable entries added with a `+` control. This is a recorded requirement, **not** a feature of VIS-FF-03A.

- Keep **LoRA activation words** distinct from **contextual associations**: activation words are explicit Card-author input; optional associations map author-entered natural-language mentions (including user-entered variants) to author-entered LoRA-specific tags. Do **not** hardcode a body-part, clothing, pose or negative-tag lookup table.
- Planned editor: a separate activation area and a list of entries, each with editable **context words/phrases** and **corresponding tags**, plus add (`+`), edit, remove and optional enabled controls. Details such as order, grouping and whether multiple LoRAs each own their own entries must be designed and reviewed in that future stage.
- Matching may use only source context within the existing image generation authority boundary; a matching entry is **not** a new fact, a state event, or a reason to modify the RP model's chosen shot. Contextual associations never force the presence of an object that is not otherwise established.
- No hidden templates of the form `if X, force Y`, no inferred negative prompts, no hard-coded character specifics. Entries are intentional, visible Card settings, not instructions smuggled in through imports.
- Preserve existing `image.trigger`, `image.look`, `image.loraAdvanced.enabled` and text `image.loraAdvanced.rules` records across import/export and rollback. Design migration and explicit handling of legacy free-form rules **before** implementation; never silently overwrite or reinterpret ambiguous source text.
- Maintain branch/chat independence, origin path and swipe provenance, prompt diagnostics, FinalAudit, and backend-compatible LoRA activation. Include UI/persistence and prompt-output regression tests in the future PR.

**Do not implement this deferred UI within VIS-FF-03A.** Proceed with verification of the existing trigger/look separation first.
