import { defineConfig } from 'vitest/config';

// 单测走纯 Node 环境，不复用 vite.config.ts 的 crx 插件（插件会依赖扩展上下文）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
