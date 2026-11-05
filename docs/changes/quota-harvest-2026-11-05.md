# Quota harvest custom build

Target version: `0.1.2995-quota-harvest.1`.
Based on upstream `ed7aeb052f1747a4567011781cd85ebc4b02ce80`, merged without
conflicts while preserving the custom quota planning pages.

## Behavior

- Accounts are identified by email and follow the existing masking controls.
- Matching account quota declines with local priced usage estimates weekly
  API-equivalent USD/CNY capacity. Insufficient data remains unknown.
- Stacked pool history and forecasts show per-account inventory, natural
  refills and eligible reset-card opportunities, with actual hourly spending
  and a recommended average consumption rate.
- The opt-in “狠狠榨干” strategy uses a receding-horizon inventory plan.
  Time-expanded minimum-cost flow allocates compatible demand; bounded
  discrete search chooses card use. New cards and observed official refills
  rebuild the future plan. Claude contributes natural refills only.
- The target token allocation is advisory. Model permissions, short-window
  caps, cooldowns, RPM, concurrency and session affinity remain enforced.
  Full lanes can use compatible pool members. Existing slow-start/failure
  rules use the configured fallback models; rankings do not force active
  conversations to switch accounts or select arbitrary models.
- Expiry auto-use remains opt-in, waits for the configured margin and the
  vendor's 80%-remaining eligibility boundary, and preserves an earlier
  natural refill. Spending a card shifts the modeled natural reset clock.
- An interactive fictional-account explanation uses the same pure solver.
  It can add cards, apply an official refill and illustrate why live
  dispatch can differ from quota priority. It never spends real cards.

## Compatibility and limits

No account, caller-key or usage-data migration is introduced by this feature.
Existing routing and auto-reset settings retain their values. Dollar values
are estimates at API prices, not cash balances or subscription billing.
Other clients' traffic and changing model/cache mixes can bias calibration.
Forecasts describe inventory under assumed demand, not guaranteed generation
speed or parallel capacity. Missing measurements and unsupported scenarios
produce no fabricated forecast.

Production plans use a 72-hour horizon, hourly slots split at exact events,
up to eight card decisions and a 400 ms search budget. “Optimal” applies
only to this discrete search. Provider groups cannot borrow one another's
demand; individual model compatibility is enforced later by the gateway.
Full details and verification entry points: [quota planning](../subsystems/quota-planning.md).

## Validation record

The model's conservation, reset/card rules and provider separation are checked
against small exhaustive cases. Removing card eligibility makes the new
eligibility regression fail. Race tests cover publication and cancellation.
The new planner UI passes Chromium and WebKit in all five supported languages.
Native, Linux and Windows vet/build checks passed again at `1189f28c`,
including the final stale-read guard and UI assets.

The complete Go suite finished with one failure: the CLI endpoint parity
table omitted the new APIs. After fixing the table, the complete CLI package
passed; all other packages passed the full run. The final stale-reading guard
and cache lifecycle tests also passed with race detection.

The complete GUI run was interrupted in the O-prefixed files, after reporting
additional regressions and a Playwright private-import compatibility failure.
That run did not establish a complete green GUI suite or a server deployment.
The later deployment and its separate checks are recorded below.

Browser fixture corrections wait for initial account reads before using rows,
observe animation completion/progress instead of host-clock sleeps, ignore
WebKit's outer text whitespace and include the quota-planner navigation item.
The final account/model and reset-switch batch passed 40/40; the context-map
and signed-out-account batch passed in both engines. Older failed attempts
remain in the local logs. At that checkpoint, full-suite failures outside these corrected batches
blocked replacement of the production binary.

Additional verified fixture batches: picker folding 22/22, editor alignment
2/2 (all languages and widths inside each case), backdrop dragging 8/8,
gateway keys/folding/model limits 10/10, skill selection/removal 22/22, and
deprecation notice 8/8. The long grip batch still has navigation timeouts;
its isolated Japanese narrow-panel case passes, which is not sufficient
evidence to call the batch fixed. Exploratory changes for that batch were
reverted. The staged Linux binary's SHA-256 and version match on the server;
the active service at that checkpoint was `0.1.2877-quota-preview.1`.

