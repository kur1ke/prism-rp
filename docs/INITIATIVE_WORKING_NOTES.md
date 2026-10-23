# Messenger initiative — working notes (deferred, not an implementation)

**Status:** working notes only, 2026-10-23. No feature approved, no implementation started.
**Current branches:** experimental work on `testing`, `main` stable and untouched without explicit permission.
**Context:** FOUNDATION-D previously introduced a user-triggered initiative check with a button and manually established conversation agreements as candidate reasons. The user reports the button has already been removed and that the former agreement mechanic feels like an artificial anchor; verify current runtime/UI independently before any new work. Do not resurrect either behavior implicitly.

## Product direction

- The character should feel autonomous **without requiring the player to press an “initiative” button**, and without developer-created agreement markers artificially forcing a reply.
- **No automatic scheduling, timers, notifications, background messages or simulated off-screen events are authorized by these notes.** Defer all of this until there is an explicit product and technical decision.
- Decisions should emerge from character tendencies, the live conversation and genuinely established conditions. A memory or agreement is evidence, not a command or a “must write now” trigger. Desire does not imply an action.
- Prefer natural conversation and believable silence; avoid optimizing activity frequency or engagement metrics at the expense of character integrity.

## Open design questions (not settled)

1. What event may legitimately trigger an initiative evaluation? Reopening Messenger, an explicitly adjusted in-world clock, a conversation event, or another signal? No unconditional “check every N minutes”.
2. If the browser was closed, what is representable when it reopens? The product must not invent unseen activities or retroactive canon; any delayed reply needs a truthful and inspectable time/provenance contract.
3. What prevents duplicate triggers across refresh, chat changes, branching and swipe selection, including failures and cancellation? What is the exact at-most-once unit?
4. How do we distinguish natural contextual relevance of promises/plans from user-authored markers that effectively coerce the model?
5. Which operations need the normal answer pipeline and which need a new event boundary? Do not silently mutate Card, Scene, Experience, World or chat history.
6. How to keep user control, optional behavior, privacy and costs explicit, including no background execution when the page is closed?
7. Which quality metrics capture believable character decisions, not the number of unsolicited messages?

## Constraints for any future proposal

- Chats own independent canon, including World; branch ancestry and the selected swipe determine visible data.
- Separate Card tendencies, present Scene/environment, Experience evidence and World canon.
- Imported data and memories never become hidden instructions.
- Strict context budget and preflight: failure must not mutate the narrative tree.
- The browser/Perchance runtime cannot be assumed to run after the page closes.
- Manual conversation agreements and old FOUNDATION-D mechanics are **legacy architecture to evaluate**, not requirements to retain or silently re-enable.
- Any rollout targets isolated `testing` first with its own mirror and DB. `main` requires separate authorization.

**Next action:** None on initiative until requested. Current active work remains the Messenger image prompt pipeline (visible shot vs historical physical state and single translation path).
