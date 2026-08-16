import type { trackersConf } from '@server/shared/trackers-conf';

export type TrackerAuthCookieSource = 'cache' | 'auth';

export type TrackerAuthCookieResult = {
  cookies: string;
  source: TrackerAuthCookieSource;
};

export type TrackerAuthCookieFactory = () => Promise<string>;

export class TrackerAuthCookieCache {
  // Cookies stay cached until a tracker rejects them; process restart clears this cache.
  private readonly cookies = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  private generation = 0;

  public get(
    tracker: keyof typeof trackersConf,
    origin: string,
  ): string | null {
    return this.cookies.get(this.getKey(tracker, origin)) ?? null;
  }

  public async getOrCreate(
    tracker: keyof typeof trackersConf,
    origin: string,
    create: TrackerAuthCookieFactory,
  ): Promise<TrackerAuthCookieResult> {
    const key = this.getKey(tracker, origin);
    const cachedCookies = this.cookies.get(key);
    if (cachedCookies) {
      return { cookies: cachedCookies, source: 'cache' };
    }

    const pendingAuth = this.pending.get(key);
    if (pendingAuth) {
      return { cookies: await pendingAuth, source: 'auth' };
    }

    const generation = this.generation;
    const authPromise = Promise.resolve().then(create);
    this.pending.set(key, authPromise);

    try {
      const cookies = await authPromise;
      if (!cookies) {
        throw new Error('No cookies found');
      }
      if (this.generation === generation) {
        this.cookies.set(key, cookies);
      }
      return { cookies, source: 'auth' };
    } finally {
      if (this.pending.get(key) === authPromise) {
        this.pending.delete(key);
      }
    }
  }

  public invalidate(
    tracker: keyof typeof trackersConf,
    origin: string,
    cookies: string,
  ): void {
    const key = this.getKey(tracker, origin);
    if (this.cookies.get(key) === cookies) {
      this.cookies.delete(key);
    }
  }

  public clear(): void {
    this.generation += 1;
    this.cookies.clear();
    this.pending.clear();
  }

  private getKey(tracker: keyof typeof trackersConf, origin: string): string {
    return `${tracker}:${normalizeTrackerOrigin(origin)}`;
  }
}

export const trackerAuthCookieCache = new TrackerAuthCookieCache();

export function clearTrackerAuthCookieCache(): void {
  trackerAuthCookieCache.clear();
}

export function normalizeTrackerOrigin(origin: string): string {
  return new URL(origin).origin;
}
