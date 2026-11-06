// Package quotaplan solves a finite-horizon quota inventory problem. For each
// discrete reset-card schedule, a time-expanded min-cost maximum-flow network
// assigns account inventory to demand slots. Mandatory pre-card consumption
// uses a dominant cost and is checked afterwards. Receding-horizon callers
// rebuild from measured state; this package never spends cards or makes calls.
package quotaplan

import (
	"errors"
	"math"
	"sort"
	"time"
)

const Hour int64 = 3600000
const eps = 1e-7

type Card struct {
	ID     string `json:"id"`
	Expiry int64  `json:"expiry"`
}
type Account struct {
	ID          string  `json:"id"`
	Group       string  `json:"group,omitempty"`
	Full        float64 `json:"full"`
	Left        float64 `json:"left"`
	Tokens      float64 `json:"tokens"`
	Reset       int64   `json:"reset"`
	PeriodHours float64 `json:"periodHours"`
	Auto        bool    `json:"auto"`
	Rescue      bool    `json:"rescue,omitempty"`
	RescueAfter int64   `json:"rescueAfter,omitempty"`
	LeadMinutes int     `json:"leadMinutes"`
	Blocked     bool    `json:"blocked"`
	Cards       []Card  `json:"cards"`
}
type Input struct {
	Now      int64              `json:"now"`
	Hours    float64            `json:"hours"`
	Demand   float64            `json:"demand"`
	Demands  map[string]float64 `json:"demands,omitempty"`
	Accounts []Account          `json:"accounts"`
}
type Point struct {
	At     int64     `json:"at"`
	Values []float64 `json:"values"`
	Total  float64   `json:"total"`
}
type Event struct {
	At   int64   `json:"at"`
	ID   string  `json:"id"`
	Kind string  `json:"kind"`
	Gain float64 `json:"gain"`
}
type Allocation struct {
	ID     string  `json:"id"`
	From   int64   `json:"from"`
	To     int64   `json:"to"`
	Amount float64 `json:"amount"`
}
type Result struct {
	Status       string       `json:"status"`
	Evaluated    int          `json:"evaluated"`
	Spent        float64      `json:"spent"`
	Waste        float64      `json:"waste"`
	ExpiredCards float64      `json:"expiredCards"`
	Remaining    float64      `json:"remaining"`
	Unserved     float64      `json:"unserved"`
	Tokens       float64      `json:"tokens"`
	Points       []Point      `json:"points"`
	Events       []Event      `json:"events"`
	Allocations  []Allocation `json:"allocations"`
}
type epoch struct {
	account         int
	start, end      int64
	amount, minimum float64
	kind            string
}
type decision struct {
	account, card int
	at            int64
	rescue        bool
}

func finite(x float64) bool { return !math.IsNaN(x) && !math.IsInf(x, 0) }
func Validate(in Input) error {
	if in.Now <= 0 || in.Now > 4102444800000 || !finite(in.Hours) || in.Hours <= 0 || in.Hours > 168 || !finite(in.Demand) || in.Demand < 0 || in.Demand > 1e6 || len(in.Accounts) > 16 {
		return errors.New("invalid planning horizon, demand or account count")
	}
	if len(in.Demands) > 16 {
		return errors.New("too many demand groups")
	}
	for _, d := range in.Demands {
		if !finite(d) || d < 0 || d > 1e6 {
			return errors.New("invalid grouped demand")
		}
	}
	seen := map[string]bool{}
	cards := 0
	for _, a := range in.Accounts {
		if a.ID == "" || seen[a.ID] || !finite(a.Full) || a.Full <= 0 || a.Full > 1e9 || !finite(a.Left) || a.Left < 0 || a.Left > 100 || !finite(a.Tokens) || a.Tokens < 0 || a.Tokens > 1e15 || a.Reset <= in.Now || a.Reset > in.Now+366*24*Hour || !finite(a.PeriodHours) || a.PeriodHours < 1 || a.PeriodHours > 744 || a.LeadMinutes < 0 || a.LeadMinutes > 1440 {
			return errors.New("invalid account inventory or reset")
		}
		seen[a.ID] = true
		cards += len(a.Cards)
		for _, c := range a.Cards {
			if c.Expiry <= in.Now || c.Expiry > in.Now+366*24*Hour {
				return errors.New("invalid card expiry")
			}
		}
	}
	if cards > 32 {
		return errors.New("too many cards")
	}
	return nil
}

