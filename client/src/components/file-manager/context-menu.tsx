import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Clipboard,
  Copy,
  FolderOpen,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react';
import type { ReactElement } from 'react';
import type { FileEntry } from './types';

export type FileItemContextMenuProps = {
  entry: FileEntry;
  canRename: boolean;
  canPaste: boolean;
  children: ReactElement;
  onOpen: (entry: FileEntry) => void;
  onCopy: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onPaste: () => void;
};

export function FileItemContextMenu({
  entry,
  canRename,
  canPaste,
  children,
  onOpen,
  onCopy,
  onMove,
  onDelete,
  onRename,
  onPaste,
}: FileItemContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className='min-w-48'>
        {entry.type === 'directory' ? (
          <ContextMenuItem onSelect={() => onOpen(entry)}>
            <FolderOpen />
            Open
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={() => onCopy(entry)}>
          <Copy />
          Copy<ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onMove(entry)}>
          <Scissors />
          Cut<ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canPaste} onSelect={onPaste}>
          <Clipboard />
          Paste<ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canRename} onSelect={() => onRename(entry)}>
          <Pencil />
          Rename<ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant='destructive' onSelect={() => onDelete(entry)}>
          <Trash2 />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
