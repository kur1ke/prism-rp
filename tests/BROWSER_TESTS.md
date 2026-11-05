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
The mobile settings fixture enters the existing Assistant view to access its
menu button. It does not prove mobile welcome/catalog navigation: those views
currently lack that button while the rail is off-screen. Keep that UI issue as
separate follow-up work rather than hiding it with forced clicks. The image
viewer scenario closes with the supported Escape shortcut and logs whether its
close button fits the viewport; the button can fall outside the screen with the
fixture prompt. This gate does not claim that button is usable in that case.

## Remaining F29 work

The historical `tests/e2e.py` is **not the current gate**. Its 203 named checks
mix active flows with retired Scene/manual Experience/editor expectations and
old IndexedDB versions. It currently fails after import because it expects the
catalog on the welcome screen. The new catalog suite covers the current route,
but is not a claim that all 203 checks have been ported. Inventory and migrate
the remaining active workflows (including remaining import/author-directive controls, empty-scene startup,
world-chat forms/provenance, storage upgrade/error UI and Perchance image/initiative paths); document retired
checks and remove the obsolete monolith after that migration. F29 remains partial.
