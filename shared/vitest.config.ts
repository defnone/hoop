import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'threads',
    coverage: {
      provider: 'v8',
      exclude: [
        // Exclude type-only modules from coverage
        'src/**/*.types.ts',
        'src/**/types.ts',
      ],
    },
    include: [
      'src/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.ts',
    ],
  },
});
