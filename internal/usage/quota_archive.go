package usage

// Saved forecasts are immutable: a later refill or calibration never rewrites
// what the user could have known at the time. Only aggregates are archived.
import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/yetone/magpie/internal/filelock"
	"github.com/yetone/magpie/internal/quotaplan"
)

type QuotaArchivePoint struct {
	At    int64   `json:"at"`
	Total float64 `json:"total"`
}
type QuotaArchiveUse struct {
	From   int64   `json:"from"`
	To     int64   `json:"to"`
	Amount float64 `json:"amount"`
}
type QuotaArchiveEntry struct {
	At     int64               `json:"at"`
	Scope  string              `json:"scope"`
	Total  float64             `json:"total"`
	Points []QuotaArchivePoint `json:"points,omitempty"`
	Uses   []QuotaArchiveUse   `json:"uses,omitempty"`
}
type QuotaTimelineBin struct {
	From      int64    `json:"from"`
	To        int64    `json:"to"`
	Actual    float64  `json:"actual"`
	Tokens    int64    `json:"tokens"`
	Known     bool     `json:"known"`
	Predicted *float64 `json:"predicted"`
}
type QuotaTimelineData struct {
	Earliest     int64               `json:"earliest"`
	Scope        string              `json:"scope"`
	Bins         []QuotaTimelineBin  `json:"bins"`
	Observations []QuotaArchivePoint `json:"observations"`
	Forecasts    []QuotaArchiveEntry `json:"forecasts"`
}

