import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: parseInt(env.VITE_DEV_PORT || '5173'),
      proxy: {
        '/api': {
          target: `http://localhost:${env.VITE_SERVER_PORT || '4444'}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'server/**/*.test.{ts,mjs}'],
      environmentMatchGlobs: [['server/**', 'node']],
      setupFiles: ['./src/__test-utils__/setup.ts'],
      coverage: {
        provider: 'v8',
        thresholds: {
          statements: 80,
          branches: 65,
          functions: 75,
          lines: 80,
        },
      },
    },
  }
})
