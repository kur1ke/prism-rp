# Scene Tracker ST-1 — integrity and diagnostics

**Scope:** conservative corrections to the existing RP scene tracker on top of merged Visual Consistency VC-1. No World Instance, AI observer, image tag pipeline, schema migrations, or Messenger `[scene:]` activation.

## Problems reproduced before changes

The new tests failed on the original tracker in seven independent scenarios: invalid actor field created a phantom actor, alternate spellings/spacing duplicated actors, `{{char}}`/`{{user}}` were not resolved to current participants, relative minutes from an unknown time fabricated midnight, malformed absolute time/date partly corrupted the clock, garment removal matched substrings inside unrelated words, and editing a reply destroyed manual scene overrides. Additional checks cover invalid-operation diagnostics, prompt-template hardcoded names, invalid manual edits and empty deltas.

## Changes

- `js/prism/scene.js` — avoid creating actors on unrecognized properties; normalize case/whitespace/ё↔е; resolve exact CC macros using current card/persona; reject blank/invalid deltas, including invalid calendar dates and hours; keep unknown time unknown instead of defaulting to midnight; match garment names on word boundaries; expose `invalidOps` count and last ten rejected operations in the **derived** active-branch scene; keep legacy `rel`/`relset`/`flag` unchanged and inactive.
- `js/chat/service.js` — pass card and persona names to `fold`, preserve explicitly manual scene edits when editing the text of the same assistant reply, and reject an invalid manual scene operation before writing it to the branch.
- `js/prism/assembler.js` — interpolate current character/user names in the scene protocol instead of relying on a generic fixed template name.
- `js/ui/controllers/drawer.js` — show a clear error if a manual scene update would not apply; validate `sceneInit` before committing it, without overwriting the previous value on failure.
- `js/ui/views/drawer.js` — display rejected model operations and their source message for diagnosis, without applying them or modifying the stored source.
- `tests/run.js` — additional regression tests for all listed behaviors.

## Invariants

- RP Scene stays separate from Messenger environment. The `[scene:]` mechanism remains disabled for Messenger.
- Authoritative card/profile information is not automatically changed by a scene delta.
- Model- and user-authored scene text already persisted in chats is not rewritten. Invalid operations remain in stored messages but are not applied.
- User-authored manual corrections remain after editing the *same swipe*, and do not leak into another swipe.
- Active scene still derives from `sceneInit` plus the operations on the active branch; no new IndexedDB store/version.
- The tracker cannot infer every clothing or pose change from free-form dialogue without model cooperation; this is **not** a full automatic observer implementation.

## Verification

From repository root:

```bash
node tests/run.js
node build.js
```

Local result: **254 passed, 0 failed**; build succeeded (73 scripts). Browser E2E was **not executed**: Playwright browser was missing, and the available system Chromium was blocked by the environment (`ERR_BLOCKED_BY_ADMINISTRATOR` for localhost and file). No real Perchance/Forge visual evaluation yet.

Manual acceptance checks: (1) create a RP scene and enter real character/player names; (2) edit an assistant reply containing `[scene:]` after adding a manual clothing override and verify the override wins; (3) switch swipes and ensure changes only follow the active one; (4) send invalid `time=25:99` or `Other.unknown=x` from a test model and see rejected operations in Scene; (5) attempt `+15m` without previously set time and verify it is rejected, not silently changed to `00:15`; (6) clear location/wardrobe using `-` and verify it still works; (7) check Messenger behaves exactly as before.
