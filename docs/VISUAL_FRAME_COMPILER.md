# Authored DRAW → Visual Frame Compiler (testing)

**Status:** experimental candidate in PR #145, not a release contract.

## Purpose

The RP model already receives branch-scoped character/world state before authoring
`[draw:]`. An authored DRAW is the only source of *image contents*. The image
pipeline must not fold Tracker, Observer metadata, Messenger snapshots or canonical
wardrobe a second time to reinterpret the frame.

## Runtime

```text
StateTracker → RP context → RP model → [draw:] ──┐
                    └─────── [state:] → Tracker │ (separate persistence)
                                               ▼
                           Source-scoped Visual Prompt Plan
                                               │
                             one Processing Provider call
                                               ▼
                          Visual Frame v1 (transient JSON)
                                               │
                           schema validation / deterministic
                                 prompt serialization
                                               ▼
                        Card identity / LoRA / mirror guard
                                               ▼
                                   image backend
```

For authored `intent` and `hybrid` modes, Image Compile requests a single
typed Visual Frame response. It contains:
- `camera`: image genre, viewpoint, framing and angle, not body pose;
- `subjects[]`: separately identified people, visible pose/action and **on-body** clothing;
- `objects[]`: visible objects **outside the body**, including removed garments
  lying nearby, with source-provided placement;
- `environment`: location and surroundings, not a camera or pose instruction;
- `lighting`: visible illumination, when stated.

Missing facts remain empty; the translator may not invent them. It does not
infer physical state from the rendered image and does not write to Tracker.
`visual-plan.js` validates the bounded JSON and serializes it to English
prose or tags. Invalid output fails the image without a fallback second LLM
call or a silent reinterpretation of source data. The translation cache is
versioned and separated from legacy reconciliation.

### Spatial meaning

A character being *in a room* supplies location; it does not force a
full-body standing composition. Photographic genre and camera angle are
independent from torso orientation, gestures and object placement.
The translator renders the resulting visual relationships instead of a literal
narrative event sequence.

### Clothing

`subjects[].clothing` is worn/visible on the person.
`objects[]` is detached and visible in the camera frame.
`removed from body` must never mean `absent from image`.
Garment categories must not be arbitrarily expanded into specific pieces.

The compiler is **not** a clothing correctness authority or memory. It
does not check the resulting image against physical wear from Tracker.

### Historical DRAW and provenance

An earlier authored DRAW in the same message retains its precise image index.
It is rendered from that original text without historical wear reconstruction.
The pipeline still checks chat, selected message, selected swipe, original
DRAW and ancestry freshness before the backend and before committing image
results. No new persisted character facts or schema changes are introduced.

### Legacy compatibility

Non-authored image generation still uses its previous derived-scene and
canonical garment reconciliation, in an explicitly separate path.
Author-provided precompiled `tags` DRAW uses the original tag path; it
does not require another text-model conversion. This prevents regression
outside the redesigned authored visual-intent workflow.

### Explicit non-goals

No extra observer, no second image model call, no fixed word-specific fixes
for `selfie`, `standing`, `underwear`, or particular clothing. Existing
one-person mirror composition flattening and Card/LoRA injection remain.

### Validation before testing mirror

CI: `node tests/run.js`, `node tests/test-mirror.js`, `node build.js`.
Live Perchance testing remains **NOT RUN** until merged into `testing`.

After merge, check spatial composition, off-body garments, multi-person
ownership, mirror flattening, image regeneration, historical image indices
and branch/swipe changes. Do not claim that CI proves semantic fidelity of
a diffusion model.

## Rollback

Revert this feature PR on `testing`. No data migration is required:
existing stored image entries retain their source DRAW and final prompt,
and no new canonical information is persisted. The Visual Frame is transient.


## Visual Planner v2 (PR #146)

The authored image intent now uses a **shot-planning** response, replacing
Visual Frame v1's translated-description layout. The RP DRAW still defines
**what is depicted**; the Processing Provider decides **how to frame the
known scene** so that the main action and visible result can be understood.

The single-model-call JSON response includes:

- `version:2`, `focus`: the source-backed visual priority;
- `composition.medium`, `framing`, `viewpoint`: photographic staging,
  chosen by Planner unless explicitly constrained by DRAW;
- `composition.rationale`: why staging makes the focus visible; stays
  in Debug metadata and must **not** be serialized into the image prompt;
- `subjects[].orientation/action/visibleResult/clothing/expression`:
  distinguish body orientation, action, visible effect and garments on-body;
- `objects[]`: separately depicted off-body objects with their positions;
- `environment`, `lighting`: source scene data, not default added props.

Serializer prioritizes shot framing and the source action/visible result ahead
of unrelated background details. The resulting frame and its rationale are
stored only as image-generation provenance for Debug, not as world state.
Structured JSON parse errors abort translation; there is no second LLM call
and no return to Tracker. Old image records keep their existing prompt.

**Known limitation:** a schema and a successful build cannot prove that a
given Processing Provider will consistently select the right crop or preserve
every subtle source relation. Evaluate the complete mechanism with real DRAW
after it enters `testing`, not by adding text-specific patches during coding.

Legacy unauthored scenes and authored precompiled tag mode are unchanged.
No new database schema, character inventory or global rules for garments.
