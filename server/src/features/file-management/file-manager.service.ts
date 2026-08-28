import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DbUserSettings } from '@server/db/app/app-schema';
import { SettingsService } from '@server/features/settings/settings.service';
import logger from '@server/lib/logger';
import {
  FileManagerRepo,
  type FileManagerTorrentFilesProvider,
} from './file-manager.repo';
import {
  DirectorySizeQueueError,
  DirectorySizeService,
  type DirectorySizeResult,
} from './file-manager-size.service';
import {
  FileManagerOwnershipResolver,
  type FileManagerOwnership,
  type FileManagerOwnershipResolverPort,
} from './file-manager-ownership';

export const fileManagerRoots = ['media', 'downloads'] as const;
export type FileManagerRoot = (typeof fileManagerRoots)[number];

export const fileManagerEntryTypes = ['directory', 'file'] as const;
export type FileManagerEntryType = (typeof fileManagerEntryTypes)[number];

export type FileManagerEntry = {
  name: string;
  path: string;
  type: FileManagerEntryType;
  size: number | null;
  modifiedAt: string | null;
  permissions: FileManagerPermissions;
  isTorrentLinked: boolean;
};

export type FileManagerPermissions = {
  readWrite: boolean;
  rename: boolean;
  ownership?: FileManagerOwnership;
};

export type FileManagerLocation = {
  root: FileManagerRoot;
  path: string;
};

export type FileManagerBatchRenameItem = {
  path: string;
  name: string;
};

export type FileManagerListing = {
  root: FileManagerRoot;
  path: string;
  entries: FileManagerEntry[];
};

export type FileManagerDirectorySize = DirectorySizeResult & {
  root: FileManagerRoot;
  path: string;
};

export type FileManagerErrorStatus = 400 | 404 | 409 | 422 | 500;
export type FileManagerErrorOutcome = 'destination-preserved';

export const FILE_MANAGER_BATCH_RENAME_MAX_ITEMS = 100;

export class FileManagerError extends Error {
  readonly status: FileManagerErrorStatus;
  readonly outcome?: FileManagerErrorOutcome;

  constructor(
    message: string,
    status: FileManagerErrorStatus,
    outcome?: FileManagerErrorOutcome,
  ) {
    super(message);
    this.name = 'FileManagerError';
    this.status = status;
    this.outcome = outcome;
  }
}

interface FileManagerSettingsProvider {
  getSettings: () => Promise<Pick<
    DbUserSettings,
    'mediaDir' | 'downloadDir'
  > | null>;
}

interface FileManagerServiceParams {
  settingsService?: FileManagerSettingsProvider;
  torrentFilesProvider?: FileManagerTorrentFilesProvider;
  directorySizeService?: DirectorySizeService;
  ownershipResolver?: FileManagerOwnershipResolverPort;
}

type OperationRoots = {
  source: string;
  destination: string;
};

type ResolvedPath = {
  normalizedPath: string;
  resolvedPath: string;
  stats: fs.Stats;
};

type DestinationPath = {
  normalizedPath: string;
  targetPath: string;
};

type BatchRenameDestinationPath = DestinationPath & {
  exists: boolean;
};

type BatchRenamePlan = {
  sourcePath: string;
  sourceRelativePath: string;
  sourceStats: fs.Stats;
  sourceType: FileManagerEntryType;
  sourcePermissions: FileManagerPermissions;
  destinationPath: string;
  destinationRelativePath: string;
  isNoOp: boolean;
};

type BatchRenameOperation = BatchRenamePlan & {
  temporaryPath: string;
};

type CreatedPath = {
  path: string;
  type: FileManagerEntryType;
  device: number | null;
  inode: number | null;
};

type DirectorySizeRootResolution = {
  path: string | null;
  status: 'ready' | 'permission-denied' | 'unavailable';
};

const FILE_ENTRY_CONCURRENCY = 16;
const READ_PERMISSION = fs.constants.R_OK | fs.constants.X_OK;
const WRITE_PERMISSION = fs.constants.W_OK | fs.constants.X_OK;

const defaultTorrentFilesProvider: FileManagerTorrentFilesProvider =
  process.env.NODE_ENV === 'test'
    ? { getTorrentFilePaths: async () => [] }
    : new FileManagerRepo();
const defaultDirectorySizeService = new DirectorySizeService();
const defaultOwnershipResolver = new FileManagerOwnershipResolver();
const batchRenameLocks = new Map<string, Promise<void>>();

export class FileManagerService {
  private readonly settingsService: FileManagerSettingsProvider;
  private readonly torrentFilesProvider: FileManagerTorrentFilesProvider;
  private readonly directorySizeService: DirectorySizeService;
  private readonly ownershipResolver: FileManagerOwnershipResolverPort;

  constructor({
    settingsService = new SettingsService(),
    torrentFilesProvider = defaultTorrentFilesProvider,
    directorySizeService = defaultDirectorySizeService,
    ownershipResolver = defaultOwnershipResolver,
  }: FileManagerServiceParams = {}) {
    this.settingsService = settingsService;
    this.torrentFilesProvider = torrentFilesProvider;
    this.directorySizeService = directorySizeService;
    this.ownershipResolver = ownershipResolver;
  }

  async list(
    root: FileManagerRoot,
    relativePath: string,
  ): Promise<FileManagerListing> {
    const rootPath = await this.getConfiguredRoot(root);
    const normalizedPath = normalizeRelativePath(relativePath);
    const directory = await this.resolveExistingPath(
      rootPath,
      normalizedPath,
      'directory',
    );
    const torrentLinkedDirectories = await this.getTorrentLinkedDirectories(
      root,
      rootPath,
    );
    const parentCanRename = await hasAccess(
      directory.resolvedPath,
      WRITE_PERMISSION,
    );
    const entries = await this.readDirectoryEntries(
      rootPath,
      normalizedPath,
      directory.resolvedPath,
      parentCanRename,
      torrentLinkedDirectories,
    );

    return {
      root,
      path: normalizedPath,
      entries,
    };
  }

