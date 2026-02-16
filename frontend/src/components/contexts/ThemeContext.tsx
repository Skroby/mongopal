import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, JSX } from 'react'
import { EventsOn, EventsOff } from '../../../wailsjs/runtime/runtime'
import { regenerateMonacoThemes } from '../../monacoConfig'
import type { Theme, ThemeColors } from '../../types/wails.d'

// ============================================================================
// Font Options
// ============================================================================

export interface FontOption {
  id: string
  label: string
  value: string
}

export const UI_FONTS: FontOption[] = [
  { id: 'system', label: 'System Default', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif" },
  { id: 'inter', label: 'Inter', value: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" },
  { id: 'sf-pro', label: 'SF Pro', value: "'SF Pro Display', 'SF Pro', -apple-system, sans-serif" },
  { id: 'segoe', label: 'Segoe UI', value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
]

export const MONO_FONTS: FontOption[] = [
  { id: 'jetbrains', label: 'JetBrains Mono', value: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace" },
  { id: 'sf-mono', label: 'SF Mono', value: "'SF Mono', SFMono-Regular, Menlo, monospace" },
  { id: 'menlo', label: 'Menlo', value: "Menlo, Monaco, 'Courier New', monospace" },
  { id: 'consolas', label: 'Consolas', value: "Consolas, 'Courier New', monospace" },
  { id: 'fira-code', label: 'Fira Code', value: "'Fira Code', 'JetBrains Mono', monospace" },
]

const FONTS_STORAGE_KEY = 'mongopal-fonts'

interface FontPrefs {
  uiFontId: string
  monoFontId: string
}

function loadFontPrefs(): FontPrefs {
  try {
    const saved = localStorage.getItem(FONTS_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return { uiFontId: 'system', monoFontId: 'jetbrains' }
}

function saveFontPrefs(prefs: FontPrefs): void {
  try {
    localStorage.setItem(FONTS_STORAGE_KEY, JSON.stringify(prefs))
  } catch { /* ignore */ }
}

// ============================================================================
// Apply helpers
// ============================================================================

const COLOR_MAP: Record<keyof ThemeColors, string> = {
  background: '--color-background',
  surface: '--color-surface',
  surfaceHover: '--color-surface-hover',
  surfaceActive: '--color-surface-active',
  textDim: '--color-text-dim',
  textMuted: '--color-text-muted',
  textSecondary: '--color-text-secondary',
  textLight: '--color-text-light',
  text: '--color-text',
  border: '--color-border',
  borderLight: '--color-border-light',
  borderHover: '--color-border-hover',
  primary: '--color-primary',
  primaryHover: '--color-primary-hover',
  primaryMuted: '--color-primary-muted',
  error: '--color-error',
  errorDark: '--color-error-dark',
  warning: '--color-warning',
  warningDark: '--color-warning-dark',
  success: '--color-success',
  successDark: '--color-success-dark',
  info: '--color-info',
  infoDark: '--color-info-dark',
  scrollbarTrack: '--color-scrollbar-track',
  scrollbarThumb: '--color-scrollbar-thumb',
  scrollbarThumbHover: '--color-scrollbar-thumb-hover',
}

export function applyThemeColors(colors: ThemeColors): void {
  const root = document.documentElement
  for (const [key, cssVar] of Object.entries(COLOR_MAP)) {
    const value = colors[key as keyof ThemeColors]
    if (value) {
      root.style.setProperty(cssVar, value)
    }
  }
  // Regenerate Monaco editor themes to match
  regenerateMonacoThemes(colors)
}

export function applyFonts(uiFontId: string, monoFontId: string): void {
  const uiFont = UI_FONTS.find(f => f.id === uiFontId)?.value ?? UI_FONTS[0].value
  const monoFont = MONO_FONTS.find(f => f.id === monoFontId)?.value ?? MONO_FONTS[0].value
  const root = document.documentElement
  root.style.setProperty('--font-ui', uiFont)
  root.style.setProperty('--font-mono', monoFont)
}

// ============================================================================
// Context
// ============================================================================

interface ThemeContextValue {
  themes: Theme[]
  currentTheme: Theme | null
  setTheme: (themeId: string) => Promise<void>
  reloadThemes: () => Promise<void>
  openThemesDir: () => Promise<void>
  uiFontId: string
  monoFontId: string
  setUIFont: (fontId: string) => void
  setMonoFont: (fontId: string) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

// ============================================================================
// Provider
// ============================================================================

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps): JSX.Element {
  const [themes, setThemes] = useState<Theme[]>([])
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null)
  const [fontPrefs, setFontPrefs] = useState<FontPrefs>(loadFontPrefs)

  // Fetch initial theme from backend
  useEffect(() => {
    const go = window.go?.main?.App

    const init = async () => {
      try {
        if (go?.GetCurrentTheme) {
          const theme = await go.GetCurrentTheme()
          setCurrentTheme(theme)
          applyThemeColors(theme.colors)
        }
        if (go?.GetThemes) {
          const all = await go.GetThemes()
          setThemes(all)
        }
      } catch (err) {
        console.error('Failed to load theme:', err)
      }
    }

    init()
  }, [])

  // Apply fonts on mount and when changed
  useEffect(() => {
    applyFonts(fontPrefs.uiFontId, fontPrefs.monoFontId)
  }, [fontPrefs])

  // Listen for theme events from backend
  useEffect(() => {
    EventsOn('theme:changed', (theme: Theme) => {
      setCurrentTheme(theme)
      applyThemeColors(theme.colors)
    })
    EventsOn('theme:list-changed', () => {
      const go = window.go?.main?.App
      if (go?.GetThemes) {
        go.GetThemes().then(setThemes).catch(console.error)
      }
    })

    return () => {
      EventsOff('theme:changed')
      EventsOff('theme:list-changed')
    }
  }, [])

  const setThemeById = useCallback(async (themeId: string) => {
    const go = window.go?.main?.App
    if (go?.SetTheme) {
      await go.SetTheme(themeId)
      // Event listener will handle the state update
    }
  }, [])

  const reloadThemes = useCallback(async () => {
    const go = window.go?.main?.App
    if (go?.ReloadThemes) {
      await go.ReloadThemes()
      // Event listener will handle the state update
    }
  }, [])

  const openThemesDir = useCallback(async () => {
    const go = window.go?.main?.App
    if (go?.OpenThemesDir) {
      await go.OpenThemesDir()
    }
  }, [])

  const setUIFont = useCallback((fontId: string) => {
    setFontPrefs(prev => {
      const next = { ...prev, uiFontId: fontId }
      saveFontPrefs(next)
      return next
    })
  }, [])

  const setMonoFont = useCallback((fontId: string) => {
    setFontPrefs(prev => {
      const next = { ...prev, monoFontId: fontId }
      saveFontPrefs(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({
    themes,
    currentTheme,
    setTheme: setThemeById,
    reloadThemes,
    openThemesDir,
    uiFontId: fontPrefs.uiFontId,
    monoFontId: fontPrefs.monoFontId,
    setUIFont,
    setMonoFont,
  }), [themes, currentTheme, setThemeById, reloadThemes, openThemesDir, fontPrefs, setUIFont, setMonoFont])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
