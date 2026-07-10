import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rpc } from '@/lib/rpc';
import customSonner from '@/components/CustomSonner';
import { useState } from 'react';
import { useTorrentStore } from '@/stores/torrentStore';

export default function FileList({
  files,
  torrentId,
}: {
  files: string[];
  torrentId: number;
}) {
  const [deletedFiles, setDeletedFiles] = useState<string[]>([]);
  const { setStartFetch } = useTorrentStore();
  const deletedFileSet = new Set(deletedFiles);

  const handleDelete = async (filePath: string, id: number) => {
    try {
      const resp = await rpc.api.files[':id'].delete.$delete({
        json: { filePath },
        param: { id: String(id) },
      });
      const json = await resp.json();
      if (!json.success) {
        customSonner({
          variant: 'error',
          text: json.message || 'Failed to delete file',
        });
        return;
      }
      setDeletedFiles((prev) =>
        prev.includes(filePath) ? prev : [...prev, filePath],
      );
      customSonner({ text: 'File deleted' });
      setStartFetch(getCurrentTimestamp());
    } catch (error) {
      customSonner({
        variant: 'error',
        text: 'Failed to delete file: ' + error,
      });
    }
  };

  const sortedFiles = files
    .filter((file) => !deletedFileSet.has(file))
    .sort(compareEpisodeFiles);

  return (
    <div className='w-full flex flex-col gap-2'>
      {sortedFiles.map((file, index) => (
        <div
          key={file}
          className={cn(
            'w-full flex flex-row items-center  border-b border-border py-4 gap-2 font-mono hover:text-white',
            index === sortedFiles.length - 1 && 'border-b-0',
          )}
        >
          <div title={file} className='truncate pr-4'>
            {file.split('/').pop()}
          </div>
          <Button
            variant='ghost'
            size='icon'
            className='flex ml-auto'
            onClick={() => handleDelete(file, torrentId)}
            aria-label={`Delete ${file.split('/').pop() ?? 'file'}`}
          >
            <Trash2 className='w-4 h-4 text-red-400' />
          </Button>
        </div>
      ))}
    </div>
  );
}

function compareEpisodeFiles(a: string, b: string): number {
  return getEpisodeNumber(a) - getEpisodeNumber(b);
}

function getEpisodeNumber(filePath: string): number {
  const episodeMatch = filePath
    .split('/')
    .pop()
    ?.match(/E(\d+)/)?.[1];
  return episodeMatch ? parseInt(episodeMatch) : 0;
}

function getCurrentTimestamp() {
  return Date.now();
}
