import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'demo' ? process.env.DEMO_BASE ?? '/orbita/' : '/',
  define: { __ORBITA_DEMO__: JSON.stringify(mode === 'demo') },
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
  server: { proxy: { '/api': 'http://127.0.0.1:3000', '/ws': { target: 'ws://127.0.0.1:3000', ws: true } } },
}));
