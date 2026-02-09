// Configure Monaco Editor to use local files instead of CDN
// This is required for airgapped environments
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { ThemeColors } from './types/wails.d'

// Tell the loader to use our local monaco-editor package
loader.config({ monaco })

// Define custom themes globally (initial static definition for first paint)
monaco.editor.defineTheme('mongopal-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'string.key.json', foreground: '94a3b8' },
    { token: 'string.value.json', foreground: '4CC38A' },
    { token: 'number', foreground: 'f59e0b' },
    { token: 'keyword', foreground: 'a78bfa' },
  ],
  colors: {
    'editor.background': '#18181b',
    'editor.foreground': '#f4f4f5',
    'editorLineNumber.foreground': '#52525b',
    'editorLineNumber.activeForeground': '#a1a1aa',
    'editor.lineHighlightBackground': '#27272a',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#4CC38A40',
    'editor.selectionHighlightBackground': '#4CC38A20',
    'editorCursor.foreground': '#4CC38A',
    'editorGutter.background': '#18181b',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#52525b80',
    'scrollbarSlider.hoverBackground': '#71717a80',
    'scrollbarSlider.activeBackground': '#a1a1aa80',
    'editorWidget.background': '#27272a',
    'editorWidget.border': '#3f3f46',
    'input.background': '#18181b',
    'input.border': '#3f3f46',
    'input.foreground': '#f4f4f5',
    'focusBorder': '#4CC38A',
  }
})

monaco.editor.defineTheme('mongopal-diff-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'string.key.json', foreground: '94a3b8' },
    { token: 'string.value.json', foreground: '4CC38A' },
    { token: 'number', foreground: 'f59e0b' },
    { token: 'keyword', foreground: 'a78bfa' },
  ],
  colors: {
    'editor.background': '#18181b',
    'editor.foreground': '#f4f4f5',
    'editorLineNumber.foreground': '#52525b',
    'editorLineNumber.activeForeground': '#a1a1aa',
    'editor.lineHighlightBackground': '#27272a',
    'editor.lineHighlightBorder': '#00000000',
    // Diff highlighting - VERY visible for debugging
    'diffEditor.insertedTextBackground': '#00ff0080',  // bright green 50%
    'diffEditor.removedTextBackground': '#ff000080',   // bright red 50%
    'diffEditor.insertedLineBackground': '#00ff0040',  // bright green 25%
    'diffEditor.removedLineBackground': '#ff000040',   // bright red 25%
    'diffEditorGutter.insertedLineBackground': '#00ff00',  // solid green
    'diffEditorGutter.removedLineBackground': '#ff0000',   // solid red
    'diffEditor.diagonalFill': '#3f3f4680',
    // Border around changed regions
    'diffEditor.border': '#ffffff',
    'diffEditor.insertedTextBorder': '#00ff00',
    'diffEditor.removedTextBorder': '#ff0000',
    'editorGutter.background': '#18181b',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#52525b80',
    'scrollbarSlider.hoverBackground': '#71717a80',
    'scrollbarSlider.activeBackground': '#a1a1aa80',
  }
})

/** Return true when the hex background is perceptually light. */
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  // Relative luminance approximation
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

/**
 * Regenerate Monaco themes from the current ThemeColors.
 * Called by ThemeContext after applying a new theme.
 */
export function regenerateMonacoThemes(colors: ThemeColors): void {
  const primaryHex = colors.primary.replace('#', '')
  const light = isLightColor(colors.background)
  const base: 'vs' | 'vs-dark' = light ? 'vs' : 'vs-dark'

  // Token colors differ for light vs dark
  const tokenRules = light
    ? [
        { token: 'string.key.json', foreground: '4b5563' },
        { token: 'string.value.json', foreground: primaryHex },
        { token: 'number', foreground: 'b45309' },
        { token: 'keyword', foreground: '7c3aed' },
      ]
    : [
        { token: 'string.key.json', foreground: '94a3b8' },
        { token: 'string.value.json', foreground: primaryHex },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'keyword', foreground: 'a78bfa' },
      ]

  monaco.editor.defineTheme('mongopal-dark', {
    base,
    inherit: true,
    rules: tokenRules,
    colors: {
      'editor.background': colors.background,
      'editor.foreground': colors.text,
      'editorLineNumber.foreground': colors.surfaceActive,
      'editorLineNumber.activeForeground': colors.textMuted,
      'editor.lineHighlightBackground': colors.surface,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': colors.primary + '40',
      'editor.selectionHighlightBackground': colors.primary + '20',
      'editorCursor.foreground': colors.primary,
      'editorGutter.background': colors.background,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': colors.scrollbarThumb + '80',
      'scrollbarSlider.hoverBackground': colors.scrollbarThumbHover + '80',
      'scrollbarSlider.activeBackground': colors.textMuted + '80',
      'editorWidget.background': colors.surface,
      'editorWidget.border': colors.border,
      'input.background': colors.background,
      'input.border': colors.border,
      'input.foreground': colors.text,
      'focusBorder': colors.primary,
    }
  })

  monaco.editor.defineTheme('mongopal-diff-dark', {
    base,
    inherit: true,
    rules: tokenRules,
    colors: {
      'editor.background': colors.background,
      'editor.foreground': colors.text,
      'editorLineNumber.foreground': colors.surfaceActive,
      'editorLineNumber.activeForeground': colors.textMuted,
      'editor.lineHighlightBackground': colors.surface,
      'editor.lineHighlightBorder': '#00000000',
      'diffEditor.insertedTextBackground': light ? '#16a34a30' : '#00ff0080',
      'diffEditor.removedTextBackground': light ? '#dc262630' : '#ff000080',
      'diffEditor.insertedLineBackground': light ? '#16a34a18' : '#00ff0040',
      'diffEditor.removedLineBackground': light ? '#dc262618' : '#ff000040',
      'diffEditorGutter.insertedLineBackground': light ? '#dcfce7' : '#00ff00',
      'diffEditorGutter.removedLineBackground': light ? '#fee2e2' : '#ff0000',
      'diffEditor.diagonalFill': colors.border + '80',
      'diffEditor.border': light ? '#000000' : '#ffffff',
      'diffEditor.insertedTextBorder': light ? '#16a34a' : '#00ff00',
      'diffEditor.removedTextBorder': light ? '#dc2626' : '#ff0000',
      'editorGutter.background': colors.background,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': colors.scrollbarThumb + '80',
      'scrollbarSlider.hoverBackground': colors.scrollbarThumbHover + '80',
      'scrollbarSlider.activeBackground': colors.textMuted + '80',
    }
  })
}

// Export monaco for direct access if needed
export { monaco }
