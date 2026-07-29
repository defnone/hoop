import { describe, expect, it } from 'vitest';
import {
  getEpisodeNumbersFromFilePath,
  getFileNameFromPath,
} from '@server/external/adapters/torrent-client/episode-file.utils';

describe('getEpisodeNumbersFromFilePath', () => {
  it.each([
    ['Show.S01E05.mkv', [5]],
    ['Show.S01.E04.2025.WEB-DL.mkv', [4]],
    ['Show.S02-E07.mkv', [7]],
    ['Show.1997-1998.02x01.mkv', [1]],
    ['Show.S01E01E02.mkv', [1, 2]],
    ['Show.S01E01-E02.mkv', [1, 2]],
    ['01-02.mkv', [1, 2]],
    ['1. Pilot.mkv', [1]],
    ['01. Pilot.mkv', [1]],
    ['Show.E12.mkv', [12]],
    ['Show.12.mkv', [12]],
    ['Other.007.extra.mkv', [7]],
    ['Show/S01E02/video.mkv', [2]],
    ['Show/S01E02/video.264.mkv', [2]],
    ['Show\\S01E03\\video.mkv', [3]],
    ['Show/Season 02/video.mkv', []],
    ['Show.Special.mkv', []],
  ])('extracts episodes from %s', (filePath, expected) => {
    expect(getEpisodeNumbersFromFilePath(filePath)).toEqual(expected);
  });
});

describe('getFileNameFromPath', () => {
  it('supports forward and backward slashes', () => {
    expect(getFileNameFromPath('Show/Season/File.mkv')).toBe('File.mkv');
    expect(getFileNameFromPath('Show\\Season\\File.mkv')).toBe('File.mkv');
  });
});
