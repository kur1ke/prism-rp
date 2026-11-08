# Browser regression gate

Install `python -m pip install -r tests/requirements-browser.txt` and
`python -m playwright install chromium`, then run:

```sh
python tests/browser_regressions.py /tmp/prism-browser-results
```

The runner builds current sources and discovers every `tests/e2e-*.py` file.
Two workers run independent browser contexts and local fixture servers. Each
suite has a 300-second watchdog. A failed or timed-out suite fails the gate;
there are no retries or exclusions. Logs and suite artifacts live in separate
directories; `summary.json` records exit codes, durations and timeouts. CI
uploads these artifacts even on failure and publishes bundles only on success.
Use `--jobs 1` for serial diagnosis or `--timeout` to change the watchdog locally.

`PRISM_CHROMIUM` may select an executable; otherwise the helper uses system
Chromium when installed, falling back to Playwright's managed browser. CI uses
the preinstalled Google Chrome on the pinned Ubuntu 24.04 runner and logs its
version. It does not download extra system fonts or reinstall browser libraries;
the initial attempt with `--with-deps` stalled on the Ubuntu package mirror. All
contexts select the isolated testing database. Google Fonts requests receive
empty CSS to remove an unrelated external dependency. Model and image responses
use fixtures; these tests do not establish live provider or hosted Perchance
availability.

Coverage includes state/source ownership, user edits and branches, final reply
persistence, navigation, image commits, backups, HTML import safety, loader
timeouts, selected card fields/Core/custom fields, lorebook semantics, retired
background handling, Memory episodes/full source/timeouts, Observer budgets/full
source, assistant scope/budgets and final Perchance budgets. The queue suite checks
real HTTP streaming, input acceptance/cancellation, draft ownership and the
Perchance adapter. The catalog suite checks welcome navigation, PNG review before
save, editing, alternate greetings and persistence at 1440 and 390 pixels.

## Legacy-flow migration

Four additional suites cover the settings/provider/model list, sampler preset
and theme persistence; world pack/lens editing and per-character isolation;
HTTP roleplay continuation/swipes/search/model selection, A1111 image UI,
PNG/LoRA export and assistant conversations; Messenger setup/manual time,
initiative refusal/API error/strict-template rejection, transactional rollback,
successful provenance and reload. Each runs at 1440 and 390 pixels.

`legacy-e2e-inventory.json` records all 203 historical named check call sites,
with their original lines and current coverage or explicit retired/replaced disposition; none remain pending. These are
call sites, not the number of executed scenarios. Ported entries describe current
semantic coverage; obsolete labels and removed controls are not recreated.
Mobile settings now enter directly from the welcome screen. The catalog suite
checks the visible menu and settings from welcome, empty catalog and populated
catalog at 320, 390 and the 900-pixel responsive boundary, with desktop controls
hidden at 1440. The image workflow clicks the viewer close button rather than
using Escape to bypass its former offscreen position. `e2e-viewer-layout.py`
checks all three controls by viewport bounds and hit testing after actual image
loading: four viewport sizes, three image shapes and two long captions (24 cases).
The full caption remains intact; only its visible label is truncated.

## F29 migration complete

All 203 historical named call sites have been individually classified in
`legacy-e2e-inventory.json`: current semantic coverage, explicitly replaced contract
or retired contract. There are zero pending entries. The obsolete `tests/e2e.py`
has been removed; its pinned `sourceRef` retains the historical source. The current
gate discovers all `e2e-*.py` suites, builds fresh sources, records evidence and
fails CI/publication on any failure or watchdog timeout.

This closes migration of the old browser flow. It does not certify a live model
or installation of the HTML in a user's Perchance generator. Native IndexedDB and
UI/adapters run for real; external AI/image providers are fixtures.

Observer/image concurrency is covered by `e2e-observer-image-race.py`: both commit orders, fresh unrelated fields, deleted/edited sources, no resurrection, and reload in RP/Messenger at 1440/390. The regression fails on the pre-A01 bundle.

Assistant replacement durability is covered by `e2e-assist-regen.py`: streaming is transient; errors, cancellation (including a late result), empty output and failed final writes retain the saved answer. Successful replacements use a conditional native transaction, preserve independent metadata and cannot resurrect a deleted or overwrite an edited conversation. Reload is checked for both provider profiles at desktop/mobile widths. External model calls are fixtures.

A03: `e2e-swipe-commit.py` проверяет атомарность выбора свайпа и превью при отказе native IndexedDB, задержанной записи и повторном вызове, сохранение продолжения и reload (RP/Messenger, desktop/mobile). Живая модель не вызывается.

`e2e-reflection-coverage.py`: разделение новых и ранее осмысленных свидетельств, unchanged/reload, native abort финальной записи, повтор неосмысленных событий в следующем цикле, изоляция якоря ветки и сохранение бэкапа. RP/Messenger × 1440/390, LLM подменена.

`e2e-scenario-cutoff.py`: границы 5/10/15/20/25/30 и «Никогда», ветки, авторское приветствие, фактические regen/continue при выбранном сроке 10, reload. RP/Messenger × 1440/390; модель подменена. `e2e-settings.py` выбирает все значения через настоящий select и проверяет сохранение после reload.

