# Quota dashboard .3 deployment — 2026-11-06

Deployed `0.1.2995-quota-dashboard.3` to the existing Magpie service on
2026-11-06 (Asia/Shanghai), following the user's explicit deployment request.
Source: merge commit `96bf4482a08e02008f96d994e7bae0782b1fe9ef`, combining the
custom baseline `713070fb` and upstream `8fbf8e0a` (99 official commits).

## Changes

- Retains the approved battery-style dashboard, consumption review, member Key
  sharing benefit, pool health, explicit one-Key/one-account bindings and all
  existing routing/card safeguards.
- Includes upstream provider, gateway, agent and plugin updates, including Codex
  allowance calibration from reply headers, plugin child-process cleanup and
  DeepSeek/Gemini request handling improvements.
- Manual quota refresh follows upstream's all-saved-Claude-accounts contract.
- Generic settings responses preserve the saved member bindings, matching the
  existing persisted-data protection. Binding changes still use their dedicated
  validated API.
- Reduced-motion dialog refreshes remain stationary. Integration checks account
  explicitly for the custom routing controls in the shared script budget.

## Artifact and server verification

Linux amd64 nogui artifact SHA-256:
`6a12f9696e1e46d60477340c40df4e809cb5fa5c2ddafab89210644a76de1fb1`.
The uploaded and installed bytes match this hash. The committed source was built
with `main.version=0.1.2995-quota-dashboard.3`. This is a custom deployment, not a
new upstream tag or GitHub release.

Before switching, the executable started successfully on the server under the
service user with an empty isolated HOME. Embedded dashboard assets, the empty
member schema and authentication rejection were verified without production
credentials in the isolated process.

The first switch rolled back automatically because its immediate quota read
contained an incomplete startup cache. The rollback was checked: the original
54 quota identities, configuration hashes and complete pre-switch usage-ledger
prefix were intact. The deployment check now waits at most 90 seconds for the
same identity predicate; the assertion was not removed. On the successful retry,
the first read had 43 identities and the next had all 54, confirming asynchronous
cache population rather than account removal.

Successful switch backup:
`/var/backups/magpie-custom/20261106T030023Z-quota-dashboard.3`.
It retains the old executable, service configuration and a consistent
stopped-service data archive with hashes. The first rollback backup is also kept
at `20261106T023149Z-quota-dashboard.3` under that directory's parent. Backups
contain private data and remain on the server.

Post-switch checks confirmed unchanged configuration hashes, all 54 existing
quota identities, the full usage-ledger prefix, active service/gateway and the
planner, history and member APIs. The stop/backup/start/check sequence took
24.64 seconds; this includes readiness checks and is not measured downtime.
The user had authorized a short restart while requests were active. Rollback
restores the old executable while retaining current data.

Chromium and WebKit passed all four dashboard tabs at 1440 and 390 px, date
navigation, no page overflow, finite rendered values, no page script errors and
observed automatic refresh. Read-only API checks observed eight members, four
accounts and four existing bindings; no binding was created by validation.
Screenshots mask identities. A later gateway snapshot observed 56 successful
completed calls, two in flight and one completed HTTP 499; these are observations
of ordinary traffic, not synthetic inference requests or an error-free guarantee.

## Validation boundary

All 108 Go package commands and all six macOS/Linux/Windows build/vet commands
passed; 20 Go packages have no tests and environment/platform-specific skips
remain disclosed in the upstream sync report. Targeted race checks, installer
checks and the quota/dashboard integration checks passed.

**The complete 1,233-file GUI suite is still unfinished and has failures.** The
background scan and per-file logs remain in
`/tmp/magpie-sync-20261106-resume/gui-complete/`. Some failures were corrected and
verified; others include scrolling, transient geometry, animation timing and a
module-loading error. Passing targeted reruns does not resolve all those causes.
Deployment followed the subsequent explicit user request, with this limitation
reported; it is not full repository acceptance. See
[the sync report](upstream-sync-2026-11-06.md).

Deployment evidence: `/tmp/magpie-sync-20261106-deploy/` (manifest, build,
preflight, first rollback, successful retry, live GUI and traffic logs). Real
reset cards were not consumed for testing. No GitHub release or remote push was
performed as part of this deployment.
