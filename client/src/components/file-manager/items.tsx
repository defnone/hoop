import { cn } from '@/lib/utils';
import {
  ARCHIVE_EXTENSIONS,
  FILE_ITEM_FOCUS_CLASSES,
  FILE_LIST_GRID_TEMPLATE,
  IMAGE_EXTENSIONS,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from './constants';
import type { FileEntry } from './types';
import { formatBytes, formatDate } from './utils';
import type { FileSelection } from './use-file-selection';
import type { DirectorySizeResult } from './use-directory-sizes';
import {
  File,
  FileArchive,
  FileImage,
  FileText,
  FileVideo,
  Folder,
} from 'lucide-react';
import { FileItemContextMenu } from './context-menu';
import { EntryLock } from './entry-lock';
import { getEntryAccessibleLabel } from './entry-lock.utils';
import { getFileOwnership } from './types';
import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export function FileGridItem({
  entry,
  selected,
  canRename,
  canPaste,
  onSelect,
  onContextMenu,
  itemRef,
  onFocus,
  onOpen,
  onCopy,
  onMove,
  onDelete,
  onRename,
  onPaste,
  registerDirectorySizeElement,
  directorySizes,
}: {
  entry: FileEntry;
  selected: boolean;
  canRename: boolean;
  canPaste: boolean;
  onSelect: FileSelection['selectEntry'];
  onContextMenu: FileSelection['selectContextEntry'];
  itemRef: FileSelection['registerEntryElement'];
  onFocus: FileSelection['selectFocusedEntry'];
  onOpen: (entry: FileEntry) => void;
  onCopy: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onPaste: () => void;
  registerDirectorySizeElement: (
    path: string,
    node: HTMLElement | null,
  ) => void;
  directorySizes: ReadonlyMap<string, DirectorySizeResult>;
}) {
  const entryState = getEntryState(entry);
  const ariaLabel = getEntryAccessibleLabel(entry.name, entryState);
  const pointerFocusRef = useRef(false);
  return (
    <FileItemContextMenu
      entry={entry}
      canRename={canRename}
      canPaste={canPaste}
      onOpen={onOpen}
      onCopy={onCopy}
      onMove={onMove}
      onDelete={onDelete}
      onRename={onRename}
      onPaste={onPaste}
    >
      <button
        type='button'
        ref={(node) => {
          itemRef(entry.path, node);
          registerDirectorySizeElement(
            entry.path,
            entry.type === 'directory' ? node : null,
          );
        }}
        aria-label={ariaLabel}
        aria-pressed={selected}
        data-file-item='true'
        data-selected={selected}
        className={cn(
          'group flex min-w-0 flex-col items-center rounded-xl border border-transparent px-2 py-3 text-center transition-colors',
          FILE_ITEM_FOCUS_CLASSES,
          entryState.permissionLimited && 'opacity-60',
          selected
            ? 'border-sky-500/30 bg-blue-500/10 hover:bg-sky-500/20'
            : 'hover:bg-white/[0.035]',
        )}
        onPointerDown={() => {
          pointerFocusRef.current = true;
        }}
        onPointerUp={() => {
          pointerFocusRef.current = false;
        }}
        onPointerCancel={() => {
          pointerFocusRef.current = false;
        }}
        onFocus={() => {
          if (pointerFocusRef.current) return;
          onFocus(entry.path);
        }}
        onKeyDown={(event) => handleEntryKeyDown(event, entry, onOpen)}
        onClick={(event) => onSelect(entry.path, event)}
        onDoubleClick={() => onOpen(entry)}
        onContextMenu={() => onContextMenu(entry.path)}
      >
        <EntryIcon
          entry={entry}
          className='mb-2 h-16 w-20 drop-shadow-[0_8px_10px_rgba(0,0,0,0.3)] sm:h-[72px] sm:w-24'
        />
        <span
          className={cn(
            'break-words max-w-full rounded px-1 text-sm leading-4 text-zinc-300',
            selected && 'bg-sky-600 text-white',
          )}
        >
          {entry.name}
          <EntryLock {...entryState} />
        </span>
        {entry.type === 'directory' ? (
          <EntrySize entry={entry} size={directorySizes.get(entry.path)} />
        ) : null}
      </button>
    </FileItemContextMenu>
  );
}

export function FileList({
  entries,
  selectedPaths,
  canRename,
  onSelect,
  onContextMenu,
  itemRef,
  onFocus,
  onOpen,
  onCopy,
  onMove,
  onRename,
  onDelete,
  onPaste,
  canPaste,
  registerDirectorySizeElement,
  directorySizes,
}: {
  entries: FileEntry[];
  selectedPaths: ReadonlySet<string>;
  canRename: (entry: FileEntry) => boolean;
  onSelect: FileSelection['selectEntry'];
  onContextMenu: FileSelection['selectContextEntry'];
  itemRef: FileSelection['registerEntryElement'];
  onFocus: FileSelection['selectFocusedEntry'];
  onOpen: (entry: FileEntry) => void;
  onCopy: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onPaste: () => void;
  canPaste: boolean;
  registerDirectorySizeElement: (
    path: string,
    node: HTMLElement | null,
  ) => void;
  directorySizes: ReadonlyMap<string, DirectorySizeResult>;
}) {
  return (
    <div data-testid='file-list' className='min-w-[44rem]'>
      <div
        className={cn(
          'sticky top-0 z-10 grid gap-4 border-b border-white/8 bg-[#111214]/95 px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-zinc-600 backdrop-blur',
          FILE_LIST_GRID_TEMPLATE,
        )}
      >
        <span>Name</span>
        <span className='whitespace-nowrap'>Size</span>
        <span className='whitespace-nowrap'>Modified</span>
      </div>

      {entries.map((entry) => (
        <FileListRow
          key={entry.path}
          entry={entry}
          selected={selectedPaths.has(entry.path)}
          canRename={canRename(entry)}
          canPaste={canPaste}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          itemRef={itemRef}
          onFocus={onFocus}
          onOpen={onOpen}
          onCopy={onCopy}
          onMove={onMove}
          onRename={onRename}
          onDelete={onDelete}
          onPaste={onPaste}
          registerDirectorySizeElement={registerDirectorySizeElement}
          directorySizes={directorySizes}
        />
      ))}
    </div>
  );
}

function FileListRow({
  entry,
  selected,
  canRename,
  canPaste,
  onSelect,
  onContextMenu,
  itemRef,
  onFocus,
  onOpen,
  onCopy,
  onMove,
  onRename,
  onDelete,
  onPaste,
  registerDirectorySizeElement,
  directorySizes,
}: {
  entry: FileEntry;
  selected: boolean;
  canRename: boolean;
  canPaste: boolean;
  onSelect: FileSelection['selectEntry'];
  onContextMenu: FileSelection['selectContextEntry'];
  itemRef: FileSelection['registerEntryElement'];
  onFocus: FileSelection['selectFocusedEntry'];
  onOpen: (entry: FileEntry) => void;
  onCopy: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onPaste: () => void;
  registerDirectorySizeElement: (
    path: string,
    node: HTMLElement | null,
  ) => void;
  directorySizes: ReadonlyMap<string, DirectorySizeResult>;
}) {
  const entryState = getEntryState(entry);
  const ariaLabel = getEntryAccessibleLabel(entry.name, entryState);
  const pointerFocusRef = useRef(false);
  return (
    <FileItemContextMenu
      entry={entry}
      canRename={canRename}
      canPaste={canPaste}
      onOpen={onOpen}
      onCopy={onCopy}
      onMove={onMove}
      onDelete={onDelete}
      onRename={onRename}
      onPaste={onPaste}
    >
      <button
        type='button'
        ref={(node) => {
          itemRef(entry.path, node);
          registerDirectorySizeElement(
            entry.path,
            entry.type === 'directory' ? node : null,
          );
        }}
        aria-label={ariaLabel}
        aria-pressed={selected}
        data-file-item='true'
        data-selected={selected}
        className={cn(
          'grid w-full items-center gap-4 border-b border-white/[0.045] px-6 py-2 text-left text-[0.88rem]',
          FILE_LIST_GRID_TEMPLATE,
          FILE_ITEM_FOCUS_CLASSES,
          entryState.permissionLimited && 'opacity-60',
          selected
            ? 'bg-blue-500/10 hover:bg-blue-500/20'
            : 'hover:bg-white/[0.035]',
        )}
        onPointerDown={() => {
          pointerFocusRef.current = true;
        }}
        onPointerUp={() => {
          pointerFocusRef.current = false;
        }}
        onPointerCancel={() => {
          pointerFocusRef.current = false;
        }}
        onFocus={() => {
          if (pointerFocusRef.current) return;
          onFocus(entry.path);
        }}
        onKeyDown={(event) => handleEntryKeyDown(event, entry, onOpen)}
        onClick={(event) => onSelect(entry.path, event)}
        onDoubleClick={() => onOpen(entry)}
        onContextMenu={() => onContextMenu(entry.path)}
      >
        <span className='flex min-w-0 items-center gap-3'>
          <EntryIcon entry={entry} className='h-7 w-8 shrink-0' />
          <span className='truncate text-zinc-300'>{entry.name}</span>
          <EntryLock {...entryState} />
        </span>
        <EntrySize entry={entry} size={directorySizes.get(entry.path)} />
        <span className='whitespace-nowrap text-zinc-500'>
          {formatDate(entry.modifiedAt)}
        </span>
      </button>
    </FileItemContextMenu>
  );
}

function EntrySize({
  entry,
  size,
}: {
  entry: FileEntry;
  size: DirectorySizeResult | undefined;
}) {
  if (entry.type === 'file') {
    return (
      <span className='whitespace-nowrap text-zinc-500'>
        {entry.size === null ? (
          <span title='Permission denied'>—</span>
        ) : (
          formatBytes(entry.size)
        )}
      </span>
    );
  }
  if (entry.size !== null) {
    return (
      <span className='whitespace-nowrap text-zinc-500'>
        {formatBytes(entry.size)}
      </span>
    );
  }
  if (!size) {
    return (
      <span
        className='whitespace-nowrap text-zinc-600'
        title='Calculating directory size'
      >
        Calculating…
      </span>
    );
  }
  if (size.status === 'permission-denied') {
    return (
      <span
        className='whitespace-nowrap text-zinc-600'
        title='Permission denied'
      >
        —
      </span>
    );
  }
  if (size.status === 'too-large') {
    return (
      <span
        className='whitespace-nowrap text-zinc-600'
        title='Directory is too large to calculate'
      >
        —
      </span>
    );
  }
  if (size.status === 'unavailable') {
    return (
      <span
        className='whitespace-nowrap text-zinc-600'
        title='Directory size unavailable'
      >
        —
      </span>
    );
  }
  return (
    <span
      className='whitespace-nowrap text-zinc-500 text-sm'
      title={size.size === null ? 'Directory size unavailable' : undefined}
    >
      {size.size === null ? '—' : formatBytes(size.size)}
    </span>
  );
}

type EntryState = {
  permissionLimited: boolean;
  isTorrentLinked: boolean;
  ownership: ReturnType<typeof getFileOwnership>;
};

function getEntryState(entry: FileEntry): EntryState {
  const permissionLimited = !entry.permissions.readWrite;
  return {
    permissionLimited,
    isTorrentLinked: entry.type === 'directory' && entry.isTorrentLinked,
    ownership: getFileOwnership(entry),
  };
}

function EntryIcon({
  entry,
  className,
}: {
  entry: FileEntry;
  className?: string;
}) {
  if (entry.type === 'directory') {
    return (
      <Folder
        className={cn('fill-sky-400 text-sky-300', className)}
        strokeWidth={0.4}
      />
    );
  }
  const extension = entry.name.split('.').pop()?.toLocaleLowerCase() ?? '';
  const Icon = VIDEO_EXTENSIONS.has(extension)
    ? FileVideo
    : IMAGE_EXTENSIONS.has(extension)
      ? FileImage
      : ARCHIVE_EXTENSIONS.has(extension)
        ? FileArchive
        : TEXT_EXTENSIONS.has(extension)
          ? FileText
          : File;
  return (
    <Icon
      className={cn('fill-zinc-600/50 text-zinc-400', className)}
      strokeWidth={0.5}
    />
  );
}

function handleEntryKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  entry: FileEntry,
  onOpen: (entry: FileEntry) => void,
): void {
  if (entry.type !== 'directory' || event.key !== 'Enter') return;
  event.preventDefault();
  onOpen(entry);
}
