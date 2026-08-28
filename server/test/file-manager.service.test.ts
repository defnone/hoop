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
  isValidRenameName,
  normalizeRelativePath,
} from '@server/features/file-management/file-manager.service';
import { FileManagerRepo } from '@server/features/file-management/file-manager.repo';
import {
  DIRECTORY_SIZE_MAX_PENDING_SCANS,
  DirectorySizeQueueError,
  DirectorySizeService,
} from '@server/features/file-management/file-manager-size.service';
import type {
  FileManagerOwnership,
  FileManagerOwnershipResolverPort,
} from '@server/features/file-management/file-manager-ownership';
import logger from '@server/lib/logger';

const testRoot = path.join(process.cwd(), 'test', '.tmp-file-manager');
const mediaRoot = path.join(testRoot, 'media');
const downloadsRoot = path.join(testRoot, 'downloads');
const outsideRoot = path.join(testRoot, 'outside');

function createService(
  torrentFilePaths: string[] = [],
  directorySizeService: DirectorySizeService = new DirectorySizeService(),
  ownershipResolver?: FileManagerOwnershipResolverPort,
): FileManagerService {
  return new FileManagerService({
    settingsService: {
      getSettings: async () => ({
        mediaDir: mediaRoot,
        downloadDir: downloadsRoot,
      }),
    },
    torrentFilesProvider: {
      getTorrentFilePaths: async () => torrentFilePaths,
    },
    directorySizeService,
    ownershipResolver,
  });
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

const backslashLiteralName = 'alias\\victim.txt';

async function createBackslashCollision(root: string): Promise<void> {
  await writeFile(path.join(root, backslashLiteralName), 'literal');
  await writeFile(path.join(root, 'alias', 'victim.txt'), 'nested');
}

beforeEach(async () => {
  await fs.promises.rm(testRoot, { recursive: true, force: true });
  await Promise.all([
    fs.promises.mkdir(mediaRoot, { recursive: true }),
    fs.promises.mkdir(downloadsRoot, { recursive: true }),
    fs.promises.mkdir(outsideRoot, { recursive: true }),
  ]);
});

afterEach(async () => {
  await fs.promises.rm(testRoot, { recursive: true, force: true });
});

describe('normalizeRelativePath', () => {
  it('normalizes supported relative paths', () => {
    expect(normalizeRelativePath('series/Season 01')).toBe('series/Season 01');
    expect(normalizeRelativePath('')).toBe('');
  });

  it('rejects backslashes before filesystem resolution', () => {
    expect(() => normalizeRelativePath('alias\\victim.txt')).toThrow(
      'Backslashes are not supported in paths',
    );
    expect(() => normalizeRelativePath('alias\\..\\victim.txt')).toThrow(
      'Backslashes are not supported in paths',
    );
    expect(normalizeRelativePath('alias/victim.txt')).toBe('alias/victim.txt');
  });

  it.each([
    '../outside',
    'series/../outside',
    '/absolute',
    'C:\\absolute',
    'series//file',
    'series/./file',
    'series/with\0nul',
  ])('rejects unsafe path %s', (value) => {
    expect(() => normalizeRelativePath(value)).toThrow(FileManagerError);
  });
});

describe('FileManagerRepo', () => {
  it('returns only persisted torrent file paths', async () => {
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(async () => [
          { files: ['/media/episode.mkv', 42] },
          { files: null },
          { files: ['/media/season/episode.mkv'] },
        ]),
      })),
    } as never;

    await expect(
      new FileManagerRepo(database).getTorrentFilePaths(),
    ).resolves.toEqual(['/media/episode.mkv', '/media/season/episode.mkv']);
  });
});

