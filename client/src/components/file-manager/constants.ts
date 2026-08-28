import type { FileRoot } from './types';

export type RootConfig = {
  value: FileRoot;
  label: string;
  description: string;
};

export const ROOTS: RootConfig[] = [
  { value: 'media', label: 'Media', description: 'Organized library' },
  { value: 'downloads', label: 'Downloads', description: 'Torrent downloads' },
];

export const FILE_MANAGER_VIEW_MODE_STORAGE_KEY = 'hoop:file-manager:view-mode';

export const FILE_LIST_GRID_TEMPLATE =
  'grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)_minmax(12rem,16rem)]';

export const FILE_ITEM_FOCUS_CLASSES = 'relative isolate outline-none';

export const VIDEO_EXTENSIONS = new Set([
  'mkv',
  'mp4',
  'avi',
  'mov',
  'webm',
  'm4v',
]);
export const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
]);
export const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
export const TEXT_EXTENSIONS = new Set(['txt', 'nfo', 'srt', 'ass', 'md']);
