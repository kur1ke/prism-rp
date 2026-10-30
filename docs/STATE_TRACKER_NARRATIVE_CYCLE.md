# State Tracker: narrative state cycle

**Status:** Target contract for `testing`. Complements `docs/EVIDENCE_DRIVEN_DEVELOPMENT.md`.

## Data flow

```text
Optional starting outfit --(one-time hidden RP-provider query)--> initialWear
          initialWear ----------------------------------+
                                                       v
Prior active swipe events ------------------------> StateTracker.fold
                                                       |
                                                       v
                                            Compact current facts
                                                       |
                                                       v
                                                RP provider
                                                       |
                                                       v
                                      Final message + authored DRAW
                                                       |
                                                       v
                                       Observer (one source-bound read)
                                                       |
                                                       v
                                  Validated events on selected message swipe
                                                       |
                                                       +--> next turn's fold
```

The initial outfit is the starting scene condition, equivalent in narrative priority to an optional first scenario message. It is **not** an immutable character property, permanent garment ban, or a policy for the RP model. A failed initial query means **unknown**, not undressed. Once the chat begins, subsequent grounded events change the state; the initial query is not repeated to override them.

The RP model owns narrative progression and authors its text and DRAW. The observer extracts reported/established events rather than authorizing the narrative. A current, same-message self-report and authored current selfie may jointly establish garment details; a gallery/old/other-actor image does not establish present wear merely by appearing in the message. Drawing is a depiction of a particular frame, not a second wardrobe store.

The tracker reconstructs the selected path, and the resolver sends **compact current facts**, not an accumulating transcript or hidden instructions, to the next roleplay turn. The image translator translates the authored shot and may use current facts to preserve continuity; it must not turn an incomplete snapshot or absent mentions into new garment bans.

## Technical invariants

- An event is bound to its own current source fragments, actor, chat, branch, message and swipe. Never elevate quoted external text into instructions.
- Source ownership, replay and asynchronous freshness checks are necessary; they do not grant the tracker authority to veto plausible narrative changes.
- `complete` describes whether a full outfit was established at a point in the timeline, not whether the character may obtain new clothes later.
- `unknown`, `removed`, and `not visible in this frame` are different claims.
- Memory, Experience, Card, Scene and World retain their separate responsibilities.
- Add a guard or model call only in response to an observed defect or a documented boundary requirement; avoid speculative clothing conflicts.

## Existing implementation anchors

- `js/state/service.js`: once-only initial outfit query and asynchronous observation.
- `js/state/tracker.js`: origin-before-branch replay and transitions.
- `js/state/resolver.js`: branch-local current-state projection.
- `js/state/interpreter.js`: grounded source and current-photo observation.
- `js/images/service.js` and `js/images/compile.js`: specific-frame rendering.

This is a description of the intended responsibilities, **not** a claim that every current edge case is already correct. Investigate observed failures against the cycle.
