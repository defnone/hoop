import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEffect, useState } from 'react';
import EpPicker from './EpPicker';
import { Loader2, Pause, Play, Trash2 } from 'lucide-react';
import DataTabs from './Tabs';
import FileList from './FileList';
import ConfirmDelete from './ConfirmDelete';
import { SiTransmission } from 'react-icons/si';
import { TorrentItemDto } from '@server/features/torrent-item/torrent-item.types';
import { useTorrentStore } from '@/stores/torrentStore';
import { rpc } from '@/lib/rpc';
import customSonner from '@/components/CustomSonner';

type EpisodesObj = {
  id: number;
  title: string;
  trackedEpisodes: boolean;
  available: boolean;
  files: string[];
}[];

export default function EditTorrentDialog({
  id,
  dialogOpen,
  setDialogOpen,
}: {
  id: number;
  openId: number | null;
  dialogOpen: boolean;
  setDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TorrentItemDto | undefined>(undefined);
  const [isAddingToClient, setIsAddingToClient] = useState(false);
  const [isRemovingFromClient, setIsRemovingFromClient] = useState(false);
  const [episodesObj, setEpisodesObj] = useState<EpisodesObj>([]);

  const setOpenId = useTorrentStore((state) => state.setOpenId);
  const setStartFetch = useTorrentStore((state) => state.setStartFetch);
  const items = useTorrentStore((state) => state.items);

  useEffect(() => {
    if (dialogOpen && id) {
      setStartFetch(Date.now());
      setOpen(true);
      setOpenId(id);
      setData(items.find((item) => item.id === id));
    }
  }, [dialogOpen, id, items]);

  useEffect(() => {
    if (!data) return;
    const episodesArray = [...Array(data.totalEpisodes)].map((_, i) => i + 1);
    const epObj = episodesArray.map((episode) => ({
      id: episode,
      title: `EP ${episode}`,
      trackedEpisodes: (data.trackedEpisodes as number[]).includes(episode),
      available: (data.haveEpisodes as number[]).includes(episode),
      files: (data.files as string[]).filter((file) =>
        file.includes('E' + episode.toString().padStart(2, '0'))
      ),
    }));
    setEpisodesObj(epObj);
  }, [data]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setOpenId(null);
      setDialogOpen(false);
    }
  };

  const handleSave = async (id: number, episodes: number[]) => {
    const resp = await (
      await rpc.api.torrents[':id']['save-tracked-ep'].$post({
        json: { episodes },
        param: { id: String(id) },
      })
    ).json();
    if (!resp.success) {
      customSonner({
        variant: 'error',
        text: resp.message || 'Failed to save episodes',
      });
    }
  };

  const handleAddToClient = async () => {
    if (!data) return;
    setIsAddingToClient(true);
    try {
      const rest = await (
        await rpc.api['torrent-client'][':id'].add.$post({
          param: { id: String(data?.id) },
        })
      ).json();
      if (!rest.success) {
        customSonner({
          variant: 'error',
          text: rest.message || 'Failed to add to client',
        });
        return;
      }
      setStartFetch(Date.now());
      customSonner({
        text: 'Added to client successfully!',
      });
    } catch (error) {
      customSonner({
        variant: 'error',
        text: 'Failed to add to client: ' + error,
      });
    } finally {
      setIsAddingToClient(false);
    }
  };

  const handleRmFromClient = async () => {
    setIsRemovingFromClient(true);
    if (!data) return;
    try {
      const resp = await (
        await rpc.api['torrent-client'][':id'].delete.$delete({
          param: { id: String(data?.id) },
        })
      ).json();
      if (!resp.success) {
        customSonner({
          text: resp.message || 'Failed to remove from client',
          variant: 'error',
        });
        return;
      }
      customSonner({
        text: 'Removed from client successfully!',
      });
      setStartFetch(Date.now());
    } catch (error) {
      customSonner({
        variant: 'error',
        text: 'Failed to remove from client: ' + error,
      });
    } finally {
      setIsRemovingFromClient(false);
      setStartFetch(Date.now());
    }
  };

  const handleDelete = async (withFiles: boolean) => {
    if (!data) return;
    try {
      const resp = await (
        await rpc.api.torrents[':id'].delete.$delete({
          json: { withFiles },
          param: { id: String(data?.id) },
        })
      ).json();
      if (!resp.success) {
        customSonner({
          variant: 'error',
          text: resp.message || 'Failed to remove from client',
        });
        return;
      }
      customSonner({ text: 'Torrent deleted successfully!' });
    } catch (error) {
      customSonner({
        variant: 'error',
        text: (error as Error).message,
      });
    } finally {
      setOpen(false);
      setStartFetch(Date.now());
      setDialogOpen(false);
    }
  };

  const handlePauseToggle = async () => {
    if (!data) return;
    try {
      const resp = await (
        await rpc.api.torrents[':id']['pause-toggle'].$put({
          param: { id: String(data?.id) },
        })
      ).json();
      if (!resp.success) {
        customSonner({
          variant: 'error',
          text: resp.message || 'Failed to pause/unpause torrent',
        });
        return;
      }
      customSonner({
        text: resp.message || 'Paused/unpaused torrent successfully!',
      });
    } catch (error) {
      customSonner({
        variant: 'error',
        text: `Failed to pause/unpause torrent: ${(error as Error).message}`,
      });
    } finally {
      setStartFetch(Date.now());
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className='flex flex-col p-0 sm:max-h-[80vh] sm:max-w-lg [&>button:last-child]:top-3.5 focus:outline-0'
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}>
        {data && (
          <>
            <DialogHeaderContent
              data={data}
              episodesObj={episodesObj}
              handleSave={handleSave}
            />
            <DialogFooterContent
              data={data}
              handleDelete={handleDelete}
              handleAddToClient={handleAddToClient}
              handleRmFromClient={handleRmFromClient}
              handlePauseToggle={handlePauseToggle}
              isAddingToClient={isAddingToClient}
              isRemovingFromClient={isRemovingFromClient}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DialogHeaderContent({
  data,
  episodesObj,
  handleSave,
}: {
  data: TorrentItemDto;
  episodesObj: {
    id: number;
    title: string;
    trackedEpisodes: boolean;
    available: boolean;
    files: string[];
  }[];
  handleSave: (id: number, episodes: number[]) => Promise<void>;
}) {
  return (
    <DialogHeader className='flex space-y-0 text-left overflow-hidden'>
      <DialogTitle className='border-b border-border px-6 py-4 text-base font-black hidden'>
        Edit Torrent
      </DialogTitle>

      <DialogDescription asChild>
        <div
          className='overflow-y-auto max-h-[80vh]'
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'hsl(74deg 9% 16%) transparent',
            scrollbarGutter: 'stable',
          }}>
          <div className='px-6 py-4 flex flex-col gap-2'>
            <h1 className='text-2xl font-extrabold text-white'>{data.title}</h1>
            <p className='text-base text-zinc-500 font-bold'>
              Season {data.season}
            </p>
            <div className='flex flex-col text-sm text-zinc-200 pb-4 tracking-wide'>
              <a
                href={data.url}
                target='_blank'
                rel='noopener noreferrer'
                className='hover:underline hover:text-white hover:underline-offset-4 leading-relaxed text-zinc-400 will-change-transform [&]:hover:translate-y-0'>
                {data.rawTitle}
              </a>
            </div>
            <DataTabs
              filesData={data.files as string[]}
              torrents={
                <EpPicker
                  itemId={data.id}
                  handleSave={handleSave}
                  episodes={episodesObj}
                />
              }
              files={
                <FileList files={data.files as string[]} torrentId={data.id} />
              }
            />
          </div>
        </div>
      </DialogDescription>
    </DialogHeader>
  );
}

function DialogFooterContent({
  data,
  handleDelete,
  handleAddToClient,
  handleRmFromClient,
  isAddingToClient,
  isRemovingFromClient,
  handlePauseToggle,
}: {
  data: TorrentItemDto;
  handleDelete: (withFiles: boolean) => Promise<void>;
  handleAddToClient: () => Promise<void>;
  handleRmFromClient: () => Promise<void>;
  isAddingToClient: boolean;
  isRemovingFromClient: boolean;
  handlePauseToggle: () => Promise<void>;
}) {
  return (
    <DialogFooter className='flex flex-row items-center relative border-t border-border px-6 h-20 -mt-4'>
      <ConfirmDelete
        onDelete={(withFiles) => handleDelete(withFiles)}
        files={data.files as string[]}>
        <Button
          size={'icon-lg'}
          type='button'
          variant='destructive'
          className='font-extrabold h-10 w-10 hover:transform-none'>
          <Trash2 strokeWidth={3} className='w-4 h-4' />
        </Button>
      </ConfirmDelete>
      <Button
        size={'icon-lg'}
        type='button'
        variant={data.controlStatus !== 'paused' ? 'outline' : 'secondary'}
        disabled={
          data.controlStatus !== 'idle' && data.controlStatus !== 'paused'
        }
        onClick={handlePauseToggle}
        className='font-extrabold h-10 w-10 hover:transform-none mr-auto'>
        {data.controlStatus === 'paused' ? (
          <Play strokeWidth={4} className='w-4 h-4' />
        ) : (
          <Pause strokeWidth={3} className='w-4 h-4' />
        )}
      </Button>

      {data.controlStatus === 'idle' && (
        <Button
          type='button'
          variant='default'
          onClick={handleAddToClient}
          disabled={isAddingToClient || data.trackedEpisodes.length === 0}
          className='font-bold'>
          {isAddingToClient ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <>
              <SiTransmission className='w-4 h-4' /> Add to Transmission
            </>
          )}
        </Button>
      )}

      {(data.controlStatus === 'downloading' ||
        data.controlStatus === 'downloadCompleted') && (
        <Button
          type='button'
          variant='destructive'
          onClick={handleRmFromClient}
          disabled={isRemovingFromClient}
          className='font-bold'>
          {isRemovingFromClient ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <>
              <Trash2 className='w-4 h-4' /> Remove from Transmission
            </>
          )}
        </Button>
      )}
    </DialogFooter>
  );
}
