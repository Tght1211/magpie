package settingsapi

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/yetone/magpie/internal/settings"
)

func TestSettingsSaveKeepsQuotaMemberOwnership(t *testing.T) {
	for _, bound := range []bool{false, true} {
		for _, body := range []string{
			`{"theme":"dark"}`,
			`{"theme":"dark","quotaMembers":null}`,
			`{"theme":"dark","quotaMembers":{"other":"codex/a"}}`,
		} {
			t.Run(body+map[bool]string{false: "/empty", true: "/bound"}[bound], func(t *testing.T) {
				home(t)
				if bound {
					if err := settings.BindQuotaMember("member", "codex/a"); err != nil {
						t.Fatal(err)
					}
				}
				before := settings.Load()
				in, _, err := Apply([]byte(body), false)
				if err != nil {
					t.Fatal(err)
				}
				for name, got := range map[string]settings.Settings{"reply": in, "disk": settings.Load()} {
					if !reflect.DeepEqual(got.QuotaMembers, before.QuotaMembers) {
						t.Errorf("%s ownership = %v, want %v", name, got.QuotaMembers, before.QuotaMembers)
					}
					if got.Theme != "dark" {
						t.Errorf("%s theme = %q", name, got.Theme)
					}
				}
				if _, err := Body(before, "quotaMembers", json.RawMessage(`{}`)); err == nil {
					t.Fatal("generic settings accepted quota ownership")
				}
			})
		}
	}
}
