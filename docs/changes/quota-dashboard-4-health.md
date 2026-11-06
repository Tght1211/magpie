# Quota dashboard .4 — planning and health

The custom dashboard now has only quota planning and pool health. The removed
consumption-review and Key-benefit pages no longer register controls or perform
their unused overview query. Historical records and ownership annotations remain
available; account bindings can be edited from the health ledger.

## Fixed behavior

- Member usage compared JSONL file size to compressed index memory, falsely marking
  complete records incomplete. It now checks the parsed ledger offset and snapshot
  file identity. Missing, changed and partially read logs remain unknown.
- Known natural supply is visible even when demand cannot yet be established.
- Health prefers member/model-compatible forecasts. If those cannot be formed,
  independently complete and fresh provider totals can produce an explicitly
  labelled aggregate scenario. This includes unattributed consumption, preserves
  provider separation and makes no member/model capacity guarantee. Known unpriced
  recent usage blocks this fallback. Aggregate scenarios cannot supply admission
  recommendations.
- Missing forecasts show an explanation instead of an empty chart. Failed plan
  reads and failed binding writes display an error. No routing, card-execution,
  ownership-permission or storage-migration behavior changes.

## Validation evidence

Evidence is retained locally under `/tmp/magpie-health-fix/`.

- The ledger regression failed on the old comparison with a fully read 600-record
  file. It passes after the fix and also rejects a partial tail and a missing file.
  Full usage-package tests and targeted member-usage race tests passed using an
  isolated HOME and pinned Go caches.
- The two-tab regression fails when the old four entries are restored (4 versus 2).
- Pure planner/member/explorer models and translation guards passed 24 tests;
  the final health model pass has 8 tests, including unknown members, provider
  separation, missing groups, stale plans, unpriced history and known supply with
  unknown demand. The final translation guard passed 4 tests.
- Chromium and WebKit cover five locales, desktop/mobile widths, keyboard tab
  navigation, timeline controls, refresh, binding/unbinding and duplicate-binding
  errors, aggregate health, missing demand, unavailable plan reads and admission
  guards. Full browser evidence is in `browser-final.log`.
- Candidate frontend with authenticated production reads passed both engines at
  1440/390 pixels, including populated supply, demand, ratio and projection plus
  automatic refresh. No production bindings or provider operations were changed.
- Native macOS, Linux amd64 nogui and Windows amd64 vet/build checks passed.

The full repository Go run is tracked separately in `go-suite.log`. The earlier
full GUI run stopped at 664 of its 1169 remaining files with 52 failing file runs;
this is not a full GUI pass, and this focused change does not resolve those other
pages' failures. Passing reruns are not used to erase that record.

Deployment and final full-Go outcome are recorded after verification completes.
