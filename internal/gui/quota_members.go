package gui

import (
	"encoding/json"
	"github.com/yetone/magpie/internal/access"
	"github.com/yetone/magpie/internal/provider"
	"github.com/yetone/magpie/internal/settings"
	"github.com/yetone/magpie/internal/usage"
	"net/http"
	"strings"
	"time"
)

type quotaMember struct {
	ID         string              `json:"id"`
	Name       string              `json:"name"`
	Account    string              `json:"account"`
	Ref        string              `json:"ref"`
	Eligible   map[string][]string `json:"eligible"`
	Restricted bool                `json:"restricted"`
}
type quotaMemberAccount struct {
	ID       string `json:"id"`
	Ref      string `json:"ref"`
	User     string `json:"user"`
	Provider string `json:"provider"`
}

func quotaMemberAccounts() []quotaMemberAccount {
	out := []quotaMemberAccount{}
	for _, pid := range []string{"codex", "claude"} {
		p, err := provider.Find(pid)
		if err != nil {
			continue
		}
		for _, a := range p.AccountIDs() {
			if a.Key {
				continue
			}
			b, _ := json.Marshal([]string{pid, strings.ToLower(a.User)})
			out = append(out, quotaMemberAccount{string(b), pid + "/" + a.ID, a.User, pid})
		}
	}
	return out
}
func quotaMemberRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/usage/quota-members", coldTurn(func(w http.ResponseWriter, r *http.Request) {
		keys, err := access.List()
		if err != nil {
			http.Error(w, "member keys unavailable", 503)
			return
		}
		st, err := settings.LoadChecked()
		if err != nil {
			http.Error(w, "member bindings unavailable", 503)
			return
		}
		now := usage.Clock()
		data := usage.QuotaMemberUses(now)
		accounts := quotaMemberAccounts()
		models := map[string]bool{}
		observed := map[string]map[string]bool{}
		for _, v := range data.Rows {
			models[v.Model] = true
			if v.Successful > 0 {
				if observed[v.Account] == nil {
					observed[v.Account] = map[string]bool{}
				}
				observed[v.Account][v.Model] = true
			}
		}
		members := []quotaMember{}
		for _, k := range keys {
			if k.Issuer != "" {
				continue
			}
			m := quotaMember{ID: k.ID, Name: k.Name, Ref: st.QuotaMembers[k.ID], Eligible: map[string][]string{}, Restricted: k.Off || k.ReadOnly || (!k.Expires.IsZero() && k.Expires.Before(now)) || k.Limit != nil || len(k.More) > 0}
			who := access.Identity{Models: access.HeldModels(k.Models, k.Accounts), Accounts: k.Accounts}
			for _, a := range accounts {
				if strings.EqualFold(a.Ref, m.Ref) {
					m.Account = a.ID
				}
				p, err := provider.Find(a.Provider)
				if err != nil {
					continue
				}
				for model := range models {
					pid, id, ok := strings.Cut(model, "/")
					if !ok || pid != a.Provider {
						continue
					}
					// Provider and Key restrictions share the gateway's own predicates.
					// Plan-specific model availability still needs a vendor reading.
					_, ref, _ := strings.Cut(a.Ref, "/")
					if observed[a.ID][model] && !m.Restricted && who.Allows(model) && who.AllowsAccount(pid, ref) && p.AccountServes(a.User, id) {
						m.Eligible[model] = append(m.Eligible[model], a.ID)
					}
				}
			}
			members = append(members, m)
		}
		writeJSON(w, struct {
			Usage    usage.PoolUses       `json:"usage"`
			Members  []quotaMember        `json:"members"`
			Accounts []quotaMemberAccount `json:"accounts"`
			At       int64                `json:"at"`
		}{data, members, accounts, time.Now().UnixMilli()})
	}))
	mux.HandleFunc("POST /api/usage/quota-members", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Key     string `json:"key"`
			Account string `json:"account"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in) != nil {
			http.Error(w, "invalid binding", 400)
			return
		}
		keys, err := access.List()
		if err != nil {
			http.Error(w, "member keys unavailable", 503)
			return
		}
		valid := false
		for _, k := range keys {
			if k.ID == in.Key && k.Issuer == "" {
				valid = true
			}
		}
		if !valid {
			http.Error(w, "unknown member", 400)
			return
		}
		valid = in.Account == ""
		for _, a := range quotaMemberAccounts() {
			if a.Ref == in.Account {
				valid = true
			}
		}
		if !valid {
			http.Error(w, "unknown account", 400)
			return
		}
		present := map[string]bool{}
		for _, k := range keys {
			present[k.ID] = true
		}
		if err := settings.BindQuotaMember(in.Key, in.Account, present); err != nil {
			http.Error(w, "binding could not be saved; the account may already belong to another member", 409)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
}
