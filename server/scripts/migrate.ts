import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

function resolveMigrationsDir(): string {
  const override: string | undefined = process.env.MIGRATIONS_DIR;
  if (override && override.trim().length > 0) return override;

  const candidates: string[] = [];

  // Preferred in production (Docker and single-build): ../migrations
  candidates.push(resolve(process.cwd(), '..', 'migrations'));

  // Local single-build fallback: ../server/src/db/migrations
  candidates.push(
    resolve(process.cwd(), '..', 'server', 'src', 'db', 'migrations')
  );

  // Dev (server workspace): src/db/migrations
  candidates.push(join(process.cwd(), 'src', 'db', 'migrations'));

  for (const dir of candidates) {
    const journal: string = join(dir, 'meta', '_journal.json');
    if (existsSync(journal)) {
      return dir;
    }
  }

  // Default to Docker production path; migrate() will throw a clear error
  return resolve(process.cwd(), '..', 'migrations');
}

export async function runMigrations(): Promise<void> {
  const databaseUrl: string | undefined = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    return;
  }

  const sqlite = new Database(databaseUrl);
  const db = drizzle({ client: sqlite });

  const migrationsFolder: string = resolveMigrationsDir();

  try {
    console.log('Running migrations from:', migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    sqlite.close();
  }
}

// If executed directly: run and exit
if (import.meta.main) {
  runMigrations().catch(() => {
    process.exit(1);
  });
}
