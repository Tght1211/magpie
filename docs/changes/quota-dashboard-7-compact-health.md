# Quota dashboard .7 — compact account rows and health outlook

The approved account-list and simple-health previews now use the existing real
quota/member APIs. Account email, plan, remaining API-equivalent estimate,
percentage and estimated full week align in one row. Mobile rows stack within
the same account. Unknown capacity and nonweekly accounts remain explicit;
there is no fabricated empty meter or plan-price-to-capacity conversion.

Health starts with a plain-language outlook, continuous runway, signed finite-card
effect and the next 24 hours as covered/shortage intervals. The time slider and
refill links inspect the selected scenario. Advanced forecast is collapsed by
default: demand intensity, natural/card first-shortage comparison, one inventory
curve and nested admission inputs remain available. Refresh retains expansion
and scenario state. The actual bound-member ledger is unaffected by the slider.

A covered interval means all compatible demands can be served. Positive total
inventory alone cannot establish availability. Intervals are at most one hour,
split at reset/card events, so shortage and recovery times are approximate.
Runway searches the full 30-day projection; no shortage within that horizon is a
lower bound, not unlimited service. A card can move a natural reset and make a
later shortage earlier; signed and bounded comparisons retain this possibility.
Finite cards do not increase recurring natural supply. Partial calibrated scope
and admission restrictions are preserved. No card executor, route, permission,
binding schema or stored-data migration changes in this update.

The slider performance check exposed unused per-member inventory computations
at every projected snapshot. Health now retains aggregate inventory and served
demand only; fully covered slots skip the max-min search, while shortages keep
fair allocation and residual flow. The 16-account/64-model, 30-day local fixture
fell from approximately 21.8 seconds to 0.51 seconds per projection; the 7/8
fixture fell from 397 to 23 milliseconds. These are host measurements, not a
latency guarantee. A 24-case comparison against the previous model preserved
reset/card events and first-shortage times, with served amounts within 0.00001.

## Verification

Evidence is retained locally under `/tmp/magpie-dashboard-7/`. Production reads
and screenshots stay outside the repository; screenshots mask account identities.

- Old frontend assets fail the new aligned-row assertion: zero table rows instead
  of four. Current assets pass. Changing coverage to positive aggregate inventory
  makes the incompatible-model regression fail on a missed immediate shortage.
- Model cases cover interval clipping/merging, recovery, missing/out-of-range
  data, first shortage after the displayed day, idle demand, finite horizons,
  signed/lower-bound card effects, fair shortages and the 16/64 supported limit.
- Existing calibration, privacy, partial scope, only-bound-Key ledger, missing
  data, natural resets and finite-card constraints remain covered.
- The historical whole-GUI browser-suite limitations documented in
  [the earlier verification record](../quota-dashboard-verification.md) remain;
  this update does not claim a whole-GUI browser-suite pass.
- No production model invocation, binding edit or reset-card spend is used for
  verification. Real Linux preflight uses a service-user isolated empty HOME.

Final frontend and artifact checks:

- 33 JavaScript/browser checks passed with no skips: four model/translation files
  and the planner browser test in Chromium and WebKit. Both engines cover all
  five locales at 1440, 1024, 390 and 320 px, new controls, refresh state,
  calibration gaps, masking, explicit bindings and asynchronous page disposal.
- macOS, Linux amd64 and Windows amd64 full-repository vet/build all passed again
  after the projection optimization. Go processes used isolated HOME and pinned
  caches. No Go source files changed; `git diff --check` is clean.
- Final candidate assets over authenticated production read APIs passed both
  engines, both tabs and 1440/390 px; automatic refresh, populated member rows,
  calibrated forecasts, finite values and page overflow were checked.
- Final Linux binary and compressed upload matched local SHA-256 hashes. Under
  an isolated empty HOME as the production service user, startup, embedded
  assets, authenticated member schema and complete-ledger recognition passed.
- All 108 Go packages passed `go test -count=1 -tags nogui` using isolated HOME,
  pinned caches and per-package logs. The run completed without failed or omitted
  packages, including the gateway, GUI, provider, settings, usage and quota solver.
