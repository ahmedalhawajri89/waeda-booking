import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Was tsconfig's job until TypeScript came out of the project. Stated here so
    // it stays a decision rather than a default: two comments in the source
    // (main.js on top-level await, the availability spec on `.at()`) rely on it.
    target: 'es2020',
  },
  test: {
    // The API's vendor tree ships other packages' JS specs; they are not ours.
    exclude: ['**/node_modules/**', 'api/**'],
  },
})
