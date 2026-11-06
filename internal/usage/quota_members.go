package usage

import (
	"github.com/yetone/magpie/internal/catalog"
	"os"
	"sort"
	"time"
)

// PoolUse is an hourly aggregate, not a request log. No secrets or contents leave
// the ledger. Empty key/account values remain unattributed, never guessed.
type PoolUse struct {
	At         int64   `json:"at"`
	Key        string  `json:"key"`
	Account    string  `json:"account"`
	Model      string  `json:"model"`
	Cost       float64 `json:"cost"`
	Tokens     int64   `json:"tokens"`
	Calls      int     `json:"calls"`
	Unpriced   int     `json:"unpriced"`
	Successful int     `json:"successful"`
}
type PoolUses struct {
	From     int64     `json:"from"`
	To       int64     `json:"to"`
	Complete bool      `json:"complete"`
	Rows     []PoolUse `json:"rows"`
}

func QuotaMemberUses(now time.Time) PoolUses {
	s := readLogSnapshot()
	out := quotaMemberUses(now, s.firstOwn, apiPricer(), func(fn func(Record)) { s.visit(now.Add(-30*24*time.Hour), fn) })
	// bytes is compressed index memory, not the ledger's parsed file offset.
	// Reject a partial read or a file changed since this snapshot was taken.
	if info, err := os.Stat(Path()); err != nil || s.off != info.Size() || !sameLogInfo(s.info, info) || s.hash == "" {
		out.Complete = false
	}
	return out
}
func quotaMemberUses(now, first time.Time, price func(Record) *catalog.Price, read func(func(Record))) PoolUses {
	from := now.Add(-30 * 24 * time.Hour).Truncate(time.Hour)
	out := PoolUses{From: from.UnixMilli(), To: now.UnixMilli(), Complete: !first.IsZero() && !first.After(now.Add(-24*time.Hour)), Rows: []PoolUse{}}
	if first.After(from) {
		out.From = first.UnixMilli()
	}
	type bucket struct {
		at                  int64
		key, account, model string
	}
	by := map[bucket]*PoolUse{}
	read(func(r Record) {
		if r.IsRejected() || r.IsReported() || r.Time.Before(from) || r.Time.After(now) || (r.Provider != "codex" && r.Provider != "claude") {
			return
		}
		key := r.CallerKeyID
		if r.CallerIssuerID != "" {
			key = r.CallerIssuerID
		}
		account := ""
		if r.Account() != "" {
			account = accountID(r.Provider, r.Account())
		}
		b := bucket{r.Time.Truncate(time.Hour).UnixMilli(), key, account, r.Provider + "/" + r.Model}
		v := by[b]
		if v == nil {
			v = &PoolUse{At: b.at, Key: b.key, Account: b.account, Model: b.model}
			by[b] = v
		}
		v.Calls++
		if r.Status >= 200 && r.Status < 300 {
			v.Successful++
		}
		v.Tokens += int64(r.Input + r.Output + r.CacheRead + r.CacheWrite)
		if p := price(r); p != nil {
			v.Cost += r.CostAt(*p)
		} else if r.Input+r.Output+r.CacheRead+r.CacheWrite > 0 {
			v.Unpriced++
		}
	})
	for _, v := range by {
		out.Rows = append(out.Rows, *v)
	}
	sort.Slice(out.Rows, func(i, j int) bool {
		a, b := out.Rows[i], out.Rows[j]
		if a.At != b.At {
			return a.At < b.At
		}
		if a.Key != b.Key {
			return a.Key < b.Key
		}
		if a.Account != b.Account {
			return a.Account < b.Account
		}
		return a.Model < b.Model
	})
	return out
}
