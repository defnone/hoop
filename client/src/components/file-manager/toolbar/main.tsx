import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Grid2X2,
  List,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { ActionsMenu, RootSwitcher, SortMenu, ToolbarButton } from './controls';
import type { FileToolbarProps } from './types';
import { rootLabel } from '../utils';

export type { FileToolbarProps } from './types';

export function FileToolbar(props: FileToolbarProps) {
  const segments = props.location.path.split('/').filter(Boolean);
  return (
    <header className='shrink-0 border-b border-white/8 bg-[#191a1e]/95  backdrop-blur'>
      <div className='flex h-14 items-center gap-2 px-3 sm:px-5'>
        <div className='flex items-center gap-1'>
          <ToolbarButton
            label='Back'
            disabled={!props.historyAvailable}
            onClick={props.onBack}
          >
            <ArrowLeft />
          </ToolbarButton>
          <ToolbarButton
            label='Forward'
            disabled={!props.futureAvailable}
            onClick={props.onForward}
          >
            <ArrowRight />
          </ToolbarButton>
        </div>
        <div className='mx-1 hidden h-5 w-px bg-white/8 sm:block' />
        <div className='min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]'>
          <div className='flex min-w-max items-center text-sm'>
            <button
              type='button'
              className='rounded-md px-2 py-1 font-bold text-zinc-200 hover:bg-white/6'
              onClick={() =>
                props.onNavigate({ root: props.location.root, path: '' })
              }
            >
              {rootLabel(props.location.root)}
            </button>
            {segments.map((segment, index) => (
              <div key={`${segment}-${index}`} className='flex items-center'>
                <ChevronRight size={14} className='text-zinc-600' />
                <button
                  type='button'
                  className='rounded-md px-2 py-1 text-zinc-400 hover:bg-white/6 hover:text-zinc-100'
                  onClick={() =>
                    props.onNavigate({
                      root: props.location.root,
                      path: segments.slice(0, index + 1).join('/'),
                    })
                  }
                >
                  {segment}
                </button>
              </div>
            ))}
          </div>
        </div>
        {props.isBusy ? (
          <LoaderCircle size={16} className='animate-spin text-sky-400' />
        ) : null}
        <ToolbarButton label='Refresh' onClick={props.onRefresh}>
          <RefreshCw />
        </ToolbarButton>
      </div>
      <div className='flex h-12 items-center gap-2 border-t border-white/[0.045] px-3 sm:px-5'>
        <div className='flex md:hidden'>
          <RootSwitcher
            location={props.location}
            onNavigate={props.onNavigate}
          />
        </div>
        <ActionsMenu {...props} />
        <SortMenu value={props.sortMode} onChange={props.onSortMode} />
        <div className='ml-auto hidden items-center rounded-lg border border-white/8 bg-black/15 p-0.5 sm:flex'>
          <ToolbarButton
            label='Grid view'
            active={props.viewMode === 'grid'}
            onClick={() => props.onViewMode('grid')}
          >
            <Grid2X2 />
          </ToolbarButton>
          <ToolbarButton
            label='List view'
            active={props.viewMode === 'list'}
            onClick={() => props.onViewMode('list')}
          >
            <List />
          </ToolbarButton>
        </div>
        <div className='relative ml-auto w-full max-w-56 sm:ml-0'>
          <Search
            className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600'
            size={14}
          />
          <Input
            aria-label='Filter files'
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder='Filter'
            className='h-8 border-white/8 bg-black/20 pl-8 text-xs'
          />
        </div>
      </div>
    </header>
  );
}
