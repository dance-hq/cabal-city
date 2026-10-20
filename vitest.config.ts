import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

for (const file of ['.env.local', '.env.development.local', '.env.test.local']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration tests share one Supabase project; run files one at a time.
    fileParallelism: false,
  },
})
