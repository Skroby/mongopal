package main

import "github.com/peternagy/mongopal/internal/types"

// =============================================================================
// Theme Methods — Thin Facade for Wails Bindings
// =============================================================================

// GetThemes returns all available themes (builtin + user).
func (a *App) GetThemes() []types.Theme {
	return a.theme.GetThemes()
}

// GetCurrentTheme returns the active theme.
func (a *App) GetCurrentTheme() types.Theme {
	return a.theme.GetCurrentTheme()
}

// SetTheme switches to the given theme ID and persists the choice.
func (a *App) SetTheme(themeID string) error {
	return a.theme.SetTheme(themeID)
}

// ReloadThemes rescans the user themes directory.
func (a *App) ReloadThemes() {
	a.theme.ReloadUserThemes()
}

// GetThemesDir returns the path to the user themes directory.
func (a *App) GetThemesDir() string {
	return a.theme.GetThemesDir()
}

// OpenThemesDir opens the themes directory in the OS file manager.
func (a *App) OpenThemesDir() error {
	return a.theme.OpenThemesDir()
}
