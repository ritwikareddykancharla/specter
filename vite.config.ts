import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two pages: the Specter dashboard and the demo storefront it haunts.
// Same origin, so the dashboard can drive the storefront in an iframe.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5177 },
  build: {
    rolldownOptions: {
      input: { main: 'index.html', target: 'target/index.html' },
    },
  },
});
