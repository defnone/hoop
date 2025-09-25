import { trackersConf } from '@server/shared/trackers-conf';

export function extractHostFromUrl(url: string): string {
  try {
    const host = new URL(url).host.replace(/www\./, '').toLowerCase();
    return host;
  } catch (e) {
    throw new Error(`Invalid URL: ${url}. ${e}`);
  }
}

export function extractTrackersAndHosts(): Record<string, string[]> {
  return Object.entries(trackersConf).reduce(
    (acc: Record<string, string[]>, [key, value]) => {
      acc[key] = value.urls
        .flatMap((u) => u.split(','))
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      return acc;
    },
    {}
  );
}

export function detectTracker(url: string) {
  const host = extractHostFromUrl(url);
  const trackersAndHosts = extractTrackersAndHosts();
  const findTracker =
    Object.entries(trackersAndHosts).find(([_, value]) =>
      value.includes(host)
    )?.[0] ?? null;

  if (!findTracker) throw new Error(`Tracker not found for ${url}`);
  return findTracker;
}

export function makeRange(start: number, end: number): number[] {
  if (start > end) return [];
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
