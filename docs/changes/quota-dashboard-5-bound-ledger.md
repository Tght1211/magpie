# Quota dashboard .5 — bound member ledger

The pool-health member sharing ledger displays only Keys with a resolved
contributed account. Unbound Keys and stale saved account references no longer
create rows. Unbinding removes a row after the saved data refreshes; binding
restores it. The compact Bind one account menu keeps unbound Keys reachable,
including when the ledger is empty. Existing rows retain their account controls.

The filter is applied after the unchanged member-ledger calculation. The complete
member dataset still feeds demand, health, forecasts and transfers. This change
adds no backend API, permission, routing, card-execution or storage behavior.

## Validation

Evidence: `/tmp/magpie-bound-ledger/`.

- The regression fails against the previous renderer with six rows instead of
  four, explicitly naming the bound-account display rule.
- Chromium and WebKit pass the planner suite in English, Simplified/Traditional
  Chinese, Japanese and German at desktop/tablet/mobile widths. Coverage includes
  stale references, removal/rebinding, unchanged demand after hiding a consuming
  Key, empty-ledger binding access, and duplicate-binding failure feedback.
- Planner, explorer, member-model and translation tests: 24 passed.
- macOS, Linux amd64 nogui and Windows amd64 vet/build checks: all six passed.
- Candidate assets with authenticated production reads: both engines passed at
  1440/390 pixels. Eight Keys remain in the API; four bound Keys render as rows.
  Health values, projection and automatic refresh remain populated.
- Linux service-user preflight passed in an empty isolated HOME, checking embedded
  assets, authenticated APIs and complete synthetic usage history.

The historical whole-GUI suite limitations remain documented in
[the previous deployment record](quota-dashboard-4-health.md). This focused
change does not claim a whole-GUI-suite pass.

Full Go verification completed all 108 package commands successfully (20 have no
test files; 84 optional/platform skip lines). It used isolated HOME and pinned
Go caches. Three library-package attempts were interrupted by the disk guard and
are not counted as passes. After removing obsolete temporary binaries and
regenerable cross-platform compiler objects, the library retry exited normally
and all remaining packages passed. Logs of the interrupted runs remain alongside
the final resume log; only completed successful package runs enter the result.

## Production deployment

Deployed `magpie 0.1.2995-quota-dashboard.5` from `25bd4408` on 2026-11-06.
Binary SHA-256: `00efeb4dd4243bca7711b66594d736a277c074de2cec4faaf9c51fa166d1f5f0`.

Backup: `/var/backups/magpie-custom/20261106T065842Z-quota-dashboard.5`. The server retained all 54 prior quota identities,
unchanged settings/provider/Key configuration and the complete pre-switch usage
ledger prefix. Gateway and planning APIs passed post-start checks. The
backup/switch/check sequence took 19.19 seconds, not measured request downtime.
The gateway remained busy during the idle preference window; the user's prior
short-restart authorization was used.

Post-deployment Chromium and WebKit passed both tabs at 1440/390 pixels, live
refresh, populated health metrics and the forecast curve. The API retained all
eight Keys; the ledger showed exactly the four bound Keys. Production bindings
were not changed by verification. Screenshots were masked for private identities.
