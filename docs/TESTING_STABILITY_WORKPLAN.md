# Testing stability work plan — 2026-10-29

Target: `testing`. Promotion to `main` is out of scope. Source base: `8b0481bda6be9c596f209356e439da0a6738fca8`.

## 1. Chat navigation and in-flight generation — IMPLEMENTED IN PR #115

- Serialize chat activations. An obsolete activation does not render over a newer navigation.
- Reject switching to a different chat or creating another chat while the active turn is in progress; this is a *temporary UI limitation*, not a durable generation architecture.
- Acquire generation lock before the first pending IndexedDB write; release it after final persistence.
- Reject regen/continue for missing, user-owned or off-path assistant messages.

Acceptance: rapid A→B selection must end with B's messages/Memory/World/Images, even if A finishes loading later. No provider call on invalid regen.

## 2. Persistence integrity — IMPLEMENTED IN PR #115

- Commit a chat and authored opening together.
- Commit user reply + `leafId`/preview together.
- Commit generated opening + `leafId`/preview together.
- Batch branch/chat/card deletions as single transactions; apply in-memory changes only after commit.
- On aborted chat/card deletion, restore Memory eligibility without allowing old Memory cycles to resume.

Acceptance: on transaction abort there are no partial deletions or orphan roots, and the prior leaf/preview remains intact.

## 3. Untrusted backup/image attributes — IMPLEMENTED IN PR #115

- Allowlist image URL schemes, exclude active content in image `src`, escape HTML attributes.
- Escape imported IDs used in common `data-*` attributes.
- Preserve existing plain HTTPS, `blob:`, and base64 PNG/JPEG/WebP/GIF images.

Acceptance: malicious avatar and ID strings cannot create executable HTML attributes after import.

## 4. Regression coverage — AUTOMATED PASS (PR CI); MANUAL NOT RUN

Commands: `node tests/run.js`, `node tests/critical-integrity.js`, `node tests/test-mirror.js`, other workflow regression tests, `node build.js`.

Manual smoke (TEST MIRROR ONLY):
1. Refresh test Perchance and verify badge reports the exact post-merge `testing` SHA; ensure `prism-rp-testing` is used.
2. Open chat A with a slow storage response then quickly choose B. Check B's messages, Prism, Memory, World, images.
3. While a real model is responding in A, click B/new-chat: must show a warning and retain A until completion.
4. Create a chat with and without first greeting; reload and verify root/leaf/preview.
5. Save a test backup; delete chat and card; restore and check messages/Memory/World and latest interaction.
6. Import a deliberately malformed avatar URL and confirm the image is hidden, no HTML event fires.
7. Run a live Perchance reply, regen, continue, and failed request. Confirm output, cancel, and edit semantics.

## 5. Further work — NOT CLOSED

- Replace the temporary navigation guard with origin-bound generation commits so switching between chats during generation is safe and supported.
- Verify IndexedDB atomic rollback in an actual browser (CI uses in-memory mocks for some fault injections).
- Complete manual backup/restore and reload flows in standalone and Perchance; verify live provider behavior.
- Audit every remaining externally sourced value entering HTML, beyond high-risk image and ID attributes.
- Cover cross-tab concurrent mutations and recovery after quota errors.

Do not promote to `main` until manual evidence and additional safeguards are reviewed. No schema migration in this PR.