describe('FileManagerService', () => {
  it.skipIf(process.platform === 'win32')(
    'lists literal backslash names independently from slash paths',
    async () => {
      await createBackslashCollision(mediaRoot);

      const result = await createService().list('media', '');

      expect(result.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: backslashLiteralName,
            path: backslashLiteralName,
            type: 'file',
          }),
          expect.objectContaining({
            name: 'alias',
            path: 'alias',
            type: 'directory',
          }),
        ]),
      );
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, backslashLiteralName),
          'utf8',
        ),
      ).resolves.toBe('literal');
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, 'alias', 'victim.txt'),
          'utf8',
        ),
      ).resolves.toBe('nested');
      await expect(
        createService().list('media', backslashLiteralName),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Backslashes are not supported in paths',
      });
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects deleting the literal backslash entry',
    async () => {
      await createBackslashCollision(mediaRoot);

      await expect(
        createService().delete({
          root: 'media',
          path: backslashLiteralName,
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Backslashes are not supported in paths',
      });

      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, backslashLiteralName),
          'utf8',
        ),
      ).resolves.toBe('literal');
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, 'alias', 'victim.txt'),
          'utf8',
        ),
      ).resolves.toBe('nested');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects renaming the literal backslash entry',
    async () => {
      await createBackslashCollision(mediaRoot);

      await expect(
        createService().rename(
          { root: 'media', path: backslashLiteralName },
          'renamed.txt',
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Backslashes are not supported in paths',
      });

      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, backslashLiteralName),
          'utf8',
        ),
      ).resolves.toBe('literal');
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, 'alias', 'victim.txt'),
          'utf8',
        ),
      ).resolves.toBe('nested');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects copying the literal backslash entry',
    async () => {
      await createBackslashCollision(downloadsRoot);

      await expect(
        createService().copy(
          { root: 'downloads', path: backslashLiteralName },
          { root: 'media', path: 'copied.txt' },
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Backslashes are not supported in paths',
      });

      await expect(
        fs.promises.readFile(
          path.join(downloadsRoot, backslashLiteralName),
          'utf8',
        ),
      ).resolves.toBe('literal');
      await expect(
        fs.promises.readFile(
          path.join(downloadsRoot, 'alias', 'victim.txt'),
          'utf8',
        ),
      ).resolves.toBe('nested');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects moving the literal backslash entry',
    async () => {
      await createBackslashCollision(downloadsRoot);

      await expect(
        createService().move(
          { root: 'downloads', path: backslashLiteralName },
          { root: 'media', path: 'moved.txt' },
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Backslashes are not supported in paths',
      });

      await expect(
        fs.promises.readFile(
          path.join(downloadsRoot, backslashLiteralName),
          'utf8',
        ),
      ).resolves.toBe('literal');
      await expect(
        fs.promises.readFile(
          path.join(downloadsRoot, 'alias', 'victim.txt'),
          'utf8',
        ),
      ).resolves.toBe('nested');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects batch renaming the literal backslash entry',
    async () => {
      await createBackslashCollision(mediaRoot);

      await expect(
        createService().renameBatch('media', [
          { path: backslashLiteralName, name: 'renamed.txt' },
        ]),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Backslashes are not supported in paths',
      });

      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, backslashLiteralName),
          'utf8',
        ),
      ).resolves.toBe('literal');
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, 'alias', 'victim.txt'),
          'utf8',
        ),
      ).resolves.toBe('nested');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects sizing the literal backslash entry',
    async () => {
      await createBackslashCollision(mediaRoot);

      await expect(
        createService().getDirectorySizes([
          { root: 'media', path: backslashLiteralName },
        ]),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Backslashes are not supported in paths',
      });

      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, backslashLiteralName),
          'utf8',
        ),
      ).resolves.toBe('literal');
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, 'alias', 'victim.txt'),
          'utf8',
        ),
      ).resolves.toBe('nested');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'keeps normal slash paths functional beside literal names',
    async () => {
      await createBackslashCollision(mediaRoot);

      await expect(
        createService().rename(
          { root: 'media', path: 'alias/victim.txt' },
          'renamed.txt',
        ),
      ).resolves.toMatchObject({
        path: 'alias/renamed.txt',
        type: 'file',
      });

      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, backslashLiteralName),
          'utf8',
        ),
      ).resolves.toBe('literal');
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, 'alias', 'renamed.txt'),
          'utf8',
        ),
      ).resolves.toBe('nested');
    },
  );

  it('lists regular files and directories with relative metadata', async () => {
    await fs.promises.mkdir(path.join(mediaRoot, 'Shows'), { recursive: true });
    await writeFile(path.join(mediaRoot, 'Shows', 'episode.mkv'), 'video');
    await writeFile(path.join(mediaRoot, 'readme.txt'), 'readme');
    await writeFile(path.join(mediaRoot, 'archive.txt'), 'archive');
    await writeFile(path.join(outsideRoot, 'hidden.txt'), 'hidden');
    await fs.promises.symlink(
      path.join(outsideRoot, 'hidden.txt'),
      path.join(mediaRoot, 'escape'),
    );

    const result = await createService().list('media', '');

    expect(result.path).toBe('');
    expect(result.entries).toEqual([
      expect.objectContaining({
        name: 'Shows',
        path: 'Shows',
        type: 'directory',
        size: null,
      }),
      expect.objectContaining({
        name: 'archive.txt',
        path: 'archive.txt',
        type: 'file',
        size: 7,
      }),
      expect.objectContaining({
        name: 'readme.txt',
        path: 'readme.txt',
        type: 'file',
        size: 6,
      }),
    ]);
    expect(result.entries.some((entry) => entry.name === 'escape')).toBe(false);
    expect(result.entries[1]?.modifiedAt).toMatch(/T/);
  });

  it('lists nested directories and rejects files as directories', async () => {
    await writeFile(path.join(mediaRoot, 'Shows', 'episode.mkv'), 'video');

    await expect(createService().list('media', 'Shows')).resolves.toMatchObject(
      {
        path: 'Shows',
        entries: [expect.objectContaining({ path: 'Shows/episode.mkv' })],
      },
    );
    await expect(
      createService().list('media', 'missing'),
    ).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      createService().list('media', 'Shows/episode.mkv'),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('lists large directories without per-entry canonicalization', async () => {
    const entryNames = Array.from(
      { length: 128 },
      (_, index) => `entry-${index.toString().padStart(3, '0')}.txt`,
    );
    await Promise.all(
      entryNames.map((entryName) =>
        writeFile(path.join(mediaRoot, entryName), entryName),
      ),
    );

    const realpathSpy = vi.spyOn(fs.promises, 'realpath');
    try {
      const result = await createService().list('media', '');
      const childCanonicalizations = realpathSpy.mock.calls.filter(
        ([candidate]) =>
          String(candidate).startsWith(`${mediaRoot}${path.sep}`),
      );

      expect(result.entries).toHaveLength(entryNames.length);
      expect(childCanonicalizations).toHaveLength(0);
    } finally {
      realpathSpy.mockRestore();
    }
  });

  it('returns permission metadata without dropping inaccessible children', async () => {
    const deniedLstatPath = path.join(mediaRoot, 'denied-lstat.txt');
    const deniedAccessPath = path.join(mediaRoot, 'denied-access.txt');
    await writeFile(deniedLstatPath, 'lstat');
    await writeFile(deniedAccessPath, 'access');

    const originalLstat = fs.promises.lstat.bind(fs.promises);
    const originalAccess = fs.promises.access.bind(fs.promises);
    const lstatSpy = vi
      .spyOn(fs.promises, 'lstat')
      .mockImplementation(async (targetPath) => {
        if (String(targetPath) === deniedLstatPath) {
          throw Object.assign(new Error('Permission denied'), {
            code: 'EACCES',
          });
        }
        return await originalLstat(targetPath);
      });
    const accessSpy = vi
      .spyOn(fs.promises, 'access')
      .mockImplementation(async (targetPath, mode) => {
        if (
          String(targetPath) === deniedAccessPath &&
          mode === (fs.constants.R_OK | fs.constants.W_OK)
        ) {
          throw Object.assign(new Error('Permission denied'), {
            code: 'EACCES',
          });
        }
        return await originalAccess(targetPath, mode);
      });

    try {
      const result = await createService().list('media', '');
      expect(result.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'denied-lstat.txt',
            size: null,
            modifiedAt: null,
            permissions: {
              readWrite: false,
              rename: true,
            },
          }),
          expect.objectContaining({
            name: 'denied-access.txt',
            permissions: expect.objectContaining({
              readWrite: false,
              rename: true,
            }),
          }),
        ]),
      );
      expect(
        accessSpy.mock.calls.filter(
          ([targetPath]) => String(targetPath) === deniedAccessPath,
        ),
      ).toHaveLength(1);
    } finally {
      lstatSpy.mockRestore();
      accessSpy.mockRestore();
    }
  });

  it('skips children on unexpected metadata errors without marking them denied', async () => {
    const deniedLstatPath = path.join(mediaRoot, 'unexpected-lstat.txt');
    const deniedAccessPath = path.join(mediaRoot, 'unexpected-access.txt');
    await writeFile(deniedLstatPath, 'lstat');
    await writeFile(deniedAccessPath, 'access');

    const originalLstat = fs.promises.lstat.bind(fs.promises);
    const originalAccess = fs.promises.access.bind(fs.promises);
    const lstatSpy = vi
      .spyOn(fs.promises, 'lstat')
      .mockImplementation(async (targetPath) => {
        if (String(targetPath) === deniedLstatPath) {
          throw Object.assign(new Error('I/O failure'), { code: 'EIO' });
        }
        return await originalLstat(targetPath);
      });
    const accessSpy = vi
      .spyOn(fs.promises, 'access')
      .mockImplementation(async (targetPath, mode) => {
        if (
          String(targetPath) === deniedAccessPath &&
          mode === (fs.constants.R_OK | fs.constants.W_OK)
        ) {
          throw Object.assign(new Error('I/O failure'), { code: 'EIO' });
        }
        return await originalAccess(targetPath, mode);
      });

    try {
      const result = await createService().list('media', '');
      expect(result.entries).toHaveLength(0);
      expect(
        accessSpy.mock.calls.some(
          ([targetPath]) => String(targetPath) === deniedAccessPath,
        ),
      ).toBe(true);
    } finally {
      lstatSpy.mockRestore();
      accessSpy.mockRestore();
    }
  });

  it('adds ownership metadata only when entry access is denied', async () => {
    const allowedPath = path.join(mediaRoot, 'allowed.txt');
    const deniedPath = path.join(mediaRoot, 'denied.txt');
    await writeFile(allowedPath, 'allowed');
    await writeFile(deniedPath, 'denied');

    const actualOwner: FileManagerOwnership['actual'] = {
      uid: 2001,
      gid: 2002,
      user: 'media-owner',
      group: 'media-group',
    };
    const expectedOwner: FileManagerOwnership['expected'] = {
      uid: 1000,
      gid: 1000,
      user: 'app-user',
      group: 'app-group',
    };
    const ownership: FileManagerOwnership = {
      actual: actualOwner,
      expected: expectedOwner,
    };
    const ownershipResolver: FileManagerOwnershipResolverPort = {
      resolve: vi.fn(async () => ownership),
    };
    const originalAccess = fs.promises.access.bind(fs.promises);
    const accessSpy = vi
      .spyOn(fs.promises, 'access')
      .mockImplementation(async (targetPath, mode) => {
        if (
          String(targetPath) === deniedPath &&
          mode === (fs.constants.R_OK | fs.constants.W_OK)
        ) {
          throw Object.assign(new Error('Permission denied'), {
            code: 'EACCES',
          });
        }
        return await originalAccess(targetPath, mode);
      });

    try {
      const result = await createService([], undefined, ownershipResolver).list(
        'media',
        '',
      );
      const allowedEntry = result.entries.find(
        (entry) => entry.name === 'allowed.txt',
      );
      const deniedEntry = result.entries.find(
        (entry) => entry.name === 'denied.txt',
      );

      expect(allowedEntry?.permissions.ownership).toBeUndefined();
      expect(deniedEntry?.permissions).toMatchObject({
        readWrite: false,
        ownership,
      });
      expect(ownershipResolver.resolve).toHaveBeenCalledTimes(1);
      expect(ownershipResolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: expect.any(Number),
          gid: expect.any(Number),
        }),
      );
    } finally {
      accessSpy.mockRestore();
    }
  });

  it('marks torrent-linked directory ancestors and blocks their rename', async () => {
    const linkedFilePath = path.join(
      mediaRoot,
      'Shows',
      'Season 01',
      'episode.mkv',
    );
    await writeFile(linkedFilePath, 'episode');
    await fs.promises.mkdir(path.join(mediaRoot, 'Shows2'));

    const service = createService([linkedFilePath]);
    const rootListing = await service.list('media', '');
    const showsEntry = rootListing.entries.find(
      (entry) => entry.path === 'Shows',
    );
    const shows2Entry = rootListing.entries.find(
      (entry) => entry.path === 'Shows2',
    );

    expect(showsEntry).toMatchObject({
      type: 'directory',
      isTorrentLinked: true,
      permissions: { rename: false },
    });
    expect(shows2Entry).toMatchObject({
      type: 'directory',
      isTorrentLinked: false,
      permissions: { rename: true },
    });
    await expect(service.list('media', 'Shows')).resolves.toMatchObject({
      entries: [
        expect.objectContaining({
          path: 'Shows/Season 01',
          isTorrentLinked: true,
          permissions: expect.objectContaining({ rename: false }),
        }),
      ],
    });

    await expect(
      service.rename({ root: 'media', path: 'Shows' }, 'Renamed Shows'),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Directory is linked to a torrent',
    });
    await expect(
      fs.promises.access(path.join(mediaRoot, 'Shows')),
    ).resolves.toBeUndefined();
  });

  it('ignores linked paths outside the configured media root', async () => {
    await fs.promises.mkdir(path.join(mediaRoot, 'Shows'));
    const service = createService([
      path.join(outsideRoot, 'Shows', 'Season 01', 'episode.mkv'),
    ]);

    const result = await service.list('media', '');
    expect(result.entries).toEqual([
      expect.objectContaining({
        path: 'Shows',
        isTorrentLinked: false,
        permissions: expect.objectContaining({ rename: true }),
      }),
    ]);
  });

  it('calculates directory sizes separately and caches successful scans', async () => {
    await writeFile(path.join(mediaRoot, 'Shows', 'episode-1.mkv'), '12345');
    await writeFile(
      path.join(mediaRoot, 'Shows', 'Season 01', 'episode-2.mkv'),
      '1234567',
    );
    await fs.promises.symlink(
      outsideRoot,
      path.join(mediaRoot, 'Shows', 'outside-link'),
    );
    const directorySizeService = new DirectorySizeService();
    const service = createService([], directorySizeService);

    const first = await service.getDirectorySizes([
      { root: 'media', path: 'Shows' },
    ]);
    const second = await service.getDirectorySizes([
      { root: 'media', path: 'Shows' },
    ]);

    expect(first).toMatchObject([
      {
        root: 'media',
        path: 'Shows',
        size: 12,
        status: 'ready',
      },
    ]);
    expect(second[0]?.calculatedAt).toBe(first[0]?.calculatedAt);
  });

  it('supports Bun synchronous directory close and canonical root aliases', async () => {
    const rootAlias = path.join(testRoot, 'media-alias');
    const aliasedDirectory = path.join(rootAlias, 'Aliased');
    await fs.promises.symlink(mediaRoot, rootAlias, 'dir');
    await writeFile(path.join(mediaRoot, 'Aliased', 'episode.mkv'), 'video');

    const originalOpendir = fs.promises.opendir.bind(fs.promises);
    const opendirSpy = vi
      .spyOn(fs.promises, 'opendir')
      .mockImplementation(async (targetPath, options) => {
        const directory = await originalOpendir(targetPath, options);
        const originalClose = directory.close.bind(directory);
        Object.defineProperty(directory, 'close', {
          configurable: true,
          value: () => {
            void Promise.resolve(originalClose()).catch(() => undefined);
          },
        });
        return directory;
      });

    try {
      await expect(
        new DirectorySizeService().getSize(aliasedDirectory, rootAlias),
      ).resolves.toMatchObject({
        size: 'video'.length,
        status: 'ready',
      });
    } finally {
      opendirSpy.mockRestore();
    }
  });

  it('resolves settings once and each configured root once per size batch', async () => {
    await Promise.all([
      fs.promises.mkdir(path.join(mediaRoot, 'Shows')),
      fs.promises.mkdir(path.join(mediaRoot, 'Movies')),
    ]);
    let settingsCalls = 0;
    const realpathSpy = vi.spyOn(fs.promises, 'realpath');
    const service = new FileManagerService({
      settingsService: {
        getSettings: async () => {
          settingsCalls += 1;
          return { mediaDir: mediaRoot, downloadDir: downloadsRoot };
        },
      },
      torrentFilesProvider: { getTorrentFilePaths: async () => [] },
      directorySizeService: new DirectorySizeService(),
    });

    try {
      await service.getDirectorySizes([
        { root: 'media', path: 'Shows' },
        { root: 'media', path: 'Movies' },
      ]);
      expect(settingsCalls).toBe(1);
      expect(
        realpathSpy.mock.calls.filter(
          ([targetPath]) => String(targetPath) === mediaRoot,
        ),
      ).toHaveLength(1);
    } finally {
      realpathSpy.mockRestore();
    }
  });

  it('isolates unexpected directory-size failures per location', async () => {
    await Promise.all([
      fs.promises.mkdir(path.join(mediaRoot, 'Good')),
      fs.promises.mkdir(path.join(mediaRoot, 'Broken')),
    ]);
    const directorySizeService = new DirectorySizeService();
    const getSizeSpy = vi
      .spyOn(directorySizeService, 'getSize')
      .mockImplementation(async (directoryPath) => {
        if (path.basename(directoryPath) === 'Broken') {
          throw Object.assign(new Error('Unexpected scanner failure'), {
            code: 'EIO',
          });
        }
        return {
          size: 7,
          status: 'ready',
          calculatedAt: '2026-08-27T00:00:00.000Z',
        };
      });
    const errorSpy = vi.spyOn(logger, 'error');
    const service = createService([], directorySizeService);

    try {
      await expect(
        service.getDirectorySizes([
          { root: 'media', path: 'Good' },
          { root: 'media', path: 'Broken' },
        ]),
      ).resolves.toEqual([
        {
          root: 'media',
          path: 'Good',
          size: 7,
          status: 'ready',
          calculatedAt: '2026-08-27T00:00:00.000Z',
        },
        {
          root: 'media',
          path: 'Broken',
          size: null,
          status: 'unavailable',
          calculatedAt: null,
        },
      ]);
      expect(getSizeSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'sizes',
          root: 'media',
          path: 'Broken',
          error: {
            name: 'Error',
            message: 'Unexpected scanner failure',
            code: 'EIO',
          },
        }),
        'Directory size calculation failed',
      );
    } finally {
      errorSpy.mockRestore();
      getSizeSpy.mockRestore();
    }
  });

  it('returns unavailable for one unavailable root without dropping another root', async () => {
    await fs.promises.mkdir(path.join(downloadsRoot, 'Ready'));
    const service = new FileManagerService({
      settingsService: {
        getSettings: async () => ({
          mediaDir: path.join(testRoot, 'missing-media'),
          downloadDir: downloadsRoot,
        }),
      },
      torrentFilesProvider: { getTorrentFilePaths: async () => [] },
      directorySizeService: new DirectorySizeService(),
    });

    await expect(
      service.getDirectorySizes([
        { root: 'media', path: '' },
        { root: 'downloads', path: 'Ready' },
      ]),
    ).resolves.toMatchObject([
      { root: 'media', path: '', status: 'unavailable', size: null },
      { root: 'downloads', path: 'Ready', status: 'ready', size: 0 },
    ]);
  });

  it('returns unavailable for queue-full size scans without dropping locations', async () => {
    await Promise.all([
      fs.promises.mkdir(path.join(mediaRoot, 'Ready')),
      fs.promises.mkdir(path.join(mediaRoot, 'Queued')),
    ]);
    const directorySizeService = new DirectorySizeService();
    const getSizeSpy = vi
      .spyOn(directorySizeService, 'getSize')
      .mockImplementation(async (directoryPath) => {
        if (path.basename(directoryPath) === 'Queued') {
          throw new DirectorySizeQueueError();
        }
        return {
          size: 2,
          status: 'ready',
          calculatedAt: '2026-08-27T00:00:00.000Z',
        };
      });
    const warnSpy = vi.spyOn(logger, 'warn');
    const errorSpy = vi.spyOn(logger, 'error');
    const service = createService([], directorySizeService);

    try {
      await expect(
        service.getDirectorySizes([
          { root: 'media', path: 'Ready' },
          { root: 'media', path: 'Queued' },
        ]),
      ).resolves.toEqual([
        {
          root: 'media',
          path: 'Ready',
          size: 2,
          status: 'ready',
          calculatedAt: '2026-08-27T00:00:00.000Z',
        },
        {
          root: 'media',
          path: 'Queued',
          size: null,
          status: 'unavailable',
          calculatedAt: null,
        },
      ]);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'sizes',
          root: 'media',
          path: 'Queued',
          error: {
            name: 'DirectorySizeQueueError',
            message: 'Directory size scan queue is full',
          },
        }),
        'Directory size calculation failed',
      );
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      getSizeSpy.mockRestore();
    }
  });

  it('caches negative directory-size results until TTL expires', async () => {
    const deniedPath = path.join(mediaRoot, 'Denied');
    await fs.promises.mkdir(deniedPath);
    const originalOpendir = fs.promises.opendir.bind(fs.promises);
    const opendirSpy = vi
      .spyOn(fs.promises, 'opendir')
      .mockImplementation(async (targetPath, options) => {
        if (String(targetPath) === deniedPath) {
          throw Object.assign(new Error('Permission denied'), {
            code: 'EACCES',
          });
        }
        return await originalOpendir(targetPath, options);
      });
    vi.useFakeTimers();

    try {
      const directorySizeService = new DirectorySizeService();
      await expect(
        directorySizeService.getSize(deniedPath, mediaRoot),
      ).resolves.toMatchObject({ status: 'permission-denied' });
      expect(opendirSpy).toHaveBeenCalledTimes(1);

      await expect(
        directorySizeService.getSize(deniedPath, mediaRoot),
      ).resolves.toMatchObject({ status: 'permission-denied' });
      expect(opendirSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_001);
      await expect(
        directorySizeService.getSize(deniedPath, mediaRoot),
      ).resolves.toMatchObject({ status: 'permission-denied' });
      expect(opendirSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      opendirSpy.mockRestore();
    }
  });

  it('returns and caches unavailable results for unexpected scanner errors', async () => {
    const unavailablePath = path.join(mediaRoot, 'Unavailable');
    await fs.promises.mkdir(unavailablePath);
    const originalOpendir = fs.promises.opendir.bind(fs.promises);
    const opendirSpy = vi
      .spyOn(fs.promises, 'opendir')
      .mockImplementation(async (targetPath, options) => {
        if (String(targetPath) === unavailablePath) {
          throw Object.assign(new Error('I/O failure'), { code: 'EIO' });
        }
        return await originalOpendir(targetPath, options);
      });

    try {
      const directorySizeService = new DirectorySizeService();
      await expect(
        directorySizeService.getSize(unavailablePath, mediaRoot),
      ).resolves.toMatchObject({ status: 'unavailable', size: null });
      await expect(
        directorySizeService.getSize(unavailablePath, mediaRoot),
      ).resolves.toMatchObject({ status: 'unavailable', size: null });
      expect(opendirSpy).toHaveBeenCalledTimes(1);
    } finally {
      opendirSpy.mockRestore();
    }
  });

  it('logs scanner failure details without absolute paths', async () => {
    const unavailablePath = path.join(mediaRoot, 'Unavailable With Details');
    await fs.promises.mkdir(unavailablePath);
    const originalOpendir = fs.promises.opendir.bind(fs.promises);
    const opendirSpy = vi
      .spyOn(fs.promises, 'opendir')
      .mockImplementation(async (targetPath, options) => {
        if (String(targetPath) === unavailablePath) {
          throw Object.assign(new Error(`I/O failure at ${unavailablePath}`), {
            code: 'EIO',
          });
        }
        return await originalOpendir(targetPath, options);
      });
    const errorSpy = vi.spyOn(logger, 'error');
    const service = createService();

    try {
      await expect(
        service.getDirectorySizes([
          { root: 'media', path: 'Unavailable With Details' },
        ]),
      ).resolves.toMatchObject([
        {
          root: 'media',
          path: 'Unavailable With Details',
          size: null,
          status: 'unavailable',
        },
      ]);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'sizes',
          root: 'media',
          path: 'Unavailable With Details',
          error: {
            name: 'Error',
            message: 'I/O failure at [path]',
            code: 'EIO',
          },
        }),
        'Directory size calculation failed',
      );
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(mediaRoot);
    } finally {
      errorSpy.mockRestore();
      opendirSpy.mockRestore();
    }
  });

  it('rejects directory-size scans when pending queue is full', async () => {
    const scanPaths = Array.from(
      { length: DIRECTORY_SIZE_MAX_PENDING_SCANS + 3 },
      (_, index) => path.join(mediaRoot, `queued-${index}`),
    );
    await Promise.all(scanPaths.map((scanPath) => fs.promises.mkdir(scanPath)));
    const neverOpened = new Promise<fs.Dir>(() => undefined);
    const opendirSpy = vi
      .spyOn(fs.promises, 'opendir')
      .mockImplementation(async () => await neverOpened);
    const directorySizeService = new DirectorySizeService();
    const requests = scanPaths.map((scanPath) =>
      directorySizeService.getSize(scanPath, mediaRoot),
    );
    for (const request of requests) void request.catch(() => undefined);

    try {
      const rejectedRequest = requests[requests.length - 1];
      await expect(rejectedRequest).rejects.toBeInstanceOf(
        DirectorySizeQueueError,
      );
    } finally {
      opendirSpy.mockRestore();
    }
  });

  it('starts a new scan after invalidation instead of awaiting stale in-flight work', async () => {
    const scanPath = path.join(mediaRoot, 'Raced');
    const filePath = path.join(scanPath, 'episode.mkv');
    await writeFile(filePath, 'a');
    const originalLstat = fs.promises.lstat.bind(fs.promises);
    const oldStats = await originalLstat(filePath);
    let releaseFirstLstat: () => void = () => undefined;
    const firstLstatGate = new Promise<void>((resolve) => {
      releaseFirstLstat = resolve;
    });
    let firstFileLstatStarted = false;
    const lstatSpy = vi
      .spyOn(fs.promises, 'lstat')
      .mockImplementation(async (targetPath) => {
        if (String(targetPath) === filePath && !firstFileLstatStarted) {
          firstFileLstatStarted = true;
          await firstLstatGate;
          return oldStats;
        }
        return await originalLstat(targetPath);
      });
    const directorySizeService = new DirectorySizeService();

    try {
      const firstScan = directorySizeService.getSize(scanPath, mediaRoot);
      await vi.waitFor(() => expect(firstFileLstatStarted).toBe(true));

      directorySizeService.invalidate([scanPath]);
      await fs.promises.writeFile(filePath, 'new-size');
      const secondScan = directorySizeService.getSize(scanPath, mediaRoot);

      await expect(secondScan).resolves.toMatchObject({
        size: 'new-size'.length,
        status: 'ready',
      });
      releaseFirstLstat();
      await expect(firstScan).resolves.toMatchObject({ size: 1 });
      await expect(
        directorySizeService.getSize(scanPath, mediaRoot),
      ).resolves.toMatchObject({ size: 'new-size'.length, status: 'ready' });
    } finally {
      releaseFirstLstat();
      lstatSpy.mockRestore();
    }
  });

  it('revalidates canonical directory paths before opening them', async () => {
    const scanPath = path.join(mediaRoot, 'Revalidated');
    await fs.promises.mkdir(scanPath);
    const originalRealpath = fs.promises.realpath.bind(fs.promises);
    const realpathSpy = vi
      .spyOn(fs.promises, 'realpath')
      .mockImplementation(async (targetPath) => {
        if (String(targetPath) === scanPath) return outsideRoot;
        return await originalRealpath(targetPath);
      });
    const opendirSpy = vi.spyOn(fs.promises, 'opendir');

    try {
      await expect(
        new DirectorySizeService().getSize(scanPath, mediaRoot),
      ).resolves.toMatchObject({ size: 0, status: 'ready' });
      expect(realpathSpy).toHaveBeenCalledWith(scanPath);
      expect(opendirSpy).not.toHaveBeenCalled();
    } finally {
      opendirSpy.mockRestore();
      realpathSpy.mockRestore();
    }
  });

  it('coalesces concurrent size scans and invalidates affected ancestors', async () => {
    await writeFile(path.join(mediaRoot, 'Sized', 'existing.txt'), 'a');
    await writeFile(path.join(downloadsRoot, 'new.txt'), 'bb');
    const directorySizeService = new DirectorySizeService();
    const service = createService([], directorySizeService);
    const opendirSpy = vi.spyOn(fs.promises, 'opendir');

    try {
      const [first, second] = await Promise.all([
        directorySizeService.getSize(path.join(mediaRoot, 'Sized')),
        directorySizeService.getSize(path.join(mediaRoot, 'Sized')),
      ]);
      expect(first).toEqual(second);
      expect(opendirSpy).toHaveBeenCalledTimes(1);

      expect(
        await service.getDirectorySizes([{ root: 'media', path: 'Sized' }]),
      ).toMatchObject([{ size: 1, status: 'ready' }]);

      await service.copy(
        { root: 'downloads', path: 'new.txt' },
        { root: 'media', path: 'Sized/new.txt' },
      );
      expect(
        await service.getDirectorySizes([{ root: 'media', path: 'Sized' }]),
      ).toMatchObject([{ size: 3, status: 'ready' }]);
    } finally {
      opendirSpy.mockRestore();
    }
  });

  it('reports permission and depth limits for directory sizes', async () => {
    await fs.promises.mkdir(path.join(mediaRoot, 'Denied'));
    const originalOpendir = fs.promises.opendir.bind(fs.promises);
    const opendirSpy = vi
      .spyOn(fs.promises, 'opendir')
      .mockImplementation(async (targetPath, options) => {
        if (String(targetPath) === path.join(mediaRoot, 'Denied')) {
          throw Object.assign(new Error('Permission denied'), {
            code: 'EACCES',
          });
        }
        return await originalOpendir(targetPath, options);
      });

    try {
      await expect(
        createService().getDirectorySizes([{ root: 'media', path: 'Denied' }]),
      ).resolves.toMatchObject([{ size: null, status: 'permission-denied' }]);
    } finally {
      opendirSpy.mockRestore();
    }

    let nestedPath = path.join(mediaRoot, 'Deep');
    for (let depth = 0; depth <= 33; depth += 1) {
      await fs.promises.mkdir(nestedPath);
      nestedPath = path.join(nestedPath, 'child');
    }
    await expect(
      createService().getDirectorySizes([{ root: 'media', path: 'Deep' }]),
    ).resolves.toMatchObject([{ size: null, status: 'too-large' }]);
  });

  it.each(['EACCES', 'EPERM'] as const)(
    'maps %s while resolving a configured root through realpath',
    async (code) => {
      const realpathSpy = vi
        .spyOn(fs.promises, 'realpath')
        .mockRejectedValueOnce(
          Object.assign(new Error(`${code} root failure`), { code }),
        );

      try {
        await expect(createService().list('media', '')).rejects.toMatchObject({
          status: 422,
          message: 'Permission denied',
        });
      } finally {
        realpathSpy.mockRestore();
      }
    },
  );

  it.each(['EACCES', 'EPERM'] as const)(
    'maps %s while validating a configured root through stat',
    async (code) => {
      const statSpy = vi
        .spyOn(fs.promises, 'stat')
        .mockRejectedValueOnce(
          Object.assign(new Error(`${code} root failure`), { code }),
        );

      try {
        await expect(createService().list('media', '')).rejects.toMatchObject({
          status: 422,
          message: 'Permission denied',
        });
      } finally {
        statSpy.mockRestore();
      }
    },
  );

  it('copies files and directories between configured roots', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'video');
    await fs.promises.mkdir(path.join(mediaRoot, 'shows'), { recursive: true });
    await fs.promises.mkdir(path.join(downloadsRoot, 'folder'), {
      recursive: true,
    });
    await writeFile(path.join(downloadsRoot, 'folder', 'nested.txt'), 'nested');

    await expect(
      createService().copy(
        { root: 'downloads', path: 'episode.mkv' },
        { root: 'media', path: 'shows/episode.mkv' },
      ),
    ).resolves.toMatchObject({
      name: 'episode.mkv',
      path: 'shows/episode.mkv',
    });
    await expect(
      fs.promises.readFile(
        path.join(mediaRoot, 'shows', 'episode.mkv'),
        'utf8',
      ),
    ).resolves.toBe('video');

    await createService().copy(
      { root: 'downloads', path: 'folder' },
      { root: 'media', path: 'copied-folder' },
    );
    await expect(
      fs.promises.readFile(
        path.join(mediaRoot, 'copied-folder', 'nested.txt'),
        'utf8',
      ),
    ).resolves.toBe('nested');
  });

  it('rejects destination conflicts without overwriting existing data', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'new');
    await writeFile(path.join(mediaRoot, 'episode.mkv'), 'old');

    await expect(
      createService().copy(
        { root: 'downloads', path: 'episode.mkv' },
        { root: 'media', path: 'episode.mkv' },
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'episode.mkv'), 'utf8'),
    ).resolves.toBe('old');
  });

  it('copies a single file with one exclusive copy operation', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'video');
    const copyFileSpy = vi.spyOn(fs.promises, 'copyFile');

    try {
      await expect(
        createService().copy(
          { root: 'downloads', path: 'episode.mkv' },
          { root: 'media', path: 'episode.mkv' },
        ),
      ).resolves.toMatchObject({ path: 'episode.mkv', type: 'file' });
      expect(copyFileSpy).toHaveBeenCalledTimes(1);
    } finally {
      copyFileSpy.mockRestore();
    }
  });

  it('moves files and removes the source', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'video');

    const result = await createService().move(
      { root: 'downloads', path: 'episode.mkv' },
      { root: 'media', path: 'episode.mkv' },
    );

    expect(result).toMatchObject({ path: 'episode.mkv', type: 'file' });
    await expect(
      fs.promises.access(path.join(downloadsRoot, 'episode.mkv')),
    ).rejects.toThrow();
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'episode.mkv'), 'utf8'),
    ).resolves.toBe('video');
  });

  it('does not overwrite a destination created during a move', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'source');
    const destinationPath = path.join(mediaRoot, 'episode.mkv');
    const originalLink = fs.promises.link.bind(fs.promises);
    const linkSpy = vi
      .spyOn(fs.promises, 'link')
      .mockImplementationOnce(async (sourcePath, targetPath) => {
        await writeFile(destinationPath, 'competitor');
        return await originalLink(sourcePath, targetPath);
      });

    try {
      await expect(
        createService().move(
          { root: 'downloads', path: 'episode.mkv' },
          { root: 'media', path: 'episode.mkv' },
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Destination already exists',
      });
      await expect(fs.promises.readFile(destinationPath, 'utf8')).resolves.toBe(
        'competitor',
      );
      await expect(
        fs.promises.readFile(path.join(downloadsRoot, 'episode.mkv'), 'utf8'),
      ).resolves.toBe('source');
    } finally {
      linkSpy.mockRestore();
    }
  });

  it('moves same-filesystem directories with one rename and preserves metadata', async () => {
    const sourcePath = path.join(downloadsRoot, 'folder');
    const destinationPath = path.join(mediaRoot, 'folder');
    const modifiedAt = new Date('2020-01-02T03:04:05.000Z');
    await fs.promises.mkdir(sourcePath);
    await fs.promises.chmod(sourcePath, 0o751);
    await fs.promises.utimes(sourcePath, modifiedAt, modifiedAt);
    const renameSpy = vi.spyOn(fs.promises, 'rename');

    try {
      await expect(
        createService().move(
          { root: 'downloads', path: 'folder' },
          { root: 'media', path: 'folder' },
        ),
      ).resolves.toMatchObject({ path: 'folder', type: 'directory' });
      const destinationStats = await fs.promises.stat(destinationPath);
      expect(renameSpy).toHaveBeenCalledTimes(1);
      expect(renameSpy).toHaveBeenCalledWith(sourcePath, destinationPath);
      expect(destinationStats.mode & 0o7777).toBe(0o751);
      expect(destinationStats.mtimeMs).toBe(modifiedAt.getTime());
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('keeps a concurrent directory target when the reservation becomes non-empty', async () => {
    await fs.promises.mkdir(path.join(downloadsRoot, 'folder'));
    const destinationPath = path.join(mediaRoot, 'folder');
    const competitorPath = path.join(destinationPath, 'competitor.txt');
    const originalRename = fs.promises.rename.bind(fs.promises);
    const renameSpy = vi
      .spyOn(fs.promises, 'rename')
      .mockImplementationOnce(async (sourcePath, targetPath) => {
        await fs.promises.writeFile(competitorPath, 'competitor');
        return await originalRename(sourcePath, targetPath);
      });

    try {
      await expect(
        createService().move(
          { root: 'downloads', path: 'folder' },
          { root: 'media', path: 'folder' },
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Destination already exists',
      });
      await expect(fs.promises.readFile(competitorPath, 'utf8')).resolves.toBe(
        'competitor',
      );
      await expect(
        fs.promises.access(path.join(downloadsRoot, 'folder')),
      ).resolves.toBeUndefined();
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('copies a directory once when a move crosses filesystems', async () => {
    await writeFile(path.join(downloadsRoot, 'folder', 'episode.mkv'), 'video');
    const renameSpy = vi
      .spyOn(fs.promises, 'rename')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device'), { code: 'EXDEV' }),
      );

    try {
      await expect(
        createService().move(
          { root: 'downloads', path: 'folder' },
          { root: 'media', path: 'folder' },
        ),
      ).resolves.toMatchObject({ path: 'folder', type: 'directory' });
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, 'folder', 'episode.mkv'),
          'utf8',
        ),
      ).resolves.toBe('video');
      await expect(
        fs.promises.access(path.join(downloadsRoot, 'folder')),
      ).rejects.toThrow();
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('preserves the destination when source directory cleanup is partial', async () => {
    await writeFile(path.join(downloadsRoot, 'folder', 'episode.mkv'), 'video');
    const renameSpy = vi
      .spyOn(fs.promises, 'rename')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device'), { code: 'EXDEV' }),
      );
    const removeSpy = vi
      .spyOn(fs.promises, 'rm')
      .mockImplementationOnce(async () => {
        await fs.promises.unlink(
          path.join(downloadsRoot, 'folder', 'episode.mkv'),
        );
        throw Object.assign(new Error('source cleanup interrupted'), {
          code: 'EPERM',
        });
      });

    try {
      await expect(
        createService().move(
          { root: 'downloads', path: 'folder' },
          { root: 'media', path: 'folder' },
        ),
      ).rejects.toMatchObject({
        status: 422,
        message:
          'Move incomplete; source was not removed and destination was preserved',
        outcome: 'destination-preserved',
      });
      await expect(
        fs.promises.readFile(
          path.join(mediaRoot, 'folder', 'episode.mkv'),
          'utf8',
        ),
      ).resolves.toBe('video');
      await expect(
        fs.promises.readFile(
          path.join(downloadsRoot, 'folder', 'episode.mkv'),
          'utf8',
        ),
      ).rejects.toThrow();
      await expect(
        fs.promises.access(path.join(downloadsRoot, 'folder')),
      ).resolves.toBeUndefined();
    } finally {
      renameSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it('does not remove a competitor child during partial directory copy cleanup', async () => {
    await writeFile(path.join(downloadsRoot, 'folder', 'first.txt'), 'first');
    const destinationPath = path.join(mediaRoot, 'folder');
    const competitorPath = path.join(destinationPath, 'competitor.txt');
    const copyFileSpy = vi
      .spyOn(fs.promises, 'copyFile')
      .mockImplementationOnce(async () => {
        await writeFile(competitorPath, 'competitor');
        throw Object.assign(new Error('copy failed'), { code: 'EACCES' });
      });

    try {
      await expect(
        createService().copy(
          { root: 'downloads', path: 'folder' },
          { root: 'media', path: 'folder' },
        ),
      ).rejects.toMatchObject({
        status: 422,
        message: 'Permission denied',
      });
      await expect(fs.promises.readFile(competitorPath, 'utf8')).resolves.toBe(
        'competitor',
      );
      await expect(
        fs.promises.readFile(
          path.join(downloadsRoot, 'folder', 'first.txt'),
          'utf8',
        ),
      ).resolves.toBe('first');
    } finally {
      copyFileSpy.mockRestore();
    }
  });

  it('renames files and directories within their parent directory', async () => {
    await writeFile(path.join(mediaRoot, 'episode.mkv'), 'video');
    const fileResult = await createService().rename(
      { root: 'media', path: 'episode.mkv' },
      'renamed.mkv',
    );

    expect(fileResult).toMatchObject({
      name: 'renamed.mkv',
      path: 'renamed.mkv',
      type: 'file',
    });
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'renamed.mkv'), 'utf8'),
    ).resolves.toBe('video');
    await expect(
      fs.promises.access(path.join(mediaRoot, 'episode.mkv')),
    ).rejects.toThrow();

    await writeFile(path.join(mediaRoot, 'Season 01', 'episode.mkv'), 'video');
    const directoryResult = await createService().rename(
      { root: 'media', path: 'Season 01' },
      'Season 02',
    );

    expect(directoryResult).toMatchObject({
      name: 'Season 02',
      path: 'Season 02',
      type: 'directory',
    });
    await expect(
      fs.promises.readFile(
        path.join(mediaRoot, 'Season 02', 'episode.mkv'),
        'utf8',
      ),
    ).resolves.toBe('video');
  });

  it('does not overwrite a destination created during a rename', async () => {
    await writeFile(path.join(mediaRoot, 'episode.mkv'), 'source');
    const destinationPath = path.join(mediaRoot, 'renamed.mkv');
    const originalLink = fs.promises.link.bind(fs.promises);
    const linkSpy = vi
      .spyOn(fs.promises, 'link')
      .mockImplementationOnce(async (sourcePath, targetPath) => {
        await writeFile(destinationPath, 'competitor');
        return await originalLink(sourcePath, targetPath);
      });

    try {
      await expect(
        createService().rename(
          { root: 'media', path: 'episode.mkv' },
          'renamed.mkv',
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Destination already exists',
      });
      await expect(fs.promises.readFile(destinationPath, 'utf8')).resolves.toBe(
        'competitor',
      );
      await expect(
        fs.promises.readFile(path.join(mediaRoot, 'episode.mkv'), 'utf8'),
      ).resolves.toBe('source');
    } finally {
      linkSpy.mockRestore();
    }
  });

  it('renames same-filesystem directories with one rename and preserves metadata', async () => {
    const sourcePath = path.join(mediaRoot, 'Season 01');
    const destinationPath = path.join(mediaRoot, 'Season 02');
    const modifiedAt = new Date('2020-01-02T03:04:05.000Z');
    await fs.promises.mkdir(sourcePath);
    await fs.promises.chmod(sourcePath, 0o751);
    await fs.promises.utimes(sourcePath, modifiedAt, modifiedAt);
    const renameSpy = vi.spyOn(fs.promises, 'rename');

    try {
      await expect(
        createService().rename(
          { root: 'media', path: 'Season 01' },
          'Season 02',
        ),
      ).resolves.toMatchObject({ path: 'Season 02', type: 'directory' });
      const destinationStats = await fs.promises.stat(destinationPath);
      expect(renameSpy).toHaveBeenCalledTimes(1);
      expect(renameSpy).toHaveBeenCalledWith(sourcePath, destinationPath);
      expect(destinationStats.mode & 0o7777).toBe(0o751);
      expect(destinationStats.mtimeMs).toBe(modifiedAt.getTime());
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('rejects invalid rename names before changing the source', async () => {
    await writeFile(path.join(mediaRoot, 'episode.mkv'), 'video');

    const invalidNames = [
      '',
      '.',
      '..',
      'nested/name',
      'nested\\name',
      '   ',
      '\0',
      '/absolute',
      'C:\\absolute',
      'C:relative',
    ];
    for (const name of invalidNames) {
      expect(isValidRenameName(name)).toBe(false);
      await expect(
        createService().rename({ root: 'media', path: 'episode.mkv' }, name),
      ).rejects.toMatchObject({ status: 400 });
    }

    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'episode.mkv'), 'utf8'),
    ).resolves.toBe('video');
  });

  it('rejects rename conflicts without overwriting the destination', async () => {
    await writeFile(path.join(mediaRoot, 'episode.mkv'), 'new');
    await writeFile(path.join(mediaRoot, 'existing.mkv'), 'old');

    await expect(
      createService().rename(
        { root: 'media', path: 'episode.mkv' },
        'existing.mkv',
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Destination already exists',
    });
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'episode.mkv'), 'utf8'),
    ).resolves.toBe('new');
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'existing.mkv'), 'utf8'),
    ).resolves.toBe('old');
  });

  it('creates one directory under configured locations', async () => {
    await fs.promises.mkdir(path.join(mediaRoot, 'Shows'));

    const rootResult = await createService().createDirectory(
      { root: 'media', path: '' },
      'New Folder',
    );
    expect(rootResult).toMatchObject({
      name: 'New Folder',
      path: 'New Folder',
      type: 'directory',
      size: null,
    });
    const rootStats = await fs.promises.stat(
      path.join(mediaRoot, 'New Folder'),
    );
    expect(rootStats.isDirectory()).toBe(true);

    const nestedResult = await createService().createDirectory(
      { root: 'media', path: 'Shows' },
      'Season 01',
    );
    expect(nestedResult).toMatchObject({
      name: 'Season 01',
      path: 'Shows/Season 01',
      type: 'directory',
    });
    const nestedStats = await fs.promises.stat(
      path.join(mediaRoot, 'Shows', 'Season 01'),
    );
    expect(nestedStats.isDirectory()).toBe(true);

    const spacedResult = await createService().createDirectory(
      { root: 'media', path: '' },
      ' folder ',
    );
    expect(spacedResult).toMatchObject({
      name: ' folder ',
      path: ' folder ',
      type: 'directory',
    });
  });

  it('rejects unsafe directory names, conflicts, and escapes', async () => {
    await fs.promises.mkdir(path.join(mediaRoot, 'existing'));
    const invalidNames = [
      '',
      '.',
      '..',
      'nested/name',
      'nested\\name',
      '   ',
      '\0',
      '/absolute',
      'C:\\absolute',
      'C:relative',
    ];

    for (const name of invalidNames) {
      await expect(
        createService().createDirectory({ root: 'media', path: '' }, name),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Name must be a single non-empty basename',
      });
    }

    await expect(
      createService().createDirectory({ root: 'media', path: '' }, 'existing'),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Destination already exists',
    });

    await writeFile(path.join(mediaRoot, 'not-directory'), 'file');
    await expect(
      createService().createDirectory(
        { root: 'media', path: 'not-directory' },
        'child',
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Path is not a directory',
    });
    await expect(
      createService().createDirectory(
        { root: 'media', path: 'missing' },
        'child',
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createService().createDirectory(
        { root: 'media', path: '../outside' },
        'child',
      ),
    ).rejects.toMatchObject({ status: 400 });

    await fs.promises.mkdir(path.join(outsideRoot, 'nested'), {
      recursive: true,
    });
    await fs.promises.symlink(outsideRoot, path.join(mediaRoot, 'escape'));
    await expect(
      createService().createDirectory(
        { root: 'media', path: 'escape/nested' },
        'child',
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      fs.promises.access(path.join(outsideRoot, 'nested', 'child')),
    ).rejects.toThrow();
  });

  it('deletes files and directories but never configured roots', async () => {
    await writeFile(path.join(mediaRoot, 'folder', 'episode.mkv'), 'video');

    await createService().delete({ root: 'media', path: 'folder' });
    await expect(
      fs.promises.access(path.join(mediaRoot, 'folder')),
    ).rejects.toThrow();
    await expect(
      createService().delete({ root: 'media', path: '' }),
    ).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      createService().rename({ root: 'media', path: '' }, 'renamed-media'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects traversal and symlink escapes for source and destination', async () => {
    await writeFile(path.join(outsideRoot, 'secret.txt'), 'secret');
    await fs.promises.symlink(
      path.join(outsideRoot, 'secret.txt'),
      path.join(downloadsRoot, 'secret.txt'),
    );
    await fs.promises.symlink(
      outsideRoot,
      path.join(downloadsRoot, 'outside-link'),
    );
    await fs.promises.mkdir(path.join(outsideRoot, 'destination'), {
      recursive: true,
    });
    await fs.promises.symlink(
      path.join(outsideRoot, 'destination'),
      path.join(mediaRoot, 'linked'),
    );
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'video');

    await expect(
      createService().copy(
        { root: 'downloads', path: '../outside/secret.txt' },
        { root: 'media', path: 'copy.txt' },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createService().copy(
        { root: 'downloads', path: 'secret.txt' },
        { root: 'media', path: 'copy.txt' },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createService().list('downloads', 'outside-link/secret.txt'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createService().copy(
        { root: 'downloads', path: 'episode.mkv' },
        { root: 'media', path: 'linked/copy.txt' },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createService().rename({ root: 'media', path: 'linked' }, 'secret.txt'),
    ).rejects.toMatchObject({ status: 400 });

    await fs.promises.mkdir(path.join(mediaRoot, 'folder'), {
      recursive: true,
    });
    await fs.promises.symlink(
      path.join(outsideRoot, 'secret.txt'),
      path.join(mediaRoot, 'folder', 'link.txt'),
    );
    await expect(
      createService().rename(
        { root: 'media', path: 'folder' },
        'renamed-folder',
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      fs.promises.access(path.join(mediaRoot, 'folder')),
    ).resolves.toBeUndefined();
  });

  it('rejects copying a directory into itself and missing settings', async () => {
    await fs.promises.mkdir(path.join(downloadsRoot, 'folder'), {
      recursive: true,
    });
    await writeFile(path.join(downloadsRoot, 'folder', 'file.txt'), 'file');

    await expect(
      createService().copy(
        { root: 'downloads', path: 'folder' },
        { root: 'downloads', path: 'folder/nested-copy' },
      ),
    ).rejects.toMatchObject({ status: 400 });

    const missingSettingsService = new FileManagerService({
      settingsService: { getSettings: async () => null },
    });
    await expect(
      missingSettingsService.list('media', ''),
    ).rejects.toMatchObject({
      status: 400,
    });

    const mediaOnlySettingsService = new FileManagerService({
      settingsService: {
        getSettings: async () => ({
          mediaDir: mediaRoot,
          downloadDir: '',
        }),
      },
    });
    await expect(
      mediaOnlySettingsService.list('media', ''),
    ).resolves.toMatchObject({
      root: 'media',
      path: '',
    });
    await expect(
      mediaOnlySettingsService.list('downloads', ''),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Download directory is not configured',
    });

    const unavailableSettingsService = new FileManagerService({
      settingsService: {
        getSettings: async () => ({
          mediaDir: path.join(testRoot, 'missing-media'),
          downloadDir: downloadsRoot,
        }),
      },
    });
    await expect(
      unavailableSettingsService.list('media', ''),
    ).rejects.toMatchObject({
      status: 400,
    });

    const failingSettingsService = new FileManagerService({
      settingsService: {
        getSettings: async () => {
          throw new Error('settings unavailable');
        },
      },
    });
    await expect(
      failingSettingsService.list('media', ''),
    ).rejects.toMatchObject({
      status: 500,
    });
  });

  it('supports operations when only the involved root is configured', async () => {
    const mediaOnlyService = new FileManagerService({
      settingsService: {
        getSettings: async () => ({
          mediaDir: mediaRoot,
          downloadDir: '',
        }),
      },
    });
    await writeFile(path.join(mediaRoot, 'source.txt'), 'source');

    await expect(
      mediaOnlyService.createDirectory(
        { root: 'media', path: '' },
        'media-folder',
      ),
    ).resolves.toMatchObject({
      name: 'media-folder',
      path: 'media-folder',
      type: 'directory',
    });

    await expect(
      mediaOnlyService.copy(
        { root: 'media', path: 'source.txt' },
        { root: 'media', path: 'copied.txt' },
      ),
    ).resolves.toMatchObject({
      name: 'copied.txt',
      path: 'copied.txt',
      type: 'file',
    });
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'copied.txt'), 'utf8'),
    ).resolves.toBe('source');

    await expect(
      mediaOnlyService.move(
        { root: 'media', path: 'copied.txt' },
        { root: 'media', path: 'moved.txt' },
      ),
    ).resolves.toMatchObject({
      name: 'moved.txt',
      path: 'moved.txt',
      type: 'file',
    });
    await expect(
      fs.promises.access(path.join(mediaRoot, 'copied.txt')),
    ).rejects.toThrow();

    await expect(
      mediaOnlyService.rename(
        { root: 'media', path: 'moved.txt' },
        'renamed.txt',
      ),
    ).resolves.toMatchObject({
      name: 'renamed.txt',
      path: 'renamed.txt',
      type: 'file',
    });
    await mediaOnlyService.delete({ root: 'media', path: 'renamed.txt' });
    await expect(
      fs.promises.access(path.join(mediaRoot, 'renamed.txt')),
    ).rejects.toThrow();

    await expect(
      mediaOnlyService.copy(
        { root: 'media', path: 'source.txt' },
        { root: 'downloads', path: 'source.txt' },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Download directory is not configured',
    });
    await expect(
      mediaOnlyService.move(
        { root: 'media', path: 'source.txt' },
        { root: 'downloads', path: 'moved.txt' },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Download directory is not configured',
    });
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'source.txt'), 'utf8'),
    ).resolves.toBe('source');

    const downloadsOnlyService = new FileManagerService({
      settingsService: {
        getSettings: async () => ({
          mediaDir: '',
          downloadDir: downloadsRoot,
        }),
      },
    });
    await expect(
      downloadsOnlyService.createDirectory(
        { root: 'downloads', path: '' },
        'downloads-folder',
      ),
    ).resolves.toMatchObject({
      name: 'downloads-folder',
      path: 'downloads-folder',
      type: 'directory',
    });
  });

  it('cleans up a failed copy and maps filesystem failures', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'video');
    await fs.promises.mkdir(path.join(mediaRoot, 'target'), {
      recursive: true,
    });

    const conflictCopyFileSpy = vi
      .spyOn(fs.promises, 'copyFile')
      .mockRejectedValueOnce(
        Object.assign(new Error('exists'), { code: 'EEXIST' }),
      );
    await expect(
      createService().copy(
        { root: 'downloads', path: 'episode.mkv' },
        { root: 'media', path: 'target/episode.mkv' },
      ),
    ).rejects.toMatchObject({ status: 409 });
    conflictCopyFileSpy.mockRestore();

    const permissionCopyFileSpy = vi
      .spyOn(fs.promises, 'copyFile')
      .mockRejectedValueOnce(
        Object.assign(new Error('permission denied'), { code: 'EACCES' }),
      );
    await expect(
      createService().copy(
        { root: 'downloads', path: 'episode.mkv' },
        { root: 'media', path: 'target/permission.mkv' },
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Permission denied',
    });
    permissionCopyFileSpy.mockRestore();

    const internalCopyFileSpy = vi
      .spyOn(fs.promises, 'copyFile')
      .mockRejectedValueOnce(new Error('unexpected failure'));
    await expect(
      createService().copy(
        { root: 'downloads', path: 'episode.mkv' },
        { root: 'media', path: 'target/internal.mkv' },
      ),
    ).rejects.toMatchObject({ status: 500 });
    internalCopyFileSpy.mockRestore();
  });

  it('does not remove a destination created while a copy is failing', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'source');
    const destinationPath = path.join(mediaRoot, 'episode.mkv');
    const copyFileSpy = vi
      .spyOn(fs.promises, 'copyFile')
      .mockImplementationOnce(async () => {
        await writeFile(destinationPath, 'competitor');
        throw Object.assign(new Error('copy failed'), { code: 'EACCES' });
      });

    try {
      await expect(
        createService().copy(
          { root: 'downloads', path: 'episode.mkv' },
          { root: 'media', path: 'episode.mkv' },
        ),
      ).rejects.toMatchObject({
        status: 422,
        message: 'Permission denied',
      });
      await expect(fs.promises.readFile(destinationPath, 'utf8')).resolves.toBe(
        'competitor',
      );
    } finally {
      copyFileSpy.mockRestore();
    }
  });

  it('does not log absolute paths when partial-copy cleanup fails', async () => {
    await writeFile(path.join(downloadsRoot, 'folder', 'episode.mkv'), 'video');
    const destinationPath = path.join(mediaRoot, 'folder');
    const competitorPath = path.join(destinationPath, 'competitor.txt');

    const copyFileSpy = vi
      .spyOn(fs.promises, 'copyFile')
      .mockImplementationOnce(async () => {
        await writeFile(competitorPath, 'competitor');
        throw Object.assign(new Error('copy failed'), { code: 'EACCES' });
      });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    try {
      await expect(
        createService().copy(
          { root: 'downloads', path: 'folder' },
          { root: 'media', path: 'folder' },
        ),
      ).rejects.toMatchObject({
        status: 422,
        message: 'Permission denied',
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toMatchObject({
        message: 'Failed to remove partial file manager copy',
        root: 'media',
        path: 'folder',
      });
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(mediaRoot);
      await expect(fs.promises.readFile(competitorPath, 'utf8')).resolves.toBe(
        'competitor',
      );
    } finally {
      copyFileSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('falls back to copy and delete for cross-device moves', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'video');
    const linkSpy = vi
      .spyOn(fs.promises, 'link')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device'), { code: 'EXDEV' }),
      );

    await expect(
      createService().move(
        { root: 'downloads', path: 'episode.mkv' },
        { root: 'media', path: 'episode.mkv' },
      ),
    ).resolves.toMatchObject({ path: 'episode.mkv' });
    linkSpy.mockRestore();
    await expect(
      fs.promises.readFile(path.join(mediaRoot, 'episode.mkv'), 'utf8'),
    ).resolves.toBe('video');
  });

  it('rolls back the destination when source cleanup fails after a cross-device copy', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'video');
    const linkSpy = vi
      .spyOn(fs.promises, 'link')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device'), { code: 'EXDEV' }),
      );
    const removeSpy = vi
      .spyOn(fs.promises, 'unlink')
      .mockRejectedValueOnce(
        Object.assign(new Error('source busy'), { code: 'EPERM' }),
      );

    await expect(
      createService().move(
        { root: 'downloads', path: 'episode.mkv' },
        { root: 'media', path: 'episode.mkv' },
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Permission denied',
    });

    linkSpy.mockRestore();
    removeSpy.mockRestore();
    await expect(
      fs.promises.access(path.join(mediaRoot, 'episode.mkv')),
    ).rejects.toThrow();
    await expect(
      fs.promises.readFile(path.join(downloadsRoot, 'episode.mkv'), 'utf8'),
    ).resolves.toBe('video');
  });

  it('reports an incomplete move when destination rollback is not safe', async () => {
    await writeFile(path.join(downloadsRoot, 'episode.mkv'), 'video');
    const linkSpy = vi
      .spyOn(fs.promises, 'link')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device'), { code: 'EXDEV' }),
      );
    const unlinkSpy = vi
      .spyOn(fs.promises, 'unlink')
      .mockRejectedValue(
        Object.assign(new Error('source busy'), { code: 'EPERM' }),
      );

    try {
      await expect(
        createService().move(
          { root: 'downloads', path: 'episode.mkv' },
          { root: 'media', path: 'episode.mkv' },
        ),
      ).rejects.toMatchObject({
        status: 422,
        message:
          'Move incomplete; source was not removed and destination was preserved',
        outcome: 'destination-preserved',
      });
      await expect(
        fs.promises.readFile(path.join(mediaRoot, 'episode.mkv'), 'utf8'),
      ).resolves.toBe('video');
      await expect(
        fs.promises.readFile(path.join(downloadsRoot, 'episode.mkv'), 'utf8'),
      ).resolves.toBe('video');
    } finally {
      linkSpy.mockRestore();
      unlinkSpy.mockRestore();
    }
  });
});
