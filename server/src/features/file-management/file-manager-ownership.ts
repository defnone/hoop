import fs from 'node:fs';
import type { Stats } from 'node:fs';

export type FileManagerOwner = {
  uid: number;
  gid: number;
  user: string | null;
  group: string | null;
};

export type FileManagerOwnership = {
  actual: FileManagerOwner;
  expected: FileManagerOwner | null;
};

export type FileManagerOwnershipResolverPort = {
  resolve: (stats: Pick<Stats, 'uid' | 'gid'>) => Promise<FileManagerOwnership>;
};

type ProcessIdentity = {
  uid: number;
  gid: number;
};

type FileManagerOwnershipResolverOptions = {
  getProcessIdentity?: () => ProcessIdentity | null;
  readFile?: (filePath: string) => Promise<string>;
};

const PASSWD_FILE = '/etc/passwd';
const GROUP_FILE = '/etc/group';

export class FileManagerOwnershipResolver
  implements FileManagerOwnershipResolverPort
{
  private readonly getProcessIdentity: () => ProcessIdentity | null;
  private readonly readFile: (filePath: string) => Promise<string>;
  private userNamesPromise: Promise<ReadonlyMap<number, string>> | null = null;
  private groupNamesPromise: Promise<ReadonlyMap<number, string>> | null = null;
  private expectedIdentity: ProcessIdentity | null | undefined;

  constructor({
    getProcessIdentity = readCurrentProcessIdentity,
    readFile = readTextFile,
  }: FileManagerOwnershipResolverOptions = {}) {
    this.getProcessIdentity = getProcessIdentity;
    this.readFile = readFile;
  }

  async resolve(
    stats: Pick<Stats, 'uid' | 'gid'>,
  ): Promise<FileManagerOwnership> {
    const [userNames, groupNames] = await Promise.all([
      this.loadUserNames(),
      this.loadGroupNames(),
    ]);
    const actual = createOwner(stats.uid, stats.gid, userNames, groupNames);
    const identity = this.getExpectedIdentity();

    return {
      actual,
      expected: identity
        ? createOwner(identity.uid, identity.gid, userNames, groupNames)
        : null,
    };
  }

  private loadUserNames(): Promise<ReadonlyMap<number, string>> {
    if (this.userNamesPromise === null) {
      this.userNamesPromise = this.readNameMap(PASSWD_FILE, 2);
    }
    return this.userNamesPromise;
  }

  private loadGroupNames(): Promise<ReadonlyMap<number, string>> {
    if (this.groupNamesPromise === null) {
      this.groupNamesPromise = this.readNameMap(GROUP_FILE, 2);
    }
    return this.groupNamesPromise;
  }

  private async readNameMap(
    filePath: string,
    idFieldIndex: number,
  ): Promise<ReadonlyMap<number, string>> {
    try {
      const contents = await this.readFile(filePath);
      const names = new Map<number, string>();
      for (const line of contents.split('\n')) {
        const fields = line.split(':');
        const name = fields[0]?.trim();
        const id = Number.parseInt(fields[idFieldIndex] ?? '', 10);
        if (name && Number.isInteger(id) && id >= 0) {
          names.set(id, name);
        }
      }
      return names;
    } catch {
      return new Map<number, string>();
    }
  }

  private getExpectedIdentity(): ProcessIdentity | null {
    if (this.expectedIdentity !== undefined) return this.expectedIdentity;
    try {
      this.expectedIdentity = this.getProcessIdentity();
    } catch {
      this.expectedIdentity = null;
    }
    return this.expectedIdentity;
  }
}

function createOwner(
  uid: number,
  gid: number,
  userNames: ReadonlyMap<number, string>,
  groupNames: ReadonlyMap<number, string>,
): FileManagerOwner {
  return {
    uid,
    gid,
    user: userNames.get(uid) ?? null,
    group: groupNames.get(gid) ?? null,
  };
}

function readCurrentProcessIdentity(): ProcessIdentity | null {
  const getuid = process.getuid;
  const getgid = process.getgid;
  if (!getuid || !getgid) return null;

  const uid = getuid();
  const gid = getgid();
  if (!Number.isInteger(uid) || uid < 0 || !Number.isInteger(gid) || gid < 0) {
    return null;
  }
  return { uid, gid };
}

async function readTextFile(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf8');
}
