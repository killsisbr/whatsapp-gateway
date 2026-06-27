import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/**/*.test.skip.ts', 'src/**/*.test.skip.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      threshold: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60
      }
    },
    testTimeout: 10000,
    sequence: {
      concurrent: false,
      shuffle: false
    }
  }
});
