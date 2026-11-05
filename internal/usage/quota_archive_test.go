package usage

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/yetone/magpie/internal/quotaplan"
)

func archiveHome(t *testing.T) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
}
func archiveFixture(at time.Time) PoolPlan {
	return PoolPlan{Total: 1, DemandKnown: true, Input: quotaplan.Input{Accounts: []quotaplan.Account{{ID: "fiction@example.test", Full: 100, Left: 50}}}, Result: quotaplan.Result{Status: "optimal-discrete", Points: []quotaplan.Point{{At: at.UnixMilli(), Total: 50}, {At: at.Add(2 * time.Hour).UnixMilli(), Total: 30}}, Allocations: []quotaplan.Allocation{{From: at.UnixMilli(), To: at.Add(2 * time.Hour).UnixMilli(), Amount: 20}}}}
}
func TestQuotaArchivePreservesFirstForecastAndCorruptFiles(t *testing.T) {
	archiveHome(t)
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	p := archiveFixture(now)
	if err := recordQuotaPlan(p, now); err != nil {
		t.Fatal(err)
	}
	p.Result.Points[0].Total = 999
	p.Input.Accounts[0].Left = 20
	if err := recordQuotaPlan(p, now.Add(6*time.Minute)); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(quotaArchiveDir(), "2026-11.jsonl")
	entries, err := readQuotaArchive(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || entries[0].Points[0].Total != 50 || len(entries[1].Points) != 0 || entries[1].Total != 20 {
		t.Fatalf("history rewritten: %+v", entries)
	}
	b, _ := os.ReadFile(path)
	if string(b) == "" {
		t.Fatal("missing archive")
	}
	if err := os.WriteFile(path, append(b, []byte("{broken")...), 0600); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	if err := recordQuotaPlan(p, now.Add(time.Hour)); err == nil {
		t.Fatal("corrupt archive treated as empty")
	}
	after, _ := os.ReadFile(path)
	if string(after) != string(before) {
		t.Fatal("corrupt archive overwritten")
	}
}
func TestQuotaArchiveConcurrentWritersAndScope(t *testing.T) {
	archiveHome(t)
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	p := archiveFixture(now)
	var wg sync.WaitGroup
	for range 6 {
		wg.Go(func() {
			if err := recordQuotaPlan(p, now); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	entries, err := readQuotaArchive(filepath.Join(quotaArchiveDir(), "2026-11.jsonl"))
	if err != nil || len(entries) != 1 {
		t.Fatal(len(entries), err)
	}
	second := archiveFixture(now)
	second.Input.Accounts[0].ID = "different@example.test"
	if quotaScope(p.Input.Accounts) == quotaScope(second.Input.Accounts) {
		t.Fatal("different pools compared")
	}
	if err := recordQuotaPlan(second, now); err != nil {
		t.Fatal(err)
	}
	entries, _ = readQuotaArchive(filepath.Join(quotaArchiveDir(), "2026-11.jsonl"))
	if len(entries) != 2 {
		t.Fatal("new scope lost")
	}
}

func TestQuotaArchiveComparisonNeverUsesHindsight(t *testing.T) {
	h := int64(time.Hour / time.Millisecond)
	entries := []QuotaArchiveEntry{
		{At: h, Points: []QuotaArchivePoint{{At: h, Total: 100}, {At: 4 * h, Total: 70}}, Uses: []QuotaArchiveUse{{From: h, To: 4 * h, Amount: 30}}},
		{At: 2 * h, Points: []QuotaArchivePoint{{At: 2 * h, Total: 100}, {At: 4 * h, Total: 0}}, Uses: []QuotaArchiveUse{{From: 2 * h, To: 4 * h, Amount: 100}}},
	}
	out := QuotaTimelineData{Bins: []QuotaTimelineBin{{From: 0, To: h}, {From: h, To: 2 * h}, {From: 2 * h, To: 3 * h}, {From: 4 * h, To: 5 * h}}}
	applyQuotaArchive(&out, entries, 0, 5*h, h)
	if out.Bins[0].Predicted != nil || out.Bins[3].Predicted != nil {
		t.Fatal("invented historical or out-of-horizon forecast")
	}
	if out.Bins[1].Predicted == nil || *out.Bins[1].Predicted != 10 {
		t.Fatal("later forecast rewrote earlier interval")
	}
	if out.Bins[2].Predicted == nil || *out.Bins[2].Predicted != 50 {
		t.Fatal("new forecast not used for subsequent interval")
	}
}

func TestQuotaPredictionAggregatesRollingPlansAndRejectsGaps(t *testing.T) {
	h := int64(time.Hour / time.Millisecond)
	fs := []QuotaArchiveEntry{}
	for i := int64(0); i < 720; i++ {
		fs = append(fs, QuotaArchiveEntry{At: i * h, Points: []QuotaArchivePoint{{At: i * h}, {At: (i + 1) * h}}, Uses: []QuotaArchiveUse{{From: i * h, To: (i + 1) * h, Amount: 2}}})
	}
	if p := quotaPrediction(fs, 0, 720*h); p == nil || *p != 1440 {
		t.Fatal("monthly aggregation lost saved forecasts", p)
	}
	fs = append(fs[:100], fs[101:]...)
	if p := quotaPrediction(fs, 0, 720*h); p != nil {
		t.Fatal("a missing forecast was filled in", *p)
	}
}
