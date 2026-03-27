import { Context } from "hono";
import type { TraktWatchedShow } from "./types/trakt";
import { buildTraktWatchedShowsUrl } from "./utils/buildTraktWatchedShowsUrl";

export const getTraktData = async (c: Context, period: "weekly" | "daily") => {
  const response = await fetch(buildTraktWatchedShowsUrl(period), {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": c.env.CLIENT_ID,
      "User-Agent": "HTTPie",
    },
  });

  if (!response.ok) {
    console.error(`API Error: ${response.status} ${response.statusText}`);
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data as TraktWatchedShow[];
};
