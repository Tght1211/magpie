package usage

import (
	"github.com/yetone/magpie/internal/catalog"
	"testing"
	"time"
)

func TestQuotaMembersKeepKeyAccountModelAndUnknownPrice(t *testing.T) {
	now := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	records := []Record{
		{Time: now.Add(-time.Hour), Provider: "codex", ProviderAccount: "a@example.test", CallerKeyID: "k", Model: "one", Input: 1000000, Status: 200},
		{Time: now.Add(-time.Hour), Provider: "codex", ProviderAccount: "b@example.test", CallerKeyID: "k", Model: "one", Input: 2000000, Status: 200},
		{Time: now.Add(-time.Hour), Provider: "codex", ProviderAccount: "a@example.test", CallerKeyID: "child", CallerIssuerID: "parent", Model: "unknown", Input: 100, Status: 200},
	}
	got := quotaMemberUses(now, now.Add(-48*time.Hour), func(r Record) *catalog.Price {
		if r.Model == "unknown" {
			return nil
		}
		return &catalog.Price{Input: 1}
	}, func(fn func(Record)) {
		for _, r := range records {
			fn(r)
		}
	})
	if !got.Complete || len(got.Rows) != 3 {
		t.Fatalf("bad aggregate: %+v", got)
	}
	total := 0.
	unknown := 0
	for _, r := range got.Rows {
		total += r.Cost
		unknown += r.Unpriced
		if r.Model == "codex/unknown" && r.Key != "parent" {
			t.Fatal("issued key not attributed to parent")
		}
	}
	if total != 3 || unknown != 1 {
		t.Fatalf("cost=%v unpriced=%v", total, unknown)
	}
}
