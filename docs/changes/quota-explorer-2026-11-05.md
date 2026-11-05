# Quota time explorer and emergency refill preview

Custom build `0.1.2995-quota-harvest.2` adds a compact pace card with measured
last-hour usage, a slower/on-pace/faster gauge, smooth value changes, live sample
age and refill countdowns. Scenario demand remains separate from actual usage.

The pool timeline can be dragged, moved with arrow keys or a date picker, and
zoomed from a day to three years. Initial inventory, natural refill inventory and
card refill inventory have separate stacked colors. Actual consumption is compared
with immutable saved forecasts, with unknown/missing periods left blank.
Both charts shade Saturdays and Sundays in the browser’s local timezone; wide
bands say Weekend and yearly views use softer shading.

Emergency scenarios show cards used, allowance added, extra served use versus
waiting and the shifted natural reset. Only already-enabled emergency resets are
included, after compatible usable inventory runs out. Expiry, cooldown and provider
restrictions remain enforced. No simulation spends cards or changes routing.

Private server-side history begins with this version and continues while the
gateway runs. Existing account settings, caller keys, ledger and quota records are
preserved. Historical predictions that were never recorded cannot be reconstructed.
Long-range scenarios assume continuing subscriptions and unchanged usage/capacity;
they are not guaranteed future credit or a global optimum.

## Verification

- Quota solver and usage packages pass race tests. Saved forecast tests cover
  concurrent append, corruption preservation, immutable first forecasts, scope
  changes, monthly aggregation and missing coverage. Authenticated history API
  tests pass and verify that reads create no journal.
- Mutation checks fail when emergency candidates are disabled, first-forecast
  immutability is removed, or the browser emergency projection is disabled.
- Explorer/model/i18n checks pass 16/16. Planner browser cases pass Chromium and
  WebKit in five languages, including weekend bands, zero/stale pace, historical
  navigation, keyboard/drag, desktop and phone layouts. Weekend calculations cover
  a 49-hour daylight-saving weekend.
- The initial full Go run hit its gateway timeout and exhausted local disk; a
  subsequent cache removal during compilation also caused cache-read failures.
  All 31 affected non-gateway packages passed after cleanup. A complete gateway
  rerun exposed a timeout-report race, fixed separately in `e78db386`; its
  deterministic regression fails before the fix. That regression, the real-server
  report test and history-retention test pass `-race -count=20`. The final complete
  gateway package passes (595.295 s). This is a recovered multi-run result, not a
  claim that the initial full run passed.
- Native/macOS, Linux amd64 and Windows vet/build checks pass. Cross-compilation
  does not establish Windows runtime behavior.
- The actual isolated local executable passes four tabs, desktop/phone widths and
  five languages in Chromium/WebKit. Assets, history GET and optimization POST
  use the executable; fictional data supplies display coverage.

The previous incomplete full GUI suite remains a known limitation; focused checks
are not a full-suite pass. The first drag test sampled a moving chart before the
shell finished scrolling; the corrected test waits for an actionable chart. The
controller also preserves keyboard focus and defers redraws during pointer drags.
An initial translation guard found a helper-name collision with another plugin's
word; renaming the helper resolved it. No real reset card was spent in validation.

This is a custom server update, not an official upstream release. Historical
predictions start with recorded data; missing past predictions stay unavailable.
The emergency candidate search and long-range projection retain the documented
limits in [quota planning](../subsystems/quota-planning.md).


## Production deployment — November 5, 2026

Installed `0.1.2995-quota-harvest.2` from application commit `a3f321fd`.
Linux amd64 SHA-256:
`138428950388a9124182f7dc23f1ee27c5a4eeef12853d323c8120883fa6b6b5`.

Requests remained active; the previously authorized short restart was used.
Backup and post-start checks completed in 19.55 seconds (not a measurement of
request downtime). The previous executable, consistent data archive, environment
and service definition are retained under
`/var/backups/magpie-custom/20261105T144142Z-quota-harvest.2`.

Configuration hashes, account identities and the existing usage-ledger prefix
were preserved. No OAuth data was restored from a stale backup. The new service
and gateway are active, and quota pool, plan, history and explorer asset checks
pass. Public HTTPS checks pass both Chromium and WebKit, four tabs at desktop and
phone widths, with weekend bands present and no page errors or page-level overflow.
Successful completed user traffic was observed after deployment; no extra paid
model call or real reset-card action was issued for verification.

The first scheduled archive record and its saved forecast were observed after
the five-minute collection interval; journal permissions exclude group/other
access. Historical comparisons now accumulate from this deployment onward.
