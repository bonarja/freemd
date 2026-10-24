import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5813',
      '/media': 'http://localhost:5813'
    }
  },
  build: {
    outDir: 'dist'
  }
});
