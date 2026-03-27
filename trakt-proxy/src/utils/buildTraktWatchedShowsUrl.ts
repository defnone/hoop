const TRAKT_API_URL = "https://api.trakt.tv";
const DEFAULT_LIMIT = "10";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_EXTENDED = "full,images";

export function buildTraktWatchedShowsUrl(period: "weekly" | "daily"): string {
  const searchParams = new URLSearchParams({
    extended: DEFAULT_EXTENDED,
    limit: DEFAULT_LIMIT,
    languages: DEFAULT_LANGUAGE,
  });

  return `${TRAKT_API_URL}/shows/watched/${period}?${searchParams.toString()}`;
}
