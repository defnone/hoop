import { describe, it, expect, beforeEach, vi } from 'vitest';
import { settingsRoute } from '@server/routes/settings';

type SettingsPayload = {
  telegramId: number | null;
  botToken: string | null;
  downloadDir: string | null;
  mediaDir: string | null;
  cleanEmptySeriesDirectories: boolean;
  deleteAfterDownload: boolean;
  syncInterval: number;
  torrentClientType: 'transmission' | 'qbittorrent';
  torrentClientUrl: string | null;
  torrentClientUsername: string | null;
  torrentClientPassword: string | null;
  jackettApiKey: string | null;
  jackettUrl: string | null;
  kinozalUsername: string | null;
  kinozalPassword: string | null;
  flaresolverrEnabled: boolean | null;
  flaresolverrUrl: string | null;
  flaresolverrTimeoutSeconds: number;
};

interface SettingsRequestPayload extends SettingsPayload {
  id?: number | null;
}

type SettingsResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const { getSettingsMock, upsertMock } = vi.hoisted(() => {
  const getSettingsMock = vi.fn<() => Promise<SettingsRequestPayload | null>>();
  const upsertMock =
    vi.fn<(payload: SettingsPayload) => Promise<SettingsPayload | null>>();
  return { getSettingsMock, upsertMock } as const;
});

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    private readonly payload: SettingsRequestPayload | undefined;

    constructor(params: { data?: SettingsRequestPayload } = {}) {
      this.payload = params.data;
    }

    async getSettings() {
      return await getSettingsMock();
    }

    async upsert() {
      if (!this.payload) throw new Error('No data provided');
      const { id: _id, ...rest } = this.payload;
      return await upsertMock(rest);
    }
  },
}));

const sampleSettings: SettingsPayload = {
  telegramId: null,
  botToken: null,
  downloadDir: '/downloads',
  mediaDir: '/media',
  cleanEmptySeriesDirectories: false,
  deleteAfterDownload: false,
  syncInterval: 30,
  torrentClientType: 'transmission',
  torrentClientUrl: 'http://localhost:9091/transmission/rpc',
  torrentClientUsername: 'user',
  torrentClientPassword: 'password',
  jackettApiKey: null,
  jackettUrl: null,
  kinozalUsername: null,
  kinozalPassword: null,
  flaresolverrEnabled: false,
  flaresolverrUrl: null,
  flaresolverrTimeoutSeconds: 60,
};

beforeEach(() => {
  getSettingsMock.mockReset();
  upsertMock.mockReset();
});

describe('settingsRoute', () => {
  it('returns settings on success', async () => {
    getSettingsMock.mockResolvedValueOnce({ id: 1, ...sampleSettings });

    const response = await settingsRoute.request('/');
    const body =
      (await response.json()) as SettingsResponse<SettingsRequestPayload | null>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.downloadDir).toBe('/downloads');
  });

  it('returns error when service fails', async () => {
    getSettingsMock.mockRejectedValueOnce(new Error('broken'));

    const response = await settingsRoute.request('/');
    const body = (await response.json()) as SettingsResponse<null>;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toBe('broken');
  });

  it('persists settings via POST', async () => {
    const payload: SettingsRequestPayload = {
      id: 1,
      ...sampleSettings,
      downloadDir: '/mnt/downloads',
      mediaDir: '/mnt/media',
    };

    const expectedPayload: SettingsPayload = {
      telegramId: payload.telegramId,
      botToken: payload.botToken,
      downloadDir: payload.downloadDir,
      mediaDir: payload.mediaDir,
      cleanEmptySeriesDirectories: payload.cleanEmptySeriesDirectories,
      deleteAfterDownload: payload.deleteAfterDownload,
      syncInterval: payload.syncInterval,
      torrentClientType: payload.torrentClientType,
      torrentClientUrl: payload.torrentClientUrl,
      torrentClientUsername: payload.torrentClientUsername,
      torrentClientPassword: payload.torrentClientPassword,
      jackettApiKey: payload.jackettApiKey,
      jackettUrl: payload.jackettUrl,
      kinozalUsername: payload.kinozalUsername,
      kinozalPassword: payload.kinozalPassword,
      flaresolverrEnabled: payload.flaresolverrEnabled,
      flaresolverrUrl: payload.flaresolverrUrl,
      flaresolverrTimeoutSeconds: payload.flaresolverrTimeoutSeconds,
    };

    upsertMock.mockResolvedValueOnce(expectedPayload);

    const response = await settingsRoute.request('/', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body =
      (await response.json()) as SettingsResponse<SettingsPayload | null>;

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(expectedPayload);
    expect(body.data?.downloadDir).toBe('/mnt/downloads');
  });

  it('returns error when save fails', async () => {
    const payload: SettingsRequestPayload = { id: 1, ...sampleSettings };
    upsertMock.mockRejectedValueOnce(new Error('save failed'));

    const response = await settingsRoute.request('/', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json',
      },
    });

    const body = (await response.json()) as SettingsResponse<null>;

    expect(response.status).toBe(400);
    expect(body.message).toBe('save failed');
  });
});
