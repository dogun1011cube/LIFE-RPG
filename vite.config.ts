import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the production build also works when served from a sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 1500 },
});
