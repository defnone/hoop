import fs from 'node:fs';
import path from 'node:path';

export const directorySizeStatuses = [
  'ready',
  'permission-denied',
  'too-large',
  'unavailable',
] as const;
export type DirectorySizeStatus = (typeof directorySizeStatuses)[number];

export type DirectorySizeResult = {
  size: number | null;
  status: DirectorySizeStatus;
  calculatedAt: string | null;
};

export type DirectorySizeFailureHandler = (error: object) => void;

export type DirectorySizeRequestOptions = {
  onFailure?: DirectorySizeFailureHandler;
  rootPathIsCanonical?: boolean;
};

export const DIRECTORY_SIZE_MAX_LOCATIONS = 32;
export const DIRECTORY_SIZE_MAX_PENDING_SCANS = 64;

export class DirectorySizeQueueError extends Error {
  constructor() {
    super('Directory size scan queue is full');
    this.name = 'DirectorySizeQueueError';
  }
}

type DirectorySizeCacheEntry = {
  result: DirectorySizeResult;
  expiresAt: number;
};

type ScanTask = {
  task: () => Promise<DirectorySizeResult>;
  resolve: (result: DirectorySizeResult) => void;
  reject: (error: Error) => void;
};

type InFlightScan = {
  version: number;
  promise: Promise<DirectorySizeResult>;
};

type ScanDirectory = {
  path: string;
  depth: number;
};

type DirectoryValidation =
  | { kind: 'ready'; path: string }
  | { kind: 'skip' }
  | { kind: 'permission-denied' };

const DIRECTORY_SIZE_CACHE_TTL_MS = 60_000;
const DIRECTORY_SIZE_CACHE_LIMIT = 512;
const DIRECTORY_SIZE_MAX_SCANS = 2;
const DIRECTORY_SIZE_MAX_ENTRIES = 100_000;
const DIRECTORY_SIZE_MAX_DEPTH = 32;
const DIRECTORY_SIZE_MAX_DURATION_MS = 5_000;

export class DirectorySizeService {
  private readonly cache = new Map<string, DirectorySizeCacheEntry>();
  private readonly inFlight = new Map<string, InFlightScan>();
  private readonly pendingScans: ScanTask[] = [];
  private readonly invalidationVersions = new Map<string, number>();
  private activeScans = 0;

  async getSize(
    directoryPath: string,
    rootPath: string = directoryPath,
    options: DirectorySizeRequestOptions = {},
  ): Promise<DirectorySizeResult> {
    const cachePath = path.resolve(directoryPath);
    const scanRootPath = path.resolve(rootPath);
    const cached = this.readCache(cachePath);
    if (cached) return cached;

    const currentScan = this.inFlight.get(cachePath);
    const version = this.getInvalidationVersion(cachePath);
    if (currentScan && currentScan.version === version) {
      return await currentScan.promise;
    }

    const scan = this.scheduleScan(() =>
      this.scan(cachePath, scanRootPath, options.rootPathIsCanonical ?? false),
    );
    this.inFlight.set(cachePath, { version, promise: scan });

    try {
      const result = await scan;
      const activeScan = this.inFlight.get(cachePath);
      if (
        activeScan?.promise === scan &&
        version === this.getInvalidationVersion(cachePath)
      ) {
        this.writeCache(cachePath, result);
      }
      return result;
    } catch (error) {
      if (error instanceof DirectorySizeQueueError) throw error;

      const result = unavailableResult();
      try {
        options.onFailure?.(Object(error));
      } catch {
        // Diagnostics must not change the scanner result.
      }

      const activeScan = this.inFlight.get(cachePath);
      if (
        activeScan?.promise === scan &&
        version === this.getInvalidationVersion(cachePath)
      ) {
        this.writeCache(cachePath, result);
      }
      return result;
    } finally {
      const activeScan = this.inFlight.get(cachePath);
      if (activeScan?.promise === scan) {
        this.inFlight.delete(cachePath);
        if (version === this.getInvalidationVersion(cachePath)) {
          this.invalidationVersions.delete(cachePath);
        }
      }
    }
  }

