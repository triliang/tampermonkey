import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// microlighter 用运行时 import(`./grammars/${lang}.js`) 按需加载 TextMate 语法文件；这是模板字符串
// 动态 import，Vite 核心不会静态分析它（需要额外插件），构建产物里不会自动带上 grammars/，
// 导致该导入在打包后的扩展里实际 404、被 microlighter 内部 .catch(() => null) 悄悄吞掉——
// 语法高亮因此完全失效且没有任何报错。手动把用到的语法文件复制到产物同级的 assets/grammars/，
// 使这个相对路径的运行时 import 能真正解析到文件。
function copyMicrolighterGrammars(): Plugin {
  let outDir = 'dist';
  return {
    name: 'copy-microlighter-grammars',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const destDir = path.resolve(rootDir, outDir, 'assets/grammars');
      mkdirSync(destDir, { recursive: true });
      cpSync(
        path.resolve(rootDir, 'node_modules/microlighter/dist/grammars/javascript.js'),
        path.join(destDir, 'javascript.js'),
      );
    },
  };
}

// Vite + CRXJS：manifest 中的源路径（.ts/.html/.png）由 CRXJS 自动打包并重写为 dist 路径。
// Preact JSX 通过 tsconfig 的 jsx/jsxImportSource 生效，无需额外 babel。
export default defineConfig({
  plugins: [
    crx({
      manifest,
      contentScripts: {
        // 按需注入的 content script 以自包含 IIFE 构建，文件名不带 .iife 约定后缀，
        // 便于 SW 通过 chrome.scripting.executeScript({ files }) 注入。
        standaloneFiles: ['src/content/index.ts'],
      },
    }),
    copyMicrolighterGrammars(),
  ],
  build: {
    target: 'chrome120',
  },
});
