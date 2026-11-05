package routes

import (
	"slices"
	"testing"
	"time"
)

func TestHarvestUsesPlanButKeepsLimitsAndRests(t *testing.T) {
	now := time.Now()
	ss := []Seat{{Key: "late", Known: true, Soon: []time.Time{now.Add(20 * time.Hour)}}, {Key: "early", Known: true, Soon: []time.Time{now.Add(time.Hour)}}, {Key: "empty", Known: true, Used: 100, Planned: true, PlanRank: 0}}
	if got := Apply(Harvest, "test", ss); !slices.Equal(got, []int{1, 0, 2}) {
		t.Fatal(got)
	}
	ss[0].Planned = true
	ss[0].PlanRank = 1
	if got := Apply(Harvest, "test", ss); got[0] != 0 {
		t.Fatal(got)
	}
	ss[0].Resting = true
	if got := Apply(Harvest, "test", ss); got[0] != 1 {
		t.Fatal(got)
	}
}

func TestHarvestCorrectsTargetShareWithoutPromotingBusyAccounts(t *testing.T) {
	ss := []Seat{{Key: "a", Known: true, Planned: true, PlanRank: 0, PlanTarget: 60, Tokens: 90}, {Key: "b", Known: true, Planned: true, PlanRank: 1, PlanTarget: 40, Tokens: 10}}
	if got := Apply(Harvest, "test", ss); got[0] != 1 {
		t.Fatal(got)
	}
	ss[1].Resting = true
	if got := Apply(Harvest, "test", ss); got[0] != 0 {
		t.Fatal(got)
	}
}
