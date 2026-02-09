/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic gray scale
        background: 'var(--color-background)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          hover: 'var(--color-surface-hover)',
          active: 'var(--color-surface-active)',
          // Legacy aliases kept during migration
          secondary: 'var(--color-surface)',
          tertiary: 'var(--color-surface-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          light: 'var(--color-border-light)',
          hover: 'var(--color-border-hover)',
        },
        // Primary (the accent color)
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          muted: 'var(--color-primary-muted)',
        },
        // Keep accent as alias for backward compat during migration
        accent: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          muted: 'var(--color-primary-muted)',
        },
        // Semantic text colors
        text: {
          DEFAULT: 'var(--color-text)',
          light: 'var(--color-text-light)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          dim: 'var(--color-text-dim)',
        },
        // Status colors
        error: { DEFAULT: 'var(--color-error)', dark: 'var(--color-error-dark)' },
        warning: { DEFAULT: 'var(--color-warning)', dark: 'var(--color-warning-dark)' },
        success: { DEFAULT: 'var(--color-success)', dark: 'var(--color-success-dark)' },
        info: { DEFAULT: 'var(--color-info)', dark: 'var(--color-info-dark)' },
      },
      fontFamily: {
        sans: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  // Safelist dynamically-applied classes that Tailwind can't detect via static analysis
  safelist: [
    'bg-background',
    'bg-surface',
    'bg-surface-hover',
    'bg-surface-active',
    'bg-primary',
    'bg-primary-hover',
    'bg-primary-muted',
    'text-text',
    'text-text-light',
    'text-text-secondary',
    'text-text-muted',
    'text-text-dim',
    'text-primary',
    'text-error',
    'text-warning',
    'text-success',
    'text-info',
    'border-border',
    'border-border-light',
    'border-primary',
  ],
  plugins: [],
}
