import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mediaRoot, downloadsRoot, loggerMock } = vi.hoisted(() => {
  const root = `${process.cwd()}/test/.tmp-file-manager-route`;
  return {
    mediaRoot: `${root}/media`,
    downloadsRoot: `${root}/downloads`,
    loggerMock: {
      debug: vi.fn<(fields: object, message: string) => void>(),
      warn: vi.fn<(fields: object, message: string) => void>(),
      error: vi.fn<(fields: object, message: string) => void>(),
    },
  };
});

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async getSettings(): Promise<{
      mediaDir: string;
      downloadDir: string;
    }> {
      return { mediaDir: mediaRoot, downloadDir: downloadsRoot };
    }
  },
}));

vi.mock('@server/lib/logger', () => ({ default: loggerMock }));

import {
  FileManagerError,
  FileManagerService,
} from '@server/features/file-management/file-manager.service';
import { fileManagerRoute } from '@server/routes/file-manager';

beforeEach(async () => {
  loggerMock.debug.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();
  await fs.promises.rm(path.dirname(mediaRoot), {
    recursive: true,
    force: true,
  });
  await Promise.all([
    fs.promises.mkdir(mediaRoot, { recursive: true }),
    fs.promises.mkdir(downloadsRoot, { recursive: true }),
  ]);
});

afterEach(async () => {
  await fs.promises.rm(path.dirname(mediaRoot), {
    recursive: true,
    force: true,
  });
});

