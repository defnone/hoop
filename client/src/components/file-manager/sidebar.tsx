import { FolderInput, HardDriveDownload, Clipboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROOTS, type RootConfig } from './constants';
import type { ClipboardState, Location } from './types';
import { rootLabel } from './utils';

export function FileSidebar({
  location,
  clipboard,
  onNavigate,
}: {
  location: Location;
  clipboard: ClipboardState | null;
  onNavigate: (location: Location) => void;
}) {
  return (
    <aside className='hidden w-64 shrink-0 border-r border-white/8 bg-[#17181b] px-3 py-5 md:block'>
      <p className='mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500'>
        Locations
      </p>
      <div className='space-y-1'>
        {ROOTS.map((root) => (
          <RootButton
            key={root.value}
            root={root}
            active={location.root === root.value}
            onClick={() => onNavigate({ root: root.value, path: '' })}
          />
        ))}
      </div>
      {clipboard ? (
        <div className='mt-8 rounded-xl border border-white/8 bg-white/[0.025] p-3'>
          <div className='mb-2 flex items-center gap-2 text-xs font-bold text-zinc-300'>
            <Clipboard size={14} className='text-sky-400' />
            Clipboard
          </div>
          <p className='truncate text-xs text-zinc-400'>
            {clipboard.items.length === 1
              ? clipboard.items[0]?.name
              : `${clipboard.items.length} items`}
          </p>
          <p className='mt-1 text-[11px] text-zinc-600'>
            {clipboard.mode === 'copy' ? 'Copy' : 'Move'} from{' '}
            {rootLabel(clipboard.items[0]?.root ?? location.root)}
          </p>
        </div>
      ) : null}
    </aside>
  );
}

function RootButton({
  root,
  active,
  onClick,
}: {
  root: RootConfig;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = root.value === 'media' ? FolderInput : HardDriveDownload;
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.045]',
        active && 'bg-blue-500/12 text-white',
      )}
    >
      <span
        className={cn(
          'grid size-8 place-items-center rounded-lg bg-white/5 text-zinc-500',
          active && 'bg-blue-500/15 text-blue-400',
        )}
      >
        <Icon size={17} />
      </span>
      <span className='min-w-0'>
        <span className='block text-sm font-bold'>{root.label}</span>
        <span className='block truncate text-[11px] text-zinc-600'>
          {root.description}
        </span>
      </span>
    </button>
  );
}
