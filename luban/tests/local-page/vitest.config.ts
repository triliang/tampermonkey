import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',include:['tests/local-page/**/*.test.ts'],testTimeout:20000}});
