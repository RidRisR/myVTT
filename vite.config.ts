import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@myvtt/sdk': resolve(__dirname, 'src/rules/sdk.ts'),
      },
    },
    server: {
      port: parseInt(env.VITE_DEV_PORT || '5173'),
      proxy: {
        '/api': {
          target: `http://localhost:${env.VITE_SERVER_PORT || '4444'}`,
          changeOrigin: true,
        },
        '/socket.io': {
          target: `http://localhost:${env.VITE_SERVER_PORT || '4444'}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: [
        'src/**/*.test.{ts,tsx}',
        'plugins/**/*.test.{ts,tsx}',
        'server/**/*.test.{ts,mjs}',
      ],
      environmentMatchGlobs: [['server/**', 'node']],
      setupFiles: ['./src/__test-utils__/setup.ts'],
      coverage: {
        provider: 'v8',
        exclude: ['src/sandbox/**', 'src/combat/**'],
        thresholds: {
          statements: 70,
          branches: 55,
          functions: 60,
          lines: 70,
        },
      },
    },
  }
})
