# Quota inventory planning (custom build)

The usage plugin visualizes subscription allowance and calls the pure
[`quotaplan`](../../internal/quotaplan/plan.go) solver. The solver neither
spends cards nor changes routing. Its inputs are measured balances,
estimated full-cycle values, natural reset times, reset cards, enabled
expiry auto-use and demand per compatible provider group.

## Measurements and interpretation

[`QuotaPool`](../../internal/usage/quota_pool.go) matches local usage costs
and input/output tokens to the same provider/account's non-overlapping
quota-decline intervals. At least five percentage points of decline are
needed. Refills, sampling gaps over two hours, zero allowance, unknown
prices and periods before the first local record cannot calibrate capacity.
Recent ratios are pooled; with five samples, one extreme on each side is
trimmed. Full-cycle API-equivalent value is `100 * sum(cost) / sum(decline)`.
This is not subscription cash or actual vendor billing. Other clients' use
and a changed model/cache mix can bias the estimate. Unknown values stay
unknown, not zero. CNY display follows the application's existing FX setting.

The production plan includes enabled Codex/Claude accounts with recent
readings and calibration. Retained readings marked `AsOf` after a failed or
deferred refresh are display-only and excluded from new plans. Paid time ending within the horizon without a
confirmed automatic renewal is excluded conservatively. The coverage count
names incomplete pools. Demand requires complete, priced local history over
24 hours; no forecast is claimed when it is unknown. Held or short-window
exhausted accounts are unavailable throughout the scenario, conservatively.
Model-specific permissions remain the real gateway's final filter; one
provider's nominal inventory is not guaranteed usable for every model.

## Optimization and bounds

`B_i` is remaining inventory, `C_i` estimated full capacity, `x_it` allocated
consumption. Between events, `B_i(t+1) = B_i(t) - x_it`, with nonnegative
balances and group demand caps. A natural reset replaces remaining inventory
with `C_i`; unused inventory is lost. A used card does the same and moves the
next natural reset by the account's cycle. It requires at most 80% remaining.
Claude has no card candidates.

For a chosen card schedule, inventory epochs connect to compatible demand
time slots in a minimum-cost maximum-flow network. Mandatory pre-card
consumption has dominant priority and is verified after flow. Among maximum
served-demand flows, expiring inventory precedes terminal inventory. Across
schedules the objective is lexicographic: maximize served demand, minimize
unused-at-refill inventory plus expired-card opportunity, then retain the
most terminal inventory. An expired unused card is valued at its full-cycle
opportunity, not current spendable balance.

The horizon is 72 hours in production (API maximum 168), with hourly demand
slots split at exact event times. Cards have skip/use candidates at their
expiry margin; a natural reset inside that margin moves the candidate after
that reset. Expiry-only schedules are searched first and their best feasible
result is kept when emergency candidates are added. Each pass enumerates at most eight nearest
card decisions within one shared 400 ms cooperative budget, checked during flow
too. Emergency alternatives cannot displace an already evaluated expiry baseline
merely by filling the candidate limit. `optimal-discrete`
means all these discrete schedules were checked, not continuous global
optimality. `bounded-feasible` is the best complete feasible solution found;
`budget-exhausted` means none finished and publishes no target. Larger pools
(maximum 16 calibrated accounts or 32 cards) are unsupported and yield unknown
(`unsupported-input`) instead of fabricated forecasts. Rebuilding from each new snapshot handles
new cards and unexpected official resets; historical measurements are never
rewritten as forecasts.

## Routing, card execution and API boundaries

[`KeepQuotaPlan`](../../internal/usage/quota_plan.go) shares gateway lifecycle,
recalculates each minute only while harvest is selected, and publishes an
immutable cache valid for two minutes and one provider configuration path.
Gateway ranking reads next-hour targets; concurrency, affinity and fallback
remain [gateway routing](gateway-routing.md)'s responsibility. Token pace is
average consumption over time, not model output speed.

