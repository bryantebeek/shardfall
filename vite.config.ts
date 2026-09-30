import { defineConfig } from 'vite';

export default defineConfig({
  // reachable from the other devices on the tailnet (dev server only)
  server: { port: 7427, strictPort: true, host: true, allowedHosts: ['.ts.net', 'framework-desktop'] },
});
