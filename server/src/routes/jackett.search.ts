import { Hono } from 'hono';
import type { ApiResponse } from '@shared/types';
import { SettingsService } from '@server/features/settings/settings.service';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { customFetch } from '@server/shared/custom-fetch';
import { handleZodValidation } from '@server/lib/validation';

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

const querySchema = z.object({
  query: z.string({ message: 'Query is required' }).trim().min(1),
  season: z.coerce.number().default(0),
  category: z.coerce.number().default(5000),
  tracker: z.coerce.string().default('rutracker'),
});

export const jackettSearchRoute = new Hono().get(
  '/',
  zValidator('query', querySchema, handleZodValidation),
  async (c) => {
    const { query, season, category, tracker } = c.req.valid('query');

    const settings = await new SettingsService().getSettings();

    if (!settings?.jackettUrl || !settings?.jackettApiKey) {
      const response: ApiResponse<null> = {
        success: false,
        message: 'Jackett is not configured',
        code: 400,
      };
      return c.json(response, 400);
    }

    const availableTrackers = ['rutracker', 'kinozal', 'noname-club'];
    const trackers = tracker === 'all' ? availableTrackers : [tracker];

    if (!settings.kinozalUsername || !settings.kinozalPassword) {
      const kinozalIndex = trackers.indexOf('kinozal');
      if (kinozalIndex > -1) {
        trackers.splice(kinozalIndex, 1);
      }
    }

    const results: JackettItem[] = [];

    for (const t of trackers) {
      let url = `${settings.jackettUrl}/api/v2.0/indexers/${t}/results/?apikey=${settings.jackettApiKey}&Category=${category}`;

      if (season && season !== 0) {
        url += `&Query=${encodeURIComponent(query)}%20S${String(
          season
        ).padStart(2, '0')}`;
      } else {
        url += `&Query=${encodeURIComponent(query)}`;
      }

      const res = await customFetch(url);

      if (!res.ok) {
        const response: ApiResponse<null> = {
          success: false,
          message: `Jackett request failed: ${res.status} ${res.statusText}`,
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
  }
);
