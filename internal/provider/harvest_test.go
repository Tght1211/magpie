package provider

import (
	"testing"
	"time"
)

func TestHarvestDeadlineAndCardGuard(t *testing.T) {
	now := time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)
	expiry := now.Add(55 * time.Hour)
	a := Allowance{{Span: 168 * time.Hour, Resets: now.Add(40 * time.Hour), ResetRunsOut: expiry}}
	if got := a.HarvestDeadline("gpt", now); !got.Equal(a[0].Resets) {
		t.Fatal(got)
	}
	a[0].Resets = now.Add(200 * time.Hour)
	if got := a.HarvestDeadline("gpt", now); !got.Equal(expiry.Add(-resetLead())) {
		t.Fatal(got)
	}
	reset := now.Add(100 * time.Hour)
	w := []QuotaWindow{{Span: 168 * time.Hour, Used: 20, ResetsAt: &reset}}
	near := expiry.Add(-time.Minute)
	if harvestCardReady(w, expiry, now) || !harvestCardReady(w, expiry, near) {
		t.Fatal("margin mismatch")
	}
	w[0].Used = 19
	if harvestCardReady(w, expiry, near) {
		t.Fatal("ineligible")
	}
	w[0].Used = 80
	reset = expiry.Add(-time.Second)
	if harvestCardReady(w, expiry, near) {
		t.Fatal("natural reset sacrificed")
	}
}
