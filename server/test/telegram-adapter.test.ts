import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DbUserSettings } from '@server/db/app/app-schema';

import { TelegramAdapter } from '@server/external/adapters/telegram/telegram.adapter';

const baseSettings: DbUserSettings = {
  id: 1,
  telegramId: 123456,
  botToken: 'token-123',
  downloadDir: null,
  mediaDir: null,
  deleteAfterDownload: false,
  syncInterval: 30,
  jackettApiKey: null,
  jackettUrl: null,
  kinozalUsername: null,
  kinozalPassword: null,
};

const okResponsePayload = {
  ok: true,
  result: {
    message_id: 1,
    date: 0,
    chat: {
      id: 123456,
      type: 'private',
    },
    text: 'Downloaded',
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TelegramAdapter', () => {
  it('throws when bot token is missing', () => {
    expect(
      () => new TelegramAdapter({ ...baseSettings, botToken: null })
    ).toThrow('TELEGRAM_BOT_TOKEN is not set');
  });

  it('throws when chat id is missing', () => {
    expect(
      () => new TelegramAdapter({ ...baseSettings, telegramId: null })
    ).toThrow('TELEGRAM_CHAT_ID is not set');
  });

  it('sendUpdate formats message and returns API response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(okResponsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new TelegramAdapter(baseSettings);

    const result = await adapter.sendUpdate('Some Show', {
      1: '/media/show/S01E01.mkv',
      2: '/media/show/S01E02.mkv',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottoken-123/sendMessage');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });

    const payload = JSON.parse(init?.body as string);
    expect(payload.chat_id).toBe('123456');
    expect(payload.text).toBe(
      'Downloaded "Some Show" episodes:\n - S01E01\n - S01E02\n'
    );

    expect(result).toEqual(okResponsePayload.result);
  });

  it('sendUpdate throws on non-ok HTTP response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('gateway fail', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new TelegramAdapter(baseSettings);

    await expect(adapter.sendUpdate('Show', {})).rejects.toThrow(
      'Telegram API sendMessage failed: 502 gateway fail'
    );
  });

  it('sendUpdate throws on invalid JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('not-json', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new TelegramAdapter(baseSettings);

    await expect(adapter.sendUpdate('Show', {})).rejects.toThrow(
      'Telegram API sendMessage returned invalid JSON'
    );
  });

  it('sendUpdate throws when API answers with error payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad request',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new TelegramAdapter(baseSettings);

    await expect(adapter.sendUpdate('Show', {})).rejects.toThrow(
      'Telegram API sendMessage error: 400 Bad request'
    );
  });
});
