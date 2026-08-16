import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import { getTmdbData } from './getTmdbData';
import type { TmdbEnvironment } from './types/tmdb';

describe('getTmdbData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes the first ten trending shows with details', async () => {
    const trendingShows = Array.from({ length: 11 }, (_, index) => ({
      id: index + 1,
      name: `Show ${index + 1}`,
      popularity: 100 - index,
      vote_average: index + 1,
      backdrop_path: `/trending-${index + 1}.jpg`,
    }));
    const details = {
      id: 1,
      name: 'Detailed Show',
      popularity: 99,
      vote_average: 8.7,
      backdrop_path: '/details.jpg',
      external_ids: { imdb_id: 'tt1234567' },
      videos: {
        results: [
          {
            key: 'unofficial',
            site: 'YouTube',
            type: 'Trailer',
            official: false,
          },
          {
            key: 'official',
            site: 'YouTube',
            type: 'Trailer',
            official: true,
          },
        ],
      },
    };
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ results: trendingShows }),
    );
    fetchMock.mockImplementation(async () => jsonResponse(details));
    vi.stubGlobal('fetch', fetchMock);

    const data = await getTmdbData(createContext(), 'weekly');

    expect(data).toHaveLength(10);
    expect(data[0]).toEqual({
      id: 1,
      title: 'Detailed Show',
      rating: 8.7,
      popularity: 99,
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/details.jpg',
      detailsUrl: 'https://www.themoviedb.org/tv/1',
      trailerUrl: 'https://www.youtube.com/watch?v=official',
      imdbId: 'tt1234567',
    });
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.themoviedb.org/3/trending/tv/week?language=en-US',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
      },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.themoviedb.org/3/tv/1?append_to_response=external_ids%2Cvideos&language=en-US',
    );
  });

  it('preserves provider order for the first ten shows after enrichment', async () => {
    const popularity = [17, 91, 4, 73, 28, 66, 55, 102, 39, 84, 12, 47];
    const trendingShows = popularity.map((value, index) => ({
      id: index + 1,
      name: `Show ${index + 1}`,
      popularity: value,
      vote_average: value / 10,
      backdrop_path: null,
    }));
    const expectedShows = trendingShows.slice(0, 10);
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ results: trendingShows }),
    );
    fetchMock.mockImplementation(async (input) => {
      const showId = extractShowId(input);
      const show = trendingShows.find((candidate) => candidate.id === showId);
      if (!show) {
        throw new Error(`Unexpected details request for show ${showId}`);
      }

      return jsonResponse({
        id: show.id,
        name: `Detailed ${show.name}`,
        popularity: show.id * 10,
        vote_average: show.vote_average,
        backdrop_path: null,
        external_ids: { imdb_id: null },
        videos: { results: [] },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const data = await getTmdbData(createContext(), 'weekly');

    expect(data).toHaveLength(10);
    expect(data.map((item) => item.id)).toEqual(
      expectedShows.map((show) => show.id),
    );
    expect(data.map((item) => item.popularity)).toEqual(
      expectedShows.map((show) => show.id * 10),
    );
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(
      fetchMock.mock.calls.slice(1).map(([input]) => extractShowId(input)),
    ).toEqual(expectedShows.map((show) => show.id));
  });

  it('uses fallback backdrop and null optional links', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({
        results: [
          {
            id: 42,
            name: 'Fallback Show',
            popularity: 10,
            vote_average: 7,
            backdrop_path: '/trending.jpg',
          },
        ],
      }),
    );
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        id: 42,
        name: '',
        popularity: 11,
        vote_average: 7.5,
        backdrop_path: null,
        external_ids: { imdb_id: null },
        videos: {
          results: [
            {
              key: 'featurette',
              site: 'YouTube',
              type: 'Featurette',
              official: true,
            },
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTmdbData(createContext(), 'daily')).resolves.toEqual([
      {
        id: 42,
        title: 'Fallback Show',
        rating: 7.5,
        popularity: 11,
        backdropUrl: 'https://image.tmdb.org/t/p/w1280/trending.jpg',
        detailsUrl: 'https://www.themoviedb.org/tv/42',
        trailerUrl: null,
        imdbId: null,
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.themoviedb.org/3/trending/tv/day?language=en-US',
    );
  });

  it('keeps a trending card when details request fails', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({
        results: [
          {
            id: 7,
            name: 'Trending Fallback',
            popularity: 13,
            vote_average: 6.9,
            backdrop_path: '/fallback.jpg',
          },
        ],
      }),
    );
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(null, { status: 503, statusText: 'Unavailable' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getTmdbData(createContext(), 'daily')).resolves.toEqual([
      {
        id: 7,
        title: 'Trending Fallback',
        rating: 6.9,
        popularity: 13,
        backdropUrl: 'https://image.tmdb.org/t/p/w1280/fallback.jpg',
        detailsUrl: 'https://www.themoviedb.org/tv/7',
        trailerUrl: null,
        imdbId: null,
      },
    ]);
    expect(errorSpy).toHaveBeenCalledWith(
      'TMDB details unavailable for show 7',
    );
  });

  it('throws a useful error when TMDB rejects a request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 401, statusText: 'Unauthorized' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getTmdbData(createContext(), 'daily')).rejects.toThrow(
      'TMDB API error: 401 Unauthorized',
    );
  });
});

function createContext(): Context<TmdbEnvironment> {
  return {
    env: {
      TMDB_API_TOKEN: 'test-token',
    },
  } as Context<TmdbEnvironment>;
}

function jsonResponse(value: object): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function extractShowId(input: RequestInfo | URL): number {
  const match = /\/tv\/(\d+)\?/.exec(String(input));
  if (!match?.[1]) {
    throw new Error(`Unexpected TMDB URL: ${String(input)}`);
  }

  return Number(match[1]);
}
