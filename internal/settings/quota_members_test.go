package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestQuotaMemberBindingIsOneToOneAndPreservesSettings(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	old := Load()
	if err := BindQuotaMember("one", "codex/a"); err != nil {
		t.Fatal(err)
	}
	old.Theme = "dark"
	if err := Save(old); err != nil {
		t.Fatal(err)
	}
	if Load().QuotaMembers["one"] != "codex/a" {
		t.Fatal("stale settings save erased binding")
	}
	if err := BindQuotaMember("two", "codex/a"); err == nil {
		t.Fatal("duplicate owner accepted")
	}
	if err := BindQuotaMember("one", "claude/b"); err != nil {
		t.Fatal(err)
	}
	if got := Load().QuotaMembers; len(got) != 1 || got["one"] != "claude/b" {
		t.Fatal(got)
	}
	if err := BindQuotaMember("one", ""); err != nil {
		t.Fatal(err)
	}
	if len(Load().QuotaMembers) != 0 {
		t.Fatal("unbind failed")
	}
}
func TestQuotaMemberBindingDoesNotOverwriteCorruptSettings(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	path := Path()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := BindQuotaMember("one", "codex/a"); err == nil {
		t.Fatal("corrupt settings overwritten")
	}
	b, _ := os.ReadFile(path)
	if string(b) != "broken" {
		t.Fatal("file changed")
	}
}

func TestQuotaMemberCanReuseAccountAfterKeyDeletion(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	if err := BindQuotaMember("gone", "codex/a"); err != nil {
		t.Fatal(err)
	}
	if err := BindQuotaMember("new", "codex/a", map[string]bool{"new": true}); err != nil {
		t.Fatal(err)
	}
	got := Load().QuotaMembers
	if len(got) != 1 || got["new"] != "codex/a" {
		t.Fatal(got)
	}
}
