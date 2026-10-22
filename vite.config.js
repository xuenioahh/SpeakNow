import path from "node:path"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildExpressionWorker } from './scripts/build-expression-worker.mjs';

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.BACKEND_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    { name: 'expression-worker', buildStart: buildExpressionWorker },
    react(),
  ]
});
