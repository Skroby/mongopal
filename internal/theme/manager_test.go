package theme

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

func newTestManager(t *testing.T) (*ThemeManager, string) {
	t.Helper()
	dir := t.TempDir()
	state := core.NewAppState()
	state.DisableEvents = true
	state.Emitter = &core.NoopEventEmitter{}
	m := NewThemeManager(state, dir)
	return m, dir
}

func TestBuiltinThemesLoaded(t *testing.T) {
	m, _ := newTestManager(t)
	themes := m.GetThemes()
	if len(themes) < 2 {
		t.Fatalf("expected at least 2 builtin themes, got %d", len(themes))
	}
	found := map[string]bool{}
	for _, th := range themes {
		found[th.ID] = true
	}
	if !found["mongopal-dark"] {
		t.Error("mongopal-dark not found")
	}
	if !found["mongopal-light"] {
		t.Error("mongopal-light not found")
	}
}

func TestDefaultThemeIsMongopalDark(t *testing.T) {
	m, _ := newTestManager(t)
	current := m.GetCurrentTheme()
	if current.ID != "mongopal-dark" {
		t.Errorf("expected default theme mongopal-dark, got %s", current.ID)
	}
}

func TestSetTheme(t *testing.T) {
	m, _ := newTestManager(t)

	err := m.SetTheme("mongopal-light")
	if err != nil {
		t.Fatalf("SetTheme failed: %v", err)
	}

	current := m.GetCurrentTheme()
	if current.ID != "mongopal-light" {
		t.Errorf("expected mongopal-light, got %s", current.ID)
	}
}

func TestSetThemeNotFound(t *testing.T) {
	m, _ := newTestManager(t)
	err := m.SetTheme("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent theme")
	}
}

func TestConfigPersistence(t *testing.T) {
	dir := t.TempDir()
	state := core.NewAppState()
	state.DisableEvents = true
	state.Emitter = &core.NoopEventEmitter{}

	m1 := NewThemeManager(state, dir)
	_ = m1.SetTheme("mongopal-light")

	// Create a new manager reading the same config
	m2 := NewThemeManager(state, dir)
	current := m2.GetCurrentTheme()
	if current.ID != "mongopal-light" {
		t.Errorf("expected persisted theme mongopal-light, got %s", current.ID)
	}
}

func TestLoadUserTheme(t *testing.T) {
	dir := t.TempDir()
	themesDir := filepath.Join(dir, "themes")
	_ = os.MkdirAll(themesDir, 0755)

	userTheme := types.Theme{
		ID:   "my-custom",
		Name: "My Custom Theme",
		Colors: types.ThemeColors{
			Background: "#111111",
			Surface:    "#222222",
			Text:       "#ffffff",
			Primary:    "#ff0000",
		},
	}
	data, _ := json.MarshalIndent(userTheme, "", "  ")
	_ = os.WriteFile(filepath.Join(themesDir, "my-custom.json"), data, 0644)

	state := core.NewAppState()
	state.DisableEvents = true
	state.Emitter = &core.NoopEventEmitter{}
	m := NewThemeManager(state, dir)

	themes := m.GetThemes()
	found := false
	for _, th := range themes {
		if th.ID == "my-custom" {
			found = true
			if th.Builtin {
				t.Error("user theme should not be marked as builtin")
			}
		}
	}
	if !found {
		t.Error("user theme my-custom not loaded")
	}

	// Can switch to user theme
	err := m.SetTheme("my-custom")
	if err != nil {
		t.Fatalf("SetTheme to user theme failed: %v", err)
	}
	if m.GetCurrentTheme().Colors.Primary != "#ff0000" {
		t.Error("user theme colors not applied")
	}
}

func TestUserThemeCannotOverwriteBuiltin(t *testing.T) {
	dir := t.TempDir()
	themesDir := filepath.Join(dir, "themes")
	_ = os.MkdirAll(themesDir, 0755)

	// Try to create a user theme with builtin ID
	fake := types.Theme{
		ID:   "mongopal-dark",
		Name: "Fake Override",
		Colors: types.ThemeColors{
			Primary: "#ff0000",
		},
	}
	data, _ := json.MarshalIndent(fake, "", "  ")
	_ = os.WriteFile(filepath.Join(themesDir, "fake.json"), data, 0644)

	state := core.NewAppState()
	state.DisableEvents = true
	state.Emitter = &core.NoopEventEmitter{}
	m := NewThemeManager(state, dir)

	current := m.GetCurrentTheme()
	if current.Colors.Primary == "#ff0000" {
		t.Error("user theme should not override builtin")
	}
}

func TestGetThemesDir(t *testing.T) {
	m, dir := newTestManager(t)
	expected := filepath.Join(dir, "themes")
	if m.GetThemesDir() != expected {
		t.Errorf("expected %s, got %s", expected, m.GetThemesDir())
	}
}

func TestReloadUserThemes(t *testing.T) {
	dir := t.TempDir()
	state := core.NewAppState()
	state.DisableEvents = true
	state.Emitter = &core.NoopEventEmitter{}
	m := NewThemeManager(state, dir)

	// Initially no user themes
	initialCount := len(m.GetThemes())

	// Add a user theme file
	themesDir := filepath.Join(dir, "themes")
	userTheme := types.Theme{
		ID:   "hot-reload-test",
		Name: "Hot Reload Test",
		Colors: types.ThemeColors{
			Background: "#000000",
			Text:       "#ffffff",
			Primary:    "#00ff00",
		},
	}
	data, _ := json.MarshalIndent(userTheme, "", "  ")
	_ = os.WriteFile(filepath.Join(themesDir, "hot-reload.json"), data, 0644)

	m.ReloadUserThemes()
	if len(m.GetThemes()) != initialCount+1 {
		t.Errorf("expected %d themes after reload, got %d", initialCount+1, len(m.GetThemes()))
	}
}
