import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import EditTorrentDialog from '@/components/EditTorrentDialog';
import { TorrentItemDto } from '@server/features/torrent-item/torrent-item.types';
import { memo, useState } from 'react';
import TrackerLogo from '../TrackerLogo';
import { useTorrentStore } from '@/stores/torrentStore';
import { cn, formatETA } from '@/lib/utils';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';
import { BadgeAlert, Pause } from 'lucide-react';
import { TooltipedIcon } from '../TooltipedIcon';

export function TorrentTableData() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [item, setItem] = useState<TorrentItemDto>();

  const openId = useTorrentStore((state) => state.openId);
  const setOpenId = useTorrentStore((state) => state.setOpenId);
  const items = useTorrentStore((state) => state.items);
  const status = useTorrentStore((state) => state.status);
  const filteredData = useTorrentStore((state) => state.filteredData);

  return (
    <>
      {item && (
        <EditTorrentDialog
          id={item.id}
          openId={openId}
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
        />
      )}
      <Table>
        <DataTableHeader />
        <TableBody>
          {filteredData.map((item) => (
            <MemoDataTableRow
              key={item.id}
              item={item}
              setItem={setItem}
              setDialogOpen={setDialogOpen}
              setOpenId={setOpenId}
              status={status[item.id]?.data}
            />
          ))}
        </TableBody>

        {items.length === 0 && (
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={7}
                className='text-center py-10 text-base text-zinc-300'>
                No torrents found. Add a new torrent to get started.
              </TableCell>
            </TableRow>
          </TableBody>
        )}
      </Table>
    </>
  );
}

const MemoDataTableRow = memo(DataTableRow);

function DataTableRow({
  item,
  setItem,
  setDialogOpen,
  setOpenId,
  status,
}: {
  item: TorrentItemDto;
  setItem: (item: TorrentItemDto) => void;
  setDialogOpen: (open: boolean) => void;
  setOpenId: (id: number) => void;
  status: NormalizedTorrent | undefined;
}) {
  const filterMediaFiles = (files: string[]) => {
    if (!files) return [];
    const mediaFilesArr = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'];

    return files.filter((file) =>
      mediaFilesArr.some((ext) => file.endsWith(ext))
    );
  };

  const downloading = status?.state === 'downloading';
  const downloadPaused = status?.state === 'paused';
  const isTrackingPaused = item.controlStatus === 'paused';
  const isShowETA =
    status?.eta &&
    status?.state === 'downloading' &&
    !isTrackingPaused &&
    Number(status?.eta) > 0;

  const downloadedFiles = filterMediaFiles(item.files as string[]).length;
  return (
    <TableRow
      onClick={() => {
        setItem(item);
        setDialogOpen(true);
        setOpenId(item.id);
      }}
      key={item.id}
      className={cn(
        'relative cursor-pointer',
        downloading &&
          'bg-green-500/10 animate-pulse animate-infinite animate-slow',
        downloadPaused &&
          'bg-zinc-300/10 animate-pulse animate-infinite animate-slow'
      )}>
      <TableCell className='w-12'>
        <TrackerLogo tracker={item.tracker || ''} />
      </TableCell>
      <TableCell
        className={cn(
          'font-bold',
          isTrackingPaused && 'text-muted-foreground/40'
        )}>
        {item.title}
      </TableCell>
      <TableCell
        className={cn(
          'font-mono text-zinc-300',
          isTrackingPaused && 'text-muted-foreground/40'
        )}>
        <span className='p-1 bg-muted rounded-md text-xs font-bold min-w-7 flex w-fit items-center justify-center'>
          {item.season}
        </span>
      </TableCell>
      <TableCell
        className={cn(
          'font-mono text-zinc-300',
          isTrackingPaused && 'text-muted-foreground/40'
        )}>
        {(item.haveEpisodes as number[]).length} of {item.totalEpisodes}
      </TableCell>
      <TableCell
        className={cn(
          'font-mono text-muted-foreground/40',
          (item.trackedEpisodes as number[]).length > 0 &&
            !isTrackingPaused &&
            'text-zinc-300'
        )}>
        {(item.trackedEpisodes as number[]).length} of {item.totalEpisodes}
      </TableCell>
      <TableCell
        className={cn(
          'font-mono',
          downloadedFiles > 0 ? 'text-green-500' : 'text-muted-foreground/40'
        )}>
        {downloadedFiles}
      </TableCell>
      <TableCell
        className={cn(
          'font-mono text-nowrap',
          new Date(item.updatedAt).toDateString() ===
            new Date().toDateString() && 'text-green-500',
          isTrackingPaused && 'text-muted-foreground/40'
        )}>
        {item.updatedAt
          ? new Date(item.updatedAt).toLocaleDateString('en-GB', {
              month: 'numeric',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
            })
          : 'N/A'}
      </TableCell>
      <TableCell className='font-mono text-zinc-300'>
        {isShowETA &&
          !item.errorMessage &&
          'ETA: ' + formatETA(Number(status?.eta))}
        {isTrackingPaused && (
          <TooltipedIcon
            icon={<Pause className='w-4 h-4 cursor-pointer text-orange-500' />}
            text='Tracking paused'
          />
        )}
        {item.errorMessage && !isTrackingPaused && (
          <TooltipedIcon
            icon={
              <BadgeAlert className='w-4 h-4 cursor-pointer text-red-500' />
            }
            text={item.errorMessage}
            align='end'
          />
        )}
      </TableCell>
      {item.controlStatus === 'downloading' && (
        <div
          className='absolute h-1 left-0 bottom-0 bg-blue-500 transition-all duration-300'
          style={{
            width: `${Number(status?.progress || 0) * 100}%`,
          }}
        />
      )}
    </TableRow>
  );
}

function DataTableHeader() {
  return (
    <TableHeader className='border-b-2 border-border pb-2'>
      <TableRow className='hover:bg-transparent'>
        <TableHead className='font-bold text-zinc-400'></TableHead>
        <TableHead className='font-bold text-zinc-400'>Title</TableHead>
        <TableHead className='font-bold text-zinc-400'>Season</TableHead>
        <TableHead className='font-bold text-zinc-400'>
          Available Episodes
        </TableHead>
        <TableHead className='font-bold text-zinc-400'>
          Tracked Episodes
        </TableHead>
        <TableHead className='font-bold text-zinc-400'>
          Downloaded Episodes
        </TableHead>
        <TableHead className='font-bold text-zinc-400'>Last Updated</TableHead>
        <TableHead className='font-bold text-zinc-400 text-right'></TableHead>
      </TableRow>
    </TableHeader>
  );
}
