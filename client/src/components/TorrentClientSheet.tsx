import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpFromLine,
  ChevronsDown,
  ChevronsUp,
  Circle,
  Clock3,
  Gauge,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type {
  TorrentClientAction,
  TorrentClientItemDto,
  TorrentClientType,
} from '@server/external/adapters/torrent-client';
import { rpc } from '@/lib/rpc';
import customSonner from '@/components/CustomSonner';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  filterTorrentClientTorrents,
  formatPeerCount,
  formatTransferSpeed,
  getTorrentProgress,
  getTorrentStateAppearance,
  getTorrentStateLabel,
  getTorrentTransferSummary,
  getAverageTransferSpeeds,
  sumAverageTransferSpeeds,
  sumTransferSpeeds,
  type TorrentListFilter,
} from '@/lib/torrent-client.utils';

type TorrentActionRequest = {
  id: string;
  action: TorrentClientAction;
};

export type TorrentRemovalRequest = {
  torrent: TorrentClientItemDto;
  deleteData: boolean;
};

const filters: Array<{ value: TorrentListFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'downloading', label: 'Downloading' },
  { value: 'seeding', label: 'Seeding' },
  { value: 'paused', label: 'Paused' },
];

export default function TorrentClientSheet({
  clientType,
}: {
  clientType: TorrentClientType;
}) {
  const clientName = getTorrentClientName(clientType);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TorrentListFilter>('all');
  const [removalRequest, setRemovalRequest] =
    useState<TorrentRemovalRequest | null>(null);
  const deferredSearch = useDeferredValue(search);
  const queryClient = useQueryClient();

  const torrentsQuery = useQuery({
    queryKey: ['torrent-client-transfers', clientType],
    enabled: open,
    refetchInterval: open ? 2000 : false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<TorrentClientItemDto[]> => {
      const response = await rpc.api['torrent-client'].$get();
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? `Failed to load ${clientName}`);
      }
      return payload.data ?? [];
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: TorrentActionRequest): Promise<string> => {
      const response = await rpc.api['torrent-client'][':id'].action.$put({
        param: { id },
        json: { action },
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? `${clientName} action failed`);
      }
      return payload.message ?? `${clientName} action completed`;
    },
    onSuccess: (message) => {
      customSonner({ text: message });
      void queryClient.invalidateQueries({
        queryKey: ['torrent-client-transfers', clientType],
      });
    },
    onError: (error) => {
      customSonner({ variant: 'error', text: error.message });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({
      torrent,
      deleteData,
    }: TorrentRemovalRequest): Promise<string> => {
      const response = await rpc.api['torrent-client'][':id'].remove.$delete({
        param: { id: torrent.id },
        query: { deleteData: deleteData ? 'true' : 'false' },
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? 'Failed to remove torrent');
      }
      return payload.message ?? `Torrent removed from ${clientName}`;
    },
    onSuccess: (message) => {
      setRemovalRequest(null);
      customSonner({ text: message });
      void queryClient.invalidateQueries({ queryKey: ['torrents'] });
      void queryClient.invalidateQueries({
        queryKey: ['torrent-client-transfers', clientType],
      });
    },
    onError: (error) => {
      customSonner({ variant: 'error', text: error.message });
    },
  });

  const torrents = torrentsQuery.data ?? [];
  const visibleTorrents = filterTorrentClientTorrents(
    torrents,
    deferredSearch,
    filter,
  );
  const speeds = sumTransferSpeeds(torrents);
  const averageSpeeds = sumAverageTransferSpeeds(torrents);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type='button'
            size='icon'
            variant='outline'
            aria-label={`Open ${clientName} transfers`}
            title={`${clientName} transfers`}
          >
            <ArrowDownToLine />
          </Button>
        </SheetTrigger>
        <SheetContent className='w-full overflow-hidden gap-0 p-0 sm:max-w-2xl'>
          <SheetHeader className='border-b px-5 py-4'>
            <div className='flex items-center gap-3 pr-8'>
              <div className='flex size-10 items-center justify-center rounded-xl bg-zinc-700 text-primary'>
                <ArrowDownToLine className='size-5' strokeWidth={3} />
              </div>
              <div className='min-w-0 flex-1'>
                <SheetTitle className='text-lg'>{clientName}</SheetTitle>
                <SheetDescription>{torrents.length} torrents</SheetDescription>
              </div>
              <TransferSpeed
                download={speeds.download}
                upload={speeds.upload}
                averageDownload={averageSpeeds.download}
                averageUpload={averageSpeeds.upload}
              />
            </div>
          </SheetHeader>

          <div className='flex flex-col gap-3 px-5 py-3'>
            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='Filter'
                aria-label={`Filter ${clientName} transfers`}
              />
            </InputGroup>
            <ScrollArea className='w-full whitespace-nowrap mb-2'>
              <ToggleGroup
                type='single'
                value={filter}
                variant='outline'
                size='sm'
                onValueChange={(value: TorrentListFilter) => {
                  if (value) setFilter(value);
                }}
              >
                {filters.map((item) => (
                  <ToggleGroupItem key={item.value} value={item.value}>
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </ScrollArea>
          </div>

          <ScrollArea className='min-h-0 min-w-0 flex-1'>
            <TorrentList
              torrents={visibleTorrents}
              isLoading={torrentsQuery.isLoading}
              error={torrentsQuery.error}
              isPending={actionMutation.isPending || removeMutation.isPending}
              onAction={(id, action) => actionMutation.mutate({ id, action })}
              onRemove={setRemovalRequest}
              clientName={clientName}
            />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <RemoveTorrentDialog
        request={removalRequest}
        isPending={removeMutation.isPending}
        onOpenChange={(isOpen) => {
          if (!isOpen && !removeMutation.isPending) setRemovalRequest(null);
        }}
        onConfirm={() => {
          if (removalRequest) removeMutation.mutate(removalRequest);
        }}
        clientName={clientName}
      />
    </>
  );
}

function TransferSpeed({
  download,
  upload,
  averageDownload,
  averageUpload,
}: {
  download: number;
  upload: number;
  averageDownload: number;
  averageUpload: number;
}) {
  return (
    <div className='hidden flex-col gap-1 text-xs text-muted-foreground sm:flex'>
      <SpeedPair label='Now' download={download} upload={upload} />
      <SpeedPair
        label='Average'
        download={averageDownload}
        upload={averageUpload}
      />
    </div>
  );
}

function SpeedPair({
  label,
  download,
  upload,
}: {
  label: string;
  download: number;
  upload: number;
}) {
  return (
    <span
      className='flex items-center justify-end gap-2'
      title={`${label} transfer speeds`}
    >
      <span className='w-12 text-right text-[10px] uppercase tracking-wide'>
        {label}
      </span>
      <span className='flex items-center gap-1'>
        <ArrowDown className='size-3.5' />
        {formatTransferSpeed(download)}
      </span>
      <span className='flex items-center gap-1'>
        <ArrowUp className='size-3.5' />
        {formatTransferSpeed(upload)}
      </span>
    </span>
  );
}

function TorrentList({
  torrents,
  isLoading,
  error,
  isPending,
  onAction,
  onRemove,
  clientName,
}: {
  torrents: TorrentClientItemDto[];
  isLoading: boolean;
  error: Error | null;
  isPending: boolean;
  onAction: (id: string, action: TorrentClientAction) => void;
  onRemove: (request: TorrentRemovalRequest) => void;
  clientName: string;
}) {
  if (isLoading) return <TorrentListSkeleton />;

  if (error) {
    return (
      <div className='flex flex-col items-center gap-2 px-6 py-16 text-center'>
        <TriangleAlert className='size-8 text-destructive' />
        <p className='font-medium'>{clientName} is unavailable</p>
        <p className='max-w-sm text-sm text-muted-foreground'>
          {error.message}
        </p>
      </div>
    );
  }

  if (torrents.length === 0) {
    return (
      <div className='flex flex-col items-center gap-2 px-6 py-16 text-center'>
        <Gauge className='size-8 text-muted-foreground' />
        <p className='font-medium'>No matching transfers</p>
        <p className='text-sm text-muted-foreground'>
          Try another filter or add a torrent to {clientName}.
        </p>
      </div>
    );
  }

  return (
    <div className='w-full min-w-0 overflow-x-hidden divide-y'>
      {torrents.map((torrent, index) => (
        <TorrentRow
          key={torrent.id}
          torrent={torrent}
          isAlternate={index % 2 === 1}
          isPending={isPending}
          onAction={onAction}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function TorrentRow({
  torrent,
  isAlternate,
  isPending,
  onAction,
  onRemove,
}: {
  torrent: TorrentClientItemDto;
  isAlternate: boolean;
  isPending: boolean;
  onAction: (id: string, action: TorrentClientAction) => void;
  onRemove: (request: TorrentRemovalRequest) => void;
}) {
  const progress = getTorrentProgress(torrent);
  const appearance = getTorrentStateAppearance(torrent.state);
  const isPaused = torrent.state === 'paused';
  const averageSpeeds = getAverageTransferSpeeds(torrent);

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'flex min-h-[4.5rem] w-full max-w-full cursor-default gap-3 overflow-hidden py-4 pl-4 pr-6 outline-none transition-colors hover:bg-accent focus-visible:bg-accent',
            isAlternate ? 'bg-transfer-row-alternate' : 'bg-transfer-row',
          )}
          data-torrent-state={torrent.state}
          role='button'
          aria-haspopup='menu'
          aria-label={`Open actions for ${torrent.name}`}
          tabIndex={0}
        >
          <TorrentStateIcon
            state={torrent.state}
            className={appearance.titleClassName}
          />
          <div className='w-0 flex-1 overflow-hidden leading-none'>
            <p
              className={cn(
                'truncate text-sm font-bold leading-4',
                appearance.titleClassName,
              )}
            >
              {torrent.name}
            </p>
            <p className='mt-1.5 truncate text-[11px] leading-3 text-muted-foreground'>
              {getTorrentTransferSummary(torrent)}
            </p>
            <div className='mt-1 flex min-w-0 items-center gap-1.5'>
              <Progress
                value={progress}
                className='h-2 min-w-0 flex-1 bg-black/35'
                indicatorClassName={appearance.indicatorClassName}
              />
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                className='size-6 rounded-sm'
                disabled={isPending}
                aria-label={`${isPaused ? 'Resume' : 'Pause'} transfer ${
                  torrent.name
                }`}
                title={isPaused ? 'Resume transfer' : 'Pause transfer'}
                onClick={(event) => {
                  event.stopPropagation();
                  onAction(torrent.id, isPaused ? 'resume' : 'pause');
                }}
              >
                {isPaused ? <Play /> : <Pause />}
              </Button>
            </div>
            <div className='mt-0.5 flex min-w-0 items-center gap-3 overflow-hidden text-[11px] leading-3 text-muted-foreground'>
              <span className='truncate'>{getTorrentStateLabel(torrent)}</span>
              <span className='shrink-0 ml-2 font-semibold'>Now</span>
              <span className='flex shrink-0 items-center gap-1'>
                <ArrowDown className='size-3' />
                {formatTransferSpeed(torrent.downloadSpeed)}
              </span>
              <span className='flex shrink-0 items-center gap-1'>
                <ArrowUp className='size-3' />
                {formatTransferSpeed(torrent.uploadSpeed)}
              </span>
              {!isPaused ? (
                <>
                  <span
                    className='shrink-0 ml-3'
                    title='Peers sending data to this client'
                  >
                    From {formatPeerCount(torrent.peersSendingToUs)}
                  </span>
                  <span
                    className='shrink-0'
                    title='Peers receiving data from this client'
                  >
                    To {formatPeerCount(torrent.peersGettingFromUs)}
                  </span>
                </>
              ) : null}
            </div>
            <div
              className='mt-1 flex items-center gap-3 text-[11px] leading-3 text-muted-foreground'
              title='Average transfer speeds since added'
            >
              <span className='font-semibold'>Average since added</span>
              <span className='flex items-center gap-1'>
                <ArrowDown className='size-3' />
                {formatTransferSpeed(averageSpeeds.download)}
              </span>
              <span className='flex items-center gap-1'>
                <ArrowUp className='size-3' />
                {formatTransferSpeed(averageSpeeds.upload)}
              </span>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <TorrentContextMenu
        torrent={torrent}
        disabled={isPending}
        onAction={onAction}
        onRemove={onRemove}
      />
    </ContextMenu>
  );
}

function TorrentContextMenu({
  torrent,
  disabled,
  onAction,
  onRemove,
}: {
  torrent: TorrentClientItemDto;
  disabled: boolean;
  onAction: (id: string, action: TorrentClientAction) => void;
  onRemove: (request: TorrentRemovalRequest) => void;
}) {
  const isPaused = torrent.state === 'paused';

  return (
    <ContextMenuContent className='w-64'>
      <ContextMenuGroup>
        <ContextMenuLabel className='truncate text-mauve-400'>
          {torrent.name}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={disabled}
          onSelect={() => onAction(torrent.id, isPaused ? 'resume' : 'pause')}
        >
          {isPaused ? <Play /> : <Pause />}
          {isPaused ? 'Resume Transfer' : 'Pause Transfer'}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disabled}
          onSelect={() => onAction(torrent.id, 'verify')}
        >
          <ShieldCheck />
          Verify Local Data
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disabled}
          onSelect={() => onAction(torrent.id, 'reannounce')}
        >
          <RefreshCw />
          Ask Tracker for More Peers
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <ChevronsUp className='mr-2' />
          Move in Queue
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuGroup>
            <ContextMenuItem
              disabled={disabled}
              onSelect={() => onAction(torrent.id, 'queue-top')}
            >
              <ChevronsUp />
              Move to Top
            </ContextMenuItem>
            <ContextMenuItem
              disabled={disabled}
              onSelect={() => onAction(torrent.id, 'queue-up')}
            >
              <ArrowUpFromLine />
              Move Up
            </ContextMenuItem>
            <ContextMenuItem
              disabled={disabled}
              onSelect={() => onAction(torrent.id, 'queue-down')}
            >
              <ArrowDownToLine />
              Move Down
            </ContextMenuItem>
            <ContextMenuItem
              disabled={disabled}
              onSelect={() => onAction(torrent.id, 'queue-bottom')}
            >
              <ChevronsDown />
              Move to Bottom
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={disabled}
          variant='destructive'
          onSelect={() => onRemove({ torrent, deleteData: false })}
        >
          <Trash2 />
          Remove Transfer
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disabled}
          variant='destructive'
          onSelect={() => onRemove({ torrent, deleteData: true })}
        >
          <Trash2 />
          Remove Transfer and Data
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}

function TorrentStateIcon({
  state,
  className,
}: {
  state: TorrentClientItemDto['state'];
  className: string;
}) {
  return (
    <div
      className={cn(
        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-black/20',
        className,
      )}
    >
      {state === 'downloading' && (
        <ArrowDown className='size-4.5' strokeWidth={3} />
      )}
      {state === 'seeding' && <ArrowUp className='size-4.5' strokeWidth={3} />}
      {state === 'paused' && <Pause className='size-4.5' strokeWidth={3} />}
      {state === 'checking' && (
        <RefreshCw className='size-4.5' strokeWidth={3} />
      )}
      {state === 'queued' && <Clock3 className='size-4.5' strokeWidth={3} />}
      {state === 'error' && (
        <TriangleAlert className='size-4.5' strokeWidth={3} />
      )}
      {state === 'warning' && (
        <TriangleAlert className='size-4.5' strokeWidth={3} />
      )}
      {state === 'unknown' && <Circle className='size-4.5' strokeWidth={3} />}
    </div>
  );
}

function TorrentListSkeleton() {
  return (
    <div className='flex flex-col gap-0 divide-y'>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className='flex gap-3 px-5 py-4'>
          <Skeleton className='size-9 shrink-0' />
          <div className='flex flex-1 flex-col gap-2'>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-1.5 w-full' />
            <Skeleton className='h-3 w-1/2' />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RemoveTorrentDialog({
  request,
  isPending,
  onOpenChange,
  onConfirm,
  clientName,
}: {
  request: TorrentRemovalRequest | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  clientName: string;
}) {
  const [lastRequest, setLastRequest] = useState<TorrentRemovalRequest | null>(
    request,
  );
  if (request !== null && request !== lastRequest) {
    setLastRequest(request);
  }
  const activeRequest = request ?? lastRequest;

  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {activeRequest?.deleteData
              ? 'Remove Torrent and Data?'
              : 'Remove Torrent?'}
          </DialogTitle>
          <DialogDescription>
            {activeRequest?.deleteData
              ? 'This removes the transfer and permanently deletes its downloaded data.'
              : `This removes the transfer from ${clientName} and keeps downloaded data on disk.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? <RefreshCw className='animate-spin' /> : <Trash2 />}
            {activeRequest?.deleteData ? 'Remove and Delete Data' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getTorrentClientName(clientType: TorrentClientType): string {
  return clientType === 'qbittorrent' ? 'qBittorrent' : 'Transmission';
}
