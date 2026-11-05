package usage

// Pool calibration uses paired readings, so an account added midway through
// its week can be estimated without attributing earlier use to this gateway.
import (
	"math"
	"slices"
	"strings"
	"time"

	"github.com/yetone/magpie/internal/catalog"
	"github.com/yetone/magpie/internal/provider"
)

type PoolSample struct {
	From     time.Time `json:"from"`
	To       time.Time `json:"to"`
	Used     float64   `json:"used"`
	Cost     float64   `json:"cost"`
	Tokens   int64     `json:"tokens"`
	Calls    int       `json:"calls"`
	Unpriced int       `json:"unpriced"`
	Complete bool      `json:"complete"`
}

type PoolAccount struct {
	Provider string       `json:"provider"`
	User     string       `json:"user"`
	Samples  []PoolSample `json:"samples"`
	Hourly   []PoolSample `json:"hourly"`
}

// QuotaPool reads one local ledger snapshot, never request contents or remote
// logs. All money uses the same API-list-price basis as WindowHolds.
func QuotaPool(now time.Time) []PoolAccount {
	since := now.Add(-7 * 24 * time.Hour)
	hist := provider.QuotaHistories(since, "", "")
	s := readLogSnapshot()
	return quotaPool(hist, now, s.firstOwn, apiPricer(), func(fn func(Record)) { s.visit(since, fn) })
}

func quotaPool(hist []provider.QuotaHistory, now, first time.Time, price func(Record) *catalog.Price, read func(func(Record))) []PoolAccount {
	out := []PoolAccount{}
	by := map[string]int{}
	for _, h := range hist {
		if (h.Provider != "codex" && h.Provider != "claude") || h.User == "" {
			continue
		}
		a := PoolAccount{Provider: h.Provider, User: h.User, Samples: []PoolSample{}, Hourly: []PoolSample{}}
		for _, l := range h.Lines {
			if l.Name != "7 days" && !strings.EqualFold(l.Name, "weekly") {
				continue
			}
			pts := slices.Clone(l.Points)
			slices.SortFunc(pts, func(a, b provider.QuotaPoint) int { return a.At.Compare(b.At) })
			var start, previous *provider.QuotaPoint
			for i := range pts {
				p := &pts[i]
				if p.At.After(now) || p.At.Before(now.Add(-7*24*time.Hour)) || math.IsNaN(p.Left) || p.Left < 0 || p.Left > 100 {
					continue
				}
				if start == nil || previous == nil || p.StartsCycleAfter(*previous) || p.Left > previous.Left || p.At.Sub(previous.At) > 2*time.Hour {
					start, previous = p, p
					continue
				}
				previous = p
				if start.Left-p.Left < provider.HoldsFloor {
					continue
				}
				// Zero may include credit-funded use; a passed/unknown reset
				// cannot establish a continuous measured window either.
				if p.Left > 0 && start.ResetsAt != nil && start.ResetsAt.After(p.At) && !first.IsZero() && !first.After(start.At) && p.At.After(start.At) {
					a.Samples = append(a.Samples, PoolSample{From: start.At, To: p.At, Used: start.Left - p.Left})
				}
				start = p
			}
			break
		}
		for at := now.Add(-24 * time.Hour); at.Before(now); at = at.Add(time.Hour) {
			a.Hourly = append(a.Hourly, PoolSample{From: at, To: at.Add(time.Hour), Complete: !first.IsZero() && !first.After(at)})
		}
		by[h.Provider+"\x00"+strings.ToLower(h.User)] = len(out)
		out = append(out, a)
	}
	read(func(r Record) {
		if (r.Provider != "codex" && r.Provider != "claude") || r.IsRejected() || r.IsReported() || r.Input+r.Output <= 0 || r.Time.After(now) {
			return
		}
		i, ok := by[r.Provider+"\x00"+strings.ToLower(r.Account())]
		if !ok {
			return
		}
		p := price(r)
		add := func(s *PoolSample) {
			if !r.Time.After(s.From) || r.Time.After(s.To) {
				return
			}
			s.Calls++
			s.Tokens += int64(r.Input + r.Output)
			if p == nil {
				s.Unpriced++
			} else {
				s.Cost += r.CostAt(*p)
			}
		}
		for j := range out[i].Samples {
			add(&out[i].Samples[j])
		}
		for j := range out[i].Hourly {
			add(&out[i].Hourly[j])
		}
	})
	return out
}
