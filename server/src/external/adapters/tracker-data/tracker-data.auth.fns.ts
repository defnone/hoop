import { customFetch } from '@server/shared/custom-fetch';

export const authFns = {
  kinozal: async (
    login: string,
    password: string,
    baseUrl: string,
    authPath: string
  ): Promise<string> => {
    const resp = await customFetch(`${baseUrl}/${authPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
        Origin: baseUrl,
        Referer: baseUrl + '/signin.php',
      },
      body: new URLSearchParams({
        username: login,
        password: password,
      }),
      redirect: 'manual',
    }).catch((error) => {
      throw new Error(`Failed to authenticate with ${error}`);
    });
    const cookies = resp.headers.getSetCookie();
    if (!cookies) throw new Error('No cookies found');
    return cookies.join('; ');
  },
};
