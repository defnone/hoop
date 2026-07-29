import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class SeriesDirectoryService {
  async removeEmptyDirectories(rootPath: string): Promise<string[]> {
    const normalizedRoot: string = this.normalizeRoot(rootPath);
    const removedPaths: string[] = [];

    await this.removeEmptyChildren(normalizedRoot, removedPaths, true);
    return removedPaths;
  }

  async testWriteAndDelete(rootPath: string): Promise<void> {
    const normalizedRoot: string = this.normalizeRoot(rootPath);
    const testDirectory: string = path.join(
      normalizedRoot,
      `.hoop-permission-test-${randomUUID()}`,
    );
    const testFile: string = path.join(testDirectory, 'test.txt');

    try {
      await mkdir(testDirectory);
      await writeFile(testFile, 'HOOP write and delete permission test');
      await unlink(testFile);
      await rmdir(testDirectory);
    } catch (error: unknown) {
      await unlink(testFile).catch(() => undefined);
      await rmdir(testDirectory).catch(() => undefined);
      throw error;
    }
  }

  private normalizeRoot(rootPath: string): string {
    const trimmedPath: string = rootPath.trim();
    if (!path.isAbsolute(trimmedPath)) {
      throw new Error('Series directory path must be absolute');
    }

    const normalizedRoot: string = path.resolve(trimmedPath);
    if (path.dirname(normalizedRoot) === normalizedRoot) {
      throw new Error('Filesystem root cannot be used as Series Directory');
    }
    return normalizedRoot;
  }

  private async removeEmptyChildren(
    directoryPath: string,
    removedPaths: string[],
    isRoot = false,
  ): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childPath: string = path.join(directoryPath, entry.name);
      await this.removeEmptyChildren(childPath, removedPaths);
    }

    const remainingEntries = await readdir(directoryPath);
    if (remainingEntries.length > 0 || isRoot) return;

    await rmdir(directoryPath);
    removedPaths.push(directoryPath);
  }
}
