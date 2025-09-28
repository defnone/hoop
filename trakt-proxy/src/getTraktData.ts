import { Context } from 'hono';
import type { TraktWatchedShow } from './types/trakt';

export const getTraktData = async (c: Context, period: 'weekly' | 'daily') => {
  const response = await fetch(
    `https://api.trakt.tv/shows/watched?extended=full%2Cimages&period=${period}&limit=10&languages=en`,
    {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': c.env.CLIENT_ID,
        'User-Agent': 'HTTPie',
      },
    }
  );

  if (!response.ok) {
    console.error(`API Error: ${response.status} ${response.statusText}`);
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  return data as TraktWatchedShow[];
};
