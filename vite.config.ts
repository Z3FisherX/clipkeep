import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ base: './', build: { outDir: 'dist', sourcemap: false,
  rollupOptions: { input: { main: resolve('index.html'), access: resolve('access.html') } } } });
