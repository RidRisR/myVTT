import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [react()],
    server: {
      port: parseInt(env.VITE_DEV_PORT || '5173'),
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
      setupFiles: ['./src/__test-utils__/setup.ts'],
    },
  }
})
