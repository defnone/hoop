import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddTorrentDialog from '@/components/AddTorrentDialog';
import { useState } from 'react';
import TrackerLogo from '@/components/TrackerLogo';
import { JackettSearchResult } from '@/types/search';

export function SearchDataTable({
  data,
  isLoading,
}: {
  data: JackettSearchResult[];
  isLoading: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string>('');

  if (!data) {
    return null;
  }

  const handleAddClick = (url: string) => {
    setSelectedUrl(url);
    setDialogOpen(true);
  };

  return (
    <div className='relative'>
      <AddTorrentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        setStartFetch={() => {}}
        url={selectedUrl}
      />

      <Table className='w-full'>
        <TableHeader className='border-b-2 border-border pb-2'>
          <TableRow className='hover:bg-transparent'>
            <TableHead className='font-bold text-zinc-400'></TableHead>
            <TableHead className='font-bold text-zinc-400'>Title</TableHead>
            <TableHead className='font-bold text-zinc-400'>Size</TableHead>
            <TableHead className='font-bold text-zinc-400'>Seeders</TableHead>
            <TableHead className='font-bold text-zinc-400'>Peers</TableHead>
            <TableHead className='font-bold text-zinc-400'>
              Publish Date
            </TableHead>
            <TableHead className='font-bold text-zinc-400 text-right'></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => (
            <TableRow key={index}>
              <TableCell className='font-medium leading-relaxed tracking-normal w-10'>
                <TrackerLogo tracker={item.Tracker} />
              </TableCell>
              <TableCell className='font-medium leading-relaxed tracking-normal'>
                <a href={item.Details} target='_blank'>
                  {item.Title || 'N/A'}
                </a>
              </TableCell>
              <TableCell className='font-mono text-zinc-300 text-nowrap items-start'>
                {item.Size
                  ? item.Size >= 1073741824
                    ? (item.Size / 1024 / 1024 / 1024).toFixed(1) + ' GB'
                    : (item.Size / 1024 / 1024).toFixed(0) + ' MB'
                  : ''}
              </TableCell>
              <TableCell className='font-mono text-zinc-300 font-extrabold'>
                {item.Seeders || ''}
              </TableCell>
              <TableCell className='font-mono text-zinc-300'>
                {item.Peers || ''}
              </TableCell>
              <TableCell className='font-mono text-zinc-300 text-nowrap'>
                {item.PublishDate
                  ? new Date(item.PublishDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : ''}
              </TableCell>
              <TableCell className='font-mono text-zinc-300 text-right'>
                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => handleAddClick(item.Details)}>
                  <Plus className='w-4 h-4' />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

        {data.length === 0 && (
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={7}
                className='text-center py-10 text-base text-zinc-300'>
                No results found now. Type something to search.
              </TableCell>
            </TableRow>
          </TableBody>
        )}
      </Table>
      {isLoading && (
        <div className='flex absolute top-0 left-0 w-full h-full justify-center items-top py-10 bg-background/50 backdrop-blur-sm'>
          <Loader2 className='w-14 h-14 animate-spin' />
        </div>
      )}
    </div>
  );
}
