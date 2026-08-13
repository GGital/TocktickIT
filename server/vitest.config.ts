import { defineConfig } from 'vitest/config'

// Node's built-in .env loader — keeps DATABASE_URL out of the repo without a dotenv dependency.
process.loadEnvFile('.env')

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
