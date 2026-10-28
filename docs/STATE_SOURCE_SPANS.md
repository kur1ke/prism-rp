# STATE-SOURCE-1 — Observer source fragment contract

**Status:** EXPERIMENT, base branch testing. The active authored text and the original authored DRAW are the only eligible evidence surfaces. Translated image prompts, rendered images, imports, Memory and Experience cannot establish observations.

## Problem

The previous Observer contract required the model to copy an exact evidence substring, and sometimes exact itemMention and placement substrings. A valid description could therefore be rejected solely because the model rewrote case endings, punctuation or adjectives. This is not solved by adding more word-matching exceptions.

## Contract

The pure module js/state/evidence-spans.js builds a bounded, deterministic catalog of SOURCE_FRAGMENTS from the **current** text and/or DRAW only. Fragment IDs are T0, T1, ... for text and D0, D1, ... for DRAW. Each catalog entry records its original string offsets and exact contents; the model sees an ID plus the source data but is not asked to copy that data.

The model outputs an action, actor, state field, certainty, value and sourceId. The application resolves the ID and reconstructs the precise original evidence and sourceSpan:{kind,start,end}. For indexed garment observations, WearObservationResolver also derives the literal itemMention from that original source and matches only a unique current-branch garment. For adjust, placement comes from the same source fragment. The model cannot provide numeric source offsets, change the declared source type, or elevate an old photo to current visual evidence.

StateTracker validates sourceSpan coordinates and deterministic fragment boundaries on every selected-branch/swipe replay. Events from an earlier continued DRAW keep their earlier drawIndex. Altering the source text, DRAW, span or selected swipe invalidates the provenance. Old persisted events using literal evidence but no sourceSpan remain readable with their existing validation rules.

Only Tracker changes canonical state. This contract does not add a wardrobe table, agent memory, transcript, second RP request, hidden instructions or new database version. The context-budget preflight remains mandatory. Text input is limited to 4500 characters, DRAW to 1600, fragments to 48 per surface with a maximum length of 420 characters, and events to INT.MAX. The fragment IDs slightly increase prompt metadata.

## Invariants and limitations

- Each chat and its selected ancestry/swipes are independent. No cross-chat or sibling facts.
- Draw events require the same conservative current-self-photo checks as before. Missing/ambiguous proof means no state transition.
- Exact source references prove **where the model looked**, not that the interpreted action is semantically correct. A model might select a real but irrelevant fragment or misinterpret negation. Those semantic issues remain observable and should be addressed separately, not papered over with additional literal-matching exceptions.
- A long sentence may be split; an event whose full evidence is spread across different fragments can remain unresolved. No silent promotion of other fragments or historical text.
- A garment not visible in a crop is never assumed removed. A garment thrown outside the frame is not automatically visible as an off-body object.
- A failed optional hidden-clothing inquiry cannot undo a confirmed source-backed removal.
- The existing older model-output format (literal evidence) is accepted for replay compatibility, but new prompts request sourceId.

## Automated and manual verification

Required tests: node tests/run.js, node tests/test-mirror.js, node build.js. Contract tests cover indexed text/DRAW events, source range tampering, invalid IDs, conflicting provenance, old photos, different swipes, continued DRAW, previous garment identity, placement, and the full Observer -> StateService -> persisted swipe -> Tracker -> Prism path. PERF-02B verifies that current source fragments are not confused with historical mentions and early observer results are reused.

**NOT RUN:** real-model and browser Perchance TEST E2E.

Manual TEST checklist: confirm published bundle SHA; use Messenger with initial blouse, skirt and tights; create a DRAW showing blouse raised, then fully removed; inspect Debug / Events for exact source-generated evidence, itemMention, reference and surviving other clothes. Test off-body visibility separately, switch ancestor swipe, use continue with two DRAWs, reload the page and verify the next Prism. Record real sourceId errors, latency and UNKNOWN outcomes. Do not clear IndexedDB. No main promotion without separate approval.

## Rollback / compatibility

No migration is required to store sourceSpan on existing swipe stateEvents. Older compatible builds ignore that additional property but can still replay the canonical event via the stored literal evidence and reference. Check IndexedDB schema compatibility before rolling back the application bundle; never overwrite or delete the TEST database merely to refresh the loader.
