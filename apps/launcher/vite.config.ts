import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    // The controller serves the API; in development the launcher runs on Vite.
    proxy: { '/api': 'http://127.0.0.1:8765' },
  },
});
