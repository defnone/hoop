import { Checkbox } from '../ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DbUserSettings } from '@server/db/app/app-schema';

export default function TorrentClientSettings({
  downloadDir,
  mediaDir,
  deleteAfterDownload,
  setData,
}: {
  downloadDir: string;
  mediaDir: string;
  deleteAfterDownload: boolean;
  setData: React.Dispatch<
    React.SetStateAction<DbUserSettings | null | undefined>
  >;
}) {
  return (
    <div className='flex flex-row gap-4'>
      <div className='flex flex-col gap-2 w-1/3'>
        <h2 className='text-xl font-black text-zinc-300'>Download Settings</h2>
      </div>

      <div className='flex flex-col items-end gap-10 w-2/3'>
        <div className='flex flex-row w-full gap-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Download Directory</h3>
            <Input
              className='font-mono text-base'
              placeholder='Download Directory Path'
              value={downloadDir}
              onChange={(e) =>
                setData((data) => {
                  if (!data) return;
                  return {
                    ...data,
                    downloadDir: e.target.value,
                  };
                })
              }
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <p className='text-sm text-zinc-400'>
              The directory path must be identical both inside the hoop Docker
              container and for Transmission.
            </p>
          </div>
        </div>

        <div className='flex flex-row w-full gap-6 border-t border-zinc-800 pt-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Series Directory</h3>
            <Input
              className='font-mono text-base'
              placeholder='Series Directory Path'
              value={mediaDir}
              onChange={(e) =>
                setData((data) => {
                  if (!data) return;
                  return {
                    ...data,
                    mediaDir: e.target.value,
                  };
                })
              }
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'></div>
        </div>

        <div className='flex flex-row w-full gap-6 border-t border-zinc-800 pt-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <p className='flex flex-row gap-2 items-center'>
              <Checkbox
                id='delete-after-download'
                checked={deleteAfterDownload}
                onCheckedChange={(checked) =>
                  setData((data) => {
                    if (!data) return;
                    return {
                      ...data,
                      deleteAfterDownload: checked === true ? true : false,
                    };
                  })
                }
              />
              <Label htmlFor='delete-after-download'>
                Delete torrent from client after download
              </Label>
            </p>
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <p className='text-sm text-zinc-400'>
              The data and the torrent will be deleted after download.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
