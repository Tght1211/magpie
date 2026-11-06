# Quota dashboard .6 — preserve expiry schedules and calibrated forecasts

Two user reports are addressed: adding accounts/Keys made otherwise usable
planning and health data disappear, and the quota-harvest forecast served less
than the simpler expiry policy in the same observed scenario.

## Expiry schedule regression

Emergency candidates could fill the first eight decision slots and displace an
expiring-card action. The solver now evaluates expiry-only schedules first,
retains the best feasible result, then searches the combined alternatives within
the same time budget. It does not claim continuous or global optimality.

`TestRescueCandidatesKeepTheExpiryBaseline` fails on the old solver with served
inventory 100 versus an expiry-only baseline of 200. With the fix, enabling
rescue candidates preserves that baseline and still reports `bounded-feasible`.
A private read-only production snapshot replay changed projected 72-hour service
from 1788.849026 to 2418.917573 API-equivalent USD, recovering one card's
630.068548 capacity. These values describe that snapshot, not a future promise.

A second later snapshot independently reproduced the same missing 630.068548
capacity; the corrected harvest and expiry simulations both served 2394.245601.

The policy table uses the solver's calibrated accounts, measured balances,
capacity estimates, flags, horizon and per-provider demand for every scenario.
Its copy distinguishes bounded optimization from the simplified 30-minute
session simulations used for other policies. The numbers are conditional
estimates, not a guaranteed ranking. Routing policy choices remain distinct.

## Partial coverage

Seven accounts existed in the investigated snapshot, but only four had usable
weekly calibration. One new Plus account had a measured percentage but no paired
calibration yet; two Free accounts had monthly windows. Whole-pool equality
checks hid the existing four-account subtotal and projection.

Known accounts now retain their subtotal, pace and provider-level health curve.
The coverage notice, subtotal count, plan labels and chart legend identify that
scope. Account cards remain visible, with a measured weekly percentage when
available; nonweekly accounts are explicitly labelled. Unknown capacity is never
zero-filled. Partial coverage does not authorize member admission or a whole-pool
health verdict. Scoped usage remains separate from whole-pool history. New unused
Keys do not invalidate known demand; unknown prices within the forecast scope
still make demand unknown.

Member ownership remains one Key to one account. Only bound Keys appear in the
sharing ledger. This patch adds no storage migration and changes no permissions,
concurrency, affinity, failover or vendor card-execution paths.

## Verification

Evidence is retained locally under `/tmp/magpie-new-key-fix/`; private production
snapshots are not repository fixtures. Deployment outcomes are recorded below
after the final executable is verified.

The first full Go attempt stopped at the GUI package's existing
`TestAppReplacesItsOlderGatewayOnceIdle`. Its 15-second exit wait was shorter
than the production port lookup's 30-second deadline; one standalone local
`lsof` measurement took 17.630 seconds. The test could clean up the fake process
while discovery was still running. Its exit wait now allows 45 seconds for
bounded discovery and the graceful/forced exit windows. Production handover
behavior is unchanged. A temporary Go overlay injected a one-time 16-second delay
at Darwin listener discovery: the old test failed on the live fake gateway,
while the corrected test passed under `-race`. Failed initial/stress logs are
retained and are not counted as successful checks.


Further stress checks exposed the shared Darwin probe's filesystem blocking and
its conversion of every empty failed `lsof` invocation into an empty port.
Socket queries now use `-b`, and only exit status 1 with empty output means no
listener. Cancellation and other failures remain errors. This macOS-only fix is
separate from quota scheduling and does not alter the Linux server's process
lookup. Fixture regressions fail without the nonblocking option and strict error
classification; the proc package separately checks real listening and empty
ports. GUI lifecycle fixtures isolate discovery as described below. The local `lsof(8)` manual documents the option and its
filename limitations; this caller requests only TCP socket PIDs.


The host still showed occasional slow native queries after avoiding filesystem
inspection. GUI lifecycle fixtures now supply the PID/lifetime of only the fake
listener they start. HTTP streaming, executable identity checks, real process
termination and the replacement listener remain real. The production discovery
function remains `proc.ListeningOn`; its separate tests cover actual OS socket
lookup and cancellation/error cases. Fixtures restore the dependency and wait
for their watcher to end. A committed slow-discovery regression holds discovery
for 16 seconds; restoring the old 15-second wait fails it. This scopes integration
tests without treating a skipped native check as a pass.


A later full Go run exposed a fixed-date Claude keep-alive fixture: its
November 6 reset had already passed, so the reading correctly rolled from 37%
to 0%. Both live-clock keep-alive fixtures now place the reset three days ahead
in UTC; historical parser fixtures retain their explicit clocks. The affected
tests pass in UTC, Pacific/Kiritimati and America/Los_Angeles. This is a test-only
correction; provider renewal behavior is unchanged.

Current focused verification:

- Solver package under the race detector, including the expiry-baseline
  regression; independent production-snapshot replays reproduce the lost card.
- 27 JavaScript model/translation tests; Chromium and WebKit planner tests in
  five locales at desktop, tablet and mobile widths. Tests cover new uncalibrated
  accounts, scoped health, comparison inputs and bound-only member rows.
- Candidate assets over read-only authenticated production APIs: both engines,
  1440/390 px, two tabs, automatic refresh, finite values and no overflow.
- Native proc race tests, GUI handover race stress (`-count=20`), lifecycle and
  replaced-binary race checks. Full GUI Go package passed without skipped tests.
- The historical whole-GUI browser suite limitations in
  `docs/quota-dashboard-verification.md` remain unresolved. This change's
  touched-page browser checks pass; no whole-GUI pass is claimed.
- No production model requests or reset-card spending were performed by these
  checks. Real Linux startup/authentication/embedded-asset preflight is repeated
  with the final release executable before deployment.

Final source validation completed on 2026-11-06 before deployment:

- All 108 Go packages passed `go test -count=1 -tags nogui` in isolated HOME
  directories with pinned caches and package-level logs. Failed/interrupted
  attempts are retained separately; the resumed ledger includes only successful
  runs and does not count skipped packages as tests.
- macOS, Linux amd64 and Windows amd64 each passed full-repository vet and
  build checks, repeated after the final live-clock fixture correction.
- Changed Go files are gofmt-clean and `git diff --check` is clean.
- Source fixes: `8965ad9d` (solver/comparison), `02578f4d` (partial coverage),
  `859eca57` (Darwin discovery/lifecycle fixtures), `dbf9b1f8` (dated fixture).
