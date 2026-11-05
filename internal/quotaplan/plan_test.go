package quotaplan

import (
	"math"
	"testing"
	"time"
)

func fixture() Input {
	now := int64(1793836800000)
	return Input{Now: now, Hours: 48, Demand: 2, Accounts: []Account{{ID: "a@example.test", Full: 100, Left: 60, Tokens: 1e6, Reset: now + 6*Hour, PeriodHours: 168, LeadMinutes: 30}, {ID: "b@example.test", Full: 100, Left: 70, Tokens: 1e6, Reset: now + 40*Hour, PeriodHours: 168, LeadMinutes: 30}}}
}
func solved(t *testing.T, in Input) Result {
	t.Helper()
	r, e := Solve(in, time.Second)
	if e != nil {
		t.Fatal(e)
	}
	if r.Status != "optimal-discrete" {
		t.Fatal(r.Status)
	}
	return r
}
func TestInventoryConservationAndEarliestExpiry(t *testing.T) {
	in := fixture()
	r := solved(t, in)
	if math.Abs(r.Spent-96) > eps {
		t.Fatal(r.Spent)
	}
	if r.Allocations[0].ID != "a@example.test" {
		t.Fatal(r.Allocations[0])
	}
	for _, p := range r.Points {
		sum := 0.0
		for i, v := range p.Values {
			if v < 0 || v > in.Accounts[i].Full+eps {
				t.Fatal(p)
			}
			sum += v
		}
		if math.Abs(sum-p.Total) > eps {
			t.Fatal(p)
		}
	}
	gain := 0.0
	for _, e := range r.Events {
		gain += e.Gain
	}
	if math.Abs(130+gain-r.Spent-r.Remaining) > eps {
		t.Fatal(r)
	}
}
func TestCardEligibilityAndNaturalResetPrecedence(t *testing.T) {
	in := fixture()
	in.Hours = 24
	in.Demand = 0
	in.Accounts = in.Accounts[:1]
	a := &in.Accounts[0]
	a.Left = 90
	a.Reset = in.Now + 100*Hour
	a.Auto = true
	a.Cards = []Card{{ID: "c", Expiry: in.Now + 10*Hour}}
	r := solved(t, in)
	if len(r.Events) != 0 || r.ExpiredCards != 100 {
		t.Fatal(r)
	}
	a.Left = 70
	r = solved(t, in)
	if len(r.Events) != 1 || r.Events[0].Kind != "card" || r.Events[0].At != in.Now+10*Hour-30*60000 {
		t.Fatal(r)
	}
	a.Left = 0
	a.Reset = in.Now + 2*Hour
	in.Demand = 4
	r = solved(t, in)
	if len(r.Events) < 2 || r.Events[0].Kind != "reset" || r.Events[1].Kind != "card" {
		t.Fatal(r.Events)
	}
	// Card refill postpones the next natural refill, so no old reset survives.
	a.Reset = in.Now + 12*Hour
	a.Left = 50
	in.Demand = 1
	r = solved(t, in)
	for i, e := range r.Events {
		if e.Kind == "card" {
			for _, next := range r.Events[i+1:] {
				if next.Kind == "reset" && next.At < e.At+168*Hour {
					t.Fatal(r.Events)
				}
			}
		}
	}
}
func TestAddedCardAndOfficialResetReplanFromMeasuredState(t *testing.T) {
	in := fixture()
	in.Hours = 24
	in.Demand = 5
	in.Accounts = in.Accounts[:1]
	in.Accounts[0].Reset = in.Now + 120*Hour
	in.Accounts[0].Auto = true
	before := solved(t, in)
	in.Accounts[0].Cards = []Card{{ID: "new", Expiry: in.Now + 10*Hour}}
	after := solved(t, in)
	if after.Spent <= before.Spent {
		t.Fatalf("new card did not add usable capacity: %g <= %g", after.Spent, before.Spent)
	}
	in.Accounts[0].Left = 100
	in.Accounts[0].Reset = in.Now + 168*Hour
	r := solved(t, in)
	if r.Points[0].Total != 100 {
		t.Fatal(r.Points[0])
	}
}
func TestClaudeAndCodexDemandCannotSubstitute(t *testing.T) {
	in := fixture()
	in.Hours = 4
	in.Demands = map[string]float64{"codex": 20, "claude": 0}
	in.Accounts[0].Group = "codex"
	in.Accounts[0].Left = 0
	in.Accounts[0].Reset = in.Now + 24*Hour
	in.Accounts[1].Group = "claude"
	in.Accounts[1].Left = 100
	r := solved(t, in)
	if r.Spent != 0 || r.Unserved != 80 {
		t.Fatal(r)
	}
	in.Demands = map[string]float64{"claude": 20}
	r = solved(t, in)
	if r.Spent != 80 || len(r.Events) != 0 {
		t.Fatal(r)
	}
}
func TestRejectInvalidAndBoundSearch(t *testing.T) {
	in := fixture()
	in.Accounts[0].Left = 101
	if _, e := Solve(in, time.Second); e == nil {
		t.Fatal("invalid balance accepted")
	}
	in = fixture()
	in.Accounts[0].Auto = true
	for i := 0; i < 9; i++ {
		in.Accounts[0].Cards = append(in.Accounts[0].Cards, Card{Expiry: in.Now + int64(i+8)*Hour})
	}
	r, e := Solve(in, time.Millisecond)
	if e != nil || r.Status != "bounded-feasible" && r.Status != "budget-exhausted" {
		t.Fatal(r.Status, e)
	}
}

