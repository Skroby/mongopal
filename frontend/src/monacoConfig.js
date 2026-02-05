// Configure Monaco Editor to use local files instead of CDN
// This is required for airgapped environments
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Tell the loader to use our local monaco-editor package
loader.config({ monaco })

// Define custom themes globally
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

// Export monaco for direct access if needed
export { monaco }