  async getDirectorySizes(
    locations: FileManagerLocation[],
  ): Promise<FileManagerDirectorySize[]> {
    const normalizedLocations = locations.map((location) => ({
      ...location,
      normalizedPath: normalizeRelativePath(location.path),
    }));
    let settings: Pick<DbUserSettings, 'mediaDir' | 'downloadDir'> | null;
    try {
      settings = await this.readSettings();
    } catch (error) {
      return normalizedLocations.map((location) => {
        logDirectorySizeFailure(
          location,
          location.normalizedPath,
          Object(error),
        );
        return createUnavailableDirectorySize(
          location.root,
          location.normalizedPath,
        );
      });
    }

    const rootPaths = await this.resolveSizeRootPaths(
      settings,
      normalizedLocations,
    );
    const results = await Promise.all(
      normalizedLocations.map(async (location) => {
        const rootResolution = rootPaths.get(location.root);
        if (!rootResolution) {
          logDirectorySizeFailure(
            location,
            location.normalizedPath,
            new Error('Configured file manager root is unavailable'),
          );
          return createUnavailableDirectorySize(
            location.root,
            location.normalizedPath,
          );
        }
        if (rootResolution.status === 'unavailable') {
          return createUnavailableDirectorySize(
            location.root,
            location.normalizedPath,
          );
        }
        if (rootResolution.status === 'permission-denied') {
          return createPermissionDeniedDirectorySize(
            location.root,
            location.normalizedPath,
          );
        }
        const rootPath = rootResolution.path;
        if (!rootPath) {
          logDirectorySizeFailure(
            location,
            location.normalizedPath,
            new Error('Configured file manager root is unavailable'),
          );
          return createUnavailableDirectorySize(
            location.root,
            location.normalizedPath,
          );
        }

        let resolved: ResolvedPath;
        try {
          resolved = await this.resolveExistingPath(
            rootPath,
            location.normalizedPath,
            'directory',
          );
        } catch (error) {
          if (error instanceof FileManagerError && error.status === 422) {
            return createPermissionDeniedDirectorySize(
              location.root,
              location.normalizedPath,
            );
          }
          logDirectorySizeFailure(
            location,
            location.normalizedPath,
            Object(error),
          );
          return createUnavailableDirectorySize(
            location.root,
            location.normalizedPath,
          );
        }

        try {
          const size = await this.directorySizeService.getSize(
            resolved.resolvedPath,
            rootPath,
            {
              onFailure: (error) =>
                logDirectorySizeFailure(
                  location,
                  location.normalizedPath,
                  error,
                ),
              rootPathIsCanonical: true,
            },
          );
          return {
            root: location.root,
            path: location.normalizedPath,
            ...size,
          };
        } catch (error) {
          logDirectorySizeFailure(
            location,
            location.normalizedPath,
            Object(error),
          );
          return createUnavailableDirectorySize(
            location.root,
            location.normalizedPath,
          );
        }
      }),
    );

    return results;
  }

  private async resolveSizeRootPaths(
    settings: Pick<DbUserSettings, 'mediaDir' | 'downloadDir'> | null,
    locations: FileManagerLocation[],
  ): Promise<Map<FileManagerRoot, DirectorySizeRootResolution>> {
    const rootPaths = new Map<FileManagerRoot, DirectorySizeRootResolution>();
    const roots = new Set(locations.map((location) => location.root));

    for (const root of roots) {
      try {
        rootPaths.set(root, {
          path: await this.resolveConfiguredLocation(settings, root),
          status: 'ready',
        });
      } catch (error) {
        if (error instanceof FileManagerError && error.status === 422) {
          rootPaths.set(root, { path: null, status: 'permission-denied' });
          continue;
        }
        logDirectorySizeFailure({ root, path: '' }, '', Object(error));
        rootPaths.set(root, { path: null, status: 'unavailable' });
      }
    }

    return rootPaths;
  }

  async copy(
    source: FileManagerLocation,
    destination: FileManagerLocation,
  ): Promise<FileManagerEntry> {
    const roots = await this.getOperationRoots(source, destination);
    const resolvedSource = await this.resolveSource(roots.source, source);
    const resolvedDestination = await this.resolveDestination(
      roots.destination,
      destination,
    );

    this.assertSourceIsNotRoot(resolvedSource.normalizedPath);
    this.assertDestinationIsNotInsideSource(
      resolvedSource,
      resolvedDestination.targetPath,
    );
    await this.assertTreeHasNoSymbolicLinks(resolvedSource.resolvedPath);

    const createdPaths: CreatedPath[] = [];
    try {
      await this.copyPath(
        resolvedSource.resolvedPath,
        resolvedDestination.targetPath,
        createdPaths,
      );
    } catch (error) {
      await this.removeCreatedPaths(createdPaths, {
        root: destination.root,
        path: resolvedDestination.normalizedPath,
      });
      throw mapFileSystemError(Object(error), 'Failed to copy item');
    }

    this.directorySizeService.invalidate([resolvedDestination.targetPath]);

    return await this.readEntry(
      roots.destination,
      resolvedDestination.normalizedPath,
      destination.root,
    );
  }

  async move(
    source: FileManagerLocation,
    destination: FileManagerLocation,
  ): Promise<FileManagerEntry> {
    const roots = await this.getOperationRoots(source, destination);
    const resolvedSource = await this.resolveSource(roots.source, source);
    const resolvedDestination = await this.resolveDestination(
      roots.destination,
      destination,
    );

    this.assertSourceIsNotRoot(resolvedSource.normalizedPath);
    this.assertDestinationIsNotInsideSource(
      resolvedSource,
      resolvedDestination.targetPath,
    );
    await this.assertTreeHasNoSymbolicLinks(resolvedSource.resolvedPath);

    try {
      await this.movePath(
        resolvedSource.resolvedPath,
        resolvedDestination.targetPath,
        resolvedSource.stats,
        {
          root: destination.root,
          path: resolvedDestination.normalizedPath,
        },
        'Failed to move item',
        'Failed to remove source after move',
      );
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Failed to move item');
    }

    this.directorySizeService.invalidate([
      resolvedSource.resolvedPath,
      resolvedDestination.targetPath,
    ]);

    return await this.readEntry(
      roots.destination,
      resolvedDestination.normalizedPath,
      destination.root,
    );
  }

  async rename(
    target: FileManagerLocation,
    name: string,
  ): Promise<FileManagerEntry> {
    assertValidRenameName(name);
    const rootPath = await this.getConfiguredRoot(target.root);
    const resolvedTarget = await this.resolveSource(rootPath, target);

    this.assertSourceIsNotRoot(resolvedTarget.normalizedPath);
    if (
      resolvedTarget.stats.isDirectory() &&
      (await this.getTorrentLinkedDirectories(target.root, rootPath)).has(
        resolvedTarget.normalizedPath,
      )
    ) {
      throw new FileManagerError('Directory is linked to a torrent', 409);
    }
    await this.assertTreeHasNoSymbolicLinks(resolvedTarget.resolvedPath);

    const parentPath = getParentRelativePath(resolvedTarget.normalizedPath);
    const renamedPath = parentPath ? `${parentPath}/${name}` : name;
    const resolvedDestination = await this.resolveDestination(rootPath, {
      root: target.root,
      path: renamedPath,
    });

    try {
      await this.movePath(
        resolvedTarget.resolvedPath,
        resolvedDestination.targetPath,
        resolvedTarget.stats,
        {
          root: target.root,
          path: resolvedDestination.normalizedPath,
        },
        'Failed to rename item',
        'Failed to remove source after rename',
      );
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Failed to rename item');
    }

    this.directorySizeService.invalidate([
      resolvedTarget.resolvedPath,
      resolvedDestination.targetPath,
    ]);

    return await this.readEntry(
      rootPath,
      resolvedDestination.normalizedPath,
      target.root,
    );
  }

