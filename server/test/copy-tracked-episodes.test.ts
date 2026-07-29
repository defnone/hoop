import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { FileManagementService } from '@server/features/file-management/file-management.service';

let statusName = 'Torrent Folder';
let statusSavePath = '';
let statusContentPath: string | undefined;
let rawFiles: { name: string }[] = [];
vi.mock('@server/external/adapters/torrent-client', () => {
  class TorrentClientMock {
    async status() {
      return {
        name: statusName,
        savePath: statusSavePath,
        raw: { files: rawFiles, content_path: statusContentPath },
      } as unknown as {
        name: string;
        savePath: string;
        raw: { files: { name: string }[]; content_path?: string };
      };
    }
  }
  return {
    createTorrentClient: async () => new TorrentClientMock(),
  };
});

const tmpRoot = path.join(process.cwd(), 'test', '.tmp');
const dirs = {
  dl: path.join(tmpRoot, 'dl'),
  media: path.join(tmpRoot, 'media'),
};

async function resetTmp() {
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  await fs.promises.mkdir(dirs.dl, { recursive: true });
  await fs.promises.mkdir(dirs.media, { recursive: true });
}

function makeTorrentItem(partial: Partial<DbTorrentItem>): DbTorrentItem {
  return {
    id: 1,
    trackerId: 'tid-1',
    rawTitle: 'Some Raw',
    title: 'Some Show',
    url: 'https://example.com/t?id=1',
    magnet: 'magnet:?xt=urn:btih:abcdef',
    season: 1,
    trackedEpisodes: [],
    haveEpisodes: [],
    totalEpisodes: 10,
    files: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    torrentClientId: 'hash123',
    controlStatus: 'idle',
    tracker: 'kinozal',
    errorMessage: null,
    ...partial,
  } as DbTorrentItem;
}

function makeSettings(partial: Partial<DbUserSettings> = {}): DbUserSettings {
  return {
    id: 1,
    telegramId: null,
    botToken: null,
    downloadDir: dirs.dl,
    mediaDir: dirs.media,
    deleteAfterDownload: false,
    syncInterval: 30,
    jackettApiKey: null,
    jackettUrl: null,
    kinozalUsername: null,
    kinozalPassword: null,
    ...partial,
  } as DbUserSettings;
}

