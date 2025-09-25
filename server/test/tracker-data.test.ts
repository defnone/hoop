import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stabilize encoding detection
vi.mock('jschardet', () => ({
  default: { detect: () => ({ encoding: 'utf-8' }) },
}));

// Mock SettingsService to avoid bun:sqlite import chain
vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async getSettings() {
      return Promise.resolve({
        id: 1,
        telegramId: null,
        botToken: null,
        downloadDir: null,
        mediaDir: null,
        deleteAfterDownload: false,
        syncInterval: 30,
        jackettApiKey: null,
        jackettUrl: null,
        kinozalUsername: null,
        kinozalPassword: null,
      });
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

const toResponse = (html: string): Response =>
  new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

describe('TrackerData.collect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      'Название сериала (1 сезон: 1-10 серии из 10)'
    );
    expect(result.epAndSeason).toEqual({
      season: 1,
      startEp: 1,
      endEp: 10,
      totalEp: 10,
    });
    expect(result.magnet).toBe('DEADBEEF1234');
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
      new TrackerDataAdapter({ url: 'https://example.com', tracker: badTracker });
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
