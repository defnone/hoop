import { customFetch } from '@server/shared/custom-fetch';
import { CloudflareChallengeError } from './utils';
import type { TrackerAuthRequestOptions } from './tracker-data.types';

export const authFns = {
  kinozal: async (
    login: string,
    password: string,
    baseUrl: string,
    authPath: string,
    requestOptions: TrackerAuthRequestOptions = {},
  ): Promise<string> => {
    const authUrl = new URL(authPath, baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
      Origin: baseUrl,
      Referer: baseUrl + '/signin.php',
    };

    if (requestOptions.cookies) {
      headers.Cookie = requestOptions.cookies;
    }

    if (requestOptions.userAgent) {
      headers['User-Agent'] = requestOptions.userAgent;
    }

    const resp = await customFetch(authUrl.href, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        username: login,
        password: password,
      }),
      redirect: 'manual',
    }).catch((error) => {
      throw new Error(`Failed to authenticate with ${error}`);
    });

    if (isCloudflareChallengeResponse(resp)) {
      throw new CloudflareChallengeError();
    }

    const cookies = resp.headers.getSetCookie();
    if (!cookies || cookies.length === 0) throw new Error('No cookies found');
    return cookies.join('; ');
  },
};

// Utilities

function isCloudflareChallengeResponse(response: Response): boolean {
  return (
    response.status === 403 &&
    response.headers.get('cf-mitigated') === 'challenge'
  );
}
