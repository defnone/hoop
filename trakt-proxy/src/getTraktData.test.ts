import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "hono";
import { getTraktData } from "./getTraktData";

describe("getTraktData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests watched shows from the period endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            watcher_count: 1,
            play_count: 2,
            collected_count: 3,
            collector_count: 4,
            show: {
              title: "The Pitt",
            },
          },
        ]),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const data = await getTraktData(createContext(), "weekly");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.trakt.tv/shows/watched/weekly?extended=full%2Cimages&limit=10&languages=en",
      {
        headers: {
          "Content-Type": "application/json",
          "trakt-api-version": "2",
          "trakt-api-key": "test-client-id",
          "User-Agent": "HTTPie",
        },
      },
    );
    expect(data).toHaveLength(1);
    expect(data[0]?.watcher_count).toBe(1);
  });

  it("throws when trakt responds with an error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 404, statusText: "Not Found" }),
      );

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getTraktData(createContext(), "daily")).rejects.toThrow(
      "API Error: 404 Not Found",
    );
  });
});

function createContext(): Context {
  return {
    env: {
      CLIENT_ID: "test-client-id",
    },
  } as Context;
}
