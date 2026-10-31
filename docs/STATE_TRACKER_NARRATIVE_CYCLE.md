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


## Authored DRAW temporal provenance (testing)

The RP provider authors both the visible image description and the depicted moment.
New directives may include a `moment=` prefix:
`[draw: moment=current-self; <description>]`,
`[draw: moment=past-self; <description>]`, or
`[draw: moment=other; <description>]`.
The application removes this metadata from the diffusion prompt and stores it
with the source DRAW on the selected swipe. The moment describes *when the
pictured event took place*, not when the image was sent.

Observer extracts source-ID-bound wear facts. Its one-shot `frameMoment`
assessment covers legacy untagged DRAWs, but it may not override an explicit
RP-authored temporal tag. The Interpreter attaches the canonical
`visualScope=current-self` only to accepted current-owner events; the
Tracker also checks the tagged original DRAW during replay. A past or
other-person photo may still be generated, but does not update physical
clothing. No secondary wardrobe registry or Memory authority is introduced.

A missing author tag retains the legacy Observer temporal classification;
it does not prove that a photograph is current. These contracts require
real-model validation in the testing mirror: an actual outfit change and a
retrieved historical photograph must have opposite Tracker effects.