// Exhaustive integer allocations form an independent oracle for small
// inventory networks (including resets and shortages).
func TestFlowMatchesExhaustiveInventory(t *testing.T) {
	for leftA := 0; leftA <= 3; leftA++ {
		for leftB := 0; leftB <= 3; leftB++ {
			for reset := 1; reset <= 3; reset++ {
				in := fixture()
				in.Hours = 3
				in.Demand = 2
				in.Accounts[0].Full = 3
				in.Accounts[0].Left = float64(leftA) * 100 / 3
				in.Accounts[0].Reset = in.Now + int64(reset)*Hour
				in.Accounts[1].Full = 3
				in.Accounts[1].Left = float64(leftB) * 100 / 3
				in.Accounts[1].Reset = in.Now + 10*Hour
				bestSpent, bestWaste := -1, 999
				var visit func(int, int, int, int, int)
				visit = func(h, a, b, spent, waste int) {
					if h == 3 {
						if spent > bestSpent || spent == bestSpent && waste < bestWaste {
							bestSpent, bestWaste = spent, waste
						}
						return
					}
					if h == reset {
						waste += a
						a = 3
					}
					for x := 0; x <= min(a, 2); x++ {
						for y := 0; y <= min(b, 2-x); y++ {
							visit(h+1, a-x, b-y, spent+x+y, waste)
						}
					}
				}
				visit(0, leftA, leftB, 0, 0)
				r := solved(t, in)
				if math.Abs(r.Spent-float64(bestSpent)) > eps || math.Abs(r.Waste-float64(bestWaste)) > eps {
					t.Fatalf("left %d/%d reset %d: spent/waste %g/%g want %d/%d", leftA, leftB, reset, r.Spent, r.Waste, bestSpent, bestWaste)
				}
			}
		}
	}
}

func TestCardsCannotRefillTwiceWithoutRequiredUse(t *testing.T) {
	in := fixture()
	in.Hours = 20
	in.Demand = 0
	in.Accounts = in.Accounts[:1]
	a := &in.Accounts[0]
	a.Left = 80
	a.Reset = in.Now + 100*Hour
	a.Auto = true
	a.Cards = []Card{{ID: "one", Expiry: in.Now + 10*Hour}, {ID: "two", Expiry: in.Now + 10*Hour}}
	r := solved(t, in)
	if len(r.Events) != 1 || r.Remaining != 100 || r.ExpiredCards != 100 {
		t.Fatal(r)
	}
}

func TestRescueBeforeExpiryAndShiftedNaturalReset(t *testing.T) {
	in := fixture()
	in.Hours = 24
	in.Demand = 10
	in.Accounts = []Account{{ID: "a", Group: "codex", Full: 100, Left: 0, Tokens: 1000, Reset: in.Now + 8*Hour, PeriodHours: 168, Rescue: true, Cards: []Card{{ID: "card", Expiry: in.Now + 48*Hour}}}}
	r, err := Solve(in, time.Second)
	if err != nil || r.Spent != 100 || len(r.Events) != 1 || r.Events[0].Kind != "rescue" || r.Events[0].At != in.Now {
		t.Fatalf("rescue must serve demand now and replace the old reset: %+v %v", r, err)
	}
	in.Accounts[0].Rescue = false
	r, err = Solve(in, time.Second)
	if err != nil || len(r.Events) != 1 || r.Events[0].Kind != "reset" {
		t.Fatalf("auto-use must remain opt-in: %+v %v", r, err)
	}
	in.Accounts[0].Rescue = true
	in.Accounts[0].RescueAfter = in.Now + 72*Hour
	r, err = Solve(in, time.Second)
	for _, e := range r.Events {
		if e.Kind == "rescue" {
			t.Fatal("cooldown bypassed", e)
		}
	}
}

func TestRescueNeedsEmptyCompatibleInventory(t *testing.T) {
	in := fixture()
	in.Hours = 6
	in.Demand = 2
	in.Accounts = []Account{{ID: "a", Full: 100, Left: 0, Reset: in.Now + 30*Hour, PeriodHours: 168, Rescue: true, Cards: []Card{{ID: "card", Expiry: in.Now + 48*Hour}}}, {ID: "b", Full: 100, Left: 50, Reset: in.Now + 30*Hour, PeriodHours: 168}}
	_, ok, _ := scenario(in, []decision{{account: 0, card: 0, at: in.Now, rescue: true}}, 1, in.Now+6*Hour, time.Now().Add(time.Second))
	if ok {
		t.Fatal("must not rescue while another compatible account has balance")
	}
	in.Accounts[1].Blocked = true
	r, ok, _ := scenario(in, []decision{{account: 0, card: 0, at: in.Now, rescue: true}}, 1, in.Now+6*Hour, time.Now().Add(time.Second))
	if !ok || len(r.Events) != 1 || r.Events[0].Kind != "rescue" {
		t.Fatal("held accounts cannot prevent rescue", r)
	}
	in.Accounts[0].Left = 20
	_, ok, _ = scenario(in, []decision{{account: 0, card: 0, at: in.Now, rescue: true}}, 1, in.Now+6*Hour, time.Now().Add(time.Second))
	if ok {
		t.Fatal("80 percent eligibility alone is not emergency exhaustion")
	}
}
