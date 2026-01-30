import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['integration/**/*.int.test.{js,jsx}'],
    setupFiles: ['./integration/setup.js'],
    globals: true,
    testTimeout: 10000, // Integration tests may take longer
  },
})