  async renameBatch(
    root: FileManagerRoot,
    items: FileManagerBatchRenameItem[],
  ): Promise<FileManagerEntry[]> {
    if (items.length === 0) {
      throw new FileManagerError('At least one item is required', 400);
    }
    if (items.length > FILE_MANAGER_BATCH_RENAME_MAX_ITEMS) {
      throw new FileManagerError(
        `Cannot rename more than ${FILE_MANAGER_BATCH_RENAME_MAX_ITEMS} items`,
        400,
      );
    }

    const normalizedItems = items.map((item) => {
      assertValidRenameName(item.name);
      return {
        path: normalizeRelativePath(item.path),
        name: item.name,
      };
    });
    const rootPath = await this.getConfiguredRoot(root);
    return await withBatchRenameLock(rootPath, async () => {
      const sourcePaths = new Set<string>();
      const sourcePlans: Array<
        Pick<
          BatchRenamePlan,
          | 'sourcePath'
          | 'sourceRelativePath'
          | 'sourceStats'
          | 'sourceType'
          | 'sourcePermissions'
        >
      > = [];
      const torrentLinkedDirectories = await this.getTorrentLinkedDirectories(
        root,
        rootPath,
      );

      for (const item of normalizedItems) {
        if (sourcePaths.has(item.path)) {
          throw new FileManagerError('Duplicate source path', 409);
        }
        sourcePaths.add(item.path);

        const resolvedSource = await this.resolveSource(rootPath, {
          root,
          path: item.path,
        });
        this.assertSourceIsNotRoot(resolvedSource.normalizedPath);
        const sourceType: FileManagerEntryType =
          resolvedSource.stats.isDirectory() ? 'directory' : 'file';
        const isTorrentLinked =
          sourceType === 'directory' &&
          torrentLinkedDirectories.has(resolvedSource.normalizedPath);
        if (isTorrentLinked) {
          throw new FileManagerError('Directory is linked to a torrent', 409);
        }
        await this.assertTreeHasNoSymbolicLinks(resolvedSource.resolvedPath);
        const sourcePermissions = await getEntryPermissions(
          resolvedSource.resolvedPath,
          sourceType,
          (await hasAccess(
            path.dirname(resolvedSource.resolvedPath),
            WRITE_PERMISSION,
          )) && !isTorrentLinked,
          resolvedSource.stats,
          this.ownershipResolver,
        );
        sourcePlans.push({
          sourcePath: resolvedSource.resolvedPath,
          sourceRelativePath: resolvedSource.normalizedPath,
          sourceStats: resolvedSource.stats,
          sourceType,
          sourcePermissions,
        });
      }

      assertBatchSourcesAreIndependent(
        sourcePlans.map((plan) => plan.sourceRelativePath),
      );

      const destinationPaths = new Set<string>();
      const sourcePlanByPath = new Map(
        sourcePlans.map((plan) => [plan.sourceRelativePath, plan]),
      );
      const plans: BatchRenamePlan[] = [];

      for (let index = 0; index < normalizedItems.length; index += 1) {
        const item = normalizedItems[index];
        const sourcePlan = sourcePlans[index];
        if (!item || !sourcePlan) {
          throw new FileManagerError('Invalid batch rename item', 400);
        }

        const parentPath = getParentRelativePath(item.path);
        const destinationRelativePath = parentPath
          ? `${parentPath}/${item.name}`
          : item.name;
        const destination = await this.resolveBatchDestination(
          rootPath,
          destinationRelativePath,
        );
        if (destinationPaths.has(destination.normalizedPath)) {
          throw new FileManagerError('Duplicate destination path', 409);
        }
        destinationPaths.add(destination.normalizedPath);
        if (
          destination.exists &&
          !sourcePlanByPath.has(destination.normalizedPath)
        ) {
          throw new FileManagerError('Destination already exists', 409);
        }

        plans.push({
          ...sourcePlan,
          destinationPath: destination.targetPath,
          destinationRelativePath: destination.normalizedPath,
          isNoOp: item.path === destination.normalizedPath,
        });
      }

      const stagedOperations: BatchRenameOperation[] = [];
      const publishedOperations: BatchRenameOperation[] = [];
      try {
        for (const plan of plans) {
          if (plan.isNoOp) continue;
          const temporaryPath = await this.createBatchRenameTempPath(
            rootPath,
            plan.sourcePath,
          );
          await fs.promises.rename(plan.sourcePath, temporaryPath);
          stagedOperations.push({ ...plan, temporaryPath });
        }

        // Node fs.rename has no no-replace mode; lock and final recheck protect
        // in-process batch requests, while external writers remain outside the lock.
        for (const operation of stagedOperations) {
          await this.assertBatchDestinationIsAvailable(
            operation.destinationPath,
          );
          await fs.promises.rename(
            operation.temporaryPath,
            operation.destinationPath,
          );
          publishedOperations.push(operation);
        }
      } catch (error) {
        await this.rollbackBatchRename(stagedOperations, publishedOperations);
        throw mapFileSystemError(Object(error), 'Failed to rename items');
      }

      this.directorySizeService.invalidate([
        ...plans.map((plan) => plan.sourcePath),
        ...plans.map((plan) => plan.destinationPath),
      ]);

      return plans.map((plan) =>
        createBatchRenameEntry(plan, torrentLinkedDirectories),
      );
    });
  }

  async createDirectory(
    location: FileManagerLocation,
    name: string,
  ): Promise<FileManagerEntry> {
    assertValidRenameName(name);
    const rootPath = await this.getConfiguredRoot(location.root);
    const normalizedLocation = normalizeRelativePath(location.path);
    await this.resolveExistingPath(rootPath, normalizedLocation, 'directory');

    const directoryPath = normalizedLocation
      ? `${normalizedLocation}/${name}`
      : name;
    const destination = await this.resolveDestination(rootPath, {
      root: location.root,
      path: directoryPath,
    });

    try {
      await fs.promises.mkdir(destination.targetPath, { recursive: false });
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Failed to create directory');
    }

    this.directorySizeService.invalidate([destination.targetPath]);

    return await this.readEntry(
      rootPath,
      destination.normalizedPath,
      location.root,
    );
  }

  async delete(target: FileManagerLocation): Promise<void> {
    const rootPath = await this.getConfiguredRoot(target.root);
    const resolvedTarget = await this.resolveSource(rootPath, target);

    this.assertSourceIsNotRoot(resolvedTarget.normalizedPath);
    await this.assertTreeHasNoSymbolicLinks(resolvedTarget.resolvedPath);

    try {
      await fs.promises.rm(resolvedTarget.resolvedPath, {
        recursive: true,
        force: false,
      });
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Failed to delete item');
    }

    this.directorySizeService.invalidate([resolvedTarget.resolvedPath]);
  }

  private async getOperationRoots(
    source: FileManagerLocation,
    destination: FileManagerLocation,
  ): Promise<OperationRoots> {
    const settings = await this.readSettings();
    const sourceRoot = await this.resolveConfiguredLocation(
      settings,
      source.root,
    );
    const destinationRoot =
      source.root === destination.root
        ? sourceRoot
        : await this.resolveConfiguredLocation(settings, destination.root);

    return {
      source: sourceRoot,
      destination: destinationRoot,
    };
  }

