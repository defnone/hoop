import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mediaRoot, downloadsRoot, loggerMock } = vi.hoisted(() => {
  const root = `${process.cwd()}/test/.tmp-file-manager-rename-batch-route`;
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

import { FILE_MANAGER_BATCH_RENAME_MAX_ITEMS } from '@server/features/file-management/file-manager.service';
import { fileManagerRoute } from '@server/routes/file-manager';

beforeEach(async () => {
  loggerMock.debug.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();
  await fs.promises.rm(path.dirname(mediaRoot), {
    recursive: true,
    force: true,
  });
  await fs.promises.mkdir(mediaRoot, { recursive: true });
  await fs.promises.mkdir(downloadsRoot, { recursive: true });
});

afterEach(async () => {
  await fs.promises.rm(path.dirname(mediaRoot), {
    recursive: true,
    force: true,
  });
});

describe('fileManagerRoute rename-batch', () => {
  it('renames items and keeps response order', async () => {
    await fs.promises.writeFile(path.join(mediaRoot, 'first.txt'), 'first');
    await fs.promises.writeFile(path.join(mediaRoot, 'second.txt'), 'second');

    const response = await fileManagerRoute.request('/rename-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        root: 'media',
        items: [
          { path: 'first.txt', name: 'renamed-first.txt' },
          { path: 'second.txt', name: 'renamed-second.txt' },
        ],
      }),
    });
    const body = (await response.json()) as {
      success: boolean;
      data?: Array<{ path: string }>;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: [{ path: 'renamed-first.txt' }, { path: 'renamed-second.txt' }],
    });
    expect(loggerMock.debug).toHaveBeenCalledTimes(2);
    expect(loggerMock.debug.mock.calls[0]?.[0]).toMatchObject({
      operation: 'rename-batch',
      phase: 'start',
      root: 'media',
    });
    expect(loggerMock.debug.mock.calls[1]?.[0]).toMatchObject({
      operation: 'rename-batch',
      phase: 'success',
    });
  });

  it('rejects extra fields, invalid names, and oversized batches', async () => {
    const extraFieldResponse = await fileManagerRoute.request('/rename-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        root: 'media',
        items: [{ path: 'first.txt', name: 'renamed.txt', extra: true }],
      }),
    });
    expect(extraFieldResponse.status).toBe(400);

    const invalidNameResponse = await fileManagerRoute.request(
      '/rename-batch',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          root: 'media',
          items: [{ path: 'first.txt', name: 'nested/name.txt' }],
        }),
      },
    );
    expect(invalidNameResponse.status).toBe(400);

    const items = Array.from(
      { length: FILE_MANAGER_BATCH_RENAME_MAX_ITEMS + 1 },
      (_, index) => ({
        path: `file-${index}.txt`,
        name: `renamed-${index}.txt`,
      }),
    );
    const oversizedResponse = await fileManagerRoute.request('/rename-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: 'media', items }),
    });

    expect(oversizedResponse.status).toBe(400);
    expect(await oversizedResponse.json()).toMatchObject({
      success: false,
      code: 400,
    });
    expect(loggerMock.debug).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledTimes(3);
  });
});