The existing opt-in expiring-card executor retains its live vendor reread.
Harvest waits for the configured expiry margin and at least 20% weekly use,
and preserves a natural reset before card expiry. When the cached solver
covers that account, reset time and card expiry, its skip/use decision is
also required. A changed/stale/unknown plan falls back to these conservative
expiry guards. The existing exhausted-week emergency reset path is unchanged.

Authenticated `GET /api/usage/quota-pool` returns calibration/history;
`GET /api/usage/quota-plan` returns input, coverage and forecast.
`POST /api/usage/quota-plan/demo` accepts at most 64 KiB, runs only the pure
solver, and never publishes targets or invokes provider APIs. Both fictional
examples and demand overrides use it. It is an illustration, not a live reset.

The UI shows account emails with the existing privacy masking, account-colored
stacked history/forecast, refill events, actual hourly API-priced consumption,
recommended pace and scenario comparisons. Other policies are simplified
30-minute-session scenarios; comparisons use the optimizer's exact calibrated
account scope, readings, auto-reset flags, horizon and provider demand. The UI
identifies harvest as bounded optimization and the other policies as simplified
session simulations, so the displayed estimates do not guarantee a policy ranking.
Smart/weight/speed/free policies without the necessary inputs show no reliable
prediction. Provider groups cannot borrow one another's demand. The dispatch illustration demonstrates why a session,
full lane or timeout may select a different account from the quota target.

## Verification

`internal/quotaplan` compares small flows against exhaustive allocations and
checks conservation, card eligibility, rolling resets and provider separation.
Usage tests cover calibration, cache expiry, concurrent publication and
shutdown; run them with `-race`. Gateway tests exercise harvest through real
request fixtures for full lanes, session fallback and slow starts. The GUI
API test covers authentication, malformed/oversized input and no publication.
`quota-planner.test.cjs` covers five locales and both Chromium/WebKit, including
masking, narrow layouts, card addition, official reset and dispatch controls.


### Display density

Planner cards use the shared application palette and controls with 12 px
panel spacing, compact metric/table padding, and a bounded pool-chart height.
The time explorer uses a narrower SVG viewBox and fewer date labels on phones;
older account charts retain internal horizontal scrolling. Page-level overflow
is checked in both engines and all supported languages.

### Live pace, emergency scenarios and saved history

The live pace card reads the complete, priced last 60 minutes every 15 seconds.
It compares that measured rate to the current deadline target (80–120% is the
on-pace band). Scenario inputs never change the measured number. Values animate
only when a new reading changes them; countdowns and sample age tick each second.
Readings older than 90 seconds become unknown, including when a request hangs.
Input focus and active timeline drags defer redraws; timeline keyboard focus
survives refreshed readings. Leaving/hiding the page stops its timers. Reduced
motion disables interpolation and pulse animation.

Emergency-enabled Codex accounts expose their existing emergency cooldown to
planning. The bounded solver adds no-card stockout candidates before card expiry;
it validates empty compatible usable inventory and shifts the natural reset after
use. These candidates are heuristic and report `bounded-feasible`, even when
all enumerated schedules complete. They do not enumerate every sequential rescue
schedule. The actual emergency executor, opt-in flags, live vendor recheck and
routing/concurrency/session guards are unchanged. A preview never spends a card.

The draggable time explorer covers one day to three years per window and can move
up to nine years ahead. Its event-driven conditional scenario consumes the earliest
refill deadline within each provider group and advances directly to depletion,
refill, card eligibility, expiry or cooldown events. The three stacked colors are
initial inventory, natural-refill inventory and card-refill inventory. Emergency
on/off comparison respects enabled accounts, card expiry, old-window cooldown and
empty compatible inventory. Claude cannot spend cards. This is an explanatory
long-range policy simulation, **not** the 72-hour flow optimizer or a routing
change. Continued subscriptions, fixed calibration/demand and known finite cards
are explicit assumptions. Held accounts remain unavailable conservatively. New
readings rebuild only future scenarios. Aggregation bounds plotted data to 120
consumption bins; event details summarize later refills.

