# Upstream sync candidate — 2026-11-06

Status: the user subsequently requested deployment of this update. Full Go
package runs and all three platform build/vet checks pass. **Full GUI acceptance
is still incomplete**. This merge records the candidate for the requested
`0.1.2995-quota-dashboard.3` deployment; it does not claim full-suite acceptance.
The deployment result is recorded separately after server verification.

- Custom baseline: `713070fbcd4ac3d344b11953cab0bc36dcf7117a`, the current local
  `codex/quota-pool-forecast` head and the same branch's verified origin head.
- Official default branch: `main`, resolved using `git ls-remote --symref`.
- Fetched upstream: `8fbf8e0af67032ce0cf0d57e63945f27c590d5d1`.
- Previous merged upstream: `ed7aeb052f1747a4567011781cd85ebc4b02ce80`.
- Candidate: `codex/upstream-sync-20261106` in
  `/Users/tght/develop/mine/magpie-upstream-sync-20261106`.
- 99 upstream commits. The prior 2026-11-05 candidate was already included in
  the current custom baseline; it was not reused as an outdated base.
- The original custom worktree was clean and remains at the same commit.

## Resolution and compatibility

The sole textual conflict was four language dictionaries in
`internal/gui/assets/i18n.js`. Custom quota-planning strings and official new
routing/balance strings were independent additions at the same insertion point.
Both sets were retained after checking their keys did not overlap. Two new
upstream Go test comments quoted plugin-owned UI labels and triggered the
translation ownership guard. The comments were rephrased; translation ownership
and the guard are unchanged. No product choice or custom-feature deletion was
necessary.

The quota solver, card executor, planning history, explicit one-Key/one-account
binding and dashboard renderer are unchanged from the deployed custom
baseline. A redundant narrow-screen `overflow:auto` declaration was removed
from `planner.css`; the later `overflow:hidden` rule already overrode it, so
computed layout is unchanged. Both engines now pass the upstream stylesheet
scroll-containment guard. Automatically merged settings code retains `QuotaMembers` preservation;
the gateway retains harvest ranking and its concurrency/session/fallback guards.
Official changes add learning of unknown Codex weekly allowance from real reply
headers and preserve the separate five-hour and weekly constraints. The planner
continues to treat uncalibrated capacity as unknown.

Official manual refresh now asks every saved Claude account for usage. The custom
planner's manual refresh is adapted to the same `asked=1&all=1` contract; automatic
reads keep their previous behavior. Its browser fixture asserts this query.

Other official changes include routed/archived search calls, refusal handover,
DeepSeek image file references, Gemini signature handling, Codex thread/provider
continuity, plugin child-process cleanup, and provider/model-picker fixes. Upstream
subsystem references describe these contracts. No production credentials or
configuration were used in validation, and no real reset card was consumed.

## Integration fixes found during full verification

- The upstream CLI route inventory now documents the custom quota-member GET
  and POST routes in its existing not-yet-exposed map. Ownership is edited in
  the dashboard; no generic CLI setter was introduced.
- The shared settings API now carries the saved `QuotaMembers` into its merge
  result. Ordinary settings saves already protected the persisted map, but their
  reply could incorrectly report an empty or supplied map. New Apply tests cover
  existing/no bindings and omitted/null/forged payloads, checking both reply and
  disk; generic CLI Body rejects the ownership key. The original parity guard
  and the new tests failed before the fix and pass after it.
- The aggregate core script budget explicitly adds 2,746 bytes, the measured
  custom `app.js` delta against upstream `8fbf8e0a`, for the provider routing
  editor's harvest/preview controls. The app.js cap and upstream headroom stay
  the same; the dashboard remains plugin code.
- Reduced-motion dialog refreshes now disable `content-in`: a pending .01ms
  animation still held the dialog translated by 2px before its compositor frame.
  A deterministic window-cap assertion failed before the CSS fix; all 80 cases
  passed after it. Normal-motion animation is unchanged.
- Browser checks now measure the current DOM after asynchronous redraws.
  Account-model badge opacity waits for the current attached badge. Modal morph
  checks measure the current row on opening/reopening/closing; diagnostics showed
  the dialog correctly at y=401 while the stale pre-redraw row was y=406.
  Geometry tolerances are unchanged. Reduced-motion spinner checks seek the
  animation clock instead of racing a one-second wall timer; removing upstream's
  finite-iteration fix still fails both engines.
