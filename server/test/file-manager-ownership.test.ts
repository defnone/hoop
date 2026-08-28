import { describe, expect, it, vi } from 'vitest';
import {
  FileManagerOwnershipResolver,
  type FileManagerOwnership,
} from '@server/features/file-management/file-manager-ownership';

const fileStats = { uid: 2001, gid: 2002 };

describe('FileManagerOwnershipResolver', () => {
  it('resolves actual and expected owners with numeric fallback', async () => {
    const readFile = vi.fn<(filePath: string) => Promise<string>>(
      async (filePath) => {
        if (filePath === '/etc/passwd') {
          return 'media-owner:x:2001:2002::/media:/sbin/nologin\n';
        }
        return 'media-group:x:2002:\n';
      },
    );
    const resolver = new FileManagerOwnershipResolver({
      getProcessIdentity: () => ({ uid: 1000, gid: 1000 }),
      readFile,
    });

    const mismatch = await resolver.resolve(fileStats);
    const match = await resolver.resolve({ uid: 1000, gid: 1000 });

    expect(mismatch).toEqual<FileManagerOwnership>({
      actual: {
        uid: 2001,
        gid: 2002,
        user: 'media-owner',
        group: 'media-group',
      },
      expected: {
        uid: 1000,
        gid: 1000,
        user: null,
        group: null,
      },
    });
    expect(match.actual).toEqual(match.expected);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('returns numeric IDs when account files are unavailable', async () => {
    const readFile = vi.fn<(filePath: string) => Promise<string>>(async () => {
      throw new Error('Account database unavailable');
    });
    const resolver = new FileManagerOwnershipResolver({
      getProcessIdentity: () => null,
      readFile,
    });

    await expect(resolver.resolve(fileStats)).resolves.toEqual({
      actual: {
        uid: 2001,
        gid: 2002,
        user: null,
        group: null,
      },
      expected: null,
    });
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});
