import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertPathInsideRoot,
  safeLinkOrCopyFile,
} from '@server/features/file-management/file-management.utils';

const testRoot = path.join(process.cwd(), 'test', '.tmp-file-management-utils');
const sourceRoot = path.join(testRoot, 'source');
const targetRoot = path.join(testRoot, 'target');
const outsideRoot = path.join(testRoot, 'outside');

describe('file management path utilities', () => {
  beforeEach(async () => {
    await fs.promises.rm(testRoot, { recursive: true, force: true });
    await Promise.all([
      fs.promises.mkdir(sourceRoot, { recursive: true }),
      fs.promises.mkdir(targetRoot, { recursive: true }),
      fs.promises.mkdir(outsideRoot, { recursive: true }),
    ]);
  });

  afterEach(async () => {
    await fs.promises.rm(testRoot, { recursive: true, force: true });
  });

  it('returns canonical path for a file inside root', async () => {
    const sourcePath = path.join(sourceRoot, 'nested', 'S01E01.mkv');
    await fs.promises.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.promises.writeFile(sourcePath, 'video');

    await expect(assertPathInsideRoot(sourceRoot, sourcePath)).resolves.toBe(
      await fs.promises.realpath(sourcePath),
    );
  });

  it('rejects traversal outside root', async () => {
    const outsidePath = path.join(outsideRoot, 'S01E01.mkv');
    await fs.promises.writeFile(outsidePath, 'secret');
    const traversalPath = path.join(sourceRoot, '..', 'outside', 'S01E01.mkv');

    await expect(
      assertPathInsideRoot(sourceRoot, traversalPath),
    ).rejects.toThrowError('Path escapes configured root');
  });

  it('rejects a source symlink that points outside root', async () => {
    const outsidePath = path.join(outsideRoot, 'S01E01.mkv');
    const sourcePath = path.join(sourceRoot, 'S01E01.mkv');
    await fs.promises.writeFile(outsidePath, 'secret');
    await fs.promises.symlink(outsidePath, sourcePath);

    await expect(
      safeLinkOrCopyFile({
        sourceRoot,
        sourcePath,
        targetRoot,
        targetPath: path.join(targetRoot, 'S01E01.mkv'),
      }),
    ).rejects.toThrowError('Path escapes configured root');
  });

  it('rejects a target symlink', async () => {
    const sourcePath = path.join(sourceRoot, 'S01E01.mkv');
    const outsidePath = path.join(outsideRoot, 'existing.mkv');
    const targetPath = path.join(targetRoot, 'S01E01.mkv');
    await fs.promises.writeFile(sourcePath, 'video');
    await fs.promises.writeFile(outsidePath, 'outside');
    await fs.promises.symlink(outsidePath, targetPath);

    await expect(
      safeLinkOrCopyFile({
        sourceRoot,
        sourcePath,
        targetRoot,
        targetPath,
      }),
    ).rejects.toThrowError('Target path must not be a symbolic link');
    await expect(fs.promises.readFile(outsidePath, 'utf8')).resolves.toBe(
      'outside',
    );
  });

  it('rejects target traversal before creating directories', async () => {
    const sourcePath = path.join(sourceRoot, 'S01E01.mkv');
    const escapedDirectory = path.join(outsideRoot, 'created-by-traversal');
    const targetPath = path.join(
      targetRoot,
      '..',
      'outside',
      'created-by-traversal',
      'S01E01.mkv',
    );
    await fs.promises.writeFile(sourcePath, 'video');

    await expect(
      safeLinkOrCopyFile({
        sourceRoot,
        sourcePath,
        targetRoot,
        targetPath,
      }),
    ).rejects.toThrowError('Path escapes configured root');
    expect(fs.existsSync(escapedDirectory)).toBe(false);
  });

  it('links or copies a valid nested source into target root', async () => {
    const sourcePath = path.join(sourceRoot, 'nested', 'S01E01.mkv');
    const targetPath = path.join(targetRoot, 'show', 'S01E01.mkv');
    await fs.promises.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.promises.writeFile(sourcePath, 'video');

    await expect(
      safeLinkOrCopyFile({ sourceRoot, sourcePath, targetRoot, targetPath }),
    ).resolves.toMatch(/^(linked|copied)$/);
    await expect(fs.promises.readFile(targetPath, 'utf8')).resolves.toBe(
      'video',
    );
  });

  it('preserves existing overwrite behavior for a regular target file', async () => {
    const sourcePath = path.join(sourceRoot, 'S01E01.mkv');
    const targetPath = path.join(targetRoot, 'S01E01.mkv');
    await fs.promises.writeFile(sourcePath, 'new-video');
    await fs.promises.writeFile(targetPath, 'old-video');

    await expect(
      safeLinkOrCopyFile({ sourceRoot, sourcePath, targetRoot, targetPath }),
    ).resolves.toBe('copied');
    await expect(fs.promises.readFile(targetPath, 'utf8')).resolves.toBe(
      'new-video',
    );
  });
});