`KeepQuotaPlan` now also collects calibrated pool observations every five minutes
while the gateway runs, regardless of the selected routing policy. It records only
complete calibrated account sets. The first feasible forecast per scope/hour is
saved in private `quota-plans/YYYY-MM.jsonl` beside `usage.jsonl`. Scope is a hash
of sorted account identities; the journal contains aggregate values and times,
not emails, keys or request contents. A held cross-process lock, append+fsync and
strict reader prevent a damaged/partial journal from being treated as empty or
rewritten. There is no automatic retention cutoff for this archive. Existing raw
quota history still retains 45 days; previously purged readings cannot be restored.

Authenticated `GET /api/usage/quota-plan?history=1&from=<ms>&to=<ms>` returns at
most 120 usage bins, observations and saved baseline data. It performs no writes.
Actual usage is drawn from retained local ledger records for the current calibrated
account set. Unpriced, incomplete and future intervals remain unknown. A comparison
stitches forecasts at their original issue times, using only already-saved
information for each segment. Every segment must be covered. Changing the account set prevents mixing scopes. Missing predictions
are never backfilled; large historical bins aggregate covered rolling forecasts.
Archive read failures return an error, not a fabricated empty history. The earliest
retained own-ledger record bounds backward exploration. API-list-price values are
estimates of consumed allowance, never actual vendor charges.

Weekend shading covers local Saturday midnight through Monday midnight in both
explorer charts. Boundaries follow browser calendar dates, including DST; short
views label wide bands and long views reduce their opacity. Shading changes no
consumption assumptions or routing priorities.

## Member dashboard (approved battery layout)

The two native tabs are quota planning and pool health. Consumption review and
Key sharing benefit no longer have page entries; retained history and member
aggregates remain available to planning and health. Member/account ownership
can be edited in the health ledger. Only Keys with a resolved contributed account
appear as ledger rows. Unbound Keys can be selected through Bind one account;
missing/stale account references remain hidden until bound. This display filter
does not change workload, pool health, or transfer calculations. The explanation demo is no longer registered. The account stack is
the planning default; controls sit above it, with date navigation and Back to now
in one strip below. Dragging preserves the range input rather than replacing it
mid-gesture. Weekends use the browser's local calendar. Minute allowance reads and
15-second measured pace reads use the existing lifecycle; no simulated refresh
values are shipped. Automatic refresh can be paused, and successful refresh time
is visible. Number interpolation occurs only when actual readings change.
Manual refresh sends `asked=1&all=1` to the provider quota endpoint, so the
upstream saved-Claude-account refresh includes every account in the pool.
Automatic reads retain their existing deferred-refresh behavior.

`GET /api/usage/quota-members` provides 30 days of local hourly Key/account/model
aggregates, current key metadata without secrets, stable account references and
explicit bindings. `POST` changes one binding only: one member Key owns exactly
one contributed account, and a contributed account cannot have two owners. The
annotation lives in `Settings.QuotaMembers`; it grants no permissions and never
changes `access.Key.Accounts`. Ordinary or stale settings saves preserve it.
The generic settings API also carries the saved bindings into its response,
ignoring omitted, null or supplied ownership maps; the CLI cannot edit them
through generic settings keys. Ownership changes use the dedicated route's
one-member/one-account validation.
Unreadable settings are not overwritten. Issued child-key use is attributed to its
issuer. Unknown caller/account identifiers remain unattributed. Failed reads,
unpriced demand and short history do not become zero. No request bodies leave the
usage ledger. The new endpoint remains behind the existing authenticated web API.

Compatibility is conservative: a successful model/account pairing in retained
local history, intersected with the gateway's `Allows`, `AllowsAccount` and
`AccountServes` predicates. An unobserved pairing is not promised capacity.
Observed provider/model IDs identify the served model, not an inferred cross-vendor
substitute. Key budget limits currently make forecasts unknown; the dashboard does
not pretend that an unknown remaining Key budget is unlimited. Concurrency, cache,
latency, short windows and actual vendor eligibility still belong to routing.

