import { resolve } from 'path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  root: resolve(__dirname),
  base: '/',
  build: {
    outDir: resolve(__dirname, '..', 'public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        wiki: resolve(__dirname, 'wiki.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
});
