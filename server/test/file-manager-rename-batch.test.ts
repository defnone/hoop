import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async getSettings(): Promise<null> {
      return null;
    }
  },
}));

import {
  FileManagerError,
  FileManagerService,
} from '@server/features/file-management/file-manager.service';

const testRoot = path.join(process.cwd(), 'test', '.tmp-file-manager-batch');
const mediaRoot = path.join(testRoot, 'media');
const downloadsRoot = path.join(testRoot, 'downloads');

function createService(
  torrentFilesProvider: {
    getTorrentFilePaths: () => Promise<string[]>;
  } = { getTorrentFilePaths: async () => [] },
): FileManagerService {
  return new FileManagerService({
    settingsService: {
      getSettings: async () => ({
        mediaDir: mediaRoot,
        downloadDir: downloadsRoot,
      }),
    },
    torrentFilesProvider,
  });
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

beforeEach(async () => {
  await fs.promises.rm(testRoot, { recursive: true, force: true });
  await fs.promises.mkdir(mediaRoot, { recursive: true });
  await fs.promises.mkdir(downloadsRoot, { recursive: true });
});

afterEach(async () => {
  await fs.promises.rm(testRoot, { recursive: true, force: true });
});

describe('FileManagerService.renameBatch', () => {
  it('renames items in request order and returns matching entries', async () => {
    await writeFile(path.join(mediaRoot, 'first.txt'), 'first');
    await writeFile(path.join(mediaRoot, 'second.txt'), 'second');
    const getTorrentFilePaths = vi.fn<() => Promise<string[]>>(async () => []);

    const result = await createService({ getTorrentFilePaths }).renameBatch(
      'media',
      [
        { path: 'first.txt', name: 'renamed-first.txt' },
        { path: 'second.txt', name: 'renamed-second.txt' },
      ],
    );

    expect(result.map((entry) => entry.path)).toEqual([
      'renamed-first.txt',
      'renamed-second.txt',
    ]);
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'renamed-first.txt'), 'utf8'),
    ).resolves.toBe('first');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'renamed-second.txt'), 'utf8'),
    ).resolves.toBe('second');
    expect(getTorrentFilePaths).toHaveBeenCalledTimes(1);
  });

  it('renames swaps without overwriting either source', async () => {
    await writeFile(path.join(mediaRoot, 'first.txt'), 'first');
    await writeFile(path.join(mediaRoot, 'second.txt'), 'second');

    await createService().renameBatch('media', [
      { path: 'first.txt', name: 'second.txt' },
      { path: 'second.txt', name: 'first.txt' },
    ]);

    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'first.txt'), 'utf8'),
    ).resolves.toBe('second');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'second.txt'), 'utf8'),
    ).resolves.toBe('first');
  });

  it('renames a three-item cycle without losing content', async () => {
    await writeFile(path.join(mediaRoot, 'first.txt'), 'first');
    await writeFile(path.join(mediaRoot, 'second.txt'), 'second');
    await writeFile(path.join(mediaRoot, 'third.txt'), 'third');

    await createService().renameBatch('media', [
      { path: 'first.txt', name: 'second.txt' },
      { path: 'second.txt', name: 'third.txt' },
      { path: 'third.txt', name: 'first.txt' },
    ]);

    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'first.txt'), 'utf8'),
    ).resolves.toBe('third');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'second.txt'), 'utf8'),
    ).resolves.toBe('first');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'third.txt'), 'utf8'),
    ).resolves.toBe('second');
  });

  it('keeps no-op items while renaming other items', async () => {
    await writeFile(path.join(mediaRoot, 'same.txt'), 'same');
    await writeFile(path.join(mediaRoot, 'change.txt'), 'change');

    const result = await createService().renameBatch('media', [
      { path: 'same.txt', name: 'same.txt' },
      { path: 'change.txt', name: 'changed.txt' },
    ]);

    expect(result.map((entry) => entry.path)).toEqual([
      'same.txt',
      'changed.txt',
    ]);
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'same.txt'), 'utf8'),
    ).resolves.toBe('same');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'changed.txt'), 'utf8'),
    ).resolves.toBe('change');
  });

  it('preflights duplicate destinations and existing conflicts', async () => {
    await writeFile(path.join(mediaRoot, 'first.txt'), 'first');
    await writeFile(path.join(mediaRoot, 'second.txt'), 'second');
    await writeFile(path.join(mediaRoot, 'existing.txt'), 'existing');

    await expect(
      createService().renameBatch('media', [
        { path: 'first.txt', name: 'same.txt' },
        { path: 'second.txt', name: 'same.txt' },
      ]),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Duplicate destination path',
    });
    await expect(
      createService().renameBatch('media', [
        { path: 'first.txt', name: 'existing.txt' },
        { path: 'second.txt', name: 'renamed.txt' },
      ]),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Destination already exists',
    });

    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'first.txt'), 'utf8'),
    ).resolves.toBe('first');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'second.txt'), 'utf8'),
    ).resolves.toBe('second');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'existing.txt'), 'utf8'),
    ).resolves.toBe('existing');
  });

  it('rolls back staged and published items after a later failure', async () => {
    await writeFile(path.join(mediaRoot, 'first.txt'), 'first');
    await writeFile(path.join(mediaRoot, 'second.txt'), 'second');
    const destinationPath = path.join(mediaRoot, 'renamed-second.txt');
    const originalRename = fs.promises.rename.bind(fs.promises);
    const renameSpy = vi
      .spyOn(fs.promises, 'rename')
      .mockImplementation(async (sourcePath, targetPath) => {
        if (String(targetPath) === destinationPath) {
          throw Object.assign(new Error('permission denied'), {
            code: 'EACCES',
          });
        }
        return await originalRename(sourcePath, targetPath);
      });

    try {
      await expect(
        createService().renameBatch('media', [
          { path: 'first.txt', name: 'renamed-first.txt' },
          { path: 'second.txt', name: 'renamed-second.txt' },
        ]),
      ).rejects.toMatchObject({ status: 422, message: 'Permission denied' });
    } finally {
      renameSpy.mockRestore();
    }

    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'first.txt'), 'utf8'),
    ).resolves.toBe('first');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'second.txt'), 'utf8'),
    ).resolves.toBe('second');
    await expect(
      fs.promises.access(path.join(mediaRoot, 'renamed-first.txt')),
    ).rejects.toThrow();
    await expect(
      fs.promises.access(path.join(mediaRoot, 'renamed-second.txt')),
    ).rejects.toThrow();
    const remainingNames = await fs.promises.readdir(mediaRoot);
    expect(remainingNames).toEqual(['first.txt', 'second.txt']);
  });

  it('serializes concurrent batches and rejects the later destination conflict', async () => {
    await writeFile(path.join(mediaRoot, 'first.txt'), 'first');
    await writeFile(path.join(mediaRoot, 'second.txt'), 'second');

    const results = await Promise.allSettled([
      createService().renameBatch('media', [
        { path: 'first.txt', name: 'same.txt' },
      ]),
      createService().renameBatch('media', [
        { path: 'second.txt', name: 'same.txt' },
      ]),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { status: 409, message: 'Destination already exists' },
    });
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'same.txt'), 'utf8'),
    ).resolves.toMatch(/^(first|second)$/);
  });

  it('builds response entries from committed metadata', async () => {
    await writeFile(path.join(mediaRoot, 'first.txt'), 'first');
    const destinationPath = path.join(mediaRoot, 'renamed.txt');
    let committed = false;
    const originalRename = fs.promises.rename.bind(fs.promises);
    const originalLstat = fs.promises.lstat.bind(fs.promises);
    const renameSpy = vi
      .spyOn(fs.promises, 'rename')
      .mockImplementation(async (sourcePath, targetPath) => {
        const result = await originalRename(sourcePath, targetPath);
        if (String(targetPath) === destinationPath) committed = true;
        return result;
      });
    const lstatSpy = vi
      .spyOn(fs.promises, 'lstat')
      .mockImplementation(async (targetPath) => {
        if (committed && String(targetPath) === destinationPath) {
          throw new Error('post-commit metadata unavailable');
        }
        return await originalLstat(targetPath);
      });

    try {
      await expect(
        createService().renameBatch('media', [
          { path: 'first.txt', name: 'renamed.txt' },
        ]),
      ).resolves.toMatchObject({
        0: { path: 'renamed.txt', name: 'renamed.txt' },
      });
    } finally {
      lstatSpy.mockRestore();
      renameSpy.mockRestore();
    }
    await expect(fs.promises.readFile(destinationPath, 'utf8')).resolves.toBe(
      'first',
    );
  });

  it('rejects unsafe paths and names before changing files', async () => {
    await writeFile(path.join(mediaRoot, 'first.txt'), 'first');

    await expect(
      createService().renameBatch('media', [
        { path: '../first.txt', name: 'renamed.txt' },
      ]),
    ).rejects.toBeInstanceOf(FileManagerError);
    await expect(
      createService().renameBatch('media', [
        { path: 'first.txt', name: 'nested/name.txt' },
      ]),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Name must be a single non-empty basename',
    });
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'first.txt'), 'utf8'),
    ).resolves.toBe('first');
  });

  it('rejects symbolic links and torrent-linked directories', async () => {
    const outsidePath = path.join(testRoot, 'outside.txt');
    await writeFile(outsidePath, 'outside');
    await fs.promises.symlink(outsidePath, path.join(mediaRoot, 'link.txt'));
    await expect(
      createService().renameBatch('media', [
        { path: 'link.txt', name: 'renamed.txt' },
      ]),
    ).rejects.toMatchObject({ status: 400 });

    const linkedDirectory = path.join(mediaRoot, 'linked');
    await writeFile(path.join(linkedDirectory, 'episode.mkv'), 'video');
    await expect(
      createService({
        getTorrentFilePaths: async () => [
          path.join(linkedDirectory, 'episode.mkv'),
        ],
      }).renameBatch('media', [{ path: 'linked', name: 'renamed-linked' }]),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Directory is linked to a torrent',
    });
  });
});
