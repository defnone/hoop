import { describe, expect, it } from "vitest";
import { buildTraktWatchedShowsUrl } from "./buildTraktWatchedShowsUrl";

describe("buildTraktWatchedShowsUrl", () => {
  it("builds the weekly watched shows endpoint", () => {
    expect(buildTraktWatchedShowsUrl("weekly")).toBe(
      "https://api.trakt.tv/shows/watched/weekly?extended=full%2Cimages&limit=10&languages=en",
    );
  });

  it("builds the daily watched shows endpoint", () => {
    expect(buildTraktWatchedShowsUrl("daily")).toBe(
      "https://api.trakt.tv/shows/watched/daily?extended=full%2Cimages&limit=10&languages=en",
    );
  });
});
