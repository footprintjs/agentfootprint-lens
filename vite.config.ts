import { defineConfig } from 'vite';

/**
 * Demo harness for the lens's views — the fast loop a tsup-built library
 * otherwise lacks. Imports the library from SOURCE (`../src`), so editing a
 * component hot-reloads here immediately.
 *
 *   npm run demo         → http://localhost:5174
 *   npm run demo:build   → a static bundle in demo-dist/
 *
 * No `@vitejs/plugin-react`: vite transforms `.tsx` through esbuild on its own
 * and the automatic JSX runtime is all this demo needs (fast refresh is the
 * only thing the plugin would add). One fewer dependency for a dev-only page.
 */
export default defineConfig({
  root: 'demo',
  server: { port: 5174 },
  esbuild: { jsx: 'automatic' },
  build: { outDir: '../demo-dist', emptyOutDir: true },
});
