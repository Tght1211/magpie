package gui

import (
	"encoding/json"
	"fmt"
	"github.com/yetone/magpie/internal/provider"
	"github.com/yetone/magpie/internal/quotaplan"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestQuotaSimulationIsAuthenticatedAndReadOnly(t *testing.T) {
	sandboxHome(t)
	mux := http.NewServeMux()
	usageRoutes(mux, folderOnly{})
	h := webGuard("session", "test-key", 0, mux)
	now := time.Now()
	in := quotaplan.Input{Now: now.UnixMilli(), Hours: 2, Demand: 3, Accounts: []quotaplan.Account{{ID: "fiction@example.test", Full: 100, Left: 50, Reset: now.Add(24 * time.Hour).UnixMilli(), PeriodHours: 168}}}
	b, _ := json.Marshal(in)
	call := func(body string, auth bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/usage/quota-plan/demo", strings.NewReader(body))
		if auth {
			r.AddCookie(&http.Cookie{Name: "session", Value: "test-key"})
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	if w := call(string(b), false); w.Code != 401 {
		t.Fatal(w.Code)
	}
	before := provider.HarvestRanks(now)
	w := call(string(b), true)
	var got quotaplan.Result
	if json.Unmarshal(w.Body.Bytes(), &got) != nil || w.Code != 200 || got.Spent != 6 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if !reflect.DeepEqual(provider.HarvestRanks(now), before) {
		t.Fatal("preview changed routing")
	}
	for _, bad := range []string{`{`, `{}`, strings.Repeat(" ", 65537) + string(b)} {
		if w := call(bad, true); w.Code != 400 {
			t.Fatal(w.Code)
		}
	}
}

func TestQuotaHistoryIsAuthenticatedAndReadOnly(t *testing.T) {
	sandboxHome(t)
	mux := http.NewServeMux()
	usageRoutes(mux, folderOnly{})
	h := webGuard("session", "test-key", 0, mux)
	now := time.Now().UnixMilli()
	query := fmt.Sprintf("/api/usage/quota-plan?history=1&from=%d&to=%d", now-3600000, now)
	call := func(path string, auth bool) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", path, nil)
		if auth {
			r.AddCookie(&http.Cookie{Name: "session", Value: "test-key"})
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	if w := call(query, false); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := call("/api/usage/quota-plan?history=1&from=bad&to=bad", true); w.Code != 400 {
		t.Fatal(w.Code)
	}
	w := call(query, true)
	var data struct {
		Bins []struct {
			Known     bool     `json:"known"`
			Predicted *float64 `json:"predicted"`
		} `json:"bins"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &data) != nil || len(data.Bins) != 120 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	for _, b := range data.Bins {
		if b.Known || b.Predicted != nil {
			t.Fatal("empty history became known")
		}
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(provider.Path()), "quota-plans")); !os.IsNotExist(err) {
		t.Fatal("preview wrote archive", err)
	}
}
