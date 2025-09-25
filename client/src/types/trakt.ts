// Show IDs interface
interface TraktShowIds {
  trakt: number;
  slug: string;
  tvdb: number;
  imdb: string;
  tmdb: number;
  tvrage: null | number;
}

// Air time interface
interface TraktShowAirs {
  day: string;
  time: string;
  timezone: string;
}

// Images interface
interface TraktShowImages {
  fanart: string[];
  poster: string[];
  logo: string[];
  clearart: string[];
  banner: string[];
  thumb: string[];
}

// Show details interface
interface TraktShow {
  title: string;
  year: number;
  ids: TraktShowIds;
  tagline: string;
  overview: string;
  first_aired: string;
  airs: TraktShowAirs;
  runtime: number;
  certification: string;
  network: string;
  country: string;
  trailer: string;
  homepage: string;
  status: string;
  rating: number;
  votes: number;
  comment_count: number;
  updated_at: string;
  language: string;
  languages: string[];
  available_translations: string[];
  genres: string[];
  aired_episodes: number;
  images: TraktShowImages;
}

// Main response interface
export interface TraktWatchedShow {
  watcher_count: number;
  play_count: number;
  collected_count: number;
  collector_count: number;
  show: TraktShow;
}
