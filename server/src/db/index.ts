import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';

const sqlite = new Database(process.env.DATABASE_URL!);
const db = drizzle({ client: sqlite });

export default db;
