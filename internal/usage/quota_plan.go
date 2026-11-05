package usage

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/yetone/magpie/internal/provider"
	"github.com/yetone/magpie/internal/quotaplan"
	"github.com/yetone/magpie/internal/settings"
)

type PoolPlan struct {
	Input       quotaplan.Input  `json:"input"`
	Result      quotaplan.Result `json:"result"`
	Coverage    int              `json:"coverage"`
	Total       int              `json:"total"`
	DemandKnown bool             `json:"demandKnown"`
}

func accountID(p, u string) string {
	b, _ := json.Marshal([]string{p, strings.ToLower(u)})
	return string(b)
}

// QuotaPlan is rebuilt from the latest snapshot. A vendor refill, a newly
// granted card or a changed account set changes future inventory immediately.
func QuotaPlan(now time.Time) PoolPlan {
	data := QuotaPool(now)
	cards := provider.CachedCards(now)
	st := settings.Load()
	lead := st.CodexResetLead
	if lead <= 0 {
		lead = 30
	}
	out := PoolPlan{Input: quotaplan.Input{Now: now.UnixMilli(), Hours: 72, Demands: map[string]float64{}, Accounts: []quotaplan.Account{}}}
	enabled := map[string]bool{}
	for _, agent := range []string{"codex", "claude"} {
		if p, err := provider.Find(agent); err == nil && p.Off {
			continue
		}
		for _, l := range provider.Logins(agent) {
			if (l.Active || l.On) && !l.Paused && l.Lapsed == "" {
				enabled[agent+"\x00"+strings.ToLower(l.User)] = true
			}
		}
	}
	for _, q := range cards {
		if !enabled[q.Provider+"\x00"+strings.ToLower(q.User)] {
			continue
		}
		out.Total++
		// Do not project renewals beyond paid time the vendor has not confirmed.
		if q.Until != nil && q.Renew != "auto" && q.Until.Before(now.Add(72*time.Hour)) {
			continue
		}
		if q.Error != "" || q.ReadAt == nil || now.Sub(*q.ReadAt) > 2*time.Hour || q.ReadAt.After(now) {
			continue
		}
		var w *provider.QuotaWindow
		for i := range q.Windows {
			v := &q.Windows[i]
			if v.Name == "7 days" || strings.EqualFold(v.Name, "weekly") {
				w = v
				break
			}
		}
		if w == nil || w.ResetsAt == nil || !w.ResetsAt.After(now) || w.Used < 0 || w.Used > 100 || math.IsNaN(w.Used) || w.Text || w.Unlimited || w.Balance != nil {
			continue
		}
		var d *PoolAccount
		for i := range data {
			if data[i].Provider == q.Provider && strings.EqualFold(data[i].User, q.User) {
				d = &data[i]
				break
			}
		}
		if d == nil {
			continue
		}
		full, tokens := poolCalibration(d.Samples, *q.ReadAt, now)
		if full <= 0 {
			continue
		}
		_, auto := provider.CodexAutoResetWhen(q.User)
		auto = auto && q.Provider == "codex"
		a := quotaplan.Account{ID: accountID(q.Provider, q.User), Group: q.Provider, Full: full, Tokens: tokens, Left: 100 - w.Used, Reset: w.ResetsAt.UnixMilli(), PeriodHours: 168, Auto: auto, LeadMinutes: lead, Blocked: q.Held, Cards: []quotaplan.Card{}}
		for _, v := range q.Windows {
			if !v.Aside && v.Used >= 100 && v.ResetsAt != nil && v.ResetsAt.After(now) && v.Name != w.Name {
				a.Blocked = true
			}
		}
		if auto && q.Resets != nil {
			for i, c := range q.Resets.Each {
				if c.Until != nil && c.Until.After(now) && (c.Window == "" || c.Window == "weekly") {
					a.Cards = append(a.Cards, quotaplan.Card{ID: strings.Join([]string{q.User, c.ID, fmt.Sprint(i)}, "/"), Expiry: c.Until.UnixMilli()})
				}
			}
			if len(a.Cards) == 0 && q.Resets.Count > 0 && q.Resets.Until != nil && q.Resets.Until.After(now) {
				a.Cards = append(a.Cards, quotaplan.Card{ID: "earliest", Expiry: q.Resets.Until.UnixMilli()})
			}
		}
		out.Input.Accounts = append(out.Input.Accounts, a)
		// A complete 24-hour log is required for a zero to mean no demand.
		if len(d.Hourly) == 24 {
			known := true
			cost := 0.0
			for _, p := range d.Hourly {
				known = known && p.Unpriced == 0 && p.Complete
				cost += p.Cost
			}
			if known {
				out.Input.Demand += cost / 24
				out.Input.Demands[q.Provider] += cost / 24
				out.Coverage++
			}
		}
	}
	out.DemandKnown = out.Coverage == len(out.Input.Accounts) && out.Coverage > 0
	if out.DemandKnown {
		out.Result, _ = quotaplan.Solve(out.Input, 400*time.Millisecond)
	} else {
		out.Result.Status = "insufficient-data"
	}
	return out
}
func poolCalibration(samples []PoolSample, read, now time.Time) (float64, float64) {
	good := []PoolSample{}
	for _, p := range samples {
		if p.Used >= 5 && p.Cost > 0 && p.Tokens > 0 && p.Calls > 0 && p.Unpriced == 0 && p.To.After(now.Add(-48*time.Hour)) && !p.To.After(read) {
			good = append(good, p)
		}
	}
	sort.Slice(good, func(i, j int) bool { return good[i].Cost/good[i].Used < good[j].Cost/good[j].Used })
	if len(good) >= 5 {
		good = good[1 : len(good)-1]
	}
	used, cost, tokens := 0.0, 0.0, 0.0
	for _, p := range good {
		used += p.Used
		cost += p.Cost
		tokens += float64(p.Tokens)
	}
	if used < 5 {
		return 0, 0
	}
	return cost * 100 / used, tokens * 100 / used
}

