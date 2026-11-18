import path from "node:path"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildExpressionWorker } from './scripts/build-expression-worker.mjs';

// https://vite.dev/config/
export default defineConfig({
  // Dependency symlinks may be shared by independent working copies. Keep each
  // app's optimized React modules separate and resolve one React instance.
  cacheDir: path.resolve(__dirname, '.cache/vite'),
  logLevel: 'error', // Suppress warnings, only show errors
  server: {
    fs: { deny: ['.env', '.env.*', '**/*.pem', '**/*.crt', '**/shared/question-bank/**', '**/shared/questionBankData.js', '**/data/**'] },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.BACKEND_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^.*questionBankData\.js$/, replacement: path.resolve(__dirname, 'src/lib/browserBankData.js') },
      { find: '@', replacement: path.resolve(__dirname, './src') }
    ],
  },
  plugins: [
    { name: 'expression-worker', buildStart: buildExpressionWorker },
    react(),
  ]
});
