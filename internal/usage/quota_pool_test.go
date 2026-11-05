package usage

import (
	"github.com/yetone/magpie/internal/catalog"
	"github.com/yetone/magpie/internal/provider"
	"testing"
	"time"
)

func TestQuotaPoolPairsOnlyMatchingAccountAndTime(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	reset := now.Add(24 * time.Hour)
	start := now.Add(-2 * time.Hour)
	h := []provider.QuotaHistory{{Provider: "codex", User: "A@example.test", Lines: []provider.QuotaLine{{Name: "7 days", Points: []provider.QuotaPoint{{At: start, Left: 80, ResetsAt: &reset}, {At: now.Add(-time.Hour), Left: 70, ResetsAt: &reset}, {At: now, Left: 60, ResetsAt: &reset}}}}}}
	records := []Record{{Provider: "codex", ProviderAccount: "a@example.test", Time: start.Add(time.Minute), Input: 1000000, Status: 200}, {Provider: "codex", ProviderAccount: "other", Time: start.Add(time.Minute), Input: 9000000, Status: 200}, {Provider: "claude", ProviderAccount: "a@example.test", Time: start.Add(time.Minute), Input: 9000000, Status: 200}, {Provider: "codex", ProviderAccount: "a@example.test", Time: now.Add(-time.Minute), Input: 1000000, Status: 200}}
	got := quotaPool(h, now, start.Add(-time.Hour), func(Record) *catalog.Price { return &catalog.Price{Input: 1} }, func(fn func(Record)) {
		for _, r := range records {
			fn(r)
		}
	})
	if len(got) != 1 || len(got[0].Samples) != 2 || got[0].Samples[0].Cost != 1 || got[0].Samples[1].Cost != 1 {
		t.Fatal(got)
	}
	full, tokens := poolCalibration(got[0].Samples, now, now)
	if full != 10 || tokens != 10000000 {
		t.Fatal(full, tokens)
	}
	got[0].Samples[0].Unpriced = 1
	got[0].Samples[1].Used = 1
	full, _ = poolCalibration(got[0].Samples, now, now)
	if full != 0 {
		t.Fatal("unknown pricing accepted")
	}
	h[0].Lines[0].Points[1].Left = 100
	got = quotaPool(h, now, start, func(Record) *catalog.Price { return nil }, func(func(Record)) {})
	if len(got[0].Samples) != 1 || got[0].Samples[0].From != h[0].Lines[0].Points[1].At {
		t.Fatal("refill counted as use", got)
	}
}
