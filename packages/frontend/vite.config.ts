import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
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