// Solve exhaustively considers no-use and expiry-margin use for up to eight
// relevant cards. A time budget bounds larger searches; Status never claims
// global continuous-time optimality. Natural resets before expiry are kept.
func Solve(in Input, budget time.Duration) (Result, error) {
	if err := Validate(in); err != nil {
		return Result{}, err
	}
	end := in.Now + int64(in.Hours*float64(Hour))
	var ds []decision
	for i, a := range in.Accounts {
		if !a.Auto || a.Blocked {
			continue
		}
		for j, c := range a.Cards {
			at := c.Expiry - int64(a.LeadMinutes)*60000
			if at < in.Now {
				at = in.Now
			}
			// Keep a known natural refill when it falls inside the card margin.
			if a.Reset < c.Expiry && a.Reset >= at {
				at = a.Reset + (c.Expiry-a.Reset)/2
			}
			if at < end {
				ds = append(ds, decision{i, j, at, false})
			}
		}
	}
	expiryDecisions := append([]decision(nil), ds...)
	stop := time.Now().Add(budget)
	// Rescue options are taken from actual stockout boundaries in the no-card
	// flow. They are bounded candidates, not a continuous-time optimum.
	rescueOptions := false
	if base, ok, complete := scenario(in, nil, 0, end, stop); ok && complete {
		for i, a := range in.Accounts {
			if !a.Rescue || a.Blocked {
				continue
			}
			for j, c := range a.Cards {
				for k, p := range base.Points {
					if p.At >= end || p.At >= c.Expiry || p.At < a.RescueAfter || k+1 < len(base.Points) && base.Points[k+1].At == p.At {
						continue
					}
					demand := in.Demand
					if len(in.Demands) > 0 {
						demand = in.Demands[a.Group]
					}
					if demand <= 0 {
						continue
					}
					left := 0.0
					for z, b := range in.Accounts {
						if !b.Blocked && (len(in.Demands) == 0 || b.Group == a.Group) {
							left += p.Values[z]
						}
					}
					if left <= eps {
						ds = append(ds, decision{i, j, p.At, true})
						rescueOptions = true
						break
					}
				}
			}
		}
	}
	// Establish the expiry-only baseline before emergency candidates can crowd
	// the bounded search. Adding rescue options must not discard a feasible
	// expiring-card schedule that was already evaluated.
	sets := [][]decision{ds}
	if rescueOptions {
		sets = [][]decision{expiryDecisions, ds}
	}
	limited := rescueOptions
	best := Result{}
	have := false
	n := 0
search:
	for _, choices := range sets {
		sort.SliceStable(choices, func(i, j int) bool { return choices[i].at < choices[j].at })
		if len(choices) > 8 {
			limited = true
			choices = choices[:8]
		}
		for mask := 0; mask < (1 << len(choices)); mask++ {
			if n > 0 && time.Now().After(stop) {
				limited = true
				break search
			}
			r, ok, complete := scenario(in, choices, mask, end, stop)
			if !complete {
				limited = true
				break search
			}
			n++
			if !ok {
				continue
			}
			loss := r.Waste + r.ExpiredCards
			old := best.Waste + best.ExpiredCards
			if !have || r.Spent > best.Spent+eps || math.Abs(r.Spent-best.Spent) < eps && (loss < old-eps || math.Abs(loss-old) < eps && (r.Remaining > best.Remaining+eps || math.Abs(r.Remaining-best.Remaining) < eps && serviceDelay(r, in.Now) < serviceDelay(best, in.Now))) {
				best = r
				have = true
			}
		}
	}
	best.Evaluated = n
	best.Status = "optimal-discrete"
	if limited {
		best.Status = "bounded-feasible"
	}
	if !have {
		best.Status = "infeasible"
		if limited {
			best.Status = "budget-exhausted"
		}
	}
	return best, nil
}

// With equal served work, waste and terminal balance, serve that work sooner.
func serviceDelay(r Result, now int64) float64 {
	value := 0.0
	for _, a := range r.Allocations {
		value += a.Amount * float64(a.From-now) / float64(Hour)
	}
	return value
}