## Local deployment validation

The native executable is running in an isolated local HOME on loopback. The
local read-only preview replays allowance and usage snapshots; it does not
import live login tokens or provider keys. Its snapshot plan is constructed
from calibrated snapshot inputs and sent to the executable's pure solver;
it is presentation validation, not a live gateway-routing trial.

The deployed page passed four tabs at desktop and phone widths in Chromium
and WebKit, for all five languages. Display fixtures supply known inputs;
assets and optimization POSTs use the actual local executable. Adding cards,
applying an official refill, session affinity and timeout illustrations were
exercised. The server snapshot separately rendered three account curves,
calibrated historical usage and key summaries.

Real-page inspection caught a missing reset-card heading translation, now
provided in all languages. A delayed Add provider animation could lose its
authorized scroll when its initial time allowance expired; frames now record
the reader's position and renew the allowance. The held-animation regression
fails on the preceding source and passes on the fix. Header observer changes
are deferred outside the observer-delivery loop. The focused animation,
header and planner batch passed 32/32. At that checkpoint, unresolved full-suite regressions still
blocked the production replacement.

The local executable GUI checks also passed against the server's read-only
snapshot in both engines (three accounts, four tabs, two widths). The GUI Go
package passed with isolated HOME. Navigation-timeout guards and the planner
plus account-switching batch passed 23/23. The long full GUI suite remains
incomplete; these focused results do not replace it.

The routing-group and icon-picker fixture batch passed 78/78 after waiting
for settled layout and using reader wheel input before position baselines.
The agent updater fixture now waits for the wheel to arrive before recording
its position; both engines passed its eight subtests.


## Compact layout and deployment preparation

The account pool pages now use 12 px panel spacing, smaller card and table
padding, tighter metric rows and a 320 px maximum pool-chart height. Key
history stays aligned to the top of its panel. Fonts, controls and colors
continue to inherit the application styles; this CSS is scoped to the planner.
The existing planner/model tests passed 6/6, covering Chromium, WebKit and all
five languages. No new timing or pixel-exact fixture was added for spacing.

The user subsequently requested installation of the complete custom build.
The deployment uses an executable built from this compact layout, a consistent
server-side data archive, preserved settings/keys/history and binary rollback
on failed health checks. The full GUI suite remains incomplete with the earlier
unresolved cases; targeted checks are not a claim that this suite is green.
This is a custom server update, not an official upstream release.


The final compact assets passed native, Linux and Windows vet/build checks.
The rebuilt local executable also passed the four-tab checks in Chromium and
WebKit at desktop/phone widths in all five languages, including the real demo
solver. Its cold-start test now waits for the initial state snapshot before
reading settings (the endpoint can initially return null).


## Production deployment — November 5, 2026

Installed `0.1.2995-quota-harvest.1` from application commit `ca5271d7`.
Linux amd64 executable SHA-256:
`42f7f79ae47f17193acb4eac3307e1a379320640b6b5563602bd312a1f4368ab`.

The initial attempts left the old service untouched while requests stayed
active. Deployment began after observing an idle interval. A consistent data
archive, previous executable, environment and service definition are retained
under `/var/backups/magpie-custom/20261105T064852Z-quota-harvest.1`.
Configuration files, including caller keys and provider settings, matched
their previous hashes. Existing quota identities were retained and the exact
previous usage-log prefix was preserved. OAuth data was not restored from
an old snapshot. The new service and gateway are active; automatic upstream
replacement remains disabled. Existing routing and card-use settings were kept.

The pool/plan APIs and compact static assets passed authenticated checks.
Public HTTPS GUI checks passed Chromium and WebKit, all four tabs at desktop
and phone widths, without page errors or page-level overflow. Subsequent real
traffic included successful completed requests on the updated gateway; these
were observed user requests, not extra test calls. The final GUI Go package
also passed under isolated HOME (78.272 s).

The earlier incomplete full GUI run and its unresolved failures remain open.
This deployment record does not turn those failures into passes or claim that
all historical regression work is finished.