  private async getConfiguredRoot(root: FileManagerRoot): Promise<string> {
    const settings = await this.readSettings();
    return await this.resolveConfiguredLocation(settings, root);
  }

  private async resolveConfiguredLocation(
    settings: Pick<DbUserSettings, 'mediaDir' | 'downloadDir'> | null,
    root: FileManagerRoot,
  ): Promise<string> {
    const configuredPath =
      root === 'media' ? settings?.mediaDir : settings?.downloadDir;
    if (!configuredPath) {
      throw new FileManagerError(
        root === 'media'
          ? 'Media directory is not configured'
          : 'Download directory is not configured',
        400,
      );
    }
    return await this.resolveConfiguredRoot(configuredPath);
  }

  private async readSettings(): Promise<Pick<
    DbUserSettings,
    'mediaDir' | 'downloadDir'
  > | null> {
    try {
      return await this.settingsService.getSettings();
    } catch {
      throw new FileManagerError('Unable to read file manager settings', 500);
    }
  }

  private async getTorrentLinkedDirectories(
    root: FileManagerRoot,
    rootPath: string,
  ): Promise<ReadonlySet<string>> {
    if (root !== 'media') return new Set<string>();
    const torrentFilePaths =
      await this.torrentFilesProvider.getTorrentFilePaths();
    return deriveTorrentLinkedDirectories(rootPath, torrentFilePaths);
  }

  private async resolveConfiguredRoot(configuredPath: string): Promise<string> {
    try {
      const canonicalRoot = await fs.promises.realpath(configuredPath);
      const stats = await fs.promises.stat(canonicalRoot);
      if (!stats.isDirectory()) {
        throw new FileManagerError(
          'Configured file manager root is not a directory',
          400,
        );
      }
      return canonicalRoot;
    } catch (error) {
      if (error instanceof FileManagerError) throw error;
      if (
        isFileSystemError(Object(error), 'EACCES') ||
        isFileSystemError(Object(error), 'EPERM')
      ) {
        throw new FileManagerError('Permission denied', 422);
      }
      throw new FileManagerError(
        isFileSystemError(Object(error), 'ENOENT')
          ? 'Configured file manager root does not exist'
          : 'Configured file manager root is unavailable',
        400,
      );
    }
  }

  private async resolveSource(
    rootPath: string,
    location: FileManagerLocation,
  ): Promise<ResolvedPath> {
    const normalizedPath = normalizeRelativePath(location.path);
    return await this.resolveExistingPath(rootPath, normalizedPath);
  }

  private async resolveExistingPath(
    rootPath: string,
    relativePath: string,
    expectedType?: FileManagerEntryType,
  ): Promise<ResolvedPath> {
    const candidatePath = resolveLexicalPath(rootPath, relativePath);
    let stats: fs.Stats;

    try {
      stats = await fs.promises.lstat(candidatePath);
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Path cannot be accessed');
    }

    if (stats.isSymbolicLink()) {
      throw new FileManagerError(
        'Symbolic links are not supported by the file manager',
        400,
      );
    }

    let resolvedPath: string;
    try {
      resolvedPath = await fs.promises.realpath(candidatePath);
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Path cannot be accessed');
    }

    assertCanonicalPathInsideRoot(rootPath, resolvedPath);
    const resolvedStats = await fs.promises.lstat(resolvedPath);
    if (resolvedStats.isSymbolicLink()) {
      throw new FileManagerError(
        'Symbolic links are not supported by the file manager',
        400,
      );
    }

    const actualType: FileManagerEntryType | null = resolvedStats.isDirectory()
      ? 'directory'
      : resolvedStats.isFile()
        ? 'file'
        : null;
    if (!actualType) {
      throw new FileManagerError(
        'Only regular files and directories are supported',
        400,
      );
    }
    if (expectedType && actualType !== expectedType) {
      throw new FileManagerError(
        expectedType === 'directory'
          ? 'Path is not a directory'
          : 'Path is not a file',
        400,
      );
    }

    return {
      normalizedPath: relativePath,
      resolvedPath,
      stats: resolvedStats,
    };
  }

  private async resolveDestination(
    rootPath: string,
    location: FileManagerLocation,
  ): Promise<DestinationPath> {
    const normalizedPath = normalizeRelativePath(location.path);
    const targetPath = resolveLexicalPath(rootPath, normalizedPath);
    const parentPath = path.dirname(targetPath);

    let parentStats: fs.Stats;
    try {
      parentStats = await fs.promises.lstat(parentPath);
    } catch (error) {
      throw mapFileSystemError(
        Object(error),
        'Destination directory cannot be accessed',
      );
    }
    if (parentStats.isSymbolicLink()) {
      throw new FileManagerError(
        'Destination directory must not contain a symbolic link',
        400,
      );
    }
    if (!parentStats.isDirectory()) {
      throw new FileManagerError('Destination parent is not a directory', 400);
    }

    let canonicalParent: string;
    try {
      canonicalParent = await fs.promises.realpath(parentPath);
    } catch (error) {
      throw mapFileSystemError(
        Object(error),
        'Destination directory cannot be accessed',
      );
    }
    assertCanonicalPathInsideRoot(rootPath, canonicalParent);

    try {
      const targetStats = await fs.promises.lstat(targetPath);
      if (targetStats.isSymbolicLink()) {
        throw new FileManagerError(
          'Destination must not be a symbolic link',
          400,
        );
      }
      const canonicalTarget = await fs.promises.realpath(targetPath);
      assertCanonicalPathInsideRoot(rootPath, canonicalTarget);
      throw new FileManagerError('Destination already exists', 409);
    } catch (error) {
      if (error instanceof FileManagerError) throw error;
      if (!isFileSystemError(Object(error), 'ENOENT')) {
        throw mapFileSystemError(
          Object(error),
          'Destination cannot be accessed',
        );
      }
    }

    return { normalizedPath, targetPath };
  }

  private async resolveBatchDestination(
    rootPath: string,
    relativePath: string,
  ): Promise<BatchRenameDestinationPath> {
    const normalizedPath = normalizeRelativePath(relativePath);
    const targetPath = resolveLexicalPath(rootPath, normalizedPath);
    const parentPath = path.dirname(targetPath);

    let parentStats: fs.Stats;
    try {
      parentStats = await fs.promises.lstat(parentPath);
    } catch (error) {
      throw mapFileSystemError(
        Object(error),
        'Destination directory cannot be accessed',
      );
    }
    if (parentStats.isSymbolicLink()) {
      throw new FileManagerError(
        'Destination directory must not contain a symbolic link',
        400,
      );
    }
    if (!parentStats.isDirectory()) {
      throw new FileManagerError('Destination parent is not a directory', 400);
    }

    let canonicalParent: string;
    try {
      canonicalParent = await fs.promises.realpath(parentPath);
    } catch (error) {
      throw mapFileSystemError(
        Object(error),
        'Destination directory cannot be accessed',
      );
    }
    assertCanonicalPathInsideRoot(rootPath, canonicalParent);

    try {
      const targetStats = await fs.promises.lstat(targetPath);
      if (targetStats.isSymbolicLink()) {
        throw new FileManagerError(
          'Destination must not be a symbolic link',
          400,
        );
      }
      const canonicalTarget = await fs.promises.realpath(targetPath);
      assertCanonicalPathInsideRoot(rootPath, canonicalTarget);
      return { normalizedPath, targetPath, exists: true };
    } catch (error) {
      if (error instanceof FileManagerError) throw error;
      if (!isFileSystemError(Object(error), 'ENOENT')) {
        throw mapFileSystemError(
          Object(error),
          'Destination cannot be accessed',
        );
      }
    }

    return { normalizedPath, targetPath, exists: false };
  }

