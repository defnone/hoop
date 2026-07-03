import logger from '@server/lib/logger';
import { redactSensitiveUrl } from '@server/shared/url-redaction.utils';

export async function customFetch(
  url: string,
  options: RequestInit = {},
  timeout = 10_000,
  attempts = 3,
): Promise<Response> {
  const { headers, ...restOptions } = options;
  const redactedUrl = redactSensitiveUrl(url);

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
      const errorMessage = getErrorMessage(e);
      logger.error(
        `Error fetching ${redactedUrl}, attempt ${i + 1}: ${errorMessage}`,
      );

      if (i === attempts - 1) {
        throw new Error(
          `Failed to fetch ${redactedUrl} after ${attempts} attempts: ${errorMessage}`,
        );
      }
    }
  }

  throw new Error(`Failed to fetch ${redactedUrl}`);
}

// Utilities

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Timeout error';
  }

  return redactSensitiveUrl(String(error));
}