The new `planner-members.js` is a conditional counterfactual, separate from the
production min-cost-flow router. It estimates demand from the last 24 complete,
priced hourly bins. A bipartite residual-flow network assigns each account's
inventory once to compatible member/model demand. Maximum common demand scaling
establishes a max-min fair share, then residual flow uses available surplus. The
available-balance curves use that common scaling for all members jointly; they
never allocate the whole pool to each Key independently. The own-account scenario
uses the same member demand and that one account. The smaller chart shows forward
cumulative fulfilled demand; actual past use is displayed separately, never
reconstructed into hypothetical historical savings. Model filtering changes the
readout, not the competing pool workload.

Health compares natural hourly capacity (`full / periodHours`) with those demands
using the same compatibility network. Cards do not enter this sustainable ratio.
Thirty-day hourly projections compare natural-only replenishment against known,
finite, enabled cards. Natural resets precede card decisions; card eligibility,
expiry, emergency opt-in/cooldown and the sliding natural reset are retained.
These are discretized scenarios, not globally optimal schedules or an operational
availability SLA. Admission adds one user-entered calibrated account and its demand
together; a subscription's sticker price does not imply capacity. Unknown inputs
leave results blank. New cards or vendor resets rebuild future projections.

The ledger's net shared contribution is actual priced use served to other identified
members minus use borrowed from their contributed accounts. Own consumption is
separate. Unbound accounts and unattributed users are excluded from transfers;
unpriced relevant records make that member's result unknown. Contributions can be
negative without implying misuse. Planning archive forecasts remain immutable;
consumption review compares only recorded intervals, not a line fitted after use.

UI polish follows Unslop by Damir Sokolovsky (@heydamir), CC BY 4.0, preserving
Magpie's palette, fonts, shell and menu components. Regression tests cover capacity
conservation, model bottlenecks, finite cards, sliding resets, binding uniqueness,
corrupt/stale settings, authentication, privacy and both tabs in both engines.


### Prototype parity correction

The production dashboard ports the approved battery-review layout directly into
`planner-dashboard.js` and scoped `planner.css`: underlined tabs, live refresh
strip, two-column balance/pace summary, account composition as the default,
percentage scale, refill annotations, weekend backgrounds through consumption
bars, date scrollbar and Back to now together, account readouts below their
heading, and event cards. Secondary pages keep the prototype's metric rows,
comparison-area charts, member scope, and side-by-side admission controls/results.
Magpie's existing navigation shell is retained. Global `.seg` and `.chart` styles
are explicitly overridden inside this page to prevent floating title-bar controls
and nested chart borders. Page header controls are removed on disposal.

Currency uses the actual backend exchange rate; the page toggle does not change
Settings. Plan price is a label only. Measured/forecast switches affect the
conditional future; history is never rewritten. Historical interpolation stops
at missing readings, reset boundaries and gaps over fifteen minutes, in both
chart and hover readout. Identity markup is left to the existing privacy masker;
the renderer must not create its own `.pii` spans because those are owned and
replaced by that masker's lifecycle.

The health admission view compares natural-only and finite-card scenarios,
reports projected card use and unmet demand by model, and finds the calibrated
weekly capacity required for 20% demand headroom using the existing compatibility
flow. It is an illustration, not an admission operation or guaranteed minimum
number of cards. No actual dispatch or card executor changes in this UI correction.

### Health completeness and scope — 2026-11-06

Member usage completeness compares the ledger file against the snapshot's parsed
file offset and file identity, not its compressed index memory footprint. Partial
trailing records, changed or unavailable files remain incomplete.

Health displays calibrated natural supply independently of demand availability.
When all member/model workload inputs are known it uses the compatibility network.
Otherwise, a fresh, complete provider-level plan may supply an explicitly labelled
aggregate scenario, including all measured use of the calibrated pool regardless
of member ownership. Provider groups remain separate. This aggregate scenario does
not claim per-member/model availability and cannot produce admission estimates.
Unknown aggregate demand or incomplete capacity leaves the forecast unavailable;
the page explains this instead of rendering empty axes. Known supply still shows.
The actual sharing ledger retains its attribution rules and does not assign
unattributed use to members. Binding failures are visible in the page status.
