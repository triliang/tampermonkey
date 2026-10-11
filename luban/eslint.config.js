import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// ESLint 9 flat config —— Phase 1 仅基础规则（未用变量报错，any 暂不拦截）。
// lint 不阻塞 build；完整规则集随 Phase 2 补充。
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'spike/**', 'fixtures/**', '*.config.js', 'eslint.config.js', 'vite.config.ts'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
