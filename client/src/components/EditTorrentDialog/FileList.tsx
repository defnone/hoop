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

  const visibleFiles = files.filter((file) => !deletedFiles.includes(file));
  const sortedFiles = [...visibleFiles].sort((a: string, b: string) => {
    const aName =
      a
        .split('/')
        .slice(-1)[0]
        .match(/E(\d+)/)?.[0] || '';
    const bName =
      b
        .split('/')
        .slice(-1)[0]
        .match(/E(\d+)/)?.[0] || '';

    const aNumber = aName ? parseInt(aName.replace('E', '')) : 0;
    const bNumber = bName ? parseInt(bName.replace('E', '')) : 0;

    return aNumber - bNumber;
  });

  return (
    <div className='w-full flex flex-col gap-2'>
      {sortedFiles.map((file, index) => (
        <div
          key={file}
          className={cn(
            'w-full flex flex-row items-center  border-b border-border py-4 gap-2 font-mono hover:text-white',
            index === visibleFiles.length - 1 && 'border-b-0',
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
          >
            <Trash2 className='w-4 h-4 text-red-400' />
          </Button>
        </div>
      ))}
    </div>
  );
}

function getCurrentTimestamp() {
  return Date.now();
}
