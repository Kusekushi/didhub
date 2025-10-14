import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// Workaround: some bundlers/optimizers probe non-existent paths inside newer
// `uuid` releases (for example `dist/esm-browser`). Force Vite to resolve the
// package to the shipped ESM bundle to avoid ENOENT during dependency
// optimization.
export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
  // Pre-bundle `uuid` explicitly so Vite's dependency optimizer doesn't probe
  // non-exported deep paths. Avoid mapping to a deep internal path (like
  // `uuid/dist/index.js`) because the package uses an `exports` map and
  // deep imports are rejected by Node semantics and Vite's import analysis.
  optimizeDeps: {
    include: ['uuid'],
  },
  build: {
    sourcemap: false,
  },
  esbuild: { legalComments: 'none' },
  server: {
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET || 'http://localhost:6000',
      '/uploads': process.env.VITE_API_PROXY_TARGET || 'http://localhost:6000',
      '/metrics': process.env.VITE_API_PROXY_TARGET || 'http://localhost:6000',
      '/health': process.env.VITE_API_PROXY_TARGET || 'http://localhost:6000',
    },
  },
});
