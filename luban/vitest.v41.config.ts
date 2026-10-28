import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',include:['tests/v4.1/**/*.test.ts']}});
