import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { createTorrentClient } from '@server/external/adapters/torrent-client';
import logger from '@server/lib/logger';
import fs from 'fs';
import path from 'path';
import { safeLinkOrCopyFile } from '@server/features/file-management/file-management.utils';

export type EpisodeCopyFailure = {
  episodeNumber: number;
  message: string;
};

export type CopyTrackedEpisodesResult = {
  files: Record<number, string>;
  failures: EpisodeCopyFailure[];
};

export class FileManagementService {
  async copyTrackedEpisodes(
    torrentItem: DbTorrentItem,
    settings: DbUserSettings,
  ): Promise<CopyTrackedEpisodesResult> {
    const trackedNumbers: number[] = Array.isArray(torrentItem.trackedEpisodes)
      ? (torrentItem.trackedEpisodes as number[])
      : [];
    if (!settings.downloadDir || !settings.mediaDir) {
      logger.error('No download or media directory found');
      return {
        files: {},
        failures: trackedNumbers.map((episodeNumber) => ({
          episodeNumber,
          message: 'Download or media directory is not configured',
        })),
      };
    }

    const result: Record<number, string> = {};
    const failures: EpisodeCopyFailure[] = [];

    let torrentName = '';
    type RawFile = { name: string };
    let filesFromClient: RawFile[] = [];

    // Resolve torrent metadata from configured client
    try {
      const client = await createTorrentClient({
        id: torrentItem.id,
        torrentItem,
      });
      const status = await client.status();
      torrentName = status.name ?? '';
      const files = status.raw.files as RawFile[] | undefined;
      filesFromClient = files ?? [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Cannot get torrent status from client: ${msg}`);
      return {
        files: result,
        failures: trackedNumbers.map((episodeNumber) => ({
          episodeNumber,
          message: `Cannot get torrent status from client: ${msg}`,
        })),
      };
    }

    const sanitizedTitle = FileManagementService.sanitizeFolderName(
      torrentItem.title,
    );

    const episodeFiles = filesFromClient
      .map((f) => ({
        relPath: f.name,
        base: path.basename(f.name),
        episode: FileManagementService.getEpisodeFromName(
          path.basename(f.name),
        ),
      }))
      .filter((x) => x.episode !== null) as Array<{
      relPath: string;
      base: string;
      episode: number;
    }>;

    for (const episodeNumber of trackedNumbers) {
      const matches = episodeFiles.filter((x) => x.episode === episodeNumber);
      if (matches.length === 0) {
        logger.info(`No file found for episode ${episodeNumber}`);
        failures.push({
          episodeNumber,
          message: `No file found for episode ${episodeNumber}`,
        });
        continue;
      }

      const videos = matches.filter(
        (m) => FileManagementService.detectKind(m.base) === 'video',
      );
      if (videos.length === 0) {
        logger.error(
          `No video file found for tracked episode ${episodeNumber}, continuing`,
        );
        failures.push({
          episodeNumber,
          message: `No video file found for episode ${episodeNumber}`,
        });
        continue;
      }

      let primaryDest: string | null = null;

      try {
        for (const m of videos) {
          let relPath = m.relPath;
          if (relPath && torrentName) {
            const withSlash = `${torrentName}${path.sep}`;
            const withFwd = `${torrentName}/`;
            const withBack = `${torrentName}\\`;
            if (relPath.startsWith(withSlash))
              relPath = relPath.slice(withSlash.length);
            else if (relPath.startsWith(withFwd))
              relPath = relPath.slice(withFwd.length);
            else if (relPath.startsWith(withBack))
              relPath = relPath.slice(withBack.length);
          }

          if (!torrentName || !relPath) continue;

          const sourcePath = path.join(
            settings.downloadDir,
            torrentName,
            relPath,
          );

          const destinationPath = FileManagementService.buildDestinationPath(
            settings.mediaDir,
            sanitizedTitle,
            torrentItem.season ?? null,
            episodeNumber,
            m.base,
          );

          try {
            const mode = await safeLinkOrCopyFile({
              sourceRoot: settings.downloadDir,
              sourcePath,
              targetRoot: settings.mediaDir,
              targetPath: destinationPath,
            });
            logger.info(
              `${
                mode === 'linked' ? 'Created hardlink' : 'Copied'
              } from ${sourcePath} to ${destinationPath}`,
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error(
              `Failed to copy from ${sourcePath} to ${destinationPath}: ${msg}`,
            );
            throw e;
          }

          if (!primaryDest) primaryDest = destinationPath;
        }

        if (primaryDest) {
          result[episodeNumber] = primaryDest;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`Error processing episode ${episodeNumber}: ${msg}`);
        failures.push({ episodeNumber, message: msg });
      }
    }

    return { files: result, failures };
  }

  static sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .replace('.', ' ')
      .trim();
  }

  private static buildDestinationPath(
    mediaDir: string,
    title: string,
    season: number | null,
    episodeNumber: number,
    originalFileName: string,
    suffix: string = '',
  ): string {
    const seasonStr = (season ?? 0).toString().padStart(2, '0');
    const episodeStr = episodeNumber.toString().padStart(2, '0');
    const ext = path.extname(originalFileName);
    const safeSuffix = suffix
      ? suffix.startsWith('.')
        ? suffix
        : `.${suffix}`
      : '';
    const fileName = `S${seasonStr}E${episodeStr}${safeSuffix}${ext}`;
    return path.join(
      mediaDir,
      FileManagementService.sanitizeFolderName(title),
      `Season ${seasonStr}`,
      fileName,
    );
  }

  private static getEpisodeFromName(name: string): number | null {
    const e =
      name.match(/[Ss](\d+)[.\-_–—x ]*[Ee][Pp]?(\d+)/i)?.[2] ||
      name.match(/(\d+)[.\-_–—x ]+(\d+)/i)?.[2] ||
      name.match(/[Ee][Pp]?(\d+)/i)?.[1];
    if (e) return Number(e);
    throw new Error('Cannot detect episode number from filename: ' + name);
  }

  private static detectKind(base: string): 'video' | 'other' {
    const videoExts = new Set<string>([
      '.mkv',
      '.mp4',
      '.avi',
      '.mov',
      '.ts',
      '.m4v',
      '.webm',
    ]);
    const ext = path.extname(base).toLowerCase();
    return videoExts.has(ext) ? 'video' : 'other';
  }

  async deleteFile(filePath: string): Promise<boolean> {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }
    try {
      const st = await fs.promises.lstat(filePath);
      if (st.isFile() || st.isSymbolicLink()) {
        await fs.promises.unlink(filePath);
        logger.info(`[FileManagement] Deleted file ${filePath}`);
        return true;
      }
      logger.warn(`[FileManagement] Path is not a file: ${filePath}`);
      return false;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        logger.warn(`[FileManagement] File not found: ${filePath}`);
        return false;
      }
      logger.error(
        `[FileManagement] Error deleting ${filePath}: ${String(err)}`,
      );
      throw err;
    }
  }
}