  private async createBatchRenameTempPath(
    rootPath: string,
    sourcePath: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const temporaryPath = path.join(
        path.dirname(sourcePath),
        `.hoop-rename-${randomUUID()}`,
      );
      assertLexicalPathInsideRoot(rootPath, temporaryPath);
      try {
        await fs.promises.lstat(temporaryPath);
      } catch (error) {
        if (isFileSystemError(Object(error), 'ENOENT')) {
          return temporaryPath;
        }
        throw mapFileSystemError(
          Object(error),
          'Temporary rename path cannot be checked',
        );
      }
    }
    throw new FileManagerError(
      'Unable to allocate a temporary rename path',
      500,
    );
  }

  private async assertBatchDestinationIsAvailable(
    targetPath: string,
  ): Promise<void> {
    try {
      const targetStats = await fs.promises.lstat(targetPath);
      if (targetStats.isSymbolicLink()) {
        throw new FileManagerError(
          'Destination must not be a symbolic link',
          400,
        );
      }
      throw new FileManagerError('Destination already exists', 409);
    } catch (error) {
      if (error instanceof FileManagerError) throw error;
      if (isFileSystemError(Object(error), 'ENOENT')) return;
      throw mapFileSystemError(Object(error), 'Destination cannot be accessed');
    }
  }

  private async rollbackBatchRename(
    stagedOperations: BatchRenameOperation[],
    publishedOperations: BatchRenameOperation[],
  ): Promise<void> {
    for (const operation of [...publishedOperations].reverse()) {
      await this.restoreBatchRenamePath(
        operation.destinationPath,
        operation.temporaryPath,
        operation.sourceStats,
      );
    }
    for (const operation of [...stagedOperations].reverse()) {
      await this.restoreBatchRenamePath(
        operation.temporaryPath,
        operation.sourcePath,
        operation.sourceStats,
      );
    }
  }

  private async restoreBatchRenamePath(
    currentPath: string,
    originalPath: string,
    expectedStats: fs.Stats,
  ): Promise<void> {
    try {
      const currentStats = await fs.promises.lstat(currentPath);
      if (
        currentStats.dev !== expectedStats.dev ||
        currentStats.ino !== expectedStats.ino
      ) {
        logBatchRenameRollbackWarning('Temporary path identity changed');
        return;
      }

      try {
        await fs.promises.lstat(originalPath);
        logBatchRenameRollbackWarning('Original path is occupied');
        return;
      } catch (error) {
        if (!isFileSystemError(Object(error), 'ENOENT')) {
          throw error;
        }
      }

      await fs.promises.rename(currentPath, originalPath);
    } catch (error) {
      if (isFileSystemError(Object(error), 'ENOENT')) return;
      logBatchRenameRollbackWarning(Object(error));
    }
  }

  private async readDirectoryEntries(
    rootPath: string,
    directoryPath: string,
    resolvedDirectoryPath: string,
    parentCanRename: boolean,
    torrentLinkedDirectories: ReadonlySet<string>,
  ): Promise<FileManagerEntry[]> {
    let directoryEntries: fs.Dirent[];
    try {
      directoryEntries = await fs.promises.readdir(resolvedDirectoryPath, {
        withFileTypes: true,
      });
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Directory cannot be read');
    }

    const entries: FileManagerEntry[] = [];
    let nextEntryIndex = 0;
    const workerCount = Math.min(
      FILE_ENTRY_CONCURRENCY,
      directoryEntries.length,
    );
    const workers: Promise<void>[] = [];

    for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
      workers.push(
        (async () => {
          while (nextEntryIndex < directoryEntries.length) {
            const currentEntryIndex = nextEntryIndex;
            nextEntryIndex += 1;
            const directoryEntry = directoryEntries[currentEntryIndex];
            if (!directoryEntry || directoryEntry.isSymbolicLink()) continue;

            const entry = await this.readDirectoryEntry(
              rootPath,
              directoryPath,
              resolvedDirectoryPath,
              directoryEntry,
              parentCanRename,
              torrentLinkedDirectories,
            );
            if (entry) entries.push(entry);
          }
        })(),
      );
    }

    await Promise.all(workers);

    entries.sort(compareEntries);
    return entries;
  }

  private async readDirectoryEntry(
    rootPath: string,
    directoryPath: string,
    resolvedDirectoryPath: string,
    directoryEntry: fs.Dirent,
    parentCanRename: boolean,
    torrentLinkedDirectories: ReadonlySet<string>,
  ): Promise<FileManagerEntry | null> {
    const childPath = path.join(resolvedDirectoryPath, directoryEntry.name);
    assertLexicalPathInsideRoot(rootPath, childPath);

    let childStats: fs.Stats;
    try {
      childStats = await fs.promises.lstat(childPath);
    } catch (error) {
      if (isFileSystemError(Object(error), 'ENOENT')) return null;
      if (isPermissionError(Object(error))) {
        return createEntryFromDirent(
          directoryPath,
          directoryEntry,
          parentCanRename,
          torrentLinkedDirectories,
        );
      }
      return null;
    }
    if (childStats.isSymbolicLink()) return null;

    const entryType: FileManagerEntryType | null = childStats.isDirectory()
      ? 'directory'
      : childStats.isFile()
        ? 'file'
        : null;
    if (!entryType) return null;

    const entryPath = joinRelativePath(directoryPath, directoryEntry.name);
    const isTorrentLinked =
      entryType === 'directory' && torrentLinkedDirectories.has(entryPath);
    let permissions: FileManagerPermissions;
    try {
      permissions = await getEntryPermissions(
        childPath,
        entryType,
        parentCanRename && !isTorrentLinked,
        childStats,
        this.ownershipResolver,
      );
    } catch (error) {
      if (isFileSystemError(Object(error), 'ENOENT')) return null;
      return null;
    }

    return {
      name: directoryEntry.name,
      path: entryPath,
      type: entryType,
      size: entryType === 'file' ? childStats.size : null,
      modifiedAt: childStats.mtime.toISOString(),
      permissions,
      isTorrentLinked,
    };
  }

  private async readEntry(
    rootPath: string,
    relativePath: string,
    root: FileManagerRoot,
  ): Promise<FileManagerEntry> {
    const resolved = await this.resolveExistingPath(rootPath, relativePath);
    const name = path.basename(resolved.resolvedPath);
    const type: FileManagerEntryType = resolved.stats.isDirectory()
      ? 'directory'
      : 'file';
    const torrentLinkedDirectories = await this.getTorrentLinkedDirectories(
      root,
      rootPath,
    );
    const isTorrentLinked =
      type === 'directory' && torrentLinkedDirectories.has(relativePath);
    const permissions = await getEntryPermissions(
      resolved.resolvedPath,
      type,
      (await hasAccess(
        path.dirname(resolved.resolvedPath),
        WRITE_PERMISSION,
      )) && !isTorrentLinked,
      resolved.stats,
      this.ownershipResolver,
    );
    return {
      name,
      path: relativePath,
      type,
      size: type === 'file' ? resolved.stats.size : null,
      modifiedAt: resolved.stats.mtime.toISOString(),
      permissions,
      isTorrentLinked,
    };
  }

  private async movePath(
    sourcePath: string,
    targetPath: string,
    sourceStats: fs.Stats,
    destination: FileManagerLocation,
    operationMessage: string,
    sourceCleanupMessage: string,
  ): Promise<void> {
    if (sourceStats.isFile()) {
      await this.moveFile(
        sourcePath,
        targetPath,
        destination,
        sourceCleanupMessage,
      );
      return;
    }
    if (!sourceStats.isDirectory()) {
      throw new FileManagerError(
        'Only regular files and directories are supported',
        400,
      );
    }
    await this.moveDirectory(
      sourcePath,
      targetPath,
      destination,
      operationMessage,
      sourceCleanupMessage,
    );
  }

  private async moveFile(
    sourcePath: string,
    targetPath: string,
    destination: FileManagerLocation,
    sourceCleanupMessage: string,
  ): Promise<void> {
    try {
      await fs.promises.link(sourcePath, targetPath);
    } catch (error) {
      if (!isFileSystemError(Object(error), 'EXDEV')) {
        throw mapFileSystemError(
          Object(error),
          'Destination cannot be created',
        );
      }
      try {
        await fs.promises.copyFile(
          sourcePath,
          targetPath,
          fs.constants.COPYFILE_EXCL,
        );
      } catch (copyError) {
        throw mapFileSystemError(
          Object(copyError),
          'Destination cannot be created',
        );
      }
    }

    const createdTarget = await this.captureCreatedPath(targetPath, 'file');
    try {
      await fs.promises.unlink(sourcePath);
    } catch (error) {
      const cleanupError = mapFileSystemError(
        Object(error),
        sourceCleanupMessage,
      );
      const destinationRolledBack = await this.removeCreatedPaths(
        [createdTarget],
        destination,
      );
      if (!destinationRolledBack) {
        throw createIncompleteMoveError(cleanupError);
      }
      throw cleanupError;
    }
  }

  private async moveDirectory(
    sourcePath: string,
    targetPath: string,
    destination: FileManagerLocation,
    operationMessage: string,
    sourceCleanupMessage: string,
  ): Promise<void> {
    const reservation = await this.reserveDirectory(targetPath);
    if (!(await this.isCurrentCreatedPath(reservation))) {
      await this.removeCreatedPaths([reservation], destination);
      throw new FileManagerError('Destination already exists', 409);
    }
    try {
      await fs.promises.rename(sourcePath, targetPath);
      return;
    } catch (error) {
      await this.removeCreatedPaths([reservation], destination);
      if (!isFileSystemError(Object(error), 'EXDEV')) {
        throw mapDirectoryMoveError(Object(error), operationMessage);
      }
    }

    const createdPaths: CreatedPath[] = [];
    try {
      await this.copyPath(sourcePath, targetPath, createdPaths);
    } catch (error) {
      await this.removeCreatedPaths(createdPaths, destination);
      throw mapFileSystemError(Object(error), operationMessage);
    }

    try {
      await fs.promises.rm(sourcePath, { recursive: true, force: false });
    } catch (error) {
      const cleanupError = mapFileSystemError(
        Object(error),
        sourceCleanupMessage,
      );
      throw createIncompleteMoveError(cleanupError);
    }
  }

  private async reserveDirectory(targetPath: string): Promise<CreatedPath> {
    try {
      await fs.promises.mkdir(targetPath, { recursive: false });
    } catch (error) {
      throw mapFileSystemError(
        Object(error),
        'Destination directory cannot be created',
      );
    }
    return await this.captureCreatedPath(targetPath, 'directory');
  }

  private async captureCreatedPath(
    targetPath: string,
    type: FileManagerEntryType,
  ): Promise<CreatedPath> {
    const createdPath: CreatedPath = {
      path: targetPath,
      type,
      device: null,
      inode: null,
    };
    try {
      const stats = await fs.promises.lstat(targetPath);
      createdPath.device = stats.dev;
      createdPath.inode = stats.ino;
    } catch {
      // Leave the path unowned when its result identity cannot be captured.
    }
    return createdPath;
  }

  private async isCurrentCreatedPath(
    createdPath: CreatedPath,
  ): Promise<boolean> {
    if (createdPath.device === null || createdPath.inode === null) return false;
    try {
      const stats = await fs.promises.lstat(createdPath.path);
      return (
        stats.dev === createdPath.device && stats.ino === createdPath.inode
      );
    } catch {
      return false;
    }
  }

  private async removeCreatedPaths(
    createdPaths: CreatedPath[],
    destination: FileManagerLocation,
  ): Promise<boolean> {
    let removed = true;
    for (const createdPath of [...createdPaths].reverse()) {
      try {
        const stats = await fs.promises.lstat(createdPath.path);
        if (createdPath.device === null || createdPath.inode === null) {
          removed = false;
          continue;
        }
        if (
          stats.dev !== createdPath.device ||
          stats.ino !== createdPath.inode
        ) {
          removed = false;
          continue;
        }
        if (createdPath.type === 'directory') {
          await fs.promises.rmdir(createdPath.path);
        } else {
          await fs.promises.unlink(createdPath.path);
        }
      } catch (error) {
        if (isFileSystemError(Object(error), 'ENOENT')) continue;
        removed = false;
        logger.warn({
          message: 'Failed to remove partial file manager copy',
          error: getSafeCleanupErrorDetails(Object(error)),
          root: destination.root,
          path: destination.path,
        });
      }
    }
    return removed;
  }

  private async copyPath(
    sourcePath: string,
    targetPath: string,
    createdPaths: CreatedPath[],
  ): Promise<void> {
    let sourceStats: fs.Stats;
    try {
      sourceStats = await fs.promises.lstat(sourcePath);
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Source cannot be read');
    }

    if (sourceStats.isSymbolicLink()) {
      throw new FileManagerError(
        'Symbolic links are not supported by the file manager',
        400,
      );
    }
    if (sourceStats.isDirectory()) {
      try {
        await fs.promises.mkdir(targetPath, { recursive: false });
      } catch (error) {
        throw mapFileSystemError(
          Object(error),
          'Destination directory cannot be created',
        );
      }
      createdPaths.push(await this.captureCreatedPath(targetPath, 'directory'));
      let children: string[];
      try {
        children = await fs.promises.readdir(sourcePath);
      } catch (error) {
        throw mapFileSystemError(
          Object(error),
          'Source directory cannot be read',
        );
      }
      for (const child of children) {
        await this.copyPath(
          path.join(sourcePath, child),
          path.join(targetPath, child),
          createdPaths,
        );
      }
      return;
    }
    if (!sourceStats.isFile()) {
      throw new FileManagerError(
        'Only regular files and directories are supported',
        400,
      );
    }

    try {
      await fs.promises.copyFile(
        sourcePath,
        targetPath,
        fs.constants.COPYFILE_EXCL,
      );
    } catch (error) {
      throw mapFileSystemError(Object(error), 'File cannot be copied');
    }
    createdPaths.push(await this.captureCreatedPath(targetPath, 'file'));
  }

  private async assertTreeHasNoSymbolicLinks(
    targetPath: string,
  ): Promise<void> {
    let stats: fs.Stats;
    try {
      stats = await fs.promises.lstat(targetPath);
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Path cannot be accessed');
    }
    if (stats.isSymbolicLink()) {
      throw new FileManagerError(
        'Symbolic links are not supported by the file manager',
        400,
      );
    }
    if (!stats.isDirectory()) return;

    let children: string[];
    try {
      children = await fs.promises.readdir(targetPath);
    } catch (error) {
      throw mapFileSystemError(Object(error), 'Directory cannot be read');
    }
    for (const child of children) {
      await this.assertTreeHasNoSymbolicLinks(path.join(targetPath, child));
    }
  }

  private assertSourceIsNotRoot(relativePath: string): void {
    if (relativePath.length === 0) {
      throw new FileManagerError(
        'The configured root cannot be operated on',
        400,
      );
    }
  }

  private assertDestinationIsNotInsideSource(
    source: ResolvedPath,
    destinationPath: string,
  ): void {
    if (!source.stats.isDirectory()) return;
    const relativeDestination = path.relative(
      source.resolvedPath,
      destinationPath,
    );
    const isInsideSource =
      relativeDestination.length === 0 ||
      (!relativeDestination.startsWith(`..${path.sep}`) &&
        relativeDestination !== '..' &&
        !path.isAbsolute(relativeDestination));
    if (isInsideSource) {
      throw new FileManagerError(
        'Destination cannot be inside the source directory',
        400,
      );
    }
  }
}

