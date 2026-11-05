package provider

import "time"

// Harvest preserves natural refills, then spends current allowance before
// the next refill. It does not enable automatic card use or change affinity.
const Harvest = "harvest"

// Installed by usage; routing only reads a bounded, immutable cached plan.
type HarvestBudget struct {
	Rank   int
	Tokens float64
}

var HarvestRanks func(time.Time) map[string]HarvestBudget

// HarvestCardPlan is optional: unknown or stale plans retain the expiry guard.
var HarvestCardPlan func(user string, reset, expiry, now time.Time) (allow, known bool)

func harvestCardAllowed(user string, windows []QuotaWindow, until, now time.Time) bool {
	if !harvestCardReady(windows, until, now) {
		return false
	}
	if HarvestCardPlan != nil {
		for _, w := range windows {
			if !w.Aside && w.Span >= 24*time.Hour && w.ResetsAt != nil {
				if allow, known := HarvestCardPlan(user, *w.ResetsAt, until, now); known {
					return allow
				}
				break
			}
		}
	}
	return true
}

func harvestOn() bool {
	for _, p := range storedFile().Providers {
		if p.ID == "codex" {
			return p.Routing == Harvest
		}
	}
	return false
}

// HarvestDeadline is an EDF deadline, not a sum of unlike percentages.
// An enabled expiring card is an opportunity even just after a natural reset.
func (a Allowance) HarvestDeadline(model string, now time.Time) time.Time {
	var reset, expiry time.Time
	for _, l := range a {
		if !l.applies(model) {
			continue
		}
		if l.Span >= 24*time.Hour && l.Resets.After(now) && (reset.IsZero() || l.Resets.Before(reset)) {
			reset = l.Resets
		}
		if l.ResetRunsOut.After(now) && (expiry.IsZero() || l.ResetRunsOut.Before(expiry)) {
			expiry = l.ResetRunsOut
		}
	}
	// Never replace an earlier natural refill with a card refill.
	if !reset.IsZero() && !expiry.IsZero() && reset.Before(expiry) {
		return reset
	}
	if !expiry.IsZero() {
		return maxTime(now, expiry.Add(-resetLead()))
	}
	return reset
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

// The user keeps control of auto-use. In this strategy it waits for the
// review margin and 20% weekly use, and lets an earlier natural reset happen.
func harvestCardReady(windows []QuotaWindow, until, now time.Time) bool {
	if !until.After(now) || until.Sub(now) > resetLead() {
		return false
	}
	for _, w := range windows {
		if w.Aside || w.Span < 24*time.Hour {
			continue
		}
		if w.ResetsAt == nil || !w.ResetsAt.After(now) || w.ResetsAt.Before(until) {
			return false
		}
		return w.Used >= 20
	}
	return false
}
