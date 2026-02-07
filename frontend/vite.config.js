import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditor from 'vite-plugin-monaco-editor'

export default defineConfig({
  plugins: [
    react(),
    monacoEditor.default({
      // Only include JSON language support (that's all we need for MongoDB documents)
      languageWorkers: ['json'],
      // Don't include other features we don't need
      customWorkers: [],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep Monaco editor in its own chunk
          'monaco-editor': ['monaco-editor'],
        },
      },
    },
  },
  // Optimize Monaco - only include JSON language
  optimizeDeps: {
    include: ['monaco-editor'],
  },
  server: {
    port: 5280,
    strictPort: true,
    hmr: {
      host: 'localhost',
      port: 5280,
      protocol: 'ws',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  },
})
