import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Clock, FileVideo, Popcorn } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTorrentStore } from '@/stores/torrentStore';

export default function EpPicker({
  episodes,
  handleSave,
  itemId,
}: {
  episodes: {
    id: number;
    title: string;
    trackedEpisodes: boolean;
    files: string[];
    available: boolean;
  }[];
  handleSave: (id: number, episodes: number[]) => void;
  itemId: number;
}) {
  const id = useId();
  const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>([]);
  const { setStartFetch } = useTorrentStore();

  useEffect(() => {
    setSelectedEpisodes(
      episodes
        .filter((episode) => episode.trackedEpisodes)
        .map((episode) => episode.id)
    );
  }, []);

  const handleCheckedChange = (checked: boolean, episodeId: number) => {
    const newSelected = checked
      ? [...selectedEpisodes, episodeId]
      : selectedEpisodes.filter((id) => id !== episodeId);

    setSelectedEpisodes(newSelected);

    setTimeout(() => {
      handleSave(itemId, newSelected);
      setStartFetch(Date.now());
    }, 50);
  };

  const handleSelectAll = () => {
    setSelectedEpisodes(episodes.map((episode) => episode.id));
    handleSave(
      itemId,
      episodes.map((episode) => episode.id)
    );
    setStartFetch(Date.now());
  };

  const handleUnselectAll = () => {
    setSelectedEpisodes([]);
    handleSave(itemId, []);
    setStartFetch(Date.now());
  };

  return (
    <div className='flex flex-col h-full overflow-hidden'>
      <div className='grid grid-cols-3 gap-3 pb-1.5'>
        {episodes.map((item) => (
          <div
            key={`${id}-${item.id}`}
            className='relative flex cursor-pointer flex-col gap-4 rounded-lg border-2 border-input p-4 shadow-sm shadow-black/5 has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:border-2 transform-gpu'>
            <div className='flex justify-between gap-2'>
              <Checkbox
                id={`${id}-${item.id}`}
                autoFocus={false}
                checked={selectedEpisodes.includes(item.id)}
                className='order-1 after:absolute after:inset-0 '
                onCheckedChange={(checked: boolean) =>
                  handleCheckedChange(checked, item.id)
                }
              />
              {item.available ? (
                item.files.length > 0 ? (
                  <FileVideo size={16} className='text-green-500' />
                ) : (
                  <Popcorn size={16} className='text-orange-300' />
                )
              ) : (
                <Clock size={16} className='text-zinc-500' />
              )}
            </div>
            <Label htmlFor={`${id}-${item.id}`}>{item.title}</Label>
          </div>
        ))}
        <div className='flex gap-2 w-full flex-row col-span-3'>
          <Button
            size='sm'
            variant='secondary'
            className='font-bold w-1/2 flex '
            onClick={handleSelectAll}>
            Select All
          </Button>
          <Button
            size='sm'
            variant='secondary'
            className='font-bold w-1/2 flex'
            onClick={handleUnselectAll}>
            Unselect All
          </Button>
        </div>
      </div>
    </div>
  );
}
