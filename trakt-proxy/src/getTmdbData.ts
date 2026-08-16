import type { Context } from 'hono';
import {
  buildTmdbBackdropUrl,
  buildTmdbDetailsPageUrl,
  buildTmdbTrendingTvUrl,
  buildTmdbTvDetailsUrl,
} from './utils/buildTmdbUrls';
import type {
  DiscoverItem,
  TmdbEnvironment,
  TmdbPeriod,
  TmdbTrendingTvResponse,
  TmdbTrendingTvShow,
  TmdbTvDetails,
  TmdbVideo,
} from './types/tmdb';

type TmdbContext = Context<TmdbEnvironment>;

export async function getTmdbData(
  c: TmdbContext,
  period: TmdbPeriod,
): Promise<DiscoverItem[]> {
  const trendingResponse = await fetch(buildTmdbTrendingTvUrl(period), {
    headers: buildTmdbHeaders(c.env.TMDB_API_TOKEN),
  });
  const trendingData =
    await readTmdbResponse<TmdbTrendingTvResponse>(trendingResponse);

  const topShows = trendingData.results.slice(0, 10);
  const enrichedShows = await Promise.all(
    topShows.map((show) => buildDiscoverItem(c, show)),
  );

  return enrichedShows;
}

// --- Helpers ---------------------------------------------------------------

function buildTmdbHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function readTmdbResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

async function buildDiscoverItem(
  c: TmdbContext,
  show: TmdbTrendingTvShow,
): Promise<DiscoverItem> {
  try {
    const detailsResponse = await fetch(buildTmdbTvDetailsUrl(show.id), {
      headers: buildTmdbHeaders(c.env.TMDB_API_TOKEN),
    });
    const details = await readTmdbResponse<TmdbTvDetails>(detailsResponse);

    return buildDiscoverItemFromDetails(show, details);
  } catch {
    console.error(`TMDB details unavailable for show ${show.id}`);
    return buildDiscoverItemFromTrending(show);
  }
}

function buildDiscoverItemFromDetails(
  show: TmdbTrendingTvShow,
  details: TmdbTvDetails,
): DiscoverItem {
  return {
    id: show.id,
    title: details.name || show.name,
    rating: details.vote_average,
    popularity: details.popularity,
    backdropUrl: buildTmdbBackdropUrl(
      details.backdrop_path ?? show.backdrop_path,
    ),
    detailsUrl: buildTmdbDetailsPageUrl(show.id),
    trailerUrl: selectOfficialYoutubeTrailer(details.videos?.results ?? []),
    imdbId: details.external_ids?.imdb_id ?? null,
  };
}

function selectOfficialYoutubeTrailer(videos: TmdbVideo[]): string | null {
  const trailer = videos.find(
    (video) =>
      video.official && video.site === 'YouTube' && video.type === 'Trailer',
  );

  return trailer?.key ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
}

function buildDiscoverItemFromTrending(show: TmdbTrendingTvShow): DiscoverItem {
  return {
    id: show.id,
    title: show.name,
    rating: show.vote_average,
    popularity: show.popularity,
    backdropUrl: buildTmdbBackdropUrl(show.backdrop_path),
    detailsUrl: buildTmdbDetailsPageUrl(show.id),
    trailerUrl: null,
    imdbId: null,
  };
}