func quotaScope(as []quotaplan.Account) string {
	ids := make([]string, 0, len(as))
	for _, a := range as {
		ids = append(ids, a.ID)
	}
	sort.Strings(ids)
	b, _ := json.Marshal(ids)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
func quotaArchiveDir() string { return filepath.Join(filepath.Dir(Path()), "quota-plans") }
func readQuotaArchive(path string) ([]QuotaArchiveEntry, error) {
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	out := []QuotaArchiveEntry{}
	r := bufio.NewReader(f)
	for {
		b, e := r.ReadBytes('\n')
		if len(b) > 0 {
			var p QuotaArchiveEntry
			if e != nil || json.Unmarshal(b, &p) != nil || p.At <= 0 || p.Scope == "" {
				return nil, fmt.Errorf("invalid quota archive: %s", filepath.Base(path))
			}
			out = append(out, p)
		}
		if e == io.EOF {
			break
		}
		if e != nil {
			return nil, e
		}
	}
	return out, nil
}

// recordQuotaPlan fails closed on a damaged journal or an unavailable lock.
// Observation cadence is five minutes; each scope's first forecast per hour wins.
func recordQuotaPlan(p PoolPlan, now time.Time) error {
	if len(p.Input.Accounts) == 0 || len(p.Input.Accounts) != p.Total {
		return nil
	}
	dir := quotaArchiveDir()
	unlock, held := filelock.Lock(filepath.Join(dir, "archive.lock"), time.Second)
	defer unlock()
	if !held {
		return errors.New("quota archive lock unavailable")
	}
	path := filepath.Join(dir, now.UTC().Format("2006-01")+".jsonl")
	old, err := readQuotaArchive(path)
	if err != nil {
		return err
	}
	entry := QuotaArchiveEntry{At: now.UnixMilli(), Scope: quotaScope(p.Input.Accounts)}
	forecast := true
	for _, e := range old {
		if e.Scope != entry.Scope {
			continue
		}
		if e.At/300000 == entry.At/300000 {
			return nil
		}
		if e.At/3600000 == entry.At/3600000 && len(e.Points) > 0 {
			forecast = false
		}
	}
	for _, a := range p.Input.Accounts {
		entry.Total += a.Full * a.Left / 100
	}
	if forecast && p.DemandKnown && (p.Result.Status == "optimal-discrete" || p.Result.Status == "bounded-feasible") {
		for _, v := range p.Result.Points {
			entry.Points = append(entry.Points, QuotaArchivePoint{v.At, v.Total})
		}
		// Coalesce account allocations with identical time bounds; no identities are stored.
		by := map[[2]int64]float64{}
		for _, v := range p.Result.Allocations {
			by[[2]int64{v.From, v.To}] += v.Amount
		}
		for k, v := range by {
			entry.Uses = append(entry.Uses, QuotaArchiveUse{k[0], k[1], v})
		}
		sort.Slice(entry.Uses, func(i, j int) bool { return entry.Uses[i].From < entry.Uses[j].From })
	}
	b, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	b = append(b, '\n')
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, err = f.Write(b)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	return closeErr
}

// QuotaTimeline compares only the current calibrated account set. Prediction
// segments use the last saved forecast issued before each segment, never hindsight.
func QuotaTimeline(from, to int64, steps int, now time.Time) (QuotaTimelineData, error) {
	out := QuotaTimelineData{Bins: []QuotaTimelineBin{}, Observations: []QuotaArchivePoint{}, Forecasts: []QuotaArchiveEntry{}}
	if from <= 0 || to <= from || to > 4102444800000 || steps < 1 || steps > 240 || to-from > 10*366*24*quotaplan.Hour {
		return out, errors.New("invalid timeline range")
	}
	p := QuotaPlan(now)
	out.Scope = quotaScope(p.Input.Accounts)
	s := readLogSnapshot()
	if !s.firstOwn.IsZero() {
		out.Earliest = s.firstOwn.UnixMilli()
	}
	members := map[string]bool{}
	for _, a := range p.Input.Accounts {
		members[a.ID] = true
	}
	step := (to - from + int64(steps) - 1) / int64(steps)
	for at := from; at < to; at += step {
		end := min(at+step, to)
		out.Bins = append(out.Bins, QuotaTimelineBin{From: at, To: end, Known: len(members) > 0 && len(members) == p.Total && out.Earliest > 0 && at >= out.Earliest && end <= now.UnixMilli()})
	}
	price := apiPricer()
	s.visit(time.UnixMilli(from), func(r Record) {
		at := r.Time.UnixMilli()
		if at < from || at >= to || at > now.UnixMilli() || r.IsRejected() || r.IsReported() || !members[accountID(r.Provider, r.Account())] || r.Input+r.Output <= 0 {
			return
		}
		b := &out.Bins[(at-from)/step]
		b.Tokens += int64(r.Input + r.Output)
		if v := price(r); v != nil {
			b.Actual += r.CostAt(*v)
		} else {
			b.Known = false
		}
	})
	// Read whole months under the same lock so an in-progress append isn't corrupt data.
	dir := quotaArchiveDir()
	if _, err := os.Stat(dir); errors.Is(err, os.ErrNotExist) {
		return out, nil
	} else if err != nil {
		return out, err
	}
	unlock, held := filelock.Lock(filepath.Join(dir, "archive.lock"), time.Second)
	defer unlock()
	if !held {
		return out, errors.New("quota archive lock unavailable")
	}
	start := time.UnixMilli(from).Add(-72 * time.Hour).UTC()
	start = time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := time.UnixMilli(min(to, now.UnixMilli())).UTC()
	entries := []QuotaArchiveEntry{}
	for m := start; !m.After(end); m = m.AddDate(0, 1, 0) {
		es, err := readQuotaArchive(filepath.Join(dir, m.Format("2006-01")+".jsonl"))
		if err != nil {
			return out, err
		}
		for _, e := range es {
			if e.Scope == out.Scope {
				entries = append(entries, e)
			}
		}
	}
	applyQuotaArchive(&out, entries, from, to, step)
	return out, nil
}

func applyQuotaArchive(out *QuotaTimelineData, entries []QuotaArchiveEntry, from, to, step int64) {
	sort.Slice(entries, func(i, j int) bool { return entries[i].At < entries[j].At })
	// Downsample observations without fabricating missing samples.
	obs := map[int64]QuotaArchivePoint{}
	for _, e := range entries {
		if e.At >= from && e.At <= to {
			obs[(e.At-from)/step] = QuotaArchivePoint{e.At, e.Total}
		}
	}
	for _, v := range obs {
		out.Observations = append(out.Observations, v)
	}
	sort.Slice(out.Observations, func(i, j int) bool { return out.Observations[i].At < out.Observations[j].At })
	forecasts := []QuotaArchiveEntry{}
	for _, e := range entries {
		if len(e.Points) > 0 {
			forecasts = append(forecasts, e)
		}
	}
	// Return only the baseline preceding the viewed range, for the balance overlay.
	for _, e := range forecasts {
		if e.At <= from && e.Points[len(e.Points)-1].At >= from {
			out.Forecasts = []QuotaArchiveEntry{e}
		}
	}
	for i := range out.Bins {
		b := &out.Bins[i]
		b.Predicted = quotaPrediction(forecasts, b.From, b.To)
	}
}

// Stitch already-issued baselines at their actual issue times. This lets a
// monthly bin compare a month of rolling plans without using later knowledge.
func quotaPrediction(fs []QuotaArchiveEntry, from, to int64) *float64 {
	total := 0.0
	for at := from; at < to; {
		j := sort.Search(len(fs), func(j int) bool { return fs[j].At > at }) - 1
		if j < 0 {
			return nil
		}
		f := fs[j]
		end := min(to, f.Points[len(f.Points)-1].At)
		if j+1 < len(fs) {
			end = min(end, fs[j+1].At)
		}
		if end <= at {
			return nil
		}
		for _, u := range f.Uses {
			overlap := min(end, u.To) - max(at, u.From)
			if overlap > 0 && u.To > u.From {
				total += u.Amount * float64(overlap) / float64(u.To-u.From)
			}
		}
		at = end
	}
	return &total
}
