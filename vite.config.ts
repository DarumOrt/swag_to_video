import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Cross-origin isolation is required for SharedArrayBuffer (multithreaded WASM in onnxruntime-web).
// `credentialless` instead of `require-corp` so model weights can still be fetched from Hugging Face.
// Keep in sync with vercel.json.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
  worker: { format: 'es' },
  build: { target: 'es2023' },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
