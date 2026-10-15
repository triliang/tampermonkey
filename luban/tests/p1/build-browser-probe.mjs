import { build } from 'vite';
import { fileURLToPath } from 'node:url';
await build({ configFile: false, root: fileURLToPath(new URL('../../', import.meta.url)), build: {
  lib: { entry: fileURLToPath(new URL('./browser-entry.ts', import.meta.url)), formats: ['es'], fileName: () => 'p1-browser.bundle.js' },
  outDir: 'spike-v2', emptyOutDir: false, minify: false, sourcemap: false,
} });