- The icon-save regression waits for the API response and closing state, then
  finishes the close animation before checking dismissal and persisted icons.
  Captured Chromium failures had saved successfully without script errors but
  advanced a 260ms close only 124ms after a five-second wait. A deliberately
  paused compositor fails the old helper and passes the new one in both engines.
  Separate modal tests retain intermediate-frame checks. The combined icon,
  modal, quota-page and translation run passed 32/32 after these fixes.

- Agent-settings regression checks wait for the saved switch from Full window
  back to the shared size before editing that other field. Waiting for a hidden
  input did not establish completion because Full window had already hidden it.
  The failover test now checks the actual Codex heading: WebKit's modal-wide
  innerText starts with a line break, while the editor and selected row are
  correct. The Only models I pick check likewise ignores WebKit’s surrounding
  line breaks while checking the exact translated words. No application behavior
  changes for these test corrections. Agent settings/failover passed 28/28 and
  Only models I pick passed 12/12 after the corrections.

## Resumed verification

Evidence and reproducible runners: `/tmp/magpie-sync-20261106-resume/`.

- Disk exhaustion was traced to Go cached-test tracing: one `testlog.txt` reached
  1.1 GiB. `go test -count=1` avoids that trace while keeping fixed build/module
  caches. Only inactive task-owned temporary output was removed. No user data
  or shared caches were deleted. Short `/tmp/mr-*` paths also avoid macOS Unix
  socket path limits in handoff tests.
- Full package inventory: **108/108 commands succeeded**, including 20 packages
  with no test files. Tests ran serially per package with `-count=1 -v -tags
  nogui -p 1 -timeout 20m`, isolated HOME, pinned caches, cleared proxy variables
  and a test-only system-proxy shim. Resume manifests retain each package's
  command result; this is a union of completed runs, not one monolithic command.
  There are 286 explicit skipped test/subtest lines (platform/live-tool or
  optional runtime conditions); those cases are not counted as executed passes.
  See `nocache/go-results.json` and package logs.
- Final macOS arm64, Linux amd64 nogui and Windows amd64 vet and builds:
  **all six passed** (`platforms-final/results.json`). Build outputs were hashed
  and removed with their private temporary directories; these are not release
  binaries. Cross-builds do not establish runtime behavior on Linux or Windows.
- Targeted race checks passed in usage, settings, provider, gateway and redact.
  The initial plugin pattern matched no tests, so it was replaced by the real
  child-lifecycle test. After installing task-local pinned Bun 1.4.2 (official
  archive checksum verified against the repository pin), all three plugin
  stop/killed/own-end subtests passed under race. Settings API ownership and
  settings preservation tests also passed with race after the new fix.
- A full CLI package rerun with task-local Bun also passed (`cli-with-bun.log`),
  exercising optional plugin checks unavailable in the earlier package run.
- Installer tests: **28/28 passed** (`site-install.log`).
- GUI regressions: account-models **24/24**, modal-morph **6/6**, window-cap
  **80/80**; reduced-motion repeat **20/20** with old-code red checks. The
  aggregate GUI run remains incomplete until the full manifest finishes.
- Full GUI manifest has 1,233 files. Completed per-file results are preserved
  across `gui*/results.json`; `gui-complete` continues the remaining files and
  records failures without calling an interrupted or partial run passed.
- The continuing broad run has also exposed an unresolved
  `agent-own-direct.test.cjs` geometry failure (Chromium zh-TW, 420px): a
  provider-group heading measured 44px while the comparison heading measured
  0px. This is not marked fixed or passed; its log is retained in `gui-complete`.
- Real-provider invocations and real reset-card consumption were not performed.

## Earlier attempts (historical evidence, superseded where noted)

Logs, test manifests and reproducible runners are in
`/tmp/magpie-sync-20261106-qa/`. Logs are local temporary evidence, not a claim of
CI or production verification.

- Initial free disk: 4.7 GiB. Both full Go attempts were interrupted for space.
  The second run's guard fired below 1 GiB; the subsequent read showed 372 MiB.
  After confirming their processes were gone, only these two run-owned temporary
  directories were removed: `go-build799043104` and `go-build2142701723` under
  the macOS temporary directory. No user data or shared caches were deleted.
  About 1.6 GiB was free after cleanup.
