import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'threads',
    coverage: { provider: 'v8' },
    include: [
      'src/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.ts',
    ],
  },
});