  invalidate(paths: string[]): void {
    const affectedPaths = paths.map((targetPath) => path.resolve(targetPath));
    const knownPaths = new Set([...this.cache.keys(), ...this.inFlight.keys()]);

    for (const knownPath of knownPaths) {
      if (
        !affectedPaths.some((targetPath) => pathsOverlap(knownPath, targetPath))
      ) {
        continue;
      }
      this.cache.delete(knownPath);
      if (this.inFlight.has(knownPath)) {
        this.invalidationVersions.set(
          knownPath,
          this.getInvalidationVersion(knownPath) + 1,
        );
      }
    }
  }

  private readCache(directoryPath: string): DirectorySizeResult | null {
    const entry = this.cache.get(directoryPath);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(directoryPath);
      return null;
    }

    this.cache.delete(directoryPath);
    this.cache.set(directoryPath, entry);
    return entry.result;
  }

  private writeCache(directoryPath: string, result: DirectorySizeResult): void {
    if (this.cache.has(directoryPath)) this.cache.delete(directoryPath);
    while (this.cache.size >= DIRECTORY_SIZE_CACHE_LIMIT) {
      const oldestPath = this.cache.keys().next().value;
      if (typeof oldestPath !== 'string') break;
      this.cache.delete(oldestPath);
    }
    this.cache.set(directoryPath, {
      result,
      expiresAt: Date.now() + DIRECTORY_SIZE_CACHE_TTL_MS,
    });
  }

  private getInvalidationVersion(directoryPath: string): number {
    return this.invalidationVersions.get(directoryPath) ?? 0;
  }

  private scheduleScan(
    task: () => Promise<DirectorySizeResult>,
  ): Promise<DirectorySizeResult> {
    if (this.pendingScans.length >= DIRECTORY_SIZE_MAX_PENDING_SCANS) {
      return Promise.reject(new DirectorySizeQueueError());
    }

    return new Promise<DirectorySizeResult>((resolve, reject) => {
      this.pendingScans.push({ task, resolve, reject });
      this.drainScanQueue();
    });
  }

  private drainScanQueue(): void {
    while (
      this.activeScans < DIRECTORY_SIZE_MAX_SCANS &&
      this.pendingScans.length > 0
    ) {
      const scanTask = this.pendingScans.shift();
      if (!scanTask) return;

      this.activeScans += 1;
      void scanTask
        .task()
        .then(scanTask.resolve, scanTask.reject)
        .finally(() => {
          this.activeScans -= 1;
          this.drainScanQueue();
        });
    }
  }

  private async scan(
    directoryPath: string,
    rootPath: string,
    rootPathIsCanonical: boolean,
  ): Promise<DirectorySizeResult> {
    const startedAt = Date.now();
    const stack: ScanDirectory[] = [{ path: directoryPath, depth: 0 }];
    let entryCount = 0;
    let totalSize = 0;
    let canonicalRootPath: string;

    try {
      canonicalRootPath = rootPathIsCanonical
        ? rootPath
        : await fs.promises.realpath(rootPath);
      while (stack.length > 0) {
        if (isScanLimitReached(startedAt, entryCount)) {
          return tooLargeResult();
        }

        const current = stack.pop();
        if (!current) break;

        const validation = await validateDirectory(
          current.path,
          canonicalRootPath,
        );
        if (validation.kind === 'permission-denied') {
          return permissionDeniedResult();
        }
        if (validation.kind === 'skip') continue;

        let directory: fs.Dir;
        try {
          directory = await fs.promises.opendir(validation.path, {
            bufferSize: 64,
          });
        } catch (error) {
          if (isFileSystemError(Object(error), 'ENOENT')) continue;
          if (isPermissionError(Object(error))) {
            return permissionDeniedResult();
          }
          throw error;
        }
        try {
          for await (const directoryEntry of directory) {
            entryCount += 1;
            if (isScanLimitReached(startedAt, entryCount)) {
              return tooLargeResult();
            }
            if (directoryEntry.isSymbolicLink()) continue;

            const childPath = path.join(validation.path, directoryEntry.name);
            let childStats: fs.Stats;
            try {
              childStats = await fs.promises.lstat(childPath);
            } catch (error) {
              if (isFileSystemError(Object(error), 'ENOENT')) continue;
              if (isPermissionError(Object(error))) {
                return permissionDeniedResult();
              }
              throw error;
            }

            if (childStats.isSymbolicLink()) continue;
            if (childStats.isDirectory()) {
              if (current.depth >= DIRECTORY_SIZE_MAX_DEPTH) {
                return tooLargeResult();
              }
              stack.push({ path: childPath, depth: current.depth + 1 });
              continue;
            }
            if (!childStats.isFile()) continue;

            totalSize += childStats.size;
            if (!Number.isSafeInteger(totalSize)) {
              return tooLargeResult();
            }
          }
        } finally {
          try {
            await directory.close();
          } catch {
            // The async iterator may have already closed the directory.
          }
        }
      }
    } catch (error) {
      if (isPermissionError(Object(error))) return permissionDeniedResult();
      throw error;
    }

    return {
      size: totalSize,
      status: 'ready',
      calculatedAt: new Date().toISOString(),
    };
  }
}

