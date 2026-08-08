import { describe, expect, it } from 'vitest';
import {
  buildTmdbBackdropUrl,
  buildTmdbDetailsPageUrl,
  buildTmdbTrendingTvUrl,
  buildTmdbTvDetailsUrl,
} from './buildTmdbUrls';

describe('TMDB URL builders', () => {
  it('maps daily period to TMDB day window', () => {
    expect(buildTmdbTrendingTvUrl('daily')).toBe(
      'https://api.themoviedb.org/3/trending/tv/day?language=en-US',
    );
  });

  it('maps weekly period to TMDB week window', () => {
    expect(buildTmdbTrendingTvUrl('weekly')).toBe(
      'https://api.themoviedb.org/3/trending/tv/week?language=en-US',
    );
  });

  it('requests TV details with external IDs and videos', () => {
    expect(buildTmdbTvDetailsUrl(123)).toBe(
      'https://api.themoviedb.org/3/tv/123?append_to_response=external_ids%2Cvideos&language=en-US',
    );
  });

  it('builds image and details links', () => {
    expect(buildTmdbBackdropUrl('/backdrop.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
    );
    expect(buildTmdbBackdropUrl(null)).toBeNull();
    expect(buildTmdbDetailsPageUrl(123)).toBe(
      'https://www.themoviedb.org/tv/123',
    );
  });
});
