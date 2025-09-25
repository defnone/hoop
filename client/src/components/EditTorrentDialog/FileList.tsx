import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rpc } from '@/lib/rpc';
import customSonner from '@/components/CustomSonner';
import { useState, useEffect } from 'react';
import { useTorrentStore } from '@/stores/torrentStore';

export default function FileList({
  files,
  torrentId,
}: {
  files: string[];
  torrentId: number;
}) {
  const [localFiles, setLocalFiles] = useState(files);
  const { setStartFetch } = useTorrentStore();

  useEffect(() => {
    setLocalFiles(files);
  }, [files]);

  const handleDelete = async (filePath: string, id: number) => {
    try {
      const resp = await rpc.api.files[':id'].delete.$delete({
        json: { filePath },
        param: { id: String(id) },
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message);
      setLocalFiles((prev) => prev.filter((f) => f !== filePath));
      customSonner({ text: 'File deleted' });
      setStartFetch(Date.now());
    } catch (error) {
      customSonner({
        variant: 'error',
        text: 'Failed to delete file: ' + error,
      });
    }
  };

  const sortedFiles = [...localFiles].sort((a, b) => {
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
            index === localFiles.length - 1 && 'border-b-0'
          )}>
          <div title={file} className='truncate pr-4'>
            {file.split('/').pop()}
          </div>
          <Button
            variant='ghost'
            size='icon'
            className='flex ml-auto'
            onClick={() => handleDelete(file, torrentId)}>
            <Trash2 className='w-4 h-4 text-red-400' />
          </Button>
        </div>
      ))}
    </div>
  );
}
