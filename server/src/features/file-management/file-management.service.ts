import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { TransmissionAdapter } from '@server/external/adapters/transmission';
import logger from '@server/lib/logger';
import fs from 'fs';
import path from 'path';

export class FileManagementService {
  async copyTrackedEpisodes(
    torrentItem: DbTorrentItem,
    settings: DbUserSettings
  ): Promise<Record<number, string>> {
    if (!settings.downloadDir || !settings.mediaDir) {
      logger.error('No download or media directory found');
      return {};
    }

    const result: Record<number, string> = {};

    // Resolve real torrent name from Transmission
    let torrentName = '';
    try {
      const tm = new TransmissionAdapter({ id: torrentItem.id, torrentItem });
      const info = await tm.status();
      torrentName = info.name ?? '';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Cannot get torrent status from Transmission: ${msg}`);
    }

    const sanitizedTitle = FileManagementService.sanitizeFolderName(
      torrentItem.title
    );

    const trackedNumbers: number[] = Array.isArray(torrentItem.trackedEpisodes)
      ? (torrentItem.trackedEpisodes as number[])
      : [];

    type RawFile = { name: string };
    let filesFromClient: RawFile[] = [];
    try {
      const tm = new TransmissionAdapter({ id: torrentItem.id, torrentItem });
      const status = await tm.status();
      const files = status.raw.files as Array<{ name: string }> | undefined;
      filesFromClient = files ?? [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Cannot read files from Transmission: ${msg}`);
    }

    const episodeFiles = filesFromClient
      .map((f) => ({
        relPath: f.name,
        base: path.basename(f.name),
        episode: FileManagementService.getEpisodeFromName(
          path.basename(f.name)
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
        logger.error(`No file found for episode ${episodeNumber}`);
        continue;
      }

      const videos = matches.filter(
        (m) => FileManagementService.detectKind(m.base) === 'video'
      );
      if (videos.length === 0) {
        logger.error(`No video file found for episode ${episodeNumber}`);
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
            relPath
          );

          const destinationPath = FileManagementService.buildDestinationPath(
            settings.mediaDir,
            sanitizedTitle,
            torrentItem.season ?? null,
            episodeNumber,
            m.base
          );

          await FileManagementService.ensureDirExists(destinationPath);

          try {
            await fs.promises.access(sourcePath);
          } catch (e) {
            logger.error(`Source file not accessible: ${sourcePath}`);
            throw e;
          }

          try {
            const mode = await FileManagementService.tryLinkOrCopy(
              sourcePath,
              destinationPath
            );
            logger.info(
              `${mode === 'linked' ? 'Created hardlink' : 'Copied'} from ${sourcePath} to ${destinationPath}`
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.error(
              `Failed to copy from ${sourcePath} to ${destinationPath}: ${msg}`
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
      }
    }

    return result;
  }

  static sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static buildDestinationPath(
    mediaDir: string,
    title: string,
    season: number | null,
    episodeNumber: number,
    originalFileName: string,
    suffix: string = ''
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
      fileName
    );
  }

  private static async ensureDirExists(filePath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  }

  private static async tryLinkOrCopy(
    source: string,
    target: string
  ): Promise<'linked' | 'copied'> {
    try {
      await fs.promises.link(source, target);
      return 'linked';
    } catch {
      await fs.promises.copyFile(source, target);
      return 'copied';
    }
  }

  private static getEpisodeFromName(name: string): number | null {
    const sxe = name.match(/[Ss](\d+)[Ee](\d+)/i)?.[2];
    if (sxe) return Number(sxe);
    const e = name.match(/[Ee](\d+)/i)?.[1];
    if (e) return Number(e);
    const plain = name.match(/(?<![\w\d])(\d{2,3})(?![\d])/u)?.[1];
    return plain ? Number(plain) : null;
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
        `[FileManagement] Error deleting ${filePath}: ${String(err)}`
      );
      throw err;
    }
  }
}
