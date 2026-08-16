import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { createTorrentClient } from '@server/external/adapters/torrent-client';
import {
  getEpisodeNumbersFromFilePath,
  getFileNameFromPath,
} from '@server/external/adapters/torrent-client/episode-file.utils';
import logger from '@server/lib/logger';
import fs from 'fs';
import path from 'path';
import {
  resolveTorrentSourcePath,
  safeLinkOrCopyFile,
} from '@server/features/file-management/file-management.utils';

export type EpisodeCopyFailure = {
  episodeNumber: number;
  message: string;
};

export type CopyTrackedEpisodesResult = {
  files: Record<number, string>;
  failures: EpisodeCopyFailure[];
};

const MAX_ERROR_FILE_COUNT = 50;
const MAX_ERROR_FILE_LIST_LENGTH = 2_000;

export class FileManagementService {
  async copyTrackedEpisodes(
    torrentItem: DbTorrentItem,
    settings: DbUserSettings,
  ): Promise<CopyTrackedEpisodesResult> {
    const trackedNumbers: number[] = Array.isArray(torrentItem.trackedEpisodes)
      ? (torrentItem.trackedEpisodes as number[])
      : [];
    const availableNumbers: number[] = Array.isArray(torrentItem.haveEpisodes)
      ? (torrentItem.haveEpisodes as number[])
      : [];
    const copyableNumbers =
      availableNumbers.length > 0
        ? trackedNumbers.filter((episodeNumber) =>
            availableNumbers.includes(episodeNumber),
          )
        : trackedNumbers;
    if (copyableNumbers.length === 0) {
      return { files: {}, failures: [] };
    }

    if (!settings.downloadDir || !settings.mediaDir) {
      logger.error('No download or media directory found');
      return {
        files: {},
        failures: copyableNumbers.map((episodeNumber) => ({
          episodeNumber,
          message: 'Download or media directory is not configured',
        })),
      };
    }

    const result: Record<number, string> = {};
    const failures: EpisodeCopyFailure[] = [];

    let torrentName: string;
    let torrentSavePath: string;
    let torrentContentPath: string | undefined;
    type RawFile = { name: string };
    type RawStatus = {
      files?: RawFile[];
      content_path?: string;
    };
    let filesFromClient: RawFile[];

    // Resolve torrent metadata from configured client
    try {
      const client = await createTorrentClient({
        id: torrentItem.id,
        torrentItem,
      });
      const status = await client.status();
      torrentName = status.name ?? '';
      torrentSavePath = status.savePath ?? '';
      const rawStatus = status.raw as RawStatus;
      torrentContentPath = rawStatus.content_path;
      filesFromClient = rawStatus.files ?? [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Cannot get torrent status from client: ${msg}`);
      return {
        files: result,
        failures: copyableNumbers.map((episodeNumber) => ({
          episodeNumber,
          message: `Cannot get torrent status from client: ${msg}`,
        })),
      };
    }

    const sanitizedTitle = FileManagementService.sanitizeFolderName(
      torrentItem.title,
    );

    const episodeFiles: Array<{
      relPath: string;
      base: string;
      episode: number;
    }> = [];
    try {
      let firstUnrecognizedVideo: string | null = null;
      for (const file of filesFromClient) {
        const base = getFileNameFromPath(file.name);
        if (FileManagementService.detectKind(base) !== 'video') continue;
        const episodes = getEpisodeNumbersFromFilePath(file.name);
        if (episodes.length === 0) {
          firstUnrecognizedVideo ??= base;
          continue;
        }
        for (const episode of episodes) {
          episodeFiles.push({
            relPath: file.name,
            base,
            episode,
          });
        }
      }
      const hasCopyableMatch = episodeFiles.some((file) =>
        copyableNumbers.includes(file.episode),
      );
      if (!hasCopyableMatch && firstUnrecognizedVideo) {
        throw new Error(
          'Cannot detect episode number from filename: ' +
            firstUnrecognizedVideo,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const torrentFiles = FileManagementService.formatErrorFileList(
        filesFromClient.map((file) => file.name),
      );
      const detailedMessage = `${message}. Torrent files: ${torrentFiles || 'none'}`;
      logger.error(detailedMessage);
      return {
        files: result,
        failures: copyableNumbers.map((episodeNumber) => ({
          episodeNumber,
          message: detailedMessage,
        })),
      };
    }

    for (const episodeNumber of copyableNumbers) {
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
          const sourcePath = await resolveTorrentSourcePath({
            sourceRoot: settings.downloadDir,
            savePath: torrentSavePath,
            contentPath: torrentContentPath,
            torrentName,
            filePath: m.relPath,
          });

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

  private static formatErrorFileList(fileNames: string[]): string {
    const visibleFiles: string[] = [];
    let currentLength = 0;

    for (const fileName of fileNames.slice(0, MAX_ERROR_FILE_COUNT)) {
      const separatorLength = visibleFiles.length > 0 ? 2 : 0;
      if (
        currentLength + separatorLength + fileName.length >
        MAX_ERROR_FILE_LIST_LENGTH
      ) {
        break;
      }
      visibleFiles.push(fileName);
      currentLength += separatorLength + fileName.length;
    }

    const omittedCount = fileNames.length - visibleFiles.length;
    const suffix =
      omittedCount > 0 ? `, ... ${omittedCount} more file(s) omitted` : '';
    return visibleFiles.join(', ') + suffix;
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
