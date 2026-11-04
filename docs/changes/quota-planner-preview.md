# Quota planning preview

Custom build: `0.1.2877-quota-preview.1`, based on `e3ed21c`.

The existing Usage plugin now adds a Quota planner page with three tabs:

- Per-account weekly balance rings, natural-reset deadlines, future refill
  windows and a reset-card expiry calendar.
- Recorded consumption with adjustable future pace and a separate target
  curve. Refills split history; forecasts cannot go below zero.
- Existing gateway-key request totals, cache-input share, pool request history
  and a clear separation between observed usage and uncomputed benefits.

The page reads authenticated existing APIs. There are no data migrations or
changes to gateway routing, session affinity or automatic reset-card execution.
The threshold and future refill shown in scenarios are assumptions. Data older
than two hours, failed readings and passed reset deadlines are not treated as
verified available quota. Explicit Refresh asks for a fresh reading; passive
minute polling follows the server's normal allowance-read policy.

Translations cover English, Simplified and Traditional Chinese, Japanese and
German. Styles inherit the application palette and controls. Account masking
uses the existing global privacy control.

## Deployment and updates

The existing systemd service, environment, data directory, caller keys and
provider settings are retained. A backup of the original executable,
configuration, updater and a consistent data archive is taken before replacing
only the executable. Failed health or configuration-integrity checks restore
the old executable without rolling OAuth credentials backwards.

The server's former official-binary update timer is disabled so it cannot
replace the customized build. A Codex daily 04:00 Asia/Shanghai task merges
upstream source into an isolated branch, resolves unambiguous conflicts and
validates it. It does not deploy or push automatically. The local checkout has
an `upstream` remote pointing to `yetone/magpie`; private prototype snapshots
remain local and are not part of the build.

## Verification

- New model tests cover renewal/card ordering, exhausted/unknown/held accounts,
  history reset boundaries and unknown cache accounting.
- New browser tests pass in Chromium and WebKit, all five languages, desktop
  and mobile widths, light/dark, masking, live sliders, escaped API data,
  failures and stale responses after navigation.
- Against the old assets, the new browser test fails because the account
  planning cards do not exist; against the implementation it passes.
- Existing request-ledger, scroll, kernel, masking, timezone and refresh tests
  were exercised. The ledger fixture now opens Routing before expecting its
  live trace: hidden pages intentionally stop polling.
- Native and Linux static checks pass. The Linux executable was started on
  the target server with an empty isolated HOME before deployment.
- The deployed build was checked through its authenticated web page: three
  Codex accounts and their history cards rendered, existing key summaries
  loaded, and no browser page error was reported. Gateway model IDs and
  configuration/caller-key hashes were preserved; historical request totals
  continued increasing after restart.

The repository-wide Go run and cross-platform checks are recorded separately
in the local validation log; this change does not claim a full GUI-suite run.