describe('FileManagementService.copyTrackedEpisodes', () => {
  beforeEach(async () => {
    await resetTmp();
    statusName = 'Torrent Folder';
    statusSavePath = dirs.dl;
    statusContentPath = undefined;
    rawFiles = [];
  });

  it('copies into /<title>/Season 01/S01E02.ext from the Transmission status.name directory', async () => {
    // Arrange: create the source file under downloadDir/<status.name>
    const srcDir = path.join(dirs.dl, statusName);
    await fs.promises.mkdir(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'Some.Show.S01E02.mkv');
    await fs.promises.writeFile(srcFile, 'dummy');
    rawFiles = [{ name: 'Some.Show.S01E02.mkv' }];

    const torrentItem = makeTorrentItem({
      title: 'Some Show',
      season: 1,
      trackedEpisodes: [2],
    });
    const settings = makeSettings();

    // Act
    const svc = new FileManagementService();
    const res = await svc.copyTrackedEpisodes(torrentItem, settings);

    // Assert
    const dest = path.join(dirs.media, 'Some Show', 'Season 01', 'S01E02.mkv');
    expect(res.files[2]).toBe(dest);
    expect(res.failures).toEqual([]);
    expect(fs.existsSync(dest)).toBe(true);
  });

  it('copies only tracked episodes available in the current release', async () => {
    const srcDir = path.join(dirs.dl, statusName);
    await fs.promises.mkdir(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'Some.Show.S03E06.mkv');
    await fs.promises.writeFile(srcFile, 'dummy');
    rawFiles = [{ name: 'Some.Show.S03E06.mkv' }];

    const torrentItem = makeTorrentItem({
      title: 'Some Show',
      season: 3,
      trackedEpisodes: [6, 7, 8],
      haveEpisodes: [1, 2, 3, 4, 5, 6],
      totalEpisodes: 8,
    });

    const result = await new FileManagementService().copyTrackedEpisodes(
      torrentItem,
      makeSettings(),
    );

    const destination = path.join(
      dirs.media,
      'Some Show',
      'Season 03',
      'S03E06.mkv',
    );
    expect(result.files).toEqual({ 6: destination });
    expect(result.failures).toEqual([]);
    expect(fs.existsSync(destination)).toBe(true);
  });

  it('uses client file path when display name differs from content root', async () => {
    statusName =
      'Show / Season: 2 / Episodes: 1-23 (Creators) [1997-1998, Comedy,';
    const contentRoot = path.join(dirs.dl, 'Show (1997-1998) - Season 02');
    const sourcePath = path.join(contentRoot, '01. Pilot.mkv');
    await fs.promises.mkdir(contentRoot, { recursive: true });
    await fs.promises.writeFile(sourcePath, 'video');
    rawFiles = [{ name: 'Show (1997-1998) - Season 02/01. Pilot.mkv' }];

    const result = await new FileManagementService().copyTrackedEpisodes(
      makeTorrentItem({
        season: 2,
        trackedEpisodes: [1],
        haveEpisodes: [1],
      }),
      makeSettings(),
    );

    const destination = path.join(
      dirs.media,
      'Some Show',
      'Season 02',
      'S02E01.mkv',
    );
    expect(result).toEqual({ files: { 1: destination }, failures: [] });
    expect(fs.existsSync(destination)).toBe(true);
  });

  it('does not require future tracked episodes absent from the current release', async () => {
    rawFiles = [{ name: 'Show.Special.mkv' }];
    const torrentItem = makeTorrentItem({
      trackedEpisodes: [7, 8],
      haveEpisodes: [1, 2, 3, 4, 5, 6],
      totalEpisodes: 8,
    });

    const result = await new FileManagementService().copyTrackedEpisodes(
      torrentItem,
      makeSettings(),
    );

    expect(result).toEqual({ files: {}, failures: [] });
  });

  it('places the file under /<sanitize(title)>/Season 01/S01E03.ext and parses number from name', async () => {
    // Arrange: files live in the Transmission status directory and name contains E03
    statusName = 'Other Name';
    const srcDir = path.join(dirs.dl, statusName);
    await fs.promises.mkdir(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'E03.mp4');
    await fs.promises.writeFile(srcFile, 'dummy');
    rawFiles = [{ name: 'E03.mp4' }];

    const torrentItem = makeTorrentItem({
      title: 'Bad:Name?<>',
      season: 1,
      trackedEpisodes: [3],
    });
    const settings = makeSettings();

    // Act
    const svc = new FileManagementService();
    const res = await svc.copyTrackedEpisodes(torrentItem, settings);

    // Assert: destination directory uses sanitize(title)
    const dest = path.join(dirs.media, 'BadName', 'Season 01', 'S01E03.mp4');
    expect(res.files[3]).toBe(dest);
    expect(res.failures).toEqual([]);
    expect(fs.existsSync(dest)).toBe(true);
  });

  it('rejects a torrent file path that escapes download directory', async () => {
    const outsideDir = path.join(tmpRoot, 'outside');
    const outsideFile = path.join(outsideDir, 'Some.Show.S01E04.mkv');
    await fs.promises.mkdir(outsideDir, { recursive: true });
    await fs.promises.writeFile(outsideFile, 'secret');
    rawFiles = [{ name: '../../outside/Some.Show.S01E04.mkv' }];

    const torrentItem = makeTorrentItem({
      title: 'Some Show',
      season: 1,
      trackedEpisodes: [4],
    });

    const result = await new FileManagementService().copyTrackedEpisodes(
      torrentItem,
      makeSettings(),
    );

    expect(result.files).toEqual({});
    expect(result.failures).toHaveLength(1);
    expect(
      fs.existsSync(
        path.join(dirs.media, 'Some Show', 'Season 01', 'S01E04.mkv'),
      ),
    ).toBe(false);
  });

  it('rejects a torrent source symlink that points outside download directory', async () => {
    const sourceDir = path.join(dirs.dl, statusName);
    const outsideDir = path.join(tmpRoot, 'outside');
    const outsideFile = path.join(outsideDir, 'Some.Show.S01E05.mkv');
    const sourceLink = path.join(sourceDir, 'Some.Show.S01E05.mkv');
    await fs.promises.mkdir(sourceDir, { recursive: true });
    await fs.promises.mkdir(outsideDir, { recursive: true });
    await fs.promises.writeFile(outsideFile, 'secret');
    await fs.promises.symlink(outsideFile, sourceLink);
    rawFiles = [{ name: 'Some.Show.S01E05.mkv' }];

    const torrentItem = makeTorrentItem({
      title: 'Some Show',
      season: 1,
      trackedEpisodes: [5],
    });

    const result = await new FileManagementService().copyTrackedEpisodes(
      torrentItem,
      makeSettings(),
    );

    expect(result.files).toEqual({});
    expect(result.failures).toHaveLength(1);
    expect(
      fs.existsSync(
        path.join(dirs.media, 'Some Show', 'Season 01', 'S01E05.mkv'),
      ),
    ).toBe(false);
  });

  it('includes torrent file list when episode detection fails', async () => {
    rawFiles = [
      { name: 'Show.Special.mkv' },
      { name: 'Show.Behind.The.Scenes.mkv' },
    ];
    const torrentItem = makeTorrentItem({
      trackedEpisodes: [1, 2],
    });

    const result = await new FileManagementService().copyTrackedEpisodes(
      torrentItem,
      makeSettings(),
    );

    const message =
      'Cannot detect episode number from filename: Show.Special.mkv. Torrent files: Show.Special.mkv, Show.Behind.The.Scenes.mkv';
    expect(result.files).toEqual({});
    expect(result.failures).toEqual([
      { episodeNumber: 1, message },
      { episodeNumber: 2, message },
    ]);
  });

  it('truncates a large torrent file list in episode detection errors', async () => {
    rawFiles = Array.from({ length: 60 }, (_, index) => ({
      name: `Special.Feature.${index + 1}.mkv`,
    }));
    const torrentItem = makeTorrentItem({
      trackedEpisodes: [1],
    });

    const result = await new FileManagementService().copyTrackedEpisodes(
      torrentItem,
      makeSettings(),
    );

    expect(result.failures[0]?.message).toContain(
      'Special.Feature.50.mkv, ... 10 more file(s) omitted',
    );
    expect(result.failures[0]?.message).not.toContain('Special.Feature.51.mkv');
  });

  it('ignores sidecar files without episode numbers', async () => {
    const srcDir = path.join(dirs.dl, statusName);
    await fs.promises.mkdir(srcDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(srcDir, 'Some.Show.S01E02.mkv'),
      'video',
    );
    rawFiles = [
      { name: 'Some.Show.S01E02.mkv' },
      { name: 'poster.jpg' },
      { name: 'metadata.nfo' },
      { name: 'sample.mkv' },
    ];
    const torrentItem = makeTorrentItem({
      trackedEpisodes: [2],
    });

    const result = await new FileManagementService().copyTrackedEpisodes(
      torrentItem,
      makeSettings(),
    );

    expect(result.failures).toEqual([]);
    expect(result.files[2]).toBe(
      path.join(dirs.media, 'Some Show', 'Season 01', 'S01E02.mkv'),
    );
  });

  it('copies one multi-episode video to every tracked episode', async () => {
    const srcDir = path.join(dirs.dl, statusName);
    await fs.promises.mkdir(srcDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(srcDir, 'Some.Show.S01E01E02.mkv'),
      'video',
    );
    rawFiles = [{ name: 'Some.Show.S01E01E02.mkv' }];
    const torrentItem = makeTorrentItem({
      trackedEpisodes: [1, 2],
    });

    const result = await new FileManagementService().copyTrackedEpisodes(
      torrentItem,
      makeSettings(),
    );

    expect(result.failures).toEqual([]);
    expect(Object.keys(result.files)).toEqual(['1', '2']);
  });
});