var harvestPlanCache struct {
	sync.Mutex
	at    time.Time
	path  string
	ranks map[string]provider.HarvestBudget
	cards map[string]cardPlan
}

type cardPlan struct{ reset, expiry, at int64 }

func init() { provider.HarvestRanks = harvestRanks; provider.HarvestCardPlan = harvestCardPlan }
func harvestCardPlan(user string, reset, expiry, now time.Time) (bool, bool) {
	harvestPlanCache.Lock()
	defer harvestPlanCache.Unlock()
	if harvestPlanCache.path != provider.Path() || now.Before(harvestPlanCache.at) || now.Sub(harvestPlanCache.at) > 2*time.Minute || now.Before(harvestPlanCache.at) {
		return false, false
	}
	p, ok := harvestPlanCache.cards[accountID("codex", user)]
	if !ok || p.reset != reset.UnixMilli() || p.expiry != expiry.UnixMilli() {
		return false, false
	}
	return p.at > 0 && p.at <= now.Add(time.Minute).UnixMilli(), true
}
func harvestRanks(now time.Time) map[string]provider.HarvestBudget {
	harvestPlanCache.Lock()
	defer harvestPlanCache.Unlock()
	if harvestPlanCache.path != provider.Path() || now.Sub(harvestPlanCache.at) > 2*time.Minute || now.Before(harvestPlanCache.at) {
		return nil
	}
	return harvestPlanCache.ranks
}
func publishQuotaPlan(p PoolPlan, now time.Time) {
	ranks := map[string]provider.HarvestBudget{}
	cards := map[string]cardPlan{}
	capacities := map[string]quotaplan.Account{}
	for _, a := range p.Input.Accounts {
		capacities[a.ID] = a
		if p.Result.Status == "optimal-discrete" || p.Result.Status == "bounded-feasible" {
			cp := cardPlan{reset: a.Reset}
			for _, c := range a.Cards {
				if cp.expiry == 0 || c.Expiry < cp.expiry {
					cp.expiry = c.Expiry
				}
			}
			for _, e := range p.Result.Events {
				if e.ID == a.ID && e.Kind == "card" && (cp.at == 0 || e.At < cp.at) {
					cp.at = e.At
				}
			}
			if cp.expiry > 0 {
				cards[a.ID] = cp
			}
		}
	}
	for _, a := range p.Result.Allocations {
		if a.Amount > 0 && a.From < now.Add(time.Hour).UnixMilli() {
			v, ok := ranks[a.ID]
			if !ok {
				v.Rank = len(ranks)
			}
			c := capacities[a.ID]
			if c.Full > 0 {
				v.Tokens += a.Amount * c.Tokens / c.Full
			}
			ranks[a.ID] = v
		}
	}

	harvestPlanCache.Lock()
	defer harvestPlanCache.Unlock()
	harvestPlanCache.path = provider.Path()
	harvestPlanCache.at = now
	harvestPlanCache.ranks = ranks
	harvestPlanCache.cards = cards
}

// KeepQuotaPlan shares the gateway lifecycle. No request starts a goroutine or
// reads the ledger; shutdown cancels the ticker with the other gateway loops.
func KeepQuotaPlan(ctx context.Context) {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		on := false
		for _, p := range provider.All() {
			if p.Routing == provider.Harvest {
				on = true
				break
			}
		}
		if on {
			now := Clock()
			publishQuotaPlan(QuotaPlan(now), now)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
