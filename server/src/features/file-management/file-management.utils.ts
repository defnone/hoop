import fs from 'node:fs';
import path from 'node:path';

interface SafeLinkOrCopyFileParams {
  sourceRoot: string;
  sourcePath: string;
  targetRoot: string;
  targetPath: string;
}

interface ResolveTorrentSourcePathParams {
  sourceRoot: string;
  savePath: string;
  contentPath?: string;
  torrentName: string;
  filePath: string;
}

export async function resolveTorrentSourcePath({
  sourceRoot,
  savePath,
  contentPath,
  torrentName,
  filePath,
}: ResolveTorrentSourcePathParams): Promise<string> {
  const normalizedFilePath = normalizeTorrentPath(filePath);
  const candidates: string[] = [];

  if (contentPath) {
    const normalizedContentPath = path.normalize(contentPath);
    const contentName = path.basename(normalizedContentPath);
    const relativeContentPath = removeLeadingPathPart(
      normalizedFilePath,
      contentName,
    );
    candidates.push(
      path.basename(normalizedFilePath) === contentName
        ? normalizedContentPath
        : path.join(normalizedContentPath, relativeContentPath),
    );
  }

  const effectiveSavePath = savePath || sourceRoot;
  candidates.push(path.join(effectiveSavePath, normalizedFilePath));

  if (effectiveSavePath !== sourceRoot) {
    candidates.push(path.join(sourceRoot, normalizedFilePath));
  }

  if (torrentName) {
    candidates.push(
      path.join(
        sourceRoot,
        torrentName,
        removeLeadingPathPart(normalizedFilePath, torrentName),
      ),
    );
  }

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await pathExists(candidate)) return candidate;
  }

  return uniqueCandidates[0] ?? path.join(sourceRoot, normalizedFilePath);
}

export async function assertPathInsideRoot(
  rootPath: string,
  candidatePath: string,
): Promise<string> {
  const [canonicalRoot, canonicalCandidate] = await Promise.all([
    fs.promises.realpath(rootPath),
    fs.promises.realpath(candidatePath),
  ]);

  assertCanonicalPathInsideRoot(canonicalRoot, canonicalCandidate);
  return canonicalCandidate;
}

export async function safeLinkOrCopyFile({
  sourceRoot,
  sourcePath,
  targetRoot,
  targetPath,
}: SafeLinkOrCopyFileParams): Promise<'linked' | 'copied'> {
  const canonicalSource = await assertPathInsideRoot(sourceRoot, sourcePath);
  const sourceStats = await fs.promises.stat(canonicalSource);
  if (!sourceStats.isFile()) {
    throw new Error('Source path is not a regular file');
  }

  assertCanonicalPathInsideRoot(
    path.resolve(targetRoot),
    path.resolve(targetPath),
  );
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const canonicalTarget = await resolveDestinationInsideRoot(
    targetRoot,
    targetPath,
  );
  await assertTargetIsNotSymbolicLink(canonicalTarget);
  const existingTargetStats = await getFileStats(canonicalTarget);
  if (
    existingTargetStats &&
    existingTargetStats.dev === sourceStats.dev &&
    existingTargetStats.ino === sourceStats.ino
  ) {
    await assertCopiedFile(canonicalTarget);
    return 'linked';
  }

  try {
    await fs.promises.link(canonicalSource, canonicalTarget);
    await assertCopiedFile(canonicalTarget);
    return 'linked';
  } catch {
    await fs.promises.copyFile(canonicalSource, canonicalTarget);
    await assertCopiedFile(canonicalTarget);
    return 'copied';
  }
}

function assertCanonicalPathInsideRoot(
  canonicalRoot: string,
  canonicalCandidate: string,
): void {
  const relativePath = path.relative(canonicalRoot, canonicalCandidate);
  const escapesRoot =
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);

  if (escapesRoot) {
    throw new Error('Path escapes configured root');
  }
}

async function resolveDestinationInsideRoot(
  rootPath: string,
  targetPath: string,
): Promise<string> {
  const [canonicalRoot, canonicalParent] = await Promise.all([
    fs.promises.realpath(rootPath),
    fs.promises.realpath(path.dirname(targetPath)),
  ]);
  const canonicalTarget = path.join(canonicalParent, path.basename(targetPath));

  assertCanonicalPathInsideRoot(canonicalRoot, canonicalTarget);
  return canonicalTarget;
}

async function assertTargetIsNotSymbolicLink(
  targetPath: string,
): Promise<void> {
  try {
    const targetStats = await fs.promises.lstat(targetPath);
    if (targetStats.isSymbolicLink()) {
      throw new Error('Target path must not be a symbolic link');
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

async function assertCopiedFile(filePath: string): Promise<void> {
  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error('Copied file is missing or empty');
  }
}

async function getFileStats(
  filePath: string,
): Promise<Awaited<ReturnType<typeof fs.promises.stat>> | null> {
  try {
    return await fs.promises.stat(filePath);
  } catch (error) {
    if (isFileNotFoundError(error)) return null;
    throw error;
  }
}

function normalizeTorrentPath(filePath: string): string {
  return filePath.replace(/[\\/]+/g, path.sep);
}

function removeLeadingPathPart(filePath: string, pathPart: string): string {
  const parts = filePath.split(path.sep);
  return parts[0] === pathPart ? parts.slice(1).join(path.sep) : filePath;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.lstat(filePath);
    return true;
  } catch (error) {
    if (isFileNotFoundError(error)) return false;
    throw error;
  }
}