- Conflict markers cleared; index/worktree `git diff --check` passed.
  `gofmt -l` on existing changed Go files printed nothing. The first scan
  mistakenly included upstream-deleted files, then the scan was corrected.
- Focused Go run passed (exit 0), with isolated HOME, fixed GOPATH/GOMODCACHE/
  GOCACHE, test-only system-proxy shim, cleared proxy variables, GOMAXPROCS=2,
  `-tags nogui -p 1 -timeout 8m -count=1`. The manifest selected 456 names
  from changed test files plus quota/harvest/member/card guards across 22
  packages. This is not a claim that 456 tests ran: platform-specific names
  do not all execute, and `internal/quotaplan` matched no names.
- Full `internal/quotaplan` was therefore run separately without a name filter:
  passed (exit 0, 0.878 s). The focused package output and selection manifest
  are retained as `go-focused.log` and `go-focused-manifest.json`.
- Full Go suite: **incomplete, not passed**. The initial all-packages process
  was stopped for low disk space. The retry ran one package per process to
  release temporary artifacts, but reached the disk guard during
  `internal/agent`; only root and `internal/access` had completed. Runner exit
  143 records the interruption. See `go-serial-full.log`, `go-packages/` and
  `disk-guard-stopped.txt`. No failing assertion was reported in those two
  interrupted attempts; interruption does not establish correctness.
- Full 1,233-file GUI suite: **incomplete, not passed**. The replacement
  50-file changed/integration run is also **incomplete, not passed**: it was
  stopped after low disk blocked full acceptance. Its initial failures are
  retained in `gui-changed.log`; targeted final reruns are described below.
- Translation guard: initially failed on the two upstream comments; after
  rephrasing, **4/4 passed** (`i18n-fixed.log`).
- Stylesheet scroll-containment guard: initially failed in both engines on
  the redundant planner declaration; after removing it, **2/2 passed**
  (`scroll-fixed.log`). No test guard was relaxed.
- Old-WebKit compatibility: initial launch was unavailable because the local
  Python Playwright package supplies core without the Babel bundle. A second
  attempt with full Playwright 1.53.1 passed static checks but lacked its
  matching browser. The final run used installed core/browser 1.58.0 and the
  installed full Playwright 1.54.1 Babel bundle, resolved by a temporary Node
  preload for that import only. **6/6 passed**, exit 0, including all-page
  WebKit execution with newer built-ins removed. No repository dependency or
  assertion was replaced (`old-webkit-fixed-environment.log`). This simulates
  missing Safari 15 built-ins, not a run of Safari 15 itself.
- Manual-refresh regression: the new assertion fails against a temporary copy
  of the assets using the old `asked=1` request, with
  `manual planner refresh includes every saved Claude account` and
  `null !== '1'` (`refresh-red.log`). The candidate source was never reverted.
- Final custom browser/model run: **25/25 passed**, exit 0, across the five
  planner/explorer/member/pool test files (`quota-final.log`). The dashboard
  browser test covers both Chromium and WebKit, all five languages, all four
  tabs, desktop/narrow layouts, bindings, real refresh behavior and failed or
  stale reads. This final run includes the CSS cleanup and manual-refresh fix.
- Standalone macOS/Linux/Windows vet and builds, race checks and real-provider
  invocation: **not run** in this sync. No reset card was consumed.

## Remaining verification

Full GUI acceptance remains unfinished. The broad scan retains all results and
continues independently. The two last layout failures (`agent-own-direct` and
`agent-update-all`) passed a joint rerun (38/38), but a passing rerun alone does
not establish their root causes; they remain disclosed. No production routing or
quota failure was demonstrated by those layout checks. Their investigation and
the full GUI scan remain follow-up work after the explicit deployment request.

Before deployment, verify the committed Linux artifact in an empty service-user
HOME, retain a stopped-service data backup and the old executable, then check
configuration hashes, account identities, the usage-ledger prefix and the planner
APIs. Any failed switch check restores the prior executable. No real reset card
is consumed for validation. This update does not publish a GitHub release or
claim an upstream version tag; `.3` identifies the custom build.

The saved source branch was rechecked at `713070fb`, with a clean worktree, before
preparing this deployment. Promotion must preserve any intervening local edits.
