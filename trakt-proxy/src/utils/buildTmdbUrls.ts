import type { TmdbPeriod } from '../types/tmdb';

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w1280';
const TMDB_DETAILS_URL = 'https://www.themoviedb.org/tv';
const DEFAULT_LANGUAGE = 'en-US';
const TMDB_APPEND_TO_RESPONSE = 'external_ids,videos';

export function buildTmdbTrendingTvUrl(period: TmdbPeriod): string {
  const timeWindow = period === 'daily' ? 'day' : 'week';
  const searchParams = new URLSearchParams({ language: DEFAULT_LANGUAGE });

  return `${TMDB_API_URL}/trending/tv/${timeWindow}?${searchParams.toString()}`;
}

export function buildTmdbTvDetailsUrl(id: number): string {
  const searchParams = new URLSearchParams({
    append_to_response: TMDB_APPEND_TO_RESPONSE,
    language: DEFAULT_LANGUAGE,
  });

  return `${TMDB_API_URL}/tv/${id}?${searchParams.toString()}`;
}

export function buildTmdbBackdropUrl(path: string | null): string | null {
  return path ? `${TMDB_IMAGE_URL}${path}` : null;
}

export function buildTmdbDetailsPageUrl(id: number): string {
  return `${TMDB_DETAILS_URL}/${id}`;
}
