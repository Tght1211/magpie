package gateway

import (
	"encoding/json"
	"github.com/yetone/magpie/internal/provider"
	"testing"
	"time"
)

func TestHarvestGatewayUsesCachedPlanAndHonorsShortLimit(t *testing.T) {
	fresh(t)
	oldAllow, oldRanks := allowances, provider.HarvestRanks
	t.Cleanup(func() { allowances = oldAllow; provider.HarvestRanks = oldRanks })
	now := time.Now()
	share := map[string]provider.Allowance{}
	allowances = func(string) map[string]provider.Allowance { return share }
	id := func(user string) string { b, _ := json.Marshal([]string{"codex", user}); return string(b) }
	provider.HarvestRanks = func(time.Time) map[string]provider.HarvestBudget {
		return map[string]provider.HarvestBudget{id("b@example.test"): {Rank: 0, Tokens: 10000}}
	}
	p := provider.Provider{ID: "codex", Routing: provider.Harvest, Account: &provider.Account{Agent: "codex", User: "a@example.test"}}
	acct := func(user string) candidate {
		return candidate{p: provider.Provider{ID: "codex", Account: &provider.Account{Agent: "codex", User: user}}, model: "gpt-5", rest: "codex#" + user}
	}
	share["a@example.test"] = provider.Allowance{{Span: 168 * time.Hour, Used: 50, Resets: now.Add(time.Hour)}}
	share["b@example.test"] = provider.Allowance{{Span: 168 * time.Hour, Used: 50, Resets: now.Add(24 * time.Hour)}}
	order := func() string {
		cs, _ := weigh(p, []candidate{acct("a@example.test"), acct("b@example.test")}, "gpt-5", provider.Chat)
		return cs[0].p.Account.User
	}
	if got := order(); got != "b@example.test" {
		t.Fatalf("plan was not read by gateway: %s", got)
	}
	share["b@example.test"] = append(share["b@example.test"], provider.Limit{Span: 5 * time.Hour, Used: 100, Resets: now.Add(time.Hour)})
	if got := order(); got != "a@example.test" {
		t.Fatalf("short limit bypassed: %s", got)
	}
	provider.HarvestRanks = func(time.Time) map[string]provider.HarvestBudget { return nil }
	share["b@example.test"] = share["b@example.test"][:1]
	if got := order(); got != "a@example.test" {
		t.Fatalf("missing plan must fall back to earliest refill: %s", got)
	}
}
