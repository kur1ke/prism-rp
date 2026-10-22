# Visual Episode / embodied POV — audit and implementation boundary (2026-10-22)

**Branch:** `testing` (feature PR only). **Authority:** `AGENTS.md`, `PRISMRP_REVIEW_PROTOCOL.md`, testing review protocol.  
**Scope of this PR:** B2 — distinction between the camera holder and an externally depicted character.  
**Not in scope:** B1 episode resolution, inference from image pixels, automatic canon updates, new persistent collections, changes to `main`.

## Evidence and observations

The user supplied an example of a natural first-person self-body photo and two actual Forge/A1111 results for Lilith.
The requested transition was “покажи ножки” → “а что повыше?”. In the first actual `[draw:]`, Lilith's feet on a gray carpet were described from first person. The compiled prompt nevertheless combined `lilithx`, full body/identity traits, `1girl`, pose and `pov`. The second scene introduced `standing` and a short pleated skirt. In both, `imageLayers.established` and `actorState` were empty.

These data establish *what the pipeline requested*, not the precise stochastic cause of every extra limb. Model anatomy errors can persist without any prompt conflict. The separate screenshot is a framing reference, not canonical evidence about Lilith's clothes or pose.

### B1 — relative visual follow-ups lose the originating situation (MAJOR, open)

- **Observation:** “а что повыше?” is treated as an independent shot and may introduce a new physical pose.
- **Code path:** `prism/service.js:historyWithDraws()` supplies at most two recent selected `[draw:]`; `images/service.js` composes each new shot from its current `draw` and tracked state. No validated same-episode link is resolved.
- **Risk:** recent external/reference images or incompatible swipes can contaminate continuity if blindly reused.
- **Required contract:** resolve a *relevant* prior image on the same chat, ancestry, selected swipe and subject; do not use “last N images” as an episode ID. Separate changes of framing from changes of the depicted situation.
- **Test gate:** same POV follow-up, external screenshot → self photo, sibling branch, switched ancestor swipe, old photo vs current photo, deletion, strict budget. Visual episode facts are **not** automatically `StateTracker` events.
- **Status:** NOT IMPLEMENTED in this PR.

### B2 — owner-camera/external-owner collision (MAJOR, this PR)

- **Observation:** `pov` and full externally depicted Lilith identity, portrait/count tags and character LoRA can coexist in a first-person self-body prompt; some observed renders have implausible duplicate body parts.
- **Architecture:** `persona.image.view='first'` means user-view POV *looking at others*. It is **not** the same as a photo made with Lilith's own camera.
- **Contract:** distinguish `external` (character visible to a camera) from `owner` (character holds camera; their body may enter frame without a second full character).
- **Explicit input:** the compact optional `camera=owner;` prefix in the `[draw:]` description. Strip metadata before translating/generating.
- **Compatibility:** conservatively infer this mode from existing explicit self-body first-person descriptions naming the owner. A mere `pov`/“looking at viewer” tag does NOT imply owner-camera.
- **Output:** retain the actual scene and visible body parts; suppress *automatically injected* whole-character identity, trigger, configured character LoRA and external-person count/portrait tags for the camera holder; preserve established physical clothing and camera-holder pose (expressed as viewpoint), add targeted anatomical negatives. Track `cameraRole` in `promptSources`.
- **Limit:** no image pixel inspection or geometry guarantee. A mirror selfie, a user-view scene, or a picture of a third person must continue to use external subject semantics unless explicitly resolved otherwise.
- **Authority:** card appearance remains stable in the character domain; omitting unseen identity tags from one prompt does not remove identity or canon.
- **Settings:** works for legacy `tags` and optional `intent`; compilation cache keys include camera mode to avoid cross-mode reuse.

## Protected invariants

1. No visual frame becomes physical canon merely by being generated.
2. Existing chat isolation and selected-swipe provenance remain the only source of branch-visible history.
3. Full identity/LoRA are still used in ordinary externally photographed character images.
4. Plain object screenshots remain object images; sender identity is never silently inserted.
5. No new IndexedDB schema, per-chat persistent episode memory or hidden instructions.
6. Scene text and model output remain lower authority than explicit user constraints and established state.
7. Prompt budget remains controlled by existing Prism assembler; one compact directive line is added when image drawing is permitted.

## Verification plan

- Unit: explicit `camera=owner` vs old unambiguous Russian self-body description, external `pov` scene, screenshot, false-positive case.
- Unit: `compose + finalise` must not inject full card trigger/look/LoRA into owner-camera shot, but must retain depicted legs/floor/garment, preserve established clothing and pose, and add negative anatomy hints.
- Integration: image service passes camera mode into compilation, preserves provenance and does not modify `StateTracker`.
- Required CI: `node tests/run.js`, `node tests/test-mirror.js`, `node build.js`.
- Manual Perchance + Forge: generate 2–3 self-body shots with owner-camera, evaluate extra limbs and framing, compare to identical old prompts using same settings/seeds. **NOT RUN** without a real live test.
- **Rollback:** revert B2 PR; stored `promptSources.cameraRole` is diagnostic and safe to ignore by older versions.

## Next independent change

Implement B1 using *source-bound* Visual Episode resolution; protect ancestry, ancestor swipe changes and current-view time; only then pass the relevant previous shot to a compiler. Do not merge B1 into this POV fix to avoid conflating semantic provenance with prompt geometry.
