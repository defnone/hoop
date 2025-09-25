import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    pool: 'threads',
    coverage: { provider: 'v8' },
    include: [
      'src/**/*.{test,spec}.ts',
      'src/**/*.{test,spec}.tsx',
      'test/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.tsx',
    ],
  },
});
