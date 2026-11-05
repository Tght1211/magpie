package gui

import (
	"encoding/base64"
	"encoding/json"
	"github.com/yetone/magpie/internal/access"
	"github.com/yetone/magpie/internal/provider"
	"github.com/yetone/magpie/internal/usage"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestQuotaMembersRequireAuthAndNeverExposeKeys(t *testing.T) {
	sandboxHome(t)
	secret, err := access.Update("add-key", access.Change{Name: "member@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	keys, err := access.List()
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	quotaMemberRoutes(mux)
	handler := webGuard("session", "test-key", 0, mux)
	call := func(method, path, body string, auth bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if auth {
			r.AddCookie(&http.Cookie{Name: "session", Value: "test-key"})
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if got := call("GET", "/api/usage/quota-members", "", false); got.Code != 401 {
		t.Fatal(got.Code)
	}
	if got := call("POST", "/api/usage/quota-members", "{}", false); got.Code != 401 {
		t.Fatal(got.Code)
	}
	got := call("GET", "/api/usage/quota-members", "", true)
	if got.Code != 200 || strings.Contains(got.Body.String(), secret) || strings.Contains(got.Body.String(), "masked") {
		t.Fatal("unsafe member response", got.Code)
	}
	for _, body := range []string{`{`, `{"key":"unknown","account":""}`, `{"key":"` + keys[0].ID + `","account":"codex/not-real"}`, strings.Repeat(" ", 4097) + `{}`} {
		if got := call("POST", "/api/usage/quota-members", body, true); got.Code != 400 {
			t.Fatal(got.Code)
		}
	}
	if got := call("POST", "/api/usage/quota-members", `{"key":"`+keys[0].ID+`","account":""}`, true); got.Code != 200 {
		t.Fatal(got.Code)
	}
}

func TestQuotaMemberBindingUsesRealStoredAccountAndLedger(t *testing.T) {
	home := sandboxHome(t)
	now := time.Now()
	jwt := func(v any) string {
		b, _ := json.Marshal(v)
		return "e30." + base64.RawURLEncoding.EncodeToString(b) + ".sig"
	}
	auth := map[string]any{"auth_mode": "chatgpt", "tokens": map[string]any{
		"id_token":     jwt(map[string]any{"email": "member@example.test", "https://api.openai.com/auth": map[string]any{"chatgpt_plan_type": "pro", "chatgpt_account_id": "member-test"}}),
		"access_token": jwt(map[string]any{"exp": now.Add(time.Hour).Unix()}), "refresh_token": "test-only", "account_id": "member-test"}}
	dir := filepath.Join(home, ".codex")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(auth)
	if err := os.WriteFile(filepath.Join(dir, "auth.json"), b, 0600); err != nil {
		t.Fatal(err)
	}
	provider.ForgetAccounts()
	t.Cleanup(provider.ForgetAccounts)
	for _, name := range []string{"member", "other"} {
		if _, err := access.Update("add-key", access.Change{Name: name}); err != nil {
			t.Fatal(err)
		}
	}
	keys, _ := access.List()
	usage.Append(usage.Record{Time: now.Add(-time.Hour), Provider: "codex", ProviderAccount: "member@example.test", CallerKeyID: keys[0].ID, Model: "gpt-5.5", Input: 1000, Status: 200})
	accounts := quotaMemberAccounts()
	if len(accounts) != 1 {
		t.Fatalf("want one stored account, got %d", len(accounts))
	}
	mux := http.NewServeMux()
	quotaMemberRoutes(mux)
	bind := func(key string) int {
		b, _ := json.Marshal(map[string]string{"key": key, "account": accounts[0].Ref})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/usage/quota-members", strings.NewReader(string(b))))
		return w.Code
	}
	if code := bind(keys[0].ID); code != 200 {
		t.Fatal(code)
	}
	if code := bind(keys[1].ID); code != 409 {
		t.Fatal("duplicate owner", code)
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/api/usage/quota-members", nil))
	var out struct {
		Members []quotaMember  `json:"members"`
		Usage   usage.PoolUses `json:"usage"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || w.Code != 200 {
		t.Fatal("bad member response", w.Code, err)
	}
	if len(out.Usage.Rows) != 1 || out.Usage.Rows[0].Account != accounts[0].ID || out.Usage.Rows[0].Key != keys[0].ID {
		t.Fatal("lost real ledger pairing")
	}
	if len(out.Members) != 2 || out.Members[0].Account != accounts[0].ID || len(out.Members[0].Eligible["codex/gpt-5.5"]) != 1 {
		t.Fatal("binding or observed compatibility lost")
	}
	if len(out.Members[0].Eligible["codex/unobserved"]) != 0 {
		t.Fatal("invented compatibility")
	}
	if _, err := access.Update("accounts-key", access.Change{Key: keys[0].ID, Accounts: []string{accounts[0].Ref}}); err != nil {
		t.Fatal(err)
	}
	if _, err := access.Update("models-key", access.Change{Key: keys[0].ID, Models: []string{"claude/*"}}); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/api/usage/quota-members", nil))
	out.Members = nil
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Members[0].Eligible["codex/gpt-5.5"]) != 0 {
		t.Fatal("model access restriction bypassed")
	}
}
