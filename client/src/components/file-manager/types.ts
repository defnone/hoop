import type { RpcClient } from '@/lib/rpc';
import type { InferResponseType } from 'hono/client';

type DirectoryResponse = InferResponseType<
  RpcClient['api']['file-manager']['$get'],
  200
>;

export type DirectoryData = NonNullable<DirectoryResponse['data']>;
export type FileRoot = DirectoryData['root'];
export type FileEntry = DirectoryData['entries'][number];

export type FileOwnership = NonNullable<FileEntry['permissions']['ownership']>;

export type FileOwner = FileOwnership['actual'];

export function getFileOwnership(entry: FileEntry): FileOwnership | null {
  return entry.permissions.ownership ?? null;
}

export type ClipboardEntry = {
  root: FileRoot;
  path: string;
  name: string;
};

export type ClipboardState = {
  mode: 'copy' | 'move';
  items: ClipboardEntry[];
};

export type Location = {
  root: FileRoot;
  path: string;
};

export type ViewMode = 'grid' | 'list';
export type SortMode = 'name' | 'date' | 'size';

export type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export type MarqueeStart = MarqueeState & {
  additive: boolean;
  basePaths: string[];
};

export type MarqueeRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
