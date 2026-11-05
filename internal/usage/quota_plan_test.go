package usage

import (
	"context"
	"github.com/yetone/magpie/internal/quotaplan"
	"sync"
	"testing"
	"time"
)

func TestHarvestPlanPublicationAndExpiry(t *testing.T) {
	now := time.Now()
	id := accountID("codex", "A@example.test")
	reset := now.Add(100 * time.Hour)
	expiry := now.Add(20 * time.Minute)
	p := PoolPlan{Input: quotaplan.Input{Accounts: []quotaplan.Account{{ID: id, Full: 100, Tokens: 1e6, Reset: reset.UnixMilli(), Cards: []quotaplan.Card{{Expiry: expiry.UnixMilli()}}}}}, Result: quotaplan.Result{Status: "optimal-discrete", Allocations: []quotaplan.Allocation{{ID: id, From: now.UnixMilli(), To: now.Add(time.Hour).UnixMilli(), Amount: 10}}, Events: []quotaplan.Event{{ID: id, Kind: "card", At: now.UnixMilli()}}}}
	publishQuotaPlan(p, now)
	if got := harvestRanks(now)[id]; got.Tokens != 100000 || got.Rank != 0 {
		t.Fatal(got)
	}
	if allow, known := harvestCardPlan("a@example.test", reset, expiry, now); !allow || !known {
		t.Fatal(allow, known)
	}
	if _, known := harvestCardPlan("a@example.test", reset.Add(time.Hour), expiry, now); known {
		t.Fatal("official reset reused old plan")
	}
	if harvestRanks(now.Add(3*time.Minute)) != nil || harvestRanks(now.Add(-time.Second)) != nil {
		t.Fatal("stale or future plan")
	}
	p.Result.Events = nil
	publishQuotaPlan(p, now)
	if allow, known := harvestCardPlan("A@example.test", reset, expiry, now); allow || !known {
		t.Fatal("skip decision lost", allow, known)
	}
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			for range 50 {
				publishQuotaPlan(p, now)
				_ = harvestRanks(now)
				harvestCardPlan("a@example.test", reset, expiry, now)
			}
		})
	}
	wg.Wait()
	publishQuotaPlan(PoolPlan{}, now)
}
func TestQuotaPlanLoopStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan struct{})
	go func() { KeepQuotaPlan(ctx); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("planner did not stop")
	}
}
