import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { Loader2 } from 'lucide-react';
import customSonner from '@/components/CustomSonner';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';
import { rpc } from '@/lib/rpc';
import { Separator } from '@radix-ui/react-separator';

interface AddTorrentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setStartFetch: (value: number) => void;
  url?: string;
  children?: React.ReactNode;
}

export default function AddTorrentDialog({
  open,
  onOpenChange,
  setStartFetch,
  url,
}: AddTorrentDialogProps) {
  const [torrentUrl, setTorrentUrl] = useState(url || '');
  const [isLoading, setIsLoading] = useState(false);
  const [markAll, setMarkAll] = useState(false);
  const [startDownloadImmediately, setStartDownloadImmediately] =
    useState(false);

  useEffect(() => {
    if (url) {
      setTorrentUrl(url);
    }
  }, [url]);

  useEffect(() => {
    if (!markAll) {
      setStartDownloadImmediately(false);
    }
  }, [markAll]);

  const handleAddTorrent = async () => {
    setIsLoading(true);
    try {
      const resp = await (
        await rpc.api.torrents.add.$post({
          json: {
            url: torrentUrl,
            selectAll: markAll,
            startDownload: startDownloadImmediately,
          },
        })
      ).json();
      if (!resp.success) {
        customSonner({
          variant: 'error',
          text: resp.message || 'Failed to add torrent',
        });
      } else {
        setStartFetch(Date.now());
        customSonner({ text: 'Torrent added successfully' });
        setTorrentUrl('');
        onOpenChange(false);
      }
      setIsLoading(false);
    } catch (error) {
      customSonner({
        variant: 'error',
        text: 'Failed to add torrent: ' + (error as Error).message,
      });
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex flex-col gap-0 p-0 sm:max-h-[min(640px,80vh)] sm:max-w-lg [&>button:last-child]:top-3.5'>
        <DialogHeader className='contents space-y-0 text-left'>
          <DialogTitle className='border-b border-border px-6 py-4 text-base font-black'>
            New Torrent
          </DialogTitle>
          <div
            className='overflow-y-auto'
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'hsl(var(--primary)) transparent',
            }}>
            <DialogDescription asChild>
              <div className='px-6 py-4'>
                <Input
                  placeholder='e.g. https://rutracker.org/forum/viewtopic...'
                  className='text-base text-white h-10'
                  value={torrentUrl}
                  onChange={(e) => {
                    setTorrentUrl(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddTorrent();
                    }
                  }}
                  type='url'
                />
                <div className='flex items-center gap-2 mt-2 mb-5 w-full text-md text-foreground/90 pl-3'>
                  Supported trackers: Rutracker, NNM-Club, Kinozal (with auth).
                </div>

                <Separator className='h-px w-full bg-border my-5' />

                <div className='flex flex-col gap-1  pt-2 text-zinc-200 '>
                  <Label
                    htmlFor='mark-all-episodes'
                    className={cn(
                      'flex items-center gap-2 text-base border rounded-md px-3 py-2 cursor-pointer',
                      markAll && 'bg-accent'
                    )}>
                    <Checkbox
                      id='mark-all-episodes'
                      checked={markAll}
                      onCheckedChange={() => {
                        setMarkAll(!markAll);
                      }}
                    />
                    Mark all episodes as tracked
                  </Label>

                  <Label
                    htmlFor='start-download-immediately'
                    className={cn(
                      'flex items-center gap-2 text-base border rounded-md px-3 py-2 cursor-pointer',
                      !markAll && 'opacity-50',
                      startDownloadImmediately && 'bg-accent'
                    )}>
                    <Checkbox
                      id='start-download-immediately'
                      checked={startDownloadImmediately}
                      disabled={!markAll}
                      onCheckedChange={() => {
                        setStartDownloadImmediately(!startDownloadImmediately);
                      }}
                    />
                    Start download immediately after adding
                  </Label>
                </div>
              </div>
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className='border-t border-border px-6 py-4 sm:items-center'>
          <DialogClose asChild>
            <Button type='button' variant='outline'>
              Cancel
            </Button>
          </DialogClose>

          <Button
            type='button'
            disabled={isLoading || !torrentUrl}
            onClick={() => {
              handleAddTorrent();
            }}
            className='font-bold rounded-md justify-center items-center'>
            {isLoading ? (
              <Loader2 className='w-4 h-4 animate-spin' />
            ) : (
              'Add Torrent'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