A04: `e2e-perchance-abort.py` использует настоящий адаптер и UI Stop с IndexedDB, подменяя только внешний плагин/fetch. Проверяет раннюю отмену и вложения, игнорирующий stop поток, поздние чанки/результат/ошибку, старый ответ ассистента, повтор и reload на 1440/390. Node-контракт: `perchance-abort.js`.

A05: `e2e-openai-done.py` использует настоящий HTTP SSE-сервер без EOF после `[DONE]`, router/OpenAI adapter, RP/Messenger UI и IndexedDB. Проверяет завершение без Stop, отмену reader/закрытие соединения, текст/reasoning/preview, отсутствие повторного запроса и reload на 1440/390. Узкие границы парсера/cleanup/отмены: `openai-sse-done.js`. Живой провайдер не вызывается.

A06: `e2e-image-translation-budget.py` — ImageService/compiler/router + реальный IndexedDB и UI-повтор, подменены модель и графический backend. RP/Messenger × API/Perchance × 1440/390, tags/intent: overflow без текстового/графического вызова, повтор, кэш, timeout/late-result, источник и reload. Node-контракт: `image-translation-budget.js`.

F29 import/opening migration: `e2e-import-directives.py` checks unknown/broken JSON,
review cancellation, URV source preservation, default-disabled imported directives,
editor save/reload and explicit system-directive consent at 1440/390 px. Prompt
membership is checked with the real assembler using the persisted card and with
actual OpenAI-adapter requests before/after explicit consent; external replies are fixtures. The fixture is synthetic and has no dialogue examples.
`e2e-empty-opening.py` checks no automatic call or placeholder turn, user-first
requests, failed opening/retry, assistant-only opening persistence, and single-system
preflight plus user-first recovery, using the actual OpenAI adapter with a local
response fixture, at both widths. These suites do not exercise a live model.
`e2e-storage-upgrade.py` uses real IndexedDB connections in separate browser tabs:
v3/v4/v5 → current v8, exact preservation of seeded rows, empty added stores,
blocked startup/reload, unresponsive-open timeout without writes, versionchange
release/warning, unique character lens, and an old Messenger chat whose empty
environment remains unpersisted. Every case runs at 1440/390 px in isolated TEST storage.
`e2e-world-chat.py` checks the real world fact form (including comma-separated
entities/topics/locations), branch ownership, timeline/lens relevance in an actual
OpenAI-adapter request, no implicit model-to-world writes and reload at 1440/390 px.
It reproduced the missing `csv` helper before the controller fix.

F29 restore/Perchance/Memory migration adds three auto-discovered suites:
- `e2e-backup-restore.py`: request/setup rollback in native IndexedDB, replacement
  cleanup, real UI failure/same-file retry, owner filtering, additive mode conflicts,
  world roundtrip and chat/world cleanup at 1440/390.
- `e2e-perchance-workflows.py`: actual compiled Perchance HTML with fixture plugins;
  default provider, live UI chunks, continuation seed, image resolution/seed/no LoRA,
  metadata context and body-only initiative/reload at both widths. This is not a
  live Perchance service or model check.
- `e2e-memory-panel-isolation.py`: actual app panel, automatic Memory/Experience,
  chat isolation/reopening/reload and unchanged inert legacy archive at both widths.

The inventory has zero pending call sites; F29 migration is complete. Existing Core
coverage is mapped to full-field/opt-in Core semantics. Retired scene-parser output
is replaced by opening persistence plus canonical StateTracker/Observer checks.

Final migration adds `e2e-editor-contracts.py` and `e2e-image-workflows.py` and expands
Messenger/world suites. Editor tests cover all seven reachable sections, metadata,
lore, literal data, optional Core clearing, empty opening and viewport bounds. Image
tests check real RP/translation/A1111 requests and auto Draw, identity/LoRA, authored
clothing, quality, size, negative/model/seed and UI sampler selection. Messenger tests
cover timezone/frame/reasons, read-only generation context, mobile forms/control
bounds and the current navigation guard plus abort. Its Stop click remains reachable
under the visible warning toast; no force click bypasses hit testing. World tests
exercise referenced-pack deletion refusal and the report's current Debug location.

`e2e-continue.py` checks the real Continue button in RP/Messenger through Perchance
and OpenAI-compatible adapters at 1440/390. A seed-inclusive Perchance response
cannot duplicate the existing answer; the prefix occurs once in the wire input.
An empty result shows an explicit message, preserves native-IDB message/chat bytes,
and permits a successful retry in the same swipe followed by reload. External
responses are fixtures; live-model behavior is not certified by this test.

`e2e-empty-regeneration.py` covers A10 with real regeneration/Stop buttons, actual
Perchance/OpenAI adapters and native IndexedDB at 1440/390 in RP/Messenger. Empty,
whitespace, reasoning-only, provider failure and pre-content cancellation preserve
the full selected message/chat and Memory/image stores. Late cancelled completion
cannot publish. Each rejected attempt is followed by a successful retry adding
exactly one swipe; prior swipes remain intact and reload preserves the result.
External model responses are fixtures, not live-model validation.
