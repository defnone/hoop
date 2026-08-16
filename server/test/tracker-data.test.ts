import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stabilize encoding detection
vi.mock('jschardet', () => ({
  default: { detect: () => ({ encoding: 'utf-8' }) },
}));

vi.mock('@server/lib/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const { settingsMock } = vi.hoisted(() => ({
  settingsMock: {
    id: 1,
    telegramId: null,
    botToken: null,
    downloadDir: null,
    mediaDir: null,
    deleteAfterDownload: false,
    syncInterval: 30,
    jackettApiKey: null,
    jackettUrl: null,
    kinozalUsername: null as string | null,
    kinozalPassword: null as string | null,
    flaresolverrEnabled: false as boolean,
    flaresolverrUrl: null as string | null,
    flaresolverrTimeoutSeconds: 60,
  },
}));

// Mock SettingsService to avoid bun:sqlite import chain
vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async getSettings() {
      return Promise.resolve({ ...settingsMock });
    }
  },
}));

// Mock network calls
vi.mock('@server/shared/custom-fetch', () => ({
  customFetch: vi.fn(),
}));

import { TrackerDataAdapter } from '@server/external/adapters/tracker-data';
import { customFetch } from '@server/shared/custom-fetch';
import { TrackerAuth } from '@server/external/adapters/tracker-data/tracker-data.auth';
import { clearFlareSolverrCache } from '@server/external/adapters/tracker-data/flaresolverr-cache';
import { clearTrackerAuthCookieCache } from '@server/external/adapters/tracker-data/tracker-data.auth-cache';

const toResponse = (html: string): Response =>
  new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

const toAuthResponse = (cookie: string): Response => {
  const response = new Response(null);
  Object.defineProperty(response.headers, 'getSetCookie', {
    value: () => [cookie],
  });
  return response;
};

