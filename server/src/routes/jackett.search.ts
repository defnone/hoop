import { Hono } from 'hono';
import type { ApiResponse } from '@shared/types';
import { SettingsService } from '@server/features/settings/settings.service';

type JackettItem = {
  Tracker: string;
  TrackerId: string;
  Title: string;
  Details: string;
  PublishDate: string;
  Size: number;
  Seeders: number;
  Peers: number;
  Grabs: number;
};

export const jackettSearchRoute = new Hono().get('/', async (c) => {
  const query = c.req.query('query') ?? '';
  const seasonStr = c.req.query('season');
  const categoryStr = c.req.query('category');
  const tracker = c.req.query('tracker') ?? 'rutracker';

  if (!query) {
    const response: ApiResponse<null> = {
      success: false,
      message: 'Query is required',
      data: null,
      code: 400,
    };
    return c.json(response, 400);
  }

  const season = seasonStr ? Number(seasonStr) : 0;
  const category = categoryStr ? Number(categoryStr) : 5000;

  const settings = await new SettingsService().getSettings();
  if (!settings?.jackettUrl || !settings?.jackettApiKey) {
    const response: ApiResponse<null> = {
      success: false,
      message: 'Jackett is not configured',
      data: null,
      code: 400,
    };
    return c.json(response, 400);
  }

  const availableTrackers = ['rutracker', 'kinozal', 'noname-club'];
  const trackers = tracker === 'all' ? availableTrackers : [tracker];

  if (!settings.kinozalUsername || !settings.kinozalPassword)
    trackers.splice(trackers.indexOf('kinozal'), 1);

  const results: JackettItem[] = [];

  for (const t of trackers) {
    let url = `${settings.jackettUrl}/api/v2.0/indexers/${t}/results/?apikey=${settings.jackettApiKey}&Category=${category}`;

    if (season && season !== 0) {
      url += `&Query=${encodeURIComponent(query)}%20S${String(season).padStart(
        2,
        '0'
      )}`;
    } else {
      url += `&Query=${encodeURIComponent(query)}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const response: ApiResponse<null> = {
        success: false,
        message: `Jackett request failed: ${res.status} ${res.statusText}`,
        data: null,
        code: res.status,
      };
      return c.json(response, 502);
    }

    const json = (await res.json()) as { Results?: JackettItem[] };
    const items = Array.isArray(json.Results) ? json.Results : [];
    const mapped = items.map((r) => ({ ...r, Tracker: t }));
    results.push(...mapped);
  }

  const response: ApiResponse<JackettItem[]> = {
    success: true,
    data: results,
  };
  return c.json(response);
});
