import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ArrowDownAZ,
  ChevronDown,
  Clipboard,
  Copy,
  FolderPlus,
  HardDriveDownload,
  MoreHorizontal,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import type { ButtonHTMLAttributes } from 'react';
import { ROOTS } from '../constants';
import type { Location, SortMode } from '../types';
import type { FileToolbarProps } from './types';

export function ActionsMenu(props: FileToolbarProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button variant='ghost' size='sm' className='gap-2 text-zinc-300'>
          <MoreHorizontal size={16} /> Actions <ChevronDown size={13} />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align='start'
          className='z-50 min-w-52 rounded-lg border bg-popover p-1 text-sm shadow-2xl'
        >
          <MenuItem
            onSelect={props.onNewFolder}
            icon={FolderPlus}
            label='New Folder'
            shortcut='⇧⌘N'
          />
          <MenuItem
            disabled={props.selectedCount === 0}
            onSelect={props.onCopy}
            icon={Copy}
            label='Copy'
            shortcut='⌘C'
          />
          <MenuItem
            disabled={props.selectedCount === 0}
            onSelect={props.onMove}
            icon={Scissors}
            label='Cut'
            shortcut='⌘X'
          />
          <MenuItem
            disabled={!props.clipboard}
            onSelect={props.onPaste}
            icon={Clipboard}
            label='Paste'
            shortcut='⌘V'
          />
          <MenuItem
            disabled={props.selectedCount === 0 || !props.canRenameSelected}
            onSelect={props.onRename}
            icon={Pencil}
            label='Rename'
            shortcut='F2'
          />
          <DropdownMenuPrimitive.Separator className='my-1 h-px bg-border' />
          <MenuItem
            disabled={props.selectedCount === 0}
            onSelect={props.onDelete}
            icon={Trash2}
            label='Delete'
            destructive
          />
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export function SortMenu({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (value: SortMode) => void;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button variant='ghost' size='sm' aria-label='Sort files'>
          <ArrowDownAZ size={16} />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align='start'
          className='z-50 min-w-40 rounded-lg border bg-popover p-1 text-sm shadow-2xl'
        >
          {(['name', 'date', 'size'] as const).map((mode) => (
            <DropdownMenuPrimitive.Item
              key={mode}
              className={cn(
                'cursor-default rounded-md px-2 py-1.5 outline-none focus:bg-accent',
                value === mode && 'bg-accent',
              )}
              onSelect={() => onChange(mode)}
            >
              {mode === 'name'
                ? 'Name'
                : mode === 'date'
                  ? 'Date modified'
                  : 'Size'}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export function RootSwitcher({
  location,
  onNavigate,
}: {
  location: Location;
  onNavigate: (location: Location) => void;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button variant='ghost' size='sm' className='px-2'>
          <HardDriveDownload size={16} />
          <ChevronDown size={12} />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align='start'
          className='z-50 min-w-40 rounded-lg border bg-popover p-1 text-sm shadow-2xl'
        >
          {ROOTS.map((root) => (
            <DropdownMenuPrimitive.Item
              key={root.value}
              className={cn(
                'cursor-default rounded-md px-2 py-1.5 outline-none focus:bg-accent',
                location.root === root.value && 'bg-accent',
              )}
              onSelect={() => onNavigate({ root: root.value, path: '' })}
            >
              {root.label}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  disabled,
  destructive,
  onSelect,
}: {
  icon: typeof Copy;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        destructive && 'text-red-500 focus:bg-red-500/10',
      )}
    >
      <Icon size={15} /> {label}
      {shortcut ? (
        <span className='ml-auto text-xs text-zinc-600'>{shortcut}</span>
      ) : null}
    </DropdownMenuPrimitive.Item>
  );
}

export function ToolbarButton({
  label,
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/6 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-25 [&_svg]:size-4',
        active && 'bg-white/8 text-zinc-100',
      )}
      {...props}
    >
      {children}
    </button>
  );
}
