import { useRef, useState, type RefObject } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import customSonner from '@/components/CustomSonner';
import { rpc } from '@/lib/rpc';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AddDownloadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDownloadDir: string;
  clientName: string;
  onAdded: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
};

export default function AddDownloadDialog({
  open,
  onOpenChange,
  defaultDownloadDir,
  clientName,
  onAdded,
  restoreFocusRef,
}: AddDownloadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <AddDownloadDialogContent
          defaultDownloadDir={defaultDownloadDir}
          clientName={clientName}
          onAdded={onAdded}
          onOpenChange={onOpenChange}
          restoreFocusRef={restoreFocusRef}
        />
      ) : null}
    </Dialog>
  );
}

function AddDownloadDialogContent({
  defaultDownloadDir,
  clientName,
  onAdded,
  onOpenChange,
  restoreFocusRef,
}: {
  defaultDownloadDir: string;
  clientName: string;
  onAdded: () => void;
  onOpenChange: (open: boolean) => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [magnet, setMagnet] = useState('');
  const [torrentFile, setTorrentFile] = useState<File | null>(null);
  const [downloadDirOverride, setDownloadDirOverride] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadDir = downloadDirOverride ?? defaultDownloadDir;

  const addMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      const directory = downloadDir.trim();
      if (!directory) throw new Error('Download directory is required');

      const response = torrentFile
        ? await rpc.api['torrent-client'].add.$post({
            form: {
              torrentFile,
              downloadDir: directory,
            },
          })
        : await rpc.api['torrent-client'].add.$post({
            form: {
              magnet: magnet.trim(),
              downloadDir: directory,
            },
          });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? 'Failed to add torrent');
      }
      return payload.message ?? 'Torrent added to client';
    },
    onSuccess: (message) => {
      customSonner({ text: message });
      onAdded();
      onOpenChange(false);
    },
    onError: (error) => {
      customSonner({ variant: 'error', text: error.message });
    },
  });

  const hasSource = Boolean(torrentFile || magnet.trim());

  return (
    <DialogContent
      className='flex flex-col gap-0 p-0 sm:max-h-[min(640px,80vh)] sm:max-w-lg [&>button:last-child]:top-3.5'
      onCloseAutoFocus={(event) => {
        const restoreTarget = restoreFocusRef?.current;
        if (!restoreTarget) return;
        restoreTarget.focus();
        event.preventDefault();
      }}
    >
      <DialogHeader className='contents space-y-0 text-left'>
        <DialogTitle className='border-b border-border px-6 py-4 text-base font-black'>
          Add download to {clientName}
        </DialogTitle>
        <div
          className='overflow-y-auto'
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'hsl(var(--primary)) transparent',
          }}
        >
          <DialogDescription className='sr-only'>
            Choose a torrent file or paste a magnet link, then select a download
            directory.
          </DialogDescription>
          <div className='grid gap-5 px-6 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='torrent-file'>Torrent file</Label>
              <div className='flex gap-2'>
                <Input
                  ref={fileInputRef}
                  id='torrent-file'
                  type='file'
                  accept='.torrent,application/x-bittorrent'
                  className='sr-only'
                  aria-describedby='torrent-file-name'
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setTorrentFile(file);
                    if (file) setMagnet('');
                  }}
                />
                <Button
                  type='button'
                  variant='outline'
                  aria-controls='torrent-file'
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload />
                  {torrentFile ? 'Change file' : 'Choose file'}
                </Button>
                <span
                  id='torrent-file-name'
                  className='min-w-0 flex-1 self-center truncate text-sm text-muted-foreground'
                  aria-live='polite'
                >
                  {torrentFile?.name ?? 'No file selected'}
                </span>
                {torrentFile ? (
                  <Button
                    type='button'
                    variant='outline'
                    aria-label='Clear selected torrent file'
                    onClick={() => {
                      setTorrentFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='magnet-link'>Magnet link</Label>
              <Input
                id='magnet-link'
                type='url'
                value={magnet}
                placeholder='magnet:?xt=urn:btih:...'
                onChange={(event) => {
                  const value = event.target.value;
                  setMagnet(value);
                  if (value.trim() && torrentFile) {
                    setTorrentFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }
                }}
              />
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='torrent-download-directory'>
                Download directory
              </Label>
              <Input
                id='torrent-download-directory'
                value={downloadDir}
                placeholder='/downloads'
                onChange={(event) => setDownloadDirOverride(event.target.value)}
              />
            </div>
          </div>
        </div>
      </DialogHeader>

      <DialogFooter className='border-t border-border px-6 py-4 sm:items-center'>
        <DialogClose asChild>
          <Button
            type='button'
            variant='outline'
            disabled={addMutation.isPending}
          >
            Cancel
          </Button>
        </DialogClose>
        <Button
          type='button'
          className='items-center justify-center rounded-md font-bold'
          disabled={addMutation.isPending || !hasSource || !downloadDir.trim()}
          onClick={() => addMutation.mutate()}
        >
          {addMutation.isPending ? (
            <Loader2 className='animate-spin' />
          ) : (
            <Upload />
          )}
          Add download
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