describe('TrackerData.collect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFlareSolverrCache();
    clearTrackerAuthCookieCache();
    settingsMock.kinozalUsername = null;
    settingsMock.kinozalPassword = null;
    settingsMock.flaresolverrEnabled = false;
    settingsMock.flaresolverrUrl = null;
  });

  afterEach(() => {
    clearFlareSolverrCache();
    clearTrackerAuthCookieCache();
    vi.restoreAllMocks();
  });

  it('throws with Cloudflare Challenge cause when 403 page indicates challenge', async () => {
    const cfHtml = `
      <html>
        <head><title>Just a moment...</title></head>
        <body><span class="challenge-error-text">Checking your browser...</span></body>
      </html>`;

    vi.mocked(customFetch).mockResolvedValueOnce(
      new Response(cfHtml, {
        status: 403,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const url = 'https://rutracker.org/forum/viewtopic.php?t=999';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });

    try {
      await td.collect();
      throw new Error('should throw');
    } catch (err) {
      const e = err as Error & { cause?: unknown };
      expect(e.message).toMatch(/^Error fetching/);
      const causeMsg =
        e.cause instanceof Error ? e.cause.message : String(e.cause);
      expect(String(causeMsg)).toContain('Cloudflare Challenge detected');
    }
  });

  it('uses FlareSolverr when Cloudflare Challenge is detected and bypass is enabled', async () => {
    settingsMock.flaresolverrEnabled = true;
    settingsMock.flaresolverrUrl = 'http://localhost:8191';

    const cfHtml = `
      <html>
        <head><title>Just a moment...</title></head>
        <body><span class="challenge-error-text">Checking your browser...</span></body>
      </html>`;
    const solvedHtml = `
      <html>
        <body>
          <div class="maintitle">
            Название шоу / extra (Сезон: 1 / Серии: 2 из 2)
          </div>
          <div class="attach_link"><a href="magnet:?xt=urn:btih:ABCDEF1234567890">magnet</a></div>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(
        new Response(cfHtml, {
          status: 403,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            solution: {
              status: 200,
              response: solvedHtml,
              cookies: [{ name: 'cf_clearance', value: 'token' }],
              userAgent: 'Mozilla/5.0 FlareSolverr',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    const url = 'https://rutracker.org/forum/viewtopic.php?t=1200';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });
    const result = await td.collect();
    const flaresolverrOptions = mockedFetch.mock.calls[1]?.[1];
    const flaresolverrBody =
      typeof flaresolverrOptions?.body === 'string'
        ? (JSON.parse(flaresolverrOptions.body) as { maxTimeout: number })
        : null;

    expect(result.torrentId).toBe('1200');
    expect(result.magnet).toBe('magnet:?xt=urn:btih:ABCDEF1234567890');
    expect(flaresolverrBody?.maxTimeout).toBe(60_000);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8191/v1',
      expect.objectContaining({
        method: 'POST',
      }),
      65_000,
      1,
    );
  });

  it('uses FlareSolverr when Cloudflare Challenge is returned with non-403 status', async () => {
    settingsMock.flaresolverrEnabled = true;
    settingsMock.flaresolverrUrl = 'http://localhost:8191';

    const cfHtml = `
      <html>
        <head><title>Just a moment...</title></head>
        <body><span class="challenge-error-text">Checking your browser...</span></body>
      </html>`;
    const solvedHtml = `
      <html>
        <body>
          <div class="maintitle">
            Название шоу / extra (Сезон: 1 / Серии: 2 из 2)
          </div>
          <div class="gensmall"><a href="magnet:?xt=urn:btih:ABCDEF1234567890">magnet</a></div>
        </body>
      </html>`;

    vi.mocked(customFetch)
      .mockResolvedValueOnce(
        new Response(cfHtml, {
          status: 503,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            solution: {
              status: 200,
              response: solvedHtml,
              cookies: [{ name: 'cf_clearance', value: 'token' }],
              userAgent: 'Mozilla/5.0 FlareSolverr',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    const url = 'https://nnmclub.to/forum/viewtopic.php?t=1734651';
    const td = new TrackerDataAdapter({ url, tracker: 'nnmClub' });
    const result = await td.collect();

    expect(result.torrentId).toBe('1734651');
    expect(result.magnet).toBe('magnet:?xt=urn:btih:ABCDEF1234567890');
  });

  it('reuses unexpired FlareSolverr cookies for next tracker request', async () => {
    settingsMock.flaresolverrEnabled = true;
    settingsMock.flaresolverrUrl = 'http://localhost:8191';

    const cfHtml = `
      <html>
        <head><title>Just a moment...</title></head>
        <body><span class="challenge-error-text">Checking your browser...</span></body>
      </html>`;
    const solvedHtml = `
      <html>
        <body>
          <div class="maintitle">
            Cached title / extra (Сезон: 1 / Серии: 2 из 2)
          </div>
          <div class="attach_link"><a href="magnet:?xt=urn:btih:CACHED1234567890">magnet</a></div>
        </body>
      </html>`;
    const expires = Math.floor(Date.now() / 1000) + 3_600;
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(
        new Response(cfHtml, {
          status: 403,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            solution: {
              status: 200,
              response: solvedHtml,
              cookies: [
                {
                  name: 'cf_clearance',
                  value: 'cached-token',
                  domain: '.rutracker.org',
                  path: '/',
                  expires,
                  secure: true,
                },
              ],
              userAgent: 'Mozilla/5.0 Cached Agent',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(toResponse(solvedHtml));

    const first = await new TrackerDataAdapter({
      url: 'https://rutracker.org/forum/viewtopic.php?t=1201',
      tracker: 'rutracker',
    }).collect();
    const second = await new TrackerDataAdapter({
      url: 'https://rutracker.org/forum/viewtopic.php?t=1202',
      tracker: 'rutracker',
    }).collect();

    expect(first.magnet).toBe('magnet:?xt=urn:btih:CACHED1234567890');
    expect(second.magnet).toBe('magnet:?xt=urn:btih:CACHED1234567890');
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(mockedFetch.mock.calls[2]?.[1]).toEqual({
      headers: {
        Cookie: 'cf_clearance=cached-token',
        'User-Agent': 'Mozilla/5.0 Cached Agent',
      },
    });
  });

  it('throws with 403 cause when 403 page does not indicate challenge', async () => {
    const plain403 = `
      <html>
        <head><title>Forbidden</title></head>
        <body><h1>403 Forbidden</h1></body>
      </html>`;

    vi.mocked(customFetch).mockResolvedValueOnce(
      new Response(plain403, {
        status: 403,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const url = 'https://rutracker.org/forum/viewtopic.php?t=1000';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });

    try {
      await td.collect();
      throw new Error('should throw');
    } catch (err) {
      const e = err as Error & { cause?: unknown };
      expect(e.message).toMatch(/^Error fetching/);
      const causeMsg =
        e.cause instanceof Error ? e.cause.message : String(e.cause);
      expect(String(causeMsg)).toContain(`Server responded with 403`);
    }
  });

  it('rutracker: parses data from anchor href (no auth)', async () => {
    const topicHtml = `
      <html>
        <body>
          <div class="maintitle">
            Название шоу / дополнительная часть заголовка (Сезон: 2 / Серии: 3-5 из 10)
          </div>
          <div class="attach_link"><a href="magnet:?xt=urn:btih:ABCDEF1234567890">magnet</a></div>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch.mockResolvedValueOnce(toResponse(topicHtml));

    const url = 'https://rutracker.org/forum/viewtopic.php?t=123';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });
    const result = await td.collect();

    expect(result.torrentId).toBe('123');
    expect(result.rawTitle).toContain('Название шоу');
    expect(result.showTitle).toBe('Название шоу');
    expect(result.epAndSeason).toEqual({
      season: 2,
      startEp: 3,
      endEp: 5,
      totalEp: 10,
    });
    expect(result.magnet).toBe('magnet:?xt=urn:btih:ABCDEF1234567890');
  });

  it('retries tracker timeout with an alternative domain', async () => {
    const topicHtml = `
      <html>
        <body>
          <div class="maintitle">
            Alternative domain show / extra (\u0421\u0435\u0437\u043e\u043d: 1 / \u0421\u0435\u0440\u0438\u0438: 2 \u0438\u0437 2)
          </div>
          <div class="attach_link"><a href="magnet:?xt=urn:btih:ABCDEF1234567890">magnet</a></div>
        </body>
      </html>`;
    const timeoutError = new Error(
      'Failed to fetch https://rutracker.org/forum/viewtopic.php?t=123 after 3 attempts: Timeout error',
    );
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(toResponse(topicHtml));

    const url = 'https://rutracker.org/forum/viewtopic.php?t=123';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });
    const result = await td.collect();

    expect(result.torrentId).toBe('123');
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      'https://rutracker.net/forum/viewtopic.php?t=123',
      { headers: {} },
      10_000,
    );
  });

  it('tries every alternative domain before throwing a tracker timeout', async () => {
    const timeoutError = new Error(
      'Failed to fetch tracker page after 3 attempts: Timeout error',
    );
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch.mockRejectedValue(timeoutError);

    const url = 'https://rutracker.org/forum/viewtopic.php?t=123';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });

    await expect(td.collect()).rejects.toThrow(
      'Failed to fetch tracker page after 3 attempts: Timeout error',
    );
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://rutracker.org/forum/viewtopic.php?t=123',
      'https://rutracker.net/forum/viewtopic.php?t=123',
      'https://rutracker.me/forum/viewtopic.php?t=123',
    ]);
  });

  it('rutracker: parses episodes label without season colon', async () => {
    const topicHtml = `
      <html>
        <body>
          <div class="maintitle">
            Ферма Кларксона / Clarkson's Farm / Сезон 5 / Эпизоды 1-7 из 8 [2026, Великобритания, документальный, WEB-DL, 2160p, HDR] MVO (Alexfilm) + Original Eng + 3x Sub Eng
          </div>
          <div class="attach_link"><a href="magnet:?xt=urn:btih:ABCDEF1234567890">magnet</a></div>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch.mockResolvedValueOnce(toResponse(topicHtml));

    const url = 'https://rutracker.org/forum/viewtopic.php?t=124';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });
    const result = await td.collect();

    expect(result.showTitle).toBe('Ферма Кларксона');
    expect(result.epAndSeason).toEqual({
      season: 5,
      startEp: 1,
      endEp: 7,
      totalEp: 8,
    });
  });

  it('kinozal: magnet on separate page, cookies via auth', async () => {
    const pageHtml = `
      <html>
        <body>
          <h1>Сериал / Название сериала (1 сезон: 1-10 серии из 10)</h1>
        </body>
      </html>`;

    const magnetHtml = `
      <html>
        <body>
          <ul><li>Инфо хеш: DEADBEEF1234</li></ul>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    class MockTrackerAuth extends TrackerAuth {
      public async getCookies(): Promise<string> {
        return 'sid=abc';
      }
    }

    const url = 'https://kinozal.tv/details.php?id=777';
    const trackerAuth = new MockTrackerAuth({
      login: 'login',
      password: 'pass',
      baseUrl: 'https://kinozal.tv',
      tracker: 'kinozal',
    });

    const td = new TrackerDataAdapter({
      url,
      tracker: 'kinozal',
      trackerAuth,
    });
    const result = await td.collect();

    expect(result.torrentId).toBe('777');
    expect(result.rawTitle).toContain('Сериал / Название сериала');
    expect(result.showTitle).toBe(
      'Название сериала (1 сезон: 1-10 серии из 10)',
    );
    expect(result.epAndSeason).toEqual({
      season: 1,
      startEp: 1,
      endEp: 10,
      totalEp: 10,
    });
    expect(result.magnet).toBe('DEADBEEF1234');
    expect(mockedFetch.mock.calls[0]?.[1]).toEqual({
      headers: { Cookie: 'sid=abc' },
    });
    expect(mockedFetch.mock.calls[1]?.[1]).toEqual({
      headers: { Cookie: 'sid=abc' },
    });
  });

  it('kinozal: reuses cached cookies across adapters on the same origin', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html><body>
        <h1>Series / Cached show (1 сезон: 1-2 серии из 2)</h1>
      </body></html>`;
    const magnetHtml =
      '<html><body><ul><li>Инфо хеш: CACHED123456</li></ul></body></html>';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=cached'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    const first = await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=788',
      tracker: 'kinozal',
    }).collect();
    const second = await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=789',
      tracker: 'kinozal',
    }).collect();

    expect(first.magnet).toBe('CACHED123456');
    expect(second.magnet).toBe('CACHED123456');
    expect(mockedFetch).toHaveBeenCalledTimes(5);
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=cached' },
    });
    expect(mockedFetch.mock.calls[4]?.[1]).toEqual({
      headers: { Cookie: 'sid=cached' },
    });
  });

  it('kinozal: refreshes an invalid cached cookie and retries the same details URL', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const firstPageHtml = `
      <html><body>
        <h1>Series / Initial show (1 сезон: 1-2 серии из 2)</h1>
      </body></html>`;
    const refreshedPageHtml = `
      <html><body>
        <h1>Series / Refreshed show (1 сезон: 1-2 серии из 2)</h1>
      </body></html>`;
    const magnetHtml =
      '<html><body><ul><li>Инфо хеш: REFRESHED123456</li></ul></body></html>';
    const loginPageHtml =
      '<html><body><form class="login"><input name="username"></form></body></html>';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=old'))
      .mockResolvedValueOnce(toResponse(firstPageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml))
      .mockResolvedValueOnce(toResponse(loginPageHtml))
      .mockResolvedValueOnce(toAuthResponse('sid=new'))
      .mockResolvedValueOnce(toResponse(refreshedPageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=790',
      tracker: 'kinozal',
    }).collect();
    const result = await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=791',
      tracker: 'kinozal',
    }).collect();

    expect(result.showTitle).toBe('Refreshed show (1 сезон: 1-2 серии из 2)');
    expect(result.magnet).toBe('REFRESHED123456');
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/details.php?id=790',
      'https://kinozal.tv/get_srv_details.php?action=2&id=790',
      'https://kinozal.tv/details.php?id=791',
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/details.php?id=791',
      'https://kinozal.tv/get_srv_details.php?action=2&id=791',
    ]);
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=old' },
    });
    expect(mockedFetch.mock.calls[5]?.[1]).toEqual({
      headers: { Cookie: 'sid=new' },
    });
    expect(mockedFetch.mock.calls[6]?.[1]).toEqual({
      headers: { Cookie: 'sid=new' },
    });
  });

  it('kinozal: keeps a 401 Cloudflare challenge out of auth refresh', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html><body>
        <h1>Series / Cloudflare status (1 сезон: 1-2 серии из 2)</h1>
      </body></html>`;
    const magnetHtml =
      '<html><body><ul><li>Инфо хеш: CFSTATUS123456</li></ul></body></html>';
    const challengeHtml = `
      <html><head><title>Just a moment...</title></head>
      <body><span class="challenge-error-text">Checking your browser...</span></body></html>`;
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=old'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml))
      .mockResolvedValueOnce(new Response(challengeHtml, { status: 401 }));

    await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=802',
      tracker: 'kinozal',
    }).collect();
    await expect(
      new TrackerDataAdapter({
        url: 'https://kinozal.tv/details.php?id=803',
        tracker: 'kinozal',
      }).collect(),
    ).rejects.toThrow(/Cloudflare Challenge/);

    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/details.php?id=802',
      'https://kinozal.tv/get_srv_details.php?action=2&id=802',
      'https://kinozal.tv/details.php?id=803',
    ]);
  });

  it('kinozal: refreshes a cached cookie after an explicit auth status', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html><body>
        <h1>Series / Status refreshed (1 сезон: 1-2 серии из 2)</h1>
      </body></html>`;
    const magnetHtml =
      '<html><body><ul><li>Инфо хеш: STATUS123456</li></ul></body></html>';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=old'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml))
      .mockResolvedValueOnce(
        new Response('<html><body>Unauthorized</body></html>', { status: 401 }),
      )
      .mockResolvedValueOnce(toAuthResponse('sid=new'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=792',
      tracker: 'kinozal',
    }).collect();
    const result = await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=793',
      tracker: 'kinozal',
    }).collect();

    expect(result.magnet).toBe('STATUS123456');
    expect(mockedFetch).toHaveBeenCalledTimes(7);
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=old' },
    });
    expect(mockedFetch.mock.calls[5]?.[1]).toEqual({
      headers: { Cookie: 'sid=new' },
    });
  });

  it('kinozal: refreshes an invalid cached cookie on the magnet URL', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html><body>
        <h1>Series / Magnet refresh (1 сезон: 1-2 серии из 2)</h1>
      </body></html>`;
    const magnetHtml =
      '<html><body><ul><li>Инфо хеш: MAGNET123456</li></ul></body></html>';
    const loginPageHtml =
      '<html><body><form class="login"><input name="username"></form></body></html>';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=old'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(loginPageHtml))
      .mockResolvedValueOnce(toAuthResponse('sid=new'))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=800',
      tracker: 'kinozal',
    }).collect();
    const result = await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=801',
      tracker: 'kinozal',
    }).collect();

    expect(result.magnet).toBe('MAGNET123456');
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/details.php?id=800',
      'https://kinozal.tv/get_srv_details.php?action=2&id=800',
      'https://kinozal.tv/details.php?id=801',
      'https://kinozal.tv/get_srv_details.php?action=2&id=801',
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/get_srv_details.php?action=2&id=801',
    ]);
    expect(mockedFetch.mock.calls[4]?.[1]).toEqual({
      headers: { Cookie: 'sid=old' },
    });
    expect(mockedFetch.mock.calls[6]?.[1]).toEqual({
      headers: { Cookie: 'sid=new' },
    });
  });

  it('kinozal: shares one refresh login between concurrent adapters', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html><body>
        <h1>Series / Concurrent refresh (1 сезон: 1-2 серии из 2)</h1>
      </body></html>`;
    const loginPageHtml =
      '<html><body><form class="login"><input name="username"></form></body></html>';
    const magnetHtml =
      '<html><body><ul><li>Инфо хеш: CONCURRENT123456</li></ul></body></html>';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=old'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));
    await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=794',
      tracker: 'kinozal',
    }).collect();

    let releaseAuth: () => void = () => undefined;
    const authGate = new Promise<void>((resolve) => {
      releaseAuth = resolve;
    });
    let refreshAuthCalls = 0;
    mockedFetch.mockImplementation(
      async (requestedUrl: string, options: RequestInit = {}) => {
        if (requestedUrl.endsWith('/takelogin.php')) {
          refreshAuthCalls += 1;
          await authGate;
          return toAuthResponse('sid=new');
        }
        if (requestedUrl.includes('/get_srv_details.php')) {
          return toResponse(magnetHtml);
        }
        const cookie = new Headers(options.headers).get('Cookie');
        return cookie === 'sid=old'
          ? toResponse(loginPageHtml)
          : toResponse(pageHtml);
      },
    );

    const firstPromise = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=795',
      tracker: 'kinozal',
    }).collect();
    const secondPromise = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=796',
      tracker: 'kinozal',
    }).collect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(refreshAuthCalls).toBe(1);
    releaseAuth();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.magnet).toBe('CONCURRENT123456');
    expect(second.magnet).toBe('CONCURRENT123456');
    expect(refreshAuthCalls).toBe(1);
  });

  it('kinozal: uses the successful alternative domain for auth and magnet', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html>
        <body>
          <h1>Series / Alternative show (1 \u0441\u0435\u0437\u043e\u043d: 1-2 \u0441\u0435\u0440\u0438\u0438 \u0438\u0437 2)</h1>
        </body>
      </html>`;
    const magnetHtml = `
      <html>
        <body>
          <ul><li>\u0418\u043d\u0444\u043e \u0445\u0435\u0448: DEADBEEF1234</li></ul>
        </body>
      </html>`;
    const timeoutError = new Error(
      'Failed to fetch https://kinozal.tv/details.php?id=780 after 3 attempts: Timeout error',
    );
    const authResponse = {
      headers: {
        getSetCookie: vi.fn(() => ['sid=abc']),
      },
    } as unknown as Response;
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(authResponse)
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(authResponse)
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    const td = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=780',
      tracker: 'kinozal',
    });
    const result = await td.collect();

    expect(result.magnet).toBe('DEADBEEF1234');
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/details.php?id=780',
      'https://kinozal.me/takelogin.php',
      'https://kinozal.me/details.php?id=780',
      'https://kinozal.me/get_srv_details.php?action=2&id=780',
    ]);
    expect(mockedFetch.mock.calls[1]?.[1]).toEqual({
      headers: { Cookie: 'sid=abc' },
    });
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=abc' },
    });
    expect(mockedFetch.mock.calls[4]?.[1]).toEqual({
      headers: { Cookie: 'sid=abc' },
    });
  });

  it('kinozal: retries another domain when authentication fails before details', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html>
        <body>
          <h1>Series / Auth fallback (1 \u0441\u0435\u0437\u043e\u043d: 1-2 \u0441\u0435\u0440\u0438\u0438 \u0438\u0437 2)</h1>
        </body>
      </html>`;
    const magnetHtml = `
      <html>
        <body>
          <ul><li>\u0418\u043d\u0444\u043e \u0445\u0435\u0448: ABCDEF123456</li></ul>
        </body>
      </html>`;
    const authError = new Error('source login failed');
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce(toAuthResponse('sid=alternative'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    const td = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=782',
      tracker: 'kinozal',
    });
    const result = await td.collect();

    expect(result.magnet).toBe('ABCDEF123456');
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.me/takelogin.php',
      'https://kinozal.me/details.php?id=782',
      'https://kinozal.me/get_srv_details.php?action=2&id=782',
    ]);
    expect(mockedFetch.mock.calls[2]?.[1]).toEqual({
      headers: { Cookie: 'sid=alternative' },
    });
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=alternative' },
    });
  });

  it('kinozal: does not retry domains for missing credentials', async () => {
    const td = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=786',
      tracker: 'kinozal',
    });

    await expect(td.collect()).rejects.toThrow(/No auth credentials found/);
    expect(customFetch).not.toHaveBeenCalled();
  });

  it('kinozal: does not retry domains when auth returns no cookies', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch.mockResolvedValueOnce(toAuthResponse(''));

    const td = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=787',
      tracker: 'kinozal',
    });

    await expect(td.collect()).rejects.toThrow(/No cookies found/);
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual(['https://kinozal.tv/takelogin.php']);
  });

  it('kinozal: retries an alternative domain when the page has no title', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const loginPageHtml =
      '<html><body><form class="login"><input name="username"></form></body></html>';
    const pageHtml = `
      <html>
        <body>
          <h1>Series / Alternative show (1 \u0441\u0435\u0437\u043e\u043d: 1-2 \u0441\u0435\u0440\u0438\u0438 \u0438\u0437 2)</h1>
        </body>
      </html>`;
    const magnetHtml = `
      <html>
        <body>
          <ul><li>\u0418\u043d\u0444\u043e \u0445\u0435\u0448: DEADBEEF1234</li></ul>
        </body>
      </html>`;
    const sourceAuthResponse = toAuthResponse('sid=source');
    const alternativeAuthResponse = toAuthResponse('sid=alternative');
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(sourceAuthResponse)
      .mockResolvedValueOnce(toResponse(loginPageHtml))
      .mockResolvedValueOnce(alternativeAuthResponse)
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    const td = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=781',
      tracker: 'kinozal',
    });
    const result = await td.collect();

    expect(result.showTitle).toBe(
      'Alternative show (1 \u0441\u0435\u0437\u043e\u043d: 1-2 \u0441\u0435\u0440\u0438\u0438 \u0438\u0437 2)',
    );
    expect(result.magnet).toBe('DEADBEEF1234');
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/details.php?id=781',
      'https://kinozal.me/takelogin.php',
      'https://kinozal.me/details.php?id=781',
      'https://kinozal.me/get_srv_details.php?action=2&id=781',
    ]);
    expect(mockedFetch.mock.calls[1]?.[1]).toEqual({
      headers: { Cookie: 'sid=source' },
    });
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=alternative' },
    });
    expect(mockedFetch.mock.calls[4]?.[1]).toEqual({
      headers: { Cookie: 'sid=alternative' },
    });
    expect(mockedFetch.mock.calls[3]?.[1]).not.toEqual({
      headers: { Cookie: 'sid=source' },
    });
  });

  it('kinozal: keeps injected auth on original origin only', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const loginPageHtml =
      '<html><body><form class="login"><input name="username"></form></body></html>';
    const pageHtml = `
      <html>
        <body>
          <h1>Series / Injected fallback (1 \u0441\u0435\u0437\u043e\u043d: 1-2 \u0441\u0435\u0440\u0438\u0438 \u0438\u0437 2)</h1>
        </body>
      </html>`;
    const magnetHtml =
      '<html><body><ul><li>\u0418\u043d\u0444\u043e \u0445\u0435\u0448: INJECTED123456</li></ul></body></html>';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toResponse(loginPageHtml))
      .mockResolvedValueOnce(toAuthResponse('sid=generated'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    class InjectedAuth extends TrackerAuth {
      public async getCookies(): Promise<string> {
        return 'sid=injected';
      }
    }

    const td = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=784',
      tracker: 'kinozal',
      trackerAuth: new InjectedAuth({
        login: 'login',
        password: 'password',
        baseUrl: 'https://kinozal.tv',
        tracker: 'kinozal',
      }),
    });
    const result = await td.collect();

    expect(result.magnet).toBe('INJECTED123456');
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/details.php?id=784',
      'https://kinozal.me/takelogin.php',
      'https://kinozal.me/details.php?id=784',
      'https://kinozal.me/get_srv_details.php?action=2&id=784',
    ]);
    expect(mockedFetch.mock.calls[0]?.[1]).toEqual({
      headers: { Cookie: 'sid=injected' },
    });
    expect(mockedFetch.mock.calls[2]?.[1]).toEqual({
      headers: { Cookie: 'sid=generated' },
    });
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=generated' },
    });
  });

  it('kinozal: isolates injected auth from the process cache on the same origin', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html><body>
        <h1>Series / Scoped auth (1 сезон: 1-2 серии из 2)</h1>
      </body></html>`;
    const magnetHtml =
      '<html><body><ul><li>Инфо хеш: SCOPED123456</li></ul></body></html>';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=global'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=797',
      tracker: 'kinozal',
    }).collect();

    let injectedAuthCalls = 0;
    class ScopedInjectedAuth extends TrackerAuth {
      public async getCookies(): Promise<string> {
        injectedAuthCalls += 1;
        return 'sid=injected';
      }
    }

    await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=798',
      tracker: 'kinozal',
      trackerAuth: new ScopedInjectedAuth({
        login: 'login',
        password: 'password',
        baseUrl: 'https://kinozal.tv',
        tracker: 'kinozal',
      }),
    }).collect();
    await new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=799',
      tracker: 'kinozal',
    }).collect();

    expect(injectedAuthCalls).toBe(1);
    expect(mockedFetch).toHaveBeenCalledTimes(7);
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=injected' },
    });
    expect(mockedFetch.mock.calls[4]?.[1]).toEqual({
      headers: { Cookie: 'sid=injected' },
    });
    expect(mockedFetch.mock.calls[5]?.[1]).toEqual({
      headers: { Cookie: 'sid=global' },
    });
  });

  it('kinozal: replaces injected auth when its origin mismatches source URL', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';

    const pageHtml = `
      <html>
        <body>
          <h1>Series / Origin mismatch (1 \u0441\u0435\u0437\u043e\u043d: 1-2 \u0441\u0435\u0440\u0438\u0438 \u0438\u0437 2)</h1>
        </body>
      </html>`;
    const magnetHtml =
      '<html><body><ul><li>\u0418\u043d\u0444\u043e \u0445\u0435\u0448: ORIGIN123456</li></ul></body></html>';
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=generated'))
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    class MismatchedAuth extends TrackerAuth {
      public async getCookies(): Promise<string> {
        throw new Error('Injected auth must not be used');
      }
    }

    const td = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=785',
      tracker: 'kinozal',
      trackerAuth: new MismatchedAuth({
        login: 'login',
        password: 'password',
        baseUrl: 'https://kinozal.guru',
        tracker: 'kinozal',
      }),
    });
    const result = await td.collect();

    expect(result.magnet).toBe('ORIGIN123456');
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/details.php?id=785',
      'https://kinozal.tv/get_srv_details.php?action=2&id=785',
    ]);
    expect(mockedFetch.mock.calls[1]?.[1]).toEqual({
      headers: { Cookie: 'sid=generated' },
    });
  });

  it('kinozal: uses auth, FlareSolverr, and active domain for magnet', async () => {
    settingsMock.kinozalUsername = 'login';
    settingsMock.kinozalPassword = 'password';
    settingsMock.flaresolverrEnabled = true;
    settingsMock.flaresolverrUrl = 'http://localhost:8191';

    const loginPageHtml =
      '<html><body><form class="login"><input name="username"></form></body></html>';
    const cfHtml = `
      <html>
        <head><title>Just a moment...</title></head>
        <body><span class="challenge-error-text">Checking your browser...</span></body>
      </html>`;
    const solvedPageHtml = `
      <html>
        <body>
          <h1>Series / Solved fallback (1 \u0441\u0435\u0437\u043e\u043d: 1-2 \u0441\u0435\u0440\u0438\u0438 \u0438\u0437 2)</h1>
        </body>
      </html>`;
    const magnetHtml = `
      <html>
        <body>
          <ul><li>\u0418\u043d\u0444\u043e \u0445\u0435\u0448: FEDCBA654321</li></ul>
        </body>
      </html>`;
    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toAuthResponse('sid=source'))
      .mockResolvedValueOnce(toResponse(loginPageHtml))
      .mockResolvedValueOnce(toAuthResponse('sid=alternative'))
      .mockResolvedValueOnce(toResponse(cfHtml))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            solution: {
              status: 200,
              response: solvedPageHtml,
              cookies: [{ name: 'cf_clearance', value: 'alternative-cf' }],
              userAgent: 'Mozilla/5.0 FlareSolverr',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(toResponse(magnetHtml));

    const td = new TrackerDataAdapter({
      url: 'https://kinozal.tv/details.php?id=783',
      tracker: 'kinozal',
    });
    const result = await td.collect();

    expect(result.magnet).toBe('FEDCBA654321');
    expect(
      mockedFetch.mock.calls.map(([requestedUrl]) => requestedUrl),
    ).toEqual([
      'https://kinozal.tv/takelogin.php',
      'https://kinozal.tv/details.php?id=783',
      'https://kinozal.me/takelogin.php',
      'https://kinozal.me/details.php?id=783',
      'http://localhost:8191/v1',
      'https://kinozal.me/get_srv_details.php?action=2&id=783',
    ]);
    expect(mockedFetch.mock.calls[1]?.[1]).toEqual({
      headers: { Cookie: 'sid=source' },
    });
    expect(mockedFetch.mock.calls[3]?.[1]).toEqual({
      headers: { Cookie: 'sid=alternative' },
    });
    const solverOptions = mockedFetch.mock.calls[4]?.[1];
    const solverBody =
      typeof solverOptions?.body === 'string'
        ? (JSON.parse(solverOptions.body) as {
            cookies?: Array<{ name: string; value: string }>;
          })
        : null;
    expect(solverBody?.cookies).toEqual([
      { name: 'sid', value: 'alternative' },
    ]);
    expect(mockedFetch.mock.calls[5]?.[1]).toEqual({
      headers: {
        Cookie: 'sid=alternative; cf_clearance=alternative-cf',
        'User-Agent': 'Mozilla/5.0 FlareSolverr',
      },
    });
  });

  it('kinozal: parses single episode with plural word', async () => {
    const pageHtml = `
      <html>
        <body>
          <h1>Сериал / Название сериала (7 сезон: 1 серии из 7)</h1>
        </body>
      </html>`;

    const magnetHtml = `
      <html>
        <body>
          <ul><li>Инфо хеш: FEEDFACE5678</li></ul>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    class MockTrackerAuth extends TrackerAuth {
      public async getCookies(): Promise<string> {
        return 'sid=abc';
      }
    }

    const url = 'https://kinozal.tv/details.php?id=778';
    const trackerAuth = new MockTrackerAuth({
      login: 'login',
      password: 'pass',
      baseUrl: 'https://kinozal.tv',
      tracker: 'kinozal',
    });

    const td = new TrackerDataAdapter({
      url,
      tracker: 'kinozal',
      trackerAuth,
    });
    const result = await td.collect();

    expect(result.torrentId).toBe('778');
    expect(result.rawTitle).toContain('Сериал / Название сериала');
    expect(result.showTitle).toBe('Название сериала (7 сезон: 1 серии из 7)');
    expect(result.epAndSeason).toEqual({
      season: 7,
      startEp: 1,
      endEp: 1,
      totalEp: 7,
    });
    expect(result.magnet).toBe('FEEDFACE5678');
  });

  it('kinozal: parses episodes label without season colon', async () => {
    const pageHtml = `
      <html>
        <body>
          <h1>Сериал / Название сериала (Сезон 5 / Эпизоды 1-7 из 8)</h1>
        </body>
      </html>`;

    const magnetHtml = `
      <html>
        <body>
          <ul><li>Инфо хеш: DEADBEEF5678</li></ul>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch
      .mockResolvedValueOnce(toResponse(pageHtml))
      .mockResolvedValueOnce(toResponse(magnetHtml));

    class MockTrackerAuth extends TrackerAuth {
      public async getCookies(): Promise<string> {
        return 'sid=abc';
      }
    }

    const url = 'https://kinozal.tv/details.php?id=779';
    const trackerAuth = new MockTrackerAuth({
      login: 'login',
      password: 'pass',
      baseUrl: 'https://kinozal.tv',
      tracker: 'kinozal',
    });

    const td = new TrackerDataAdapter({
      url,
      tracker: 'kinozal',
      trackerAuth,
    });
    const result = await td.collect();

    expect(result.epAndSeason).toEqual({
      season: 5,
      startEp: 1,
      endEp: 7,
      totalEp: 8,
    });
    expect(result.magnet).toBe('DEADBEEF5678');
  });

  it('nnmClub: parses data from anchor href (no auth)', async () => {
    const topicHtml = `
      <html>
        <body>
          <div class="maintitle">
            Название шоу / extra (сезон 3, серии 7-9 из 12)
          </div>
          <div class="gensmall"><a href="magnet:?xt=urn:btih:FACECAFE0011">magnet</a></div>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch.mockResolvedValueOnce(toResponse(topicHtml));

    const url = 'https://nnmclub.to/forum/viewtopic.php?t=987';
    const td = new TrackerDataAdapter({ url, tracker: 'nnmClub' });
    const result = await td.collect();

    expect(result.torrentId).toBe('987');
    expect(result.showTitle).toBe('Название шоу');
    expect(result.epAndSeason).toEqual({
      season: 3,
      startEp: 7,
      endEp: 9,
      totalEp: 12,
    });
    expect(result.magnet).toBe('magnet:?xt=urn:btih:FACECAFE0011');
  });

  it('nnmClub: parses episodes label with slash separator', async () => {
    const topicHtml = `
      <html>
        <body>
          <div class="maintitle">
            Название шоу / extra (Сезон 5 / Эпизоды 1-7 из 8)
          </div>
          <div class="gensmall"><a href="magnet:?xt=urn:btih:FACECAFE0012">magnet</a></div>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch.mockResolvedValueOnce(toResponse(topicHtml));

    const url = 'https://nnmclub.to/forum/viewtopic.php?t=988';
    const td = new TrackerDataAdapter({ url, tracker: 'nnmClub' });
    const result = await td.collect();

    expect(result.epAndSeason).toEqual({
      season: 5,
      startEp: 1,
      endEp: 7,
      totalEp: 8,
    });
    expect(result.magnet).toBe('magnet:?xt=urn:btih:FACECAFE0012');
  });

  it('rutracker: fallback parses magnet from text when href is empty', async () => {
    const topicHtml = `
      <html>
        <body>
          <div class="maintitle">
            Шоу / zzz (Сезон: 1 / Серии: 2 из 2)
          </div>
          <div class="attach_link"><a>ABC123FF</a></div>
        </body>
      </html>`;

    const mockedFetch = vi.mocked(customFetch);
    mockedFetch.mockResolvedValueOnce(toResponse(topicHtml));

    const url = 'https://rutracker.org/forum/viewtopic.php?t=111';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });
    const result = await td.collect();

    expect(result.torrentId).toBe('111');
    expect(result.magnet).toBe('ABC123FF');
  });

  it('throws when title is missing (no titleSelector match)', async () => {
    const htmlNoTitle = `<html><body><div>no-title-here</div></body></html>`;
    vi.mocked(customFetch).mockResolvedValueOnce(toResponse(htmlNoTitle));

    const url = 'https://rutracker.org/forum/viewtopic.php?t=1';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });
    await expect(td.collect()).rejects.toThrow(/No raw title found/);
  });

  it('throws when seasons/episodes pattern missing', async () => {
    const html = `
      <html>
        <body>
          <div class="maintitle">Название шоу / без сезонов</div>
        </body>
      </html>`;
    vi.mocked(customFetch).mockResolvedValueOnce(toResponse(html));

    const url = 'https://rutracker.org/forum/viewtopic.php?t=2';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });
    await expect(td.collect()).rejects.toThrow(/No episodes and season found/);
  });

  it('throws when tracker id not found in URL', () => {
    const create = () =>
      new TrackerDataAdapter({
        url: 'https://rutracker.org/forum/viewtopic.php',
        tracker: 'rutracker',
      });
    expect(create).toThrow(/Tracker id not found/);
  });

  it('throws when tracker is unknown', () => {
    const badTracker =
      'unknown' as unknown as keyof typeof import('@server/shared/trackers-conf').trackersConf;
    const create = () =>
      new TrackerDataAdapter({
        url: 'https://example.com',
        tracker: badTracker,
      });
    expect(create).toThrow(/Tracker not found/);
  });

  it('kinozal: cookie retrieval error propagates to collect()', async () => {
    const pageHtml = `
      <html>
        <body>
          <h1>Сериал / Тест (1 сезон: 1-2 серии из 2)</h1>
        </body>
      </html>`;

    vi.mocked(customFetch).mockResolvedValueOnce(toResponse(pageHtml));

    class FailingAuth extends TrackerAuth {
      public async getCookies(): Promise<string> {
        throw new Error('bad creds');
      }
    }

    const url = 'https://kinozal.tv/details.php?id=42';
    const trackerAuth = new FailingAuth({
      login: 'login',
      password: 'pass',
      baseUrl: 'https://kinozal.tv',
      tracker: 'kinozal',
    });
    const td = new TrackerDataAdapter({ url, tracker: 'kinozal', trackerAuth });

    await expect(td.collect()).rejects.toThrow(/bad creds/);
  });

  it('throws when magnet element exists but has no text', async () => {
    const topicHtml = `
      <html>
        <body>
          <div class="maintitle">
            Название шоу / часть (Сезон: 1 / Серии: 2 из 2)
          </div>
          <div class="attach_link"><a href=""></a></div>
        </body>
      </html>`;

    vi.mocked(customFetch).mockResolvedValueOnce(toResponse(topicHtml));

    const url = 'https://rutracker.org/forum/viewtopic.php?t=555';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });

    await expect(td.collect()).rejects.toThrow(/No magnet element found/);
  });

  it('throws when magnet text does not match expected pattern', async () => {
    const topicHtml = `
      <html>
        <body>
          <div class="maintitle">
            Название шоу / часть (Сезон: 1 / Серии: 2 из 2)
          </div>
          <div class="attach_link"><a href="">!!!</a></div>
        </body>
      </html>`;

    vi.mocked(customFetch).mockResolvedValueOnce(toResponse(topicHtml));

    const url = 'https://rutracker.org/forum/viewtopic.php?t=556';
    const td = new TrackerDataAdapter({ url, tracker: 'rutracker' });

    await expect(td.collect()).rejects.toThrow(/No magnet match found/);
  });
});
