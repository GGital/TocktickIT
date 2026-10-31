import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Backend runs on :3000. Proxying keeps the browser same-origin, so no CORS setup is needed.
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    // STYLE-01 asserts the real token values, so stylesheets must be applied in jsdom.
    css: true,
    globals: true,
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}'],
    // userEvent typing in jsdom runs past the 5 s default when every file runs in parallel; alone, each takes 1–3 s.
    testTimeout: 15_000,
  },
})