export function normalizeRelativePath(relativePath: string): string {
  if (relativePath.length === 0) return '';
  if (relativePath.includes('\0')) {
    throw new FileManagerError('Path contains an invalid NUL character', 400);
  }

  if (relativePath.includes('\\')) {
    throw new FileManagerError('Backslashes are not supported in paths', 400);
  }

  const normalizedPath = relativePath;
  if (normalizedPath.startsWith('/') || /^[A-Za-z]:/.test(normalizedPath)) {
    throw new FileManagerError('Only relative paths are allowed', 400);
  }

  const segments = normalizedPath.split('/');
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..',
    )
  ) {
    throw new FileManagerError('Path traversal is not allowed', 400);
  }
  return segments.join('/');
}

export function isValidRenameName(name: string): boolean {
  return (
    name.length > 0 &&
    name.trim().length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    !path.isAbsolute(name) &&
    !/^[A-Za-z]:/.test(name)
  );
}

function assertBatchSourcesAreIndependent(sourcePaths: string[]): void {
  for (let leftIndex = 0; leftIndex < sourcePaths.length; leftIndex += 1) {
    const leftPath = sourcePaths[leftIndex];
    if (!leftPath) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sourcePaths.length;
      rightIndex += 1
    ) {
      const rightPath = sourcePaths[rightIndex];
      if (!rightPath) continue;
      if (
        isRelativePathInside(leftPath, rightPath) ||
        isRelativePathInside(rightPath, leftPath)
      ) {
        throw new FileManagerError(
          'Nested batch rename sources are not supported',
          400,
        );
      }
    }
  }
}

