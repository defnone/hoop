import { describe, expect, it } from 'vitest';
import {
  detectTracker,
  extractHostFromUrl,
} from '../src/features/torrent-item/torrent-item.utils';

describe('torrent-item.utils', () => {
  it('extractHostFromUrl strips www and lowercases', () => {
    expect(extractHostFromUrl('https://www.Kinozal.TV/details.php?id=1')).toBe(
      'kinozal.tv',
    );
  });

  it('detectTracker matches kinozal alternative domains', () => {
    expect(detectTracker('https://kinozal.tv/details.php?id=2098851')).toBe(
      'kinozal',
    );
    expect(detectTracker('https://kinozal.guru/details.php?id=2098851')).toBe(
      'kinozal',
    );
  });

  it('detectTracker matches rutracker', () => {
    const tracker = detectTracker(
      'https://rutracker.org/forum/viewtopic.php?t=123',
    );
    expect(tracker).toBe('rutracker');
  });

  it('detectTracker matches rutracker alternative domains', () => {
    expect(
      detectTracker('https://rutracker.net/forum/viewtopic.php?t=123'),
    ).toBe('rutracker');
    expect(
      detectTracker('https://rutracker.me/forum/viewtopic.php?t=123'),
    ).toBe('rutracker');
  });
});
