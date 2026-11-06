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
with their original lines, current evidence or pending disposition. These are
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

## Remaining F29 work

The historical `tests/e2e.py` is **not the current gate**. Its 203 named checks
mix active flows with retired Scene/manual Experience/editor expectations and
old IndexedDB versions. It currently fails after import because it expects the
catalog on the welcome screen. The new catalog suite covers the current route,
but is not a claim that all 203 checks have been ported. Inventory and migrate
the remaining active workflows (including remaining import/author-directive controls, empty-scene startup,
world-chat forms/provenance, storage upgrade/error UI and Perchance image/initiative paths); document retired
checks and remove the obsolete monolith after that migration. F29 remains partial.

Observer/image concurrency is covered by `e2e-observer-image-race.py`: both commit orders, fresh unrelated fields, deleted/edited sources, no resurrection, and reload in RP/Messenger at 1440/390. The regression fails on the pre-A01 bundle.

Assistant replacement durability is covered by `e2e-assist-regen.py`: streaming is transient; errors, cancellation (including a late result), empty output and failed final writes retain the saved answer. Successful replacements use a conditional native transaction, preserve independent metadata and cannot resurrect a deleted or overwrite an edited conversation. Reload is checked for both provider profiles at desktop/mobile widths. External model calls are fixtures.

A03: `e2e-swipe-commit.py` проверяет атомарность выбора свайпа и превью при отказе native IndexedDB, задержанной записи и повторном вызове, сохранение продолжения и reload (RP/Messenger, desktop/mobile). Живая модель не вызывается.

`e2e-reflection-coverage.py`: разделение новых и ранее осмысленных свидетельств, unchanged/reload, native abort финальной записи, повтор неосмысленных событий в следующем цикле, изоляция якоря ветки и сохранение бэкапа. RP/Messenger × 1440/390, LLM подменена.

`e2e-scenario-cutoff.py`: границы 5/10/15/20/25/30 и «Никогда», ветки, авторское приветствие, фактические regen/continue при выбранном сроке 10, reload. RP/Messenger × 1440/390; модель подменена. `e2e-settings.py` выбирает все значения через настоящий select и проверяет сохранение после reload.
