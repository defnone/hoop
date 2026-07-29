import { seriesDirectoryVerifyRoute } from '@server/routes/series-directory.verify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { testWriteAndDeleteMock } = vi.hoisted(() => ({
  testWriteAndDeleteMock: vi.fn<(path: string) => Promise<void>>(),
}));

vi.mock('@server/features/file-management/series-directory.service', () => ({
  SeriesDirectoryService: class {
    testWriteAndDelete(path: string): Promise<void> {
      return testWriteAndDeleteMock(path);
    }
  },
}));

beforeEach(() => {
  testWriteAndDeleteMock.mockReset();
});

describe('seriesDirectoryVerifyRoute', () => {
  it('validates and trims the directory path', async () => {
    testWriteAndDeleteMock.mockResolvedValue();

    const response = await seriesDirectoryVerifyRoute.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '  /media  ' }),
    });

    expect(response.status).toBe(200);
    expect(testWriteAndDeleteMock).toHaveBeenCalledWith('/media');
  });

  it('rejects an invalid path payload', async () => {
    const response = await seriesDirectoryVerifyRoute.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 42 }),
    });

    expect(response.status).toBe(400);
    expect(testWriteAndDeleteMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const response = await seriesDirectoryVerifyRoute.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(testWriteAndDeleteMock).not.toHaveBeenCalled();
  });

  it('returns a permission test failure', async () => {
    testWriteAndDeleteMock.mockRejectedValue(new Error('Permission denied'));

    const response = await seriesDirectoryVerifyRoute.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/media' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      message: 'Permission denied',
    });
  });
});