describe('fileManagerRoute', () => {
  it('lists a configured root through the RPC route', async () => {
    await fs.promises.writeFile(path.join(mediaRoot, 'poster.jpg'), 'poster');

    const response = await fileManagerRoute.request('/?root=media');
    const body = (await response.json()) as {
      success: boolean;
      data?: { root: string; path: string; entries: Array<{ path: string }> };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        root: 'media',
        path: '',
        entries: [{ path: 'poster.jpg' }],
      },
    });
    expect(loggerMock.debug).toHaveBeenCalledTimes(2);
    expect(loggerMock.debug.mock.calls[0]?.[0]).toMatchObject({
      operation: 'list',
      phase: 'start',
      root: 'media',
      path: '',
    });
    expect(loggerMock.debug.mock.calls[1]?.[0]).toMatchObject({
      operation: 'list',
      phase: 'success',
      root: 'media',
      path: '',
      durationMs: expect.any(Number),
    });
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('returns batched directory sizes through the RPC route', async () => {
    await fs.promises.mkdir(path.join(mediaRoot, 'size-folder', 'nested'), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(mediaRoot, 'size-folder', 'episode.mkv'),
      'video',
    );
    await fs.promises.writeFile(
      path.join(mediaRoot, 'size-folder', 'nested', 'subtitle.srt'),
      'subtitles',
    );

    const response = await fileManagerRoute.request('/sizes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locations: [{ root: 'media', path: 'size-folder' }],
      }),
    });
    const body = (await response.json()) as {
      success: boolean;
      data?: Array<{
        root: string;
        path: string;
        size: number | null;
        status: string;
        calculatedAt: string | null;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: [
        {
          root: 'media',
          path: 'size-folder',
          size: 14,
          status: 'ready',
        },
      ],
    });
    expect(body.data?.[0]?.calculatedAt).toMatch(/T/);
    expect(loggerMock.debug).toHaveBeenCalledTimes(2);
    expect(loggerMock.debug.mock.calls[0]?.[0]).toMatchObject({
      operation: 'sizes',
      phase: 'start',
      locations: [{ root: 'media', path: 'size-folder' }],
    });
    expect(loggerMock.debug.mock.calls[1]?.[0]).toMatchObject({
      operation: 'sizes',
      phase: 'success',
      durationMs: expect.any(Number),
    });
  });

  it('rejects oversized directory-size batches', async () => {
    const locations = Array.from({ length: 33 }, () => ({
      root: 'media',
      path: '',
    }));
    const response = await fileManagerRoute.request('/sizes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locations }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 400,
    });
    expect(loggerMock.debug).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0]?.[0]).toMatchObject({
      operation: 'sizes',
      phase: 'failure',
      status: 400,
      durationMs: 0,
    });
  });

  it.each(['EACCES', 'EPERM'] as const)(
    'returns 422 when configured root resolution fails with %s',
    async (code) => {
      const realpathSpy = vi
        .spyOn(fs.promises, 'realpath')
        .mockRejectedValueOnce(
          Object.assign(new Error(`${code} root failure`), { code }),
        );

      try {
        const response = await fileManagerRoute.request('/?root=media');
        const body = (await response.json()) as {
          success: boolean;
          message?: string;
        };

        expect(response.status).toBe(422);
        expect(body).toMatchObject({
          success: false,
          message: 'Permission denied',
        });
        expect(loggerMock.debug).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn.mock.calls[0]?.[0]).toMatchObject({
          operation: 'list',
          phase: 'failure',
          root: 'media',
          path: '',
          status: 422,
          message: 'Permission denied',
          durationMs: expect.any(Number),
        });
        expect(loggerMock.error).not.toHaveBeenCalled();
      } finally {
        realpathSpy.mockRestore();
      }
    },
  );

  it('validates list query parameters', async () => {
    const response = await fileManagerRoute.request('/?root=invalid');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 400,
    });
  });

  it('logs sanitized validation failures for each file-manager operation', async () => {
    const listResponse = await fileManagerRoute.request(
      '/?root=invalid&path=%2Fprivate%2Fsecret',
    );
    expect(listResponse.status).toBe(400);

    const moveResponse = await fileManagerRoute.request('/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { root: 'invalid', path: '/private/secret' },
        destination: { root: 'downloads', path: 'safe' },
      }),
    });
    expect(moveResponse.status).toBe(400);

    const directoryResponse = await fileManagerRoute.request('/directory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: { root: 'media', path: '/private/secret' },
        name: '   ',
      }),
    });
    expect(directoryResponse.status).toBe(400);

    expect(loggerMock.debug).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledTimes(3);
    expect(loggerMock.warn.mock.calls.map(([fields]) => fields)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'list',
          phase: 'failure',
          status: 400,
          path: '[invalid path]',
          durationMs: 0,
          issues: expect.any(Array),
        }),
        expect.objectContaining({
          operation: 'move',
          phase: 'failure',
          status: 400,
          source: { path: '[invalid path]' },
          destination: { root: 'downloads', path: 'safe' },
          durationMs: 0,
          issues: expect.any(Array),
        }),
        expect.objectContaining({
          operation: 'create-directory',
          phase: 'failure',
          status: 400,
          root: 'media',
          path: '[invalid path]',
          name: '[invalid name]',
          durationMs: 0,
          issues: expect.any(Array),
        }),
      ]),
    );
    expect(JSON.stringify(loggerMock.warn.mock.calls)).not.toContain(
      '/private/secret',
    );
  });

  it('logs one warning for expected file-manager failures', async () => {
    const response = await fileManagerRoute.request('/', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: { root: 'media', path: '' } }),
    });

    expect(response.status).toBe(400);
    expect(loggerMock.debug).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.warn.mock.calls[0]?.[0]).toMatchObject({
      operation: 'delete',
      phase: 'failure',
      root: 'media',
      path: '',
      durationMs: expect.any(Number),
      status: 400,
      message: 'The configured root cannot be operated on',
    });
    expect(JSON.stringify(loggerMock.warn.mock.calls)).not.toContain(mediaRoot);
  });

  it.each([
    ['EACCES', 422, 'Permission denied'],
    ['EPERM', 422, 'Permission denied'],
    ['ENOTDIR', 400, 'Path is not a directory'],
  ] as const)(
    'maps %s move failures to safe responses and warning logs',
    async (code, status, message) => {
      await fs.promises.writeFile(
        path.join(downloadsRoot, 'source.txt'),
        'source',
      );
      const linkSpy = vi
        .spyOn(fs.promises, 'link')
        .mockRejectedValueOnce(
          Object.assign(new Error(`${code} failure`), { code }),
        );

      try {
        const response = await fileManagerRoute.request('/move', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            source: { root: 'downloads', path: 'source.txt' },
            destination: { root: 'media', path: 'moved.txt' },
          }),
        });
        const body = (await response.json()) as {
          success: boolean;
          message?: string;
          code?: number;
        };

        expect(response.status).toBe(status);
        expect(body).toMatchObject({
          success: false,
          message,
        });
        expect(loggerMock.debug).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn.mock.calls[0]?.[0]).toMatchObject({
          operation: 'move',
          phase: 'failure',
          status,
          message,
          source: { root: 'downloads', path: 'source.txt' },
          destination: { root: 'media', path: 'moved.txt' },
          durationMs: expect.any(Number),
        });
        expect(loggerMock.error).not.toHaveBeenCalled();
      } finally {
        linkSpy.mockRestore();
      }
    },
  );

  it('returns the destination-preserved outcome for incomplete moves', async () => {
    const moveSpy = vi
      .spyOn(FileManagerService.prototype, 'move')
      .mockRejectedValueOnce(
        new FileManagerError(
          'Move incomplete; source was not removed and destination was preserved',
          422,
          'destination-preserved',
        ),
      );

    try {
      const response = await fileManagerRoute.request('/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: { root: 'downloads', path: 'source.txt' },
          destination: { root: 'media', path: 'moved.txt' },
        }),
      });
      const body = (await response.json()) as {
        success: boolean;
        message?: string;
        outcome?: string;
      };

      expect(response.status).toBe(422);
      expect(body).toMatchObject({
        success: false,
        message:
          'Move incomplete; source was not removed and destination was preserved',
        outcome: 'destination-preserved',
      });
    } finally {
      moveSpy.mockRestore();
    }
  });

  it('logs unexpected failures once with a stack and safe logical fields', async () => {
    const unexpectedError = new Error('Unexpected file manager failure');
    const listSpy = vi
      .spyOn(FileManagerService.prototype, 'list')
      .mockRejectedValueOnce(unexpectedError);

    try {
      const response = await fileManagerRoute.request(
        '/?root=media&path=%2Fprivate%2Fsecret',
      );

      expect(response.status).toBe(500);
    } finally {
      listSpy.mockRestore();
    }

    expect(loggerMock.debug).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.debug.mock.calls[0]?.[0]).toMatchObject({
      operation: 'list',
      phase: 'start',
      root: 'media',
      path: '[invalid path]',
    });
    expect(loggerMock.error.mock.calls[0]?.[0]).toMatchObject({
      operation: 'list',
      phase: 'failure',
      root: 'media',
      path: '[invalid path]',
      durationMs: expect.any(Number),
      error: {
        name: 'Error',
        message: unexpectedError.message,
        stack: unexpectedError.stack,
      },
    });
    expect(JSON.stringify(loggerMock.debug.mock.calls)).not.toContain(
      '/private/secret',
    );
  });

  it('copies, moves, and deletes items through RPC routes', async () => {
    await fs.promises.writeFile(
      path.join(downloadsRoot, 'episode.mkv'),
      'video',
    );
    await fs.promises.mkdir(path.join(mediaRoot, 'incoming'), {
      recursive: true,
    });

    const copyResponse = await fileManagerRoute.request('/copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { root: 'downloads', path: 'episode.mkv' },
        destination: { root: 'media', path: 'incoming/episode.mkv' },
      }),
    });
    expect(copyResponse.status).toBe(200);
    expect(
      await fs.promises.readFile(
        path.join(mediaRoot, 'incoming', 'episode.mkv'),
        'utf8',
      ),
    ).toBe('video');

    const moveResponse = await fileManagerRoute.request('/move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { root: 'downloads', path: 'episode.mkv' },
        destination: { root: 'media', path: 'incoming/moved.mkv' },
      }),
    });
    expect(moveResponse.status).toBe(200);

    const deleteResponse = await fileManagerRoute.request('/', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { root: 'media', path: 'incoming/moved.mkv' },
      }),
    });
    expect(deleteResponse.status).toBe(200);
    await expect(
      fs.promises.access(path.join(mediaRoot, 'incoming', 'moved.mkv')),
    ).rejects.toThrow();
  });

  it('renames files and directories through the RPC route', async () => {
    await fs.promises.writeFile(path.join(mediaRoot, 'episode.mkv'), 'video');
    await fs.promises.mkdir(path.join(downloadsRoot, 'Season 01'), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(downloadsRoot, 'Season 01', 'episode.mkv'),
      'video',
    );

    const fileResponse = await fileManagerRoute.request('/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { root: 'media', path: 'episode.mkv' },
        name: 'renamed.mkv',
      }),
    });
    expect(fileResponse.status).toBe(200);
    expect(await fileResponse.json()).toMatchObject({
      success: true,
      data: { name: 'renamed.mkv', path: 'renamed.mkv', type: 'file' },
    });

    const directoryResponse = await fileManagerRoute.request('/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { root: 'downloads', path: 'Season 01' },
        name: 'Season 02',
      }),
    });
    expect(directoryResponse.status).toBe(200);
    expect(await directoryResponse.json()).toMatchObject({
      success: true,
      data: { name: 'Season 02', path: 'Season 02', type: 'directory' },
    });
    await expect(
      fs.promises.readFile(
        path.join(downloadsRoot, 'Season 02', 'episode.mkv'),
        'utf8',
      ),
    ).resolves.toBe('video');
  });

  it('creates directories through the RPC route', async () => {
    const rootResponse = await fileManagerRoute.request('/directory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: { root: 'media', path: '' },
        name: 'New Folder',
      }),
    });
    expect(rootResponse.status).toBe(200);
    expect(await rootResponse.json()).toMatchObject({
      success: true,
      data: {
        name: 'New Folder',
        path: 'New Folder',
        type: 'directory',
        size: null,
      },
    });
    const rootStats = await fs.promises.stat(
      path.join(mediaRoot, 'New Folder'),
    );
    expect(rootStats.isDirectory()).toBe(true);

    await fs.promises.mkdir(path.join(downloadsRoot, 'incoming'));
    const nestedResponse = await fileManagerRoute.request('/directory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: { root: 'downloads', path: 'incoming' },
        name: 'Season 01',
      }),
    });
    expect(nestedResponse.status).toBe(200);
    expect(await nestedResponse.json()).toMatchObject({
      success: true,
      data: {
        name: 'Season 01',
        path: 'incoming/Season 01',
        type: 'directory',
      },
    });
  });

  it('validates rename names and protects roots and symlinks', async () => {
    await fs.promises.writeFile(path.join(mediaRoot, 'episode.mkv'), 'video');
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
      const response = await fileManagerRoute.request('/rename', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: { root: 'media', path: 'episode.mkv' },
          name,
        }),
      });
      expect(response.status).toBe(400);
    }

    const rootResponse = await fileManagerRoute.request('/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { root: 'media', path: '' },
        name: 'renamed-media',
      }),
    });
    expect(rootResponse.status).toBe(400);

    await fs.promises.mkdir(path.join(mediaRoot, 'outside'), {
      recursive: true,
    });
    await fs.promises.symlink(
      path.join(mediaRoot, 'outside'),
      path.join(mediaRoot, 'linked'),
    );
    const symlinkResponse = await fileManagerRoute.request('/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { root: 'media', path: 'linked' },
        name: 'renamed-link',
      }),
    });
    expect(symlinkResponse.status).toBe(400);
  });

  it('returns conflict and validation errors', async () => {
    await fs.promises.writeFile(path.join(downloadsRoot, 'episode.mkv'), 'new');
    await fs.promises.writeFile(path.join(mediaRoot, 'episode.mkv'), 'old');

    const conflictResponse = await fileManagerRoute.request('/copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { root: 'downloads', path: 'episode.mkv' },
        destination: { root: 'media', path: 'episode.mkv' },
      }),
    });
    expect(conflictResponse.status).toBe(409);
    expect(await conflictResponse.json()).toMatchObject({
      success: false,
      message: 'Destination already exists',
    });

    const malformedResponse = await fileManagerRoute.request('/copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformedResponse.status).toBe(400);

    const renameConflictResponse = await fileManagerRoute.request('/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: { root: 'downloads', path: 'episode.mkv' },
        name: 'episode.mkv',
      }),
    });
    expect(renameConflictResponse.status).toBe(409);
    expect(await renameConflictResponse.json()).toMatchObject({
      success: false,
      message: 'Destination already exists',
    });

    const rootDeleteResponse = await fileManagerRoute.request('/', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: { root: 'media', path: '' } }),
    });
    expect(rootDeleteResponse.status).toBe(400);
  });

  it('validates directory names and rejects unsafe locations', async () => {
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
      const response = await fileManagerRoute.request('/directory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          location: { root: 'media', path: '' },
          name,
        }),
      });
      expect(response.status).toBe(400);
    }

    const conflictResponse = await fileManagerRoute.request('/directory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: { root: 'media', path: '' },
        name: 'existing',
      }),
    });
    expect(conflictResponse.status).toBe(409);
    expect(await conflictResponse.json()).toMatchObject({
      success: false,
      message: 'Destination already exists',
    });

    const traversalResponse = await fileManagerRoute.request('/directory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: { root: 'media', path: '../outside' },
        name: 'child',
      }),
    });
    expect(traversalResponse.status).toBe(400);

    const outsideRoot = path.join(path.dirname(mediaRoot), 'outside');
    await fs.promises.mkdir(path.join(outsideRoot, 'nested'), {
      recursive: true,
    });
    await fs.promises.symlink(outsideRoot, path.join(mediaRoot, 'escape'));
    const symlinkResponse = await fileManagerRoute.request('/directory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: { root: 'media', path: 'escape/nested' },
        name: 'child',
      }),
    });
    expect(symlinkResponse.status).toBe(400);
    await expect(
      fs.promises.access(path.join(outsideRoot, 'nested', 'child')),
    ).rejects.toThrow();
  });
});
