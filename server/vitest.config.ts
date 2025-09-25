import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@server': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    pool: 'threads',
    coverage: {
      provider: 'v8',
      exclude: [
        'drizzle.config.ts',
        'eslint.config.mjs',
        'scripts/**/*',
        'dist/**/*',
        'vitest.config.ts',
        'src/index.ts',
        'src/db/index.ts',
        'src/db/auth/auth-schema.ts',
        'src/external/**/index.ts',
      ],
    },
  },
});