async function withBatchRenameLock<T>(
  lockKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = batchRenameLocks.get(lockKey) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  batchRenameLocks.set(lockKey, queued);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (batchRenameLocks.get(lockKey) === queued) {
      batchRenameLocks.delete(lockKey);
    }
  }
}

function isRelativePathInside(
  parentPath: string,
  candidatePath: string,
): boolean {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function createBatchRenameEntry(
  plan: BatchRenamePlan,
  torrentLinkedDirectories: ReadonlySet<string>,
): FileManagerEntry {
  const isTorrentLinked =
    plan.sourceType === 'directory' &&
    torrentLinkedDirectories.has(plan.destinationRelativePath);
  return {
    name: path.basename(plan.destinationRelativePath),
    path: plan.destinationRelativePath,
    type: plan.sourceType,
    size: plan.sourceType === 'file' ? plan.sourceStats.size : null,
    modifiedAt: plan.sourceStats.mtime.toISOString(),
    permissions: {
      ...plan.sourcePermissions,
      rename: plan.sourcePermissions.rename && !isTorrentLinked,
    },
    isTorrentLinked,
  };
}

function createEntryFromDirent(
  directoryPath: string,
  directoryEntry: fs.Dirent,
  parentCanRename: boolean,
  torrentLinkedDirectories: ReadonlySet<string>,
): FileManagerEntry | null {
  const entryType = getEntryType(directoryEntry);
  if (!entryType) return null;

  const entryPath = joinRelativePath(directoryPath, directoryEntry.name);
  const isTorrentLinked =
    entryType === 'directory' && torrentLinkedDirectories.has(entryPath);

  return {
    name: directoryEntry.name,
    path: entryPath,
    type: entryType,
    size: null,
    modifiedAt: null,
    permissions: {
      readWrite: false,
      rename: parentCanRename && !isTorrentLinked,
    },
    isTorrentLinked,
  };
}

function createPermissionDeniedDirectorySize(
  root: FileManagerRoot,
  relativePath: string,
): FileManagerDirectorySize {
  return {
    root,
    path: relativePath,
    size: null,
    status: 'permission-denied',
    calculatedAt: null,
  };
}

function createUnavailableDirectorySize(
  root: FileManagerRoot,
  relativePath: string,
): FileManagerDirectorySize {
  return {
    root,
    path: relativePath,
    size: null,
    status: 'unavailable',
    calculatedAt: null,
  };
}

function logBatchRenameRollbackWarning(error: object | string): void {
  logger.warn(
    {
      operation: 'rename-batch',
      phase: 'rollback',
      error:
        typeof error === 'string'
          ? { name: 'RollbackError', message: error }
          : getSafeErrorDetails(error),
    },
    'File manager batch rename rollback incomplete',
  );
}

function logDirectorySizeFailure(
  location: FileManagerLocation,
  normalizedPath: string,
  error: object,
): void {
  const fields = {
    operation: 'sizes' as const,
    root: location.root,
    path: normalizedPath,
    error: getSafeErrorDetails(error),
  };
  if (error instanceof DirectorySizeQueueError) {
    logger.warn(fields, 'Directory size calculation failed');
    return;
  }
  logger.error(fields, 'Directory size calculation failed');
}

async function getEntryPermissions(
  entryPath: string,
  entryType: FileManagerEntryType,
  canRename: boolean,
  stats: fs.Stats,
  ownershipResolver: FileManagerOwnershipResolverPort,
): Promise<FileManagerPermissions> {
  const accessMode =
    entryType === 'directory'
      ? READ_PERMISSION | WRITE_PERMISSION
      : fs.constants.R_OK | fs.constants.W_OK;
  const readWrite = await hasAccess(entryPath, accessMode);
  const ownership = readWrite
    ? undefined
    : await ownershipResolver.resolve(stats);

  return {
    readWrite,
    rename: canRename,
    ...(ownership ? { ownership } : {}),
  };
}

async function hasAccess(entryPath: string, mode: number): Promise<boolean> {
  try {
    await fs.promises.access(entryPath, mode);
    return true;
  } catch (error) {
    if (isPermissionError(Object(error))) return false;
    throw error;
  }
}

function getEntryType(directoryEntry: fs.Dirent): FileManagerEntryType | null {
  if (directoryEntry.isDirectory()) return 'directory';
  if (directoryEntry.isFile()) return 'file';
  return null;
}

function joinRelativePath(directoryPath: string, entryName: string): string {
  return directoryPath ? `${directoryPath}/${entryName}` : entryName;
}

function deriveTorrentLinkedDirectories(
  rootPath: string,
  torrentFilePaths: string[],
): ReadonlySet<string> {
  const linkedDirectories = new Set<string>();

  for (const torrentFilePath of torrentFilePaths) {
    if (!path.isAbsolute(torrentFilePath)) continue;
    const relativePath = path.relative(rootPath, path.resolve(torrentFilePath));
    if (isOutsideRoot(relativePath) || relativePath.length === 0) continue;

    const segments = relativePath.split(path.sep).filter(Boolean);
    for (let index = 1; index < segments.length; index += 1) {
      linkedDirectories.add(segments.slice(0, index).join('/'));
    }
  }

  return linkedDirectories;
}

function isOutsideRoot(relativePath: string): boolean {
  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

function assertValidRenameName(name: string): void {
  if (!isValidRenameName(name)) {
    throw new FileManagerError('Name must be a single non-empty basename', 400);
  }
}

function getParentRelativePath(relativePath: string): string {
  const separatorIndex = relativePath.lastIndexOf('/');
  return separatorIndex === -1 ? '' : relativePath.slice(0, separatorIndex);
}

function resolveLexicalPath(rootPath: string, relativePath: string): string {
  const candidatePath = path.resolve(
    rootPath,
    ...relativePath.split('/').filter(Boolean),
  );
  assertLexicalPathInsideRoot(rootPath, candidatePath);
  return candidatePath;
}

function assertLexicalPathInsideRoot(
  rootPath: string,
  candidatePath: string,
): void {
  const relativePath = path.relative(rootPath, candidatePath);
  const escapesRoot =
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);
  if (escapesRoot) {
    throw new FileManagerError('Path escapes configured root', 400);
  }
}

function assertCanonicalPathInsideRoot(
  rootPath: string,
  candidatePath: string,
): void {
  assertLexicalPathInsideRoot(
    path.resolve(rootPath),
    path.resolve(candidatePath),
  );
}

function compareEntries(
  left: FileManagerEntry,
  right: FileManagerEntry,
): number {
  if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
  return left.name.localeCompare(right.name, undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function isFileSystemError(error: object, code: string): boolean {
  if (!(error instanceof Error)) return false;
  if (!('code' in error)) return false;
  return (error as NodeJS.ErrnoException).code === code;
}

function isPermissionError(error: object): boolean {
  return (
    isFileSystemError(error, 'EACCES') || isFileSystemError(error, 'EPERM')
  );
}

function getSafeCleanupErrorDetails(error: object): {
  name: string;
  code?: string;
} {
  if (!(error instanceof Error)) return { name: 'UnknownError' };
  if (!('code' in error)) return { name: error.name };
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string'
    ? { name: error.name, code }
    : { name: error.name };
}

function getSafeErrorDetails(error: object): {
  name: string;
  message: string;
  code?: string;
} {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError', message: 'Unknown error' };
  }

  const code = getSafeErrorCode(error);
  return code
    ? {
        name: sanitizeErrorName(error.name),
        message: sanitizeErrorMessage(error.message),
        code,
      }
    : {
        name: sanitizeErrorName(error.name),
        message: sanitizeErrorMessage(error.message),
      };
}

const QUOTED_ABSOLUTE_PATH_PATTERN =
  /(['"`])(?:[A-Za-z]:[\\/]|\/)[^\r\n'"`]*\1/g;
const ABSOLUTE_PATH_PATTERN =
  /(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\/)[^\r\n,;()[\]{}]+/g;
const SAFE_ERROR_MESSAGE_LENGTH = 256;

function sanitizeErrorName(name: string): string {
  const safeName = name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64);
  return safeName || 'Error';
}

function sanitizeErrorMessage(message: string): string {
  const safeMessage = message
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(QUOTED_ABSOLUTE_PATH_PATTERN, '[path]')
    .replace(ABSOLUTE_PATH_PATTERN, '[path]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SAFE_ERROR_MESSAGE_LENGTH);
  return safeMessage || 'Unknown error';
}

function getSafeErrorCode(error: Error): string | undefined {
  if (!('code' in error)) return undefined;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code)
    ? code
    : undefined;
}

function mapDirectoryMoveError(
  error: object,
  fallbackMessage: string,
): FileManagerError {
  if (isFileSystemError(error, 'ENOTDIR')) {
    return new FileManagerError('Destination already exists', 409);
  }
  return mapFileSystemError(error, fallbackMessage);
}

function createIncompleteMoveError(error: FileManagerError): FileManagerError {
  return new FileManagerError(
    'Move incomplete; source was not removed and destination was preserved',
    error.status,
    'destination-preserved',
  );
}

function mapFileSystemError(
  error: object,
  fallbackMessage: string,
): FileManagerError {
  if (error instanceof FileManagerError) return error;
  if (error instanceof Error) {
    if (isFileSystemError(error, 'ENOENT')) {
      return new FileManagerError('Path was not found', 404);
    }
    if (
      isFileSystemError(error, 'EEXIST') ||
      isFileSystemError(error, 'ENOTEMPTY') ||
      isFileSystemError(error, 'EISDIR')
    ) {
      return new FileManagerError('Destination already exists', 409);
    }
    if (
      isFileSystemError(error, 'EACCES') ||
      isFileSystemError(error, 'EPERM')
    ) {
      return new FileManagerError('Permission denied', 422);
    }
    if (isFileSystemError(error, 'ENOTDIR')) {
      return new FileManagerError('Path is not a directory', 400);
    }
  }
  return new FileManagerError(fallbackMessage, 500);
}
