# Quota dashboard integration verification — 2026-11-06

The approved battery layout now runs in the Usage plugin, reading authenticated
quota, pool, planning-history and member-usage APIs. The four views are quota
planning, consumption review, Key sharing benefit and pool health. Refresh
animation follows changed measurements; it does not generate synthetic usage.

Each member Key is explicitly bound to one contributed account. The binding
annotates ownership only and changes no Key permissions or request routing.
Duplicate ownership is rejected, ordinary settings saves preserve bindings, and
an explicit binding action releases annotations belonging to deleted Keys.
The routing, concurrency and session-affinity mechanisms are unchanged.

## Interpretation

- Currency is calibrated API-equivalent allowance, not the subscription price.
- Historical actual balances are aggregate observations; future account stacks
  are conditional projections. Missing observations are not fabricated.
- Key comparisons allocate the same pool jointly to competing member/model
  demand. They predict future own-account versus shared service; they do not
  invent historical savings. The current ownership annotation applies to retained
  usage records; historical ownership changes are not reconstructed.
- Demand requires 24 complete priced hours and a member snapshot no more than
  120 seconds old. Unavailable or incomplete data is displayed as unknown.
- Forecast compatibility requires an observed successful account/model pairing
  and current access predicates. This can underpredict new compatible pairings.
  Limited Keys currently have no capacity forecast.
- Member projections are bounded to 16 accounts, 64 demand nodes and 90 days.
  The longer planning explorer is a separate conditional scenario.
- Natural replenishment determines sustainable capacity. Finite reset cards
  affect the scenario, including expiry and the shifted natural-reset window,
  but do not increase the sustainable capacity ratio.
- Admission evaluates one proposed calibrated account and one selected demand
  model. It is not a subscription-price recommendation or availability guarantee.

## Completed checks

- Final frontend run: `NODE_PATH=/tmp/magpie-test-node/node_modules node --test
  internal/gui/tests/quota-planner.test.cjs
  internal/gui/tests/quota-members-model.test.cjs
  internal/gui/tests/quota-explorer-model.test.cjs
  internal/gui/tests/i18n-keys.test.cjs` passed 20/20, including both engines,
  after the final payload and stale-snapshot guards.
- Chromium and WebKit quota-page tests: all four tabs, five locales, narrow
  layouts, timeline navigation, binding/unbinding and persisted refresh behavior,
  duplicate ownership rejection, missing-data states and asynchronous page exit.
  Browser screenshots use synthetic test accounts, not production data.
- JavaScript model tests: shared-capacity conservation, constrained models,
  finite cards, sliding resets, natural reset before expiry, member transfers,
  incomplete history and exact reset boundaries. Translation-key checks passed.
- Full `internal/settings` and `internal/usage` Go package tests passed.
- `internal/gui` Go package passed with
  `-skip '^TestProxyCheckSaysAProxyPassedBy$'`; see the failure below.
- Targeted race checks passed for quota members, settings preservation and the
  built-in asset manifest across settings, usage and GUI packages.
- Native macOS `go vet -p1 -tags nogui ./...` passed. A native build passed
  before the final binding-pruning and frontend guard changes; that binary is
  not a release artifact for the final source.
- The browser regression test failed against the original HEAD's assets on the
  missing account layout, then passed with the new frontend.
- Go checks used temporary HOME directories with pinned Go caches and cleared
  proxy environment variables. No production configuration was used by tests.

## Incomplete checks and release boundary

The full `go test -tags nogui ./...` run was stopped because disk space was
nearly exhausted; it did not pass. The full GUI suite was also stopped after
failures/timeouts on account/settings pages and is not a passing run. A separate
Chromium account-alias rerun passed 10/10; the other full-suite failures remain
unresolved. Linux and Windows builds/vet were not run in this integration pass.

`TestProxyCheckSaysAProxyPassedBy` returned HTTP 502 where its direct fixture
expected success. It was reproduced against unmodified starting HEAD
`fde8661f1f39ee006045d9722b9b50127e4c9536` under isolated HOME. Reproduction on
old code does not resolve the failure or satisfy the release criteria.

This is a development-branch integration. No production deployment, release,
live account invocation or real reset-card consumption was performed. The full
verification gaps must be resolved before treating this as a validated release.


## Approved prototype parity correction — 2026-11-06

The first dashboard integration (`ef08d574`, deployed as
`0.1.2995-quota-dashboard.1`) preserved data and passed its functional checks,
but did not faithfully reproduce the approved UI. This correction directly
ports all four pages from the approved local `quota-battery-review` prototype
served at `127.0.0.1:43550` and keeps the real API adapters.

The prototype and candidate were captured at 1440 px in both light and dark
modes. Matching main-page geometry was measured: heading 52 px; balance summary
153.6875 px with 20 px padding; forecast controls 49 px; date strip 101.5 px;
account grid 116.5 px. Native shell dimensions and actual-data-dependent content
are intentionally different. Screenshots use fictional fixtures; production
checks mask identities. Local evidence: `/tmp/magpie-ui-parity/`.

Verified on the correction:

- Chromium and WebKit: all four tabs, five locales, 1440/1024/390 px, currency,
  forecast mode, cards, date range, privacy round-trip, explicit binding,
  admission inputs, stale/failed reads, periodic refresh and navigation cleanup.
- Four pure/fixture model suites plus i18n guards passed 27/27; final browser
  and i18n invocation passed 6/6, including measured geometry and keyboard tab
  navigation assertions.
- Linux amd64 nogui final build passed with isolated HOME.
- Candidate assets against authenticated production reads passed both engines,
  all four tabs at 1440/390 px and observed automatic refresh. No production
  bindings, routing settings or card operations were changed by this check.

Earlier full-suite limitations above remain disclosed; this correction does not
claim a new full repository Go/GUI suite pass. It changes frontend assets only,
with no settings migration, routing change or reset-card operation.

### Corrected production deployment

Deployed `0.1.2995-quota-dashboard.2` from `bdfec1e0` on 2026-11-06
(Asia/Shanghai). Linux executable SHA-256:
`765c53e1af6a1003b3d7bdb4acb146e13358d678ebc9c0a43e360c5d37477cb5`.

The independent Linux preflight used an empty HOME as the service user and
verified startup, embedded assets, member schema and authenticated access.
Uploaded bytes matched the locally built hash. A backup of the prior executable,
service configuration and consistent stopped-service data is retained at
`/var/backups/magpie-custom/20261105T192013Z-quota-dashboard.2`.

The switch verified unchanged configuration hashes, all 54 existing provider
quota identities and the full pre-deploy usage-ledger prefix. Gateway and planner
APIs were healthy. The backup/switch/check sequence took 9.66 seconds; this is
not a measured request downtime. Rollback restores the old executable while
retaining current data.

Post-deployment Chromium/WebKit checks passed all four tabs at 1440 and 390 px,
including actual automatic refresh, finite values, no page overflow and no browser
errors. The member API returned 8 members, 4 accounts and 4 explicit bindings;
these are observed state, not bindings created by this deployment. A subsequent
trace snapshot observed 5 successfully completed calls, none failed and none in
flight. Screenshots are privacy-masked; local evidence is under
`/tmp/magpie-dashboard-live/` and `/tmp/magpie-parity-*.log`.

## Later compact layout update

The approved compact account rows and simple two-tab health outlook are recorded
in [quota dashboard .7](changes/quota-dashboard-7-compact-health.md). This later
record supersedes the original four-page/grid layout and contains its own final
validation and deployment outcomes; the historical failed/incomplete runs above
remain evidence of those earlier attempts.
