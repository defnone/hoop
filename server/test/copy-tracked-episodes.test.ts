import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { FileManagementService } from '@server/features/file-management/file-management.service';

let statusName = 'Torrent Folder';
let rawFiles: { name: string }[] = [];
vi.mock('@server/external/adapters/transmission', () => {
  return {
    TransmissionAdapter: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(_: any) {}
      async status() {
        return { name: statusName, raw: { files: rawFiles } } as unknown as {
          name: string;
          raw: { files: { name: string }[] };
        };
      }
    },
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
    transmissionId: 'hash123',
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
    rawFiles = [];
  });

  it('copies into /<title>/S01E02.ext from the Transmission status.name directory', async () => {
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
    const dest = path.join(dirs.media, 'Some Show', 'S01E02.mkv');
    expect(res[2]).toBe(dest);
    expect(fs.existsSync(dest)).toBe(true);
  });

  it('places the file under /<sanitize(title)>/S01E03.ext and parses number from name', async () => {
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
    const dest = path.join(dirs.media, 'BadName', 'S01E03.mp4');
    expect(res[3]).toBe(dest);
    expect(fs.existsSync(dest)).toBe(true);
  });
});

describe('FileManagementService.getEpisodeFromName', () => {
  const getEpisodeFromName = FileManagementService[
    'getEpisodeFromName'
  ] as (name: string) => number | null;

  it('returns episode number for classic SxxEyy pattern', () => {
    expect(getEpisodeFromName('Show.S01E05.mkv')).toBe(5);
  });

  it('returns episode number when season and episode are separated', () => {
    expect(getEpisodeFromName('Show.S01.E04.2025.WEB-DL.mkv')).toBe(4);
    expect(getEpisodeFromName('Show.S02-E07.mkv')).toBe(7);
  });

  it('throws when episode number cannot be detected', () => {
    expect(() => getEpisodeFromName('Show.Special.mkv')).toThrow(
      'Cannot detect episode number from filename: Show.Special.mkv'
    );
  });
});
