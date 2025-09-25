import { Input } from '@/components/ui/input';
import { ListFilter, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddTorrentDialog from '@/components/AddTorrentDialog';
import { useState } from 'react';
import { useTorrentStore } from '@/stores/torrentStore';

export function TorrentTopBar() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { search, setSearch, setStartFetch } = useTorrentStore();

  return (
    <>
      <AddTorrentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        setStartFetch={setStartFetch}
        url={''}
      />
      <div className='flex items-center justify-between py-5'>
        <div className='flex items-center gap-2'>
          <div className='relative'>
            <Input
              placeholder='Filter by title'
              className='w-64 pl-8'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ListFilter
              size={16}
              className='absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground'
            />
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant={'secondary'}
            className='font-extrabold rounded-md text-sm justify-center items-center bg-blue-700'
            onClick={() => setDialogOpen(true)}>
            <Plus size={16} />
            New Torrent
          </Button>
        </div>
      </div>
    </>
  );
}
