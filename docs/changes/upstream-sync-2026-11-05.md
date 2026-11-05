# Upstream sync candidate: 2026-11-05

Status: upstream candidate passed Go validation; combined custom-feature GUI acceptance follows in the integration branch.

- Custom base: `e2c559ff4a8e84dc98db1a675a3921792ec3bf5e` (`codex/quota-planner-preview`).
- Upstream: `ed7aeb052f1747a4567011781cd85ebc4b02ce80` (`yetone/magpie`, main fetched on this run).
- Common ancestor: `e3ed21c7a2fbba6bb940097472e324530cc2f3ae`.
- Candidate: `codex/upstream-sync-20261105`, in `/Users/tght/develop/mine/magpie-upstream-sync-20261105`.
- 27 upstream commits, 104 upstream changed files. Git merged without conflicts; the shared translation file merged automatically.
- Original checkout remains clean at the custom base. Nothing was pushed, released, or deployed.

## Compatibility review

The quota planning, consumption scenarios and Key benefits implementations,
their manifest, markup, translations and tests retain their saved custom
contents. The common translation file retains the four custom page titles.
The planner still uses the existing authenticated read APIs and is a preview;
it does not execute resets or change account ranking/session affinity.

Upstream improves Usage rendering with cached curve parsing and avoids drawing
cards twice on open. Balance-only plugin cards gain balance histories; Codex
window-history handling remains in `noteQuotaHistory`. Gateway changes include
bounded compaction waits, local fallback for over-cap compaction requests,
region-refusal retries, request-body memory handling and caller-key status
reporting. Claude conversations retain the first working folder for cache
continuity. Plugin options and agent-package identification are also updated.

An upstream compatibility change needs noting before deployment:
`Provider.AccountModelsAll` records a key explicitly set to All models.
Fetching models preserves that new explicit marker. Older All models choices
have no marker and may be narrowed once to the key's fetched model list when
other keys expose more models. This behavior is documented upstream in
`docs/subsystems/providers-accounts.md`; the sync adds no further migration.

## Validation

- `git diff --check` and staged diff check passed; `gofmt -l` on upstream-changed Go files printed nothing.
- Focused `go test -tags nogui -p 1 -timeout 5m -count=1` passed for proc, provider, plugin, gui, gateway, cli and sessions. Its filter contains the 145 test names from changed test files, including platform-specific/helper names; this is not a claim of 145 individually executed tests. Temporary HOME, pinned Go caches, cleared proxy variables and a test-only `scutil` shim kept the run off the real configuration.
- Native `go vet ./...` passed (existing macOS deprecation/enum warnings).
- Initial browser run: 424 of 425 passed across Chromium/WebKit, including the custom planner and the changed upstream pages. The one failure and its repair are described below.
- Follow-up browser regression run: all 327 passed, including the full Context tuning file, i18n keys, Traditional Chinese/Japanese/German suites, Usage ledger/refresh, panel refresh, plugin kernel and compact-setting consistency, across Chromium and WebKit.
- After freeing build-cache space, Linux and Windows vet and native/Linux/Windows builds passed. The first full Go run exceeded the gateway package's 10-minute aggregate timeout; rerunning with `-p 1 -timeout 30m ./...` passed every package (gateway 572.819 seconds). The earlier interrupted run is not counted as a pass.
- Not run on this upstream-only candidate: race checks, full GUI suite or live provider/server checks. The combined feature branch must complete its own acceptance before deployment.

## Browser fixture repair

`context-tune.test.cjs` assumed that the advice response plus 300 ms meant its
entrance animation had started. Chromium redrew the pane for history before
its first painted frame, recording 0 animation starts for 4 charts. The same
failure reproduced in an isolated run. Diagnostic timestamps showed the
history redraw before the first animation frame; reduced-motion was false.

The test now holds the history response until it observes the first four
animation-start events, explicitly requests normal motion, and waits for
frames instead of sleeping before checking redraws. Production behavior is
unchanged. Both engines passed the focused check. A fixture-only mutation
that disables `tune-still` failed in both engines with 8 starts instead of 4,
so the check still detects repeated entrance animations. The original failure
and the deliberate mutation failures remain in the validation logs.

## Integration

This commit preserves the upstream merge and its isolated browser fixture
repair. It will be merged into `codex/quota-pool-forecast` for combined
validation. Later explicit user instructions authorize pushing the custom
branch and deploying after that validation, with server data preserved.

The resumed Go log is `/tmp/magpie-upstream-20261105-resume-qa/go-full-30m.log`.
Earlier logs and runner scripts remain under the worktree's Git metadata at
`sync-validation-20261105`. No server change is part of this merge commit.
