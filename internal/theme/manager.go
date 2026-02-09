// Package theme manages application themes (builtin + user-defined).
package theme

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// ThemeManager handles theme loading, switching, and persistence.
type ThemeManager struct {
	state     *core.AppState
	configDir string
	themesDir string

	mu       sync.RWMutex
	themes   map[string]types.Theme
	configID string // active theme ID
}

// NewThemeManager creates a new ThemeManager and loads all themes.
func NewThemeManager(state *core.AppState, configDir string) *ThemeManager {
	themesDir := filepath.Join(configDir, "themes")
	_ = os.MkdirAll(themesDir, 0755)

	m := &ThemeManager{
		state:     state,
		configDir: configDir,
		themesDir: themesDir,
		themes:    make(map[string]types.Theme),
	}

	m.loadBuiltinThemes()
	m.loadUserThemes()
	m.loadConfig()

	return m
}

// ---------- Built-in themes ----------

func (m *ThemeManager) loadBuiltinThemes() {
	m.themes["mongopal-dark"] = types.Theme{
		ID:      "mongopal-dark",
		Name:    "MongoPal Dark",
		Author:  "MongoPal",
		Builtin: true,
		Colors: types.ThemeColors{
			Background:          "#18181b",
			Surface:             "#27272a",
			SurfaceHover:        "#3f3f46",
			SurfaceActive:       "#52525b",
			TextDim:             "#71717a",
			TextMuted:           "#a1a1aa",
			TextSecondary:       "#d4d4d8",
			TextLight:           "#e4e4e7",
			Text:                "#f4f4f5",
			Border:              "#3f3f46",
			BorderLight:         "#52525b",
			BorderHover:         "#71717a",
			Primary:             "#4CC38A",
			PrimaryHover:        "#5AD49B",
			PrimaryMuted:        "#2D7A54",
			Error:               "#f87171",
			ErrorDark:           "#7f1d1d",
			Warning:             "#fbbf24",
			WarningDark:         "#78350f",
			Success:             "#4ade80",
			SuccessDark:         "#14532d",
			Info:                "#60a5fa",
			InfoDark:            "#1e3a5f",
			ScrollbarTrack:      "#27272a",
			ScrollbarThumb:      "#52525b",
			ScrollbarThumbHover: "#71717a",
		},
	}

	m.themes["mongopal-light"] = types.Theme{
		ID:      "mongopal-light",
		Name:    "MongoPal Light",
		Author:  "MongoPal",
		Builtin: true,
		Colors: types.ThemeColors{
			Background:          "#f4f4f5",
			Surface:             "#ffffff",
			SurfaceHover:        "#e4e4e7",
			SurfaceActive:       "#d4d4d8",
			TextDim:             "#71717a",
			TextMuted:           "#52525b",
			TextSecondary:       "#3f3f46",
			TextLight:           "#27272a",
			Text:                "#18181b",
			Border:              "#d4d4d8",
			BorderLight:         "#e4e4e7",
			BorderHover:         "#a1a1aa",
			Primary:             "#059669",
			PrimaryHover:        "#047857",
			PrimaryMuted:        "#a7f3d0",
			Error:               "#dc2626",
			ErrorDark:           "#fee2e2",
			Warning:             "#d97706",
			WarningDark:         "#fef3c7",
			Success:             "#16a34a",
			SuccessDark:         "#dcfce7",
			Info:                "#2563eb",
			InfoDark:            "#dbeafe",
			ScrollbarTrack:      "#e4e4e7",
			ScrollbarThumb:      "#a1a1aa",
			ScrollbarThumbHover: "#71717a",
		},
	}
}

// ---------- User themes ----------

func (m *ThemeManager) loadUserThemes() {
	entries, err := os.ReadDir(m.themesDir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		data, err := os.ReadFile(filepath.Join(m.themesDir, entry.Name()))
		if err != nil {
			continue
		}

		var t types.Theme
		if err := json.Unmarshal(data, &t); err != nil {
			continue
		}

		// Require at minimum an id and name
		if t.ID == "" || t.Name == "" {
			continue
		}

		// Never let a user theme overwrite a builtin
		if _, exists := m.themes[t.ID]; exists {
			if m.themes[t.ID].Builtin {
				continue
			}
		}

		t.Builtin = false
		m.themes[t.ID] = t
	}
}

// ---------- Config persistence ----------

func (m *ThemeManager) configPath() string {
	return filepath.Join(m.configDir, "theme_config.json")
}

func (m *ThemeManager) loadConfig() {
	data, err := os.ReadFile(m.configPath())
	if err != nil {
		m.configID = "mongopal-dark"
		return
	}

	var cfg types.ThemeConfig
	if err := json.Unmarshal(data, &cfg); err != nil || cfg.ActiveThemeID == "" {
		m.configID = "mongopal-dark"
		return
	}

	// Verify the theme exists
	if _, ok := m.themes[cfg.ActiveThemeID]; !ok {
		m.configID = "mongopal-dark"
		return
	}

	m.configID = cfg.ActiveThemeID
}

func (m *ThemeManager) saveConfig() error {
	cfg := types.ThemeConfig{ActiveThemeID: m.configID}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal theme config: %w", err)
	}
	return os.WriteFile(m.configPath(), data, 0644)
}

// ---------- Public API ----------

// GetThemes returns all available themes (builtin + user).
func (m *ThemeManager) GetThemes() []types.Theme {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]types.Theme, 0, len(m.themes))
	// Builtins first
	for _, t := range m.themes {
		if t.Builtin {
			result = append(result, t)
		}
	}
	for _, t := range m.themes {
		if !t.Builtin {
			result = append(result, t)
		}
	}
	return result
}

// GetCurrentTheme returns the active theme.
func (m *ThemeManager) GetCurrentTheme() types.Theme {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if t, ok := m.themes[m.configID]; ok {
		return t
	}
	return m.themes["mongopal-dark"]
}

// SetTheme switches to the given theme ID and persists the choice.
func (m *ThemeManager) SetTheme(themeID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.themes[themeID]; !ok {
		return fmt.Errorf("theme not found: %s", themeID)
	}

	m.configID = themeID
	if err := m.saveConfig(); err != nil {
		return err
	}

	t := m.themes[themeID]
	m.state.EmitEvent("theme:changed", t)
	return nil
}

// ReloadUserThemes rescans the themes directory for new/modified user themes.
func (m *ThemeManager) ReloadUserThemes() {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Remove existing user themes
	for id, t := range m.themes {
		if !t.Builtin {
			delete(m.themes, id)
		}
	}

	m.loadUserThemes()
	m.state.EmitEvent("theme:list-changed", nil)
}

// GetThemesDir returns the path to the user themes directory.
func (m *ThemeManager) GetThemesDir() string {
	return m.themesDir
}

// OpenThemesDir opens the themes directory in the OS file manager.
func (m *ThemeManager) OpenThemesDir() error {
	_ = os.MkdirAll(m.themesDir, 0755)

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", m.themesDir)
	case "linux":
		cmd = exec.Command("xdg-open", m.themesDir)
	case "windows":
		cmd = exec.Command("explorer", m.themesDir)
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
	return cmd.Start()
}
