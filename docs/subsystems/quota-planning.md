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
readings and calibration. Paid time ending within the horizon without a
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
that reset. At most eight nearest card decisions are enumerated within a
400 ms cooperative search budget, checked during flow too. `optimal-discrete`
means all these discrete schedules were checked, not continuous global
optimality. `bounded-feasible` is the best complete feasible solution found;
`budget-exhausted` means none finished and publishes no target. Larger pools
(maximum 16 calibrated accounts or 32 cards) are unsupported and yield unknown
instead of fabricated forecasts. Rebuilding from each new snapshot handles
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
30-minute-session scenarios; Smart/weight/speed/free policies without the
necessary inputs show no reliable prediction. Provider groups cannot borrow
one another's demand. The dispatch illustration demonstrates why a session,
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
