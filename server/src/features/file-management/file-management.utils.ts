import fs from 'node:fs';
import path from 'node:path';

interface SafeLinkOrCopyFileParams {
  sourceRoot: string;
  sourcePath: string;
  targetRoot: string;
  targetPath: string;
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

  try {
    await fs.promises.link(canonicalSource, canonicalTarget);
    return 'linked';
  } catch {
    await fs.promises.copyFile(canonicalSource, canonicalTarget);
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
