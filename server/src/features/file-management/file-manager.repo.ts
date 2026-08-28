import { torrentItems } from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

export interface FileManagerTorrentFilesProvider {
  getTorrentFilePaths: () => Promise<string[]>;
}

export class FileManagerRepo implements FileManagerTorrentFilesProvider {
  private readonly database: BunSQLiteDatabase | null;

  constructor(database?: BunSQLiteDatabase) {
    this.database = database ?? null;
  }

  async getTorrentFilePaths(): Promise<string[]> {
    const database = this.database ?? (await import('@server/db')).default;
    const rows = await database
      .select({ files: torrentItems.files })
      .from(torrentItems);

    return rows.flatMap(({ files }) =>
      Array.isArray(files)
        ? files.filter((file): file is string => typeof file === 'string')
        : [],
    );
  }
}