func scenario(in Input, ds []decision, mask int, end int64, stop time.Time) (Result, bool, bool) {
	var es []epoch
	times := []int64{in.Now, end}
	spentCards := map[[2]int]bool{}
	for t := in.Now + Hour; t < end; t += Hour {
		times = append(times, t)
	}
	for i, a := range in.Accounts {
		chosen := []decision{}
		for k, d := range ds {
			if d.account == i && mask&(1<<k) != 0 {
				if spentCards[[2]int{i, d.card}] {
					return Result{}, false, true
				}
				chosen = append(chosen, d)
				spentCards[[2]int{i, d.card}] = true
			}
		}
		start, reset, amount, kind := in.Now, a.Reset, a.Full*a.Left/100, "initial"
		rescueAfter := a.RescueAfter
		for start < end {
			next := min(reset, end)
			card := -1
			for j, d := range chosen {
				if d.at >= start && d.at < next {
					next = d.at
					card = j
					break
				}
			}
			minimum := 0.0
			if card >= 0 {
				minimum = math.Max(0, amount-.8*a.Full)
				if chosen[card].rescue {
					if next < rescueAfter {
						return Result{}, false, true
					}
					minimum = amount
				}
			}
			if next == start && minimum > eps {
				return Result{}, false, true
			}
			es = append(es, epoch{i, start, next, amount, minimum, kind})
			times = append(times, next)
			start = next
			if start == end {
				break
			}
			amount = a.Full
			kind = "reset"
			if card >= 0 {
				kind = "card"
				if chosen[card].rescue {
					kind = "rescue"
					rescueAfter = reset
				}
				chosen = append(chosen[:card], chosen[card+1:]...)
				reset = start + int64(a.PeriodHours*float64(Hour))
			} else {
				reset += int64(a.PeriodHours * float64(Hour))
			}
		}
	}
	sort.SliceStable(es, func(i, j int) bool { return es[i].end < es[j].end })
	sort.Slice(times, func(i, j int) bool { return times[i] < times[j] })
	ts := times[:0]
	for _, t := range times {
		if len(ts) == 0 || t != ts[len(ts)-1] {
			ts = append(ts, t)
		}
	}
	times = ts
	slots := len(times) - 1
	groups := []string{""}
	demands := map[string]float64{"": in.Demand}
	if len(in.Demands) > 0 {
		groups = nil
		demands = in.Demands
		for k := range demands {
			groups = append(groups, k)
		}
		sort.Strings(groups)
	}
	groupIndex := map[string]int{}
	totalDemand := 0.0
	for i, k := range groups {
		groupIndex[k] = i
		totalDemand += demands[k]
	}
	source := len(es) + slots*len(groups)
	sink := source + 1
	g := make(graph, sink+1)
	refs := make([][]*edge, len(es))
	mandatory := make([]*edge, len(es))
	for i, e := range es {
		if in.Accounts[e.account].Blocked {
			continue
		}
		if e.minimum > eps {
			mandatory[i] = g.add(source, i, e.minimum, -1e8)
		}
		cost := 0.0
		if e.end >= end {
			cost = 1
		}
		g.add(source, i, math.Max(0, e.amount-e.minimum), cost)
		group := 0
		var ok bool
		if len(in.Demands) > 0 {
			group, ok = groupIndex[in.Accounts[e.account].Group]
			if !ok {
				continue
			}
		}
		for j := 0; j < slots; j++ {
			if times[j] >= e.start && times[j+1] <= e.end {
				v := g.add(i, len(es)+group*slots+j, e.amount, 0)
				v.slot = j
				refs[i] = append(refs[i], v)
			}
		}
	}
	for gi, k := range groups {
		for j := 0; j < slots; j++ {
			g.add(len(es)+gi*slots+j, sink, demands[k]*float64(times[j+1]-times[j])/float64(Hour), 0)
		}
	}
	flow, complete := g.run(source, sink, stop)
	if !complete {
		return Result{}, false, false
	}
	for i, e := range es {
		if e.minimum > eps && (mandatory[i] == nil || mandatory[i].initial-mandatory[i].cap < e.minimum-eps) {
			return Result{}, false, true
		}
	}
	r := Result{Spent: flow, Unserved: math.Max(0, totalDemand*in.Hours-flow), Points: []Point{}, Events: []Event{}, Allocations: []Allocation{}}
	balances := make([]float64, len(in.Accounts))
	uses := make([][]float64, slots)
	for j := range uses {
		uses[j] = make([]float64, len(in.Accounts))
	}
	for i, a := range in.Accounts {
		balances[i] = a.Full * a.Left / 100
		for j, c := range a.Cards {
			if c.Expiry <= end && !spentCards[[2]int{i, j}] {
				r.ExpiredCards += a.Full
			}
		}
	}
	for i, refs := range refs {
		for _, v := range refs {
			amount := v.initial - v.cap
			if amount > eps {
				e := es[i]
				uses[v.slot][e.account] += amount
				r.Allocations = append(r.Allocations, Allocation{in.Accounts[e.account].ID, times[v.slot], times[v.slot+1], amount})
				r.Tokens += amount * in.Accounts[e.account].Tokens / in.Accounts[e.account].Full
			}
		}
	}
	snap := func(t int64) {
		p := Point{At: t, Values: append([]float64(nil), balances...)}
		for _, b := range balances {
			p.Total += b
		}
		r.Points = append(r.Points, p)
	}
	snap(in.Now)
	valid := true
	refill := func(t int64) {
		for phase := 0; phase < 2; phase++ {
			for _, e := range es {
				if (e.kind == "reset") != (phase == 0) {
					continue
				}
				if e.kind == "initial" || e.start != t {
					continue
				}
				a := in.Accounts[e.account]
				if e.kind == "rescue" {
					for i, b := range in.Accounts {
						if !b.Blocked && (len(in.Demands) == 0 || b.Group == a.Group) && balances[i] > eps {
							valid = false
						}
					}
				}
				gain := math.Max(0, a.Full-balances[e.account])
				r.Waste += balances[e.account]
				balances[e.account] = a.Full
				r.Events = append(r.Events, Event{t, a.ID, e.kind, gain})
				snap(t)
			}
		}
	}
	refill(in.Now)
	for j := 0; j < slots; j++ {
		for i, v := range uses[j] {
			balances[i] = math.Max(0, balances[i]-v)
		}
		snap(times[j+1])
		refill(times[j+1])
	}
	if !valid {
		return Result{}, false, true
	}
	r.Remaining = r.Points[len(r.Points)-1].Total
	sort.SliceStable(r.Allocations, func(i, j int) bool { return r.Allocations[i].From < r.Allocations[j].From })
	return r, true, true
}
