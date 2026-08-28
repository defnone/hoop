import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FolderOpen, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { FileGridItem, FileList } from './items';
import type { FileEntry, MarqueeState, ViewMode } from './types';
import type { FileSelection } from './use-file-selection';
import type { DirectorySizeResult } from './use-directory-sizes';
import { getMarqueeDistance, getMarqueeRect } from './utils';

export type FileContentSelectionProps = {
  selectedPaths: ReadonlySet<string>;
  canRename: (entry: FileEntry) => boolean;
  marquee: MarqueeState | null;
  beginMarquee: FileSelection['beginMarquee'];
  handleContentClick: FileSelection['handleContentClick'];
  registerEntryElement: FileSelection['registerEntryElement'];
  selectFocusedEntry: FileSelection['selectFocusedEntry'];
  registerDirectorySizeElement: (
    path: string,
    node: HTMLElement | null,
  ) => void;
  onSelect: FileSelection['selectEntry'];
  onContextMenu: FileSelection['selectContextEntry'];
};

export type FileContentStateProps = {
  search: string;
  isPending: boolean;
  errorMessage: string | null;
  isConfigurationError: boolean;
};

export type FileContentActionProps = {
  canPaste: boolean;
  onRetry: () => void;
  onOpenSettings: () => void;
  onOpen: (entry: FileEntry) => void;
  onCopy: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onPaste: () => void;
};

export type FileContentProps = {
  entries: FileEntry[];
  directorySizes: ReadonlyMap<string, DirectorySizeResult>;
  viewMode: ViewMode;
  selection: FileContentSelectionProps;
  state: FileContentStateProps;
  actions: FileContentActionProps;
};

export function FileContent(props: FileContentProps) {
  return (
    <ScrollArea
      data-testid='file-content'
      className='relative min-h-0 min-w-0 flex-1'
      onMouseDown={props.selection.beginMarquee}
      onClick={props.selection.handleContentClick}
    >
      <div
        className={cn('min-h-full', props.viewMode === 'grid' && 'p-4 sm:p-6')}
      >
        {props.selection.marquee &&
        getMarqueeDistance(props.selection.marquee) >= 4 ? (
          <MarqueeSelection marquee={props.selection.marquee} />
        ) : null}
        {props.state.isPending ? (
          <EmptyState icon={LoaderCircle} title='Opening folder' spinning />
        ) : props.state.errorMessage ? (
          <EmptyState
            icon={FolderOpen}
            title='Cannot open folder'
            description={props.state.errorMessage}
            action={
              props.state.isConfigurationError ? (
                <Button onClick={props.actions.onOpenSettings}>
                  Open settings
                </Button>
              ) : (
                <Button onClick={props.actions.onRetry}>Try again</Button>
              )
            }
          />
        ) : props.entries.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={props.state.search ? 'No matching items' : 'Folder is empty'}
            description={
              props.state.search
                ? 'Try another search.'
                : 'Files placed here will appear automatically.'
            }
          />
        ) : props.viewMode === 'grid' ? (
          <div className='grid grid-cols-[repeat(auto-fill,minmax(126px,1fr))] gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]'>
            {props.entries.map((entry) => (
              <FileGridItem
                key={entry.path}
                entry={entry}
                selected={props.selection.selectedPaths.has(entry.path)}
                canRename={props.selection.canRename(entry)}
                onSelect={props.selection.onSelect}
                onContextMenu={props.selection.onContextMenu}
                itemRef={props.selection.registerEntryElement}
                onFocus={props.selection.selectFocusedEntry}
                registerDirectorySizeElement={
                  props.selection.registerDirectorySizeElement
                }
                directorySizes={props.directorySizes}
                onOpen={props.actions.onOpen}
                onCopy={props.actions.onCopy}
                onMove={props.actions.onMove}
                onDelete={props.actions.onDelete}
                onRename={props.actions.onRename}
                onPaste={props.actions.onPaste}
                canPaste={props.actions.canPaste}
              />
            ))}
          </div>
        ) : (
          <FileList
            entries={props.entries}
            selectedPaths={props.selection.selectedPaths}
            canRename={props.selection.canRename}
            onSelect={props.selection.onSelect}
            onContextMenu={props.selection.onContextMenu}
            itemRef={props.selection.registerEntryElement}
            onFocus={props.selection.selectFocusedEntry}
            registerDirectorySizeElement={
              props.selection.registerDirectorySizeElement
            }
            directorySizes={props.directorySizes}
            onOpen={props.actions.onOpen}
            onCopy={props.actions.onCopy}
            onMove={props.actions.onMove}
            onRename={props.actions.onRename}
            onDelete={props.actions.onDelete}
            onPaste={props.actions.onPaste}
            canPaste={props.actions.canPaste}
          />
        )}
      </div>
      <ScrollBar orientation='horizontal' />
    </ScrollArea>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  spinning,
}: {
  icon: typeof FolderOpen;
  title: string;
  description?: string;
  action?: ReactNode;
  spinning?: boolean;
}) {
  return (
    <div className='grid h-full min-h-72 place-items-center'>
      <div className='flex max-w-sm flex-col items-center text-center'>
        <Icon
          className={cn(
            'mb-4 size-12 text-zinc-700',
            spinning && 'animate-spin',
          )}
          strokeWidth={1.2}
        />
        <h2 className='text-sm font-bold text-zinc-300'>{title}</h2>
        {description ? (
          <p className='mt-1 text-xs text-zinc-600'>{description}</p>
        ) : null}
        {action ? <div className='mt-4'>{action}</div> : null}
      </div>
    </div>
  );
}

function MarqueeSelection({ marquee }: { marquee: MarqueeState }) {
  const rect = getMarqueeRect(marquee);
  return (
    <div
      data-testid='selection-marquee'
      className='pointer-events-none fixed z-30 border border-sky-400/70 bg-sky-400/10'
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      }}
    />
  );
}
