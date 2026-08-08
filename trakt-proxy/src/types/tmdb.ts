export type TmdbPeriod = 'daily' | 'weekly';

export interface TmdbBindings {
  RATE_LIMITER: RateLimit;
  TMDB_API_TOKEN: string;
}

export interface TmdbEnvironment {
  Bindings: TmdbBindings;
  Variables: {
    rateLimit: boolean;
  };
}

export interface TmdbTrendingTvShow {
  id: number;
  name: string;
  popularity: number;
  vote_average: number;
  backdrop_path: string | null;
}

export interface TmdbTrendingTvResponse {
  results: TmdbTrendingTvShow[];
}

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  popularity: number;
  vote_average: number;
  backdrop_path: string | null;
  external_ids?: {
    imdb_id?: string | null;
  };
  videos?: {
    results: TmdbVideo[];
  };
}

export interface DiscoverItem {
  id: number;
  title: string;
  rating: number;
  popularity: number;
  backdropUrl: string | null;
  detailsUrl: string;
  trailerUrl: string | null;
  imdbId: string | null;
}