function isScanLimitReached(startedAt: number, entryCount: number): boolean {
  return (
    entryCount > DIRECTORY_SIZE_MAX_ENTRIES ||
    Date.now() - startedAt > DIRECTORY_SIZE_MAX_DURATION_MS
  );
}

function tooLargeResult(): DirectorySizeResult {
  return {
    size: null,
    status: 'too-large',
    calculatedAt: null,
  };
}

function permissionDeniedResult(): DirectorySizeResult {
  return {
    size: null,
    status: 'permission-denied',
    calculatedAt: null,
  };
}

function unavailableResult(): DirectorySizeResult {
  return {
    size: null,
    status: 'unavailable',
    calculatedAt: null,
  };
}

async function validateDirectory(
  directoryPath: string,
  rootPath: string,
): Promise<DirectoryValidation> {
  let stats: fs.Stats;
  try {
    stats = await fs.promises.lstat(directoryPath);
  } catch (error) {
    if (isFileSystemError(Object(error), 'ENOENT')) return { kind: 'skip' };
    if (isPermissionError(Object(error))) {
      return { kind: 'permission-denied' };
    }
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    return { kind: 'skip' };
  }

  let canonicalPath: string;
  try {
    canonicalPath = await fs.promises.realpath(directoryPath);
  } catch (error) {
    if (isFileSystemError(Object(error), 'ENOENT')) return { kind: 'skip' };
    if (isPermissionError(Object(error))) {
      return { kind: 'permission-denied' };
    }
    throw error;
  }
  if (!isPathInsideRoot(rootPath, canonicalPath)) return { kind: 'skip' };
  return { kind: 'ready', path: canonicalPath };
}

function pathsOverlap(leftPath: string, rightPath: string): boolean {
  const relativePath = path.relative(leftPath, rightPath);
  const reverseRelativePath = path.relative(rightPath, leftPath);
  return (
    isPathInsideOrEqual(relativePath) ||
    isPathInsideOrEqual(reverseRelativePath)
  );
}

function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  return isPathInsideOrEqual(path.relative(rootPath, targetPath));
}

function isPathInsideOrEqual(relativePath: string): boolean {
  return (
    (relativePath.length === 0 && !path.isAbsolute(relativePath)) ||
    (relativePath.length > 0 &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function isPermissionError(error: object): boolean {
  return (
    isFileSystemError(error, 'EACCES') || isFileSystemError(error, 'EPERM')
  );
}

function isFileSystemError(error: object, code: string): boolean {
  if (!(error instanceof Error) || !('code' in error)) return false;
  return (error as NodeJS.ErrnoException).code === code;
}
