/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme palette
        surface: {
          DEFAULT: '#18181b', // zinc-900
          secondary: '#27272a', // zinc-800
          tertiary: '#3f3f46', // zinc-700
        },
        border: {
          DEFAULT: '#3f3f46', // zinc-700
          light: '#52525b', // zinc-600
        },
        accent: {
          DEFAULT: '#4CC38A', // MongoDB green
          hover: '#5AD49B',
          muted: '#2D7A54',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
