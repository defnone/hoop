import logger from '@server/lib/logger';

export async function customFetch(
  url: string,
  options: RequestInit = {},
  timeout = 10_000,
  attempts = 3
): Promise<Response> {
  const { headers, ...restOptions } = options;

  for (let i = 0; i < attempts; i++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...restOptions,
        headers: {
          ...headers,
        },
        signal: c.signal,
      });
      clearTimeout(t);
      return response;
    } catch (e) {
      clearTimeout(t);
      logger.error(
        `Error fetching ${url}, attempt ${i + 1}: ${
          e instanceof Error && e.name === 'AbortError' ? 'Timeout error' : e
        }`
      );

      if (i === attempts - 1) {
        throw new Error(
          `Failed to fetch ${url} after ${attempts} attempts: ${
            e instanceof Error && e.name === 'AbortError' ? 'Timeout error' : e
          }`
        );
      }
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}
