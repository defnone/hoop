import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SeriesDirectoryService } from '@server/features/file-management/series-directory.service';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('SeriesDirectoryService', () => {
  it('removes nested empty directories but preserves root and non-empty trees', async () => {
    const root = await createRoot();
    const emptyLeaf = path.join(root, 'Empty Show', 'Season 01');
    const populatedDirectory = path.join(root, 'Populated Show', 'Season 01');
    await mkdir(emptyLeaf, { recursive: true });
    await mkdir(populatedDirectory, { recursive: true });
    await writeFile(path.join(populatedDirectory, 'S01E01.mkv'), 'video');

    const removed = await new SeriesDirectoryService().removeEmptyDirectories(
      root,
    );

    expect(removed).toEqual([emptyLeaf, path.join(root, 'Empty Show')]);
    expect(await readdir(root)).toEqual(['Populated Show']);
  });

  it('tests write and delete without leaving artifacts', async () => {
    const root = await createRoot();

    await new SeriesDirectoryService().testWriteAndDelete(root);

    expect(await readdir(root)).toEqual([]);
  });

  it('rejects relative paths and filesystem root', async () => {
    const service = new SeriesDirectoryService();

    await expect(service.removeEmptyDirectories('relative')).rejects.toThrow(
      'Series directory path must be absolute',
    );
    await expect(
      service.removeEmptyDirectories(path.parse('/').root),
    ).rejects.toThrow('Filesystem root cannot be used as Series Directory');
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hoop-series-directory-'));
  roots.push(root);
  return root;
}
