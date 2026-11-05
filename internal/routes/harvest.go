package routes

import (
	"math"
	"sort"
	"time"
)

// Harvest uses earliest refill deadlines on new work. The gateway's rests,
// model limits and conversation affinity still apply after this ordering.
var Harvest = Strategy{Exact: true, ByUse: true, Order: func(_ string, seats []Seat) []int {
	ids := identity(len(seats))
	totalTarget, totalTokens := 0.0, 0.0
	for _, s := range seats {
		if s.Planned && !s.Resting && seatTier(s) == 0 {
			totalTarget += s.PlanTarget
			totalTokens += s.Tokens
		}
	}
	sort.SliceStable(ids, func(i, j int) bool {
		a, b := seats[ids[i]], seats[ids[j]]
		if a.Resting != b.Resting {
			return !a.Resting
		}
		if x, y := seatTier(a), seatTier(b); x != y {
			return x < y
		}
		if a.Planned != b.Planned {
			return a.Planned
		}
		if a.Planned && b.Planned && totalTarget > 0 && totalTokens > 0 {
			x, y := a.PlanTarget/totalTarget-a.Tokens/totalTokens, b.PlanTarget/totalTarget-b.Tokens/totalTokens
			// Quantized feedback has a transitive ordering; pairwise deadbands do not.
			if bx, by := math.Round(x*20), math.Round(y*20); bx != by {
				return bx > by
			}
		}
		if a.Planned && a.PlanRank != b.PlanRank {
			return a.PlanRank < b.PlanRank
		}
		var x, y time.Time
		if len(a.Soon) > 0 {
			x = a.Soon[0]
		}
		if len(b.Soon) > 0 {
			y = b.Soon[0]
		}
		if x.IsZero() != y.IsZero() {
			return !x.IsZero()
		}
		return x.Before(y)
	})
	return ids
}}
