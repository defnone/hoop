import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  out: './src/db/migrations',
  schema: ['./src/db/app/app-schema.ts', './src/db/auth/auth-schema.ts'],
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
