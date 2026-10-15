import { build } from 'vite';
import { fileURLToPath } from 'node:url';
await build({configFile:false,root:fileURLToPath(new URL('../../',import.meta.url)),build:{target:'esnext',lib:{entry:fileURLToPath(new URL('./browser-entry.tsx',import.meta.url)),formats:['es'],fileName:()=> 'p2-browser.bundle.js'},outDir:'spike-v2/p2-generated',emptyOutDir:true,minify:false}});
