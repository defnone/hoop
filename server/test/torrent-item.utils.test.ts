import { describe, expect, it } from 'vitest';
import { detectTracker, extractHostFromUrl } from '../src/features/torrent-item/torrent-item.utils';

describe('torrent-item.utils', () => {
  it('extractHostFromUrl strips www and lowercases', () => {
    expect(extractHostFromUrl('https://www.Kinozal.TV/details.php?id=1')).toBe('kinozal.tv');
  });

  it('detectTracker matches kinozal by host list with commas', () => {
    const tracker = detectTracker('https://kinozal.tv/details.php?id=2098851');
    expect(tracker).toBe('kinozal');
  });

  it('detectTracker matches rutracker', () => {
    const tracker = detectTracker('https://rutracker.org/forum/viewtopic.php?t=123');
    expect(tracker).toBe('rutracker');
  });
});

