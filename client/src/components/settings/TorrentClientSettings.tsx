import customSonner from '@/components/CustomSonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { rpc } from '@/lib/rpc';
import type { DbUserSettings } from '@server/db/app/app-schema';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function TorrentClientSettings({
  downloadDir,
  mediaDir,
  cleanEmptySeriesDirectories,
  deleteAfterDownload,
  clientType,
  clientUrl,
  clientUsername,
  clientPassword,
  setData,
}: {
  downloadDir: string;
  mediaDir: string;
  cleanEmptySeriesDirectories: boolean;
  deleteAfterDownload: boolean;
  clientType: 'transmission' | 'qbittorrent';
  clientUrl: string;
  clientUsername: string;
  clientPassword: string;
  setData: React.Dispatch<
    React.SetStateAction<DbUserSettings | null | undefined>
  >;
}) {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingSeriesDirectory, setIsTestingSeriesDirectory] =
    useState(false);

  const handleTestConnection = async () => {
    if (!clientUrl || !clientUsername || !clientPassword) {
      customSonner({
        variant: 'error',
        text: 'Torrent client connection settings are required',
      });
      return;
    }
    try {
      setIsTestingConnection(true);
      const response = await rpc.api['torrent-client'].verify.$post({
        json: {
          type: clientType,
          url: clientUrl,
          username: clientUsername,
          password: clientPassword,
        },
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? 'Torrent client connection failed');
      }
      customSonner({
        text: `Torrent client connected (${payload.data?.version ?? 'unknown version'})`,
      });
    } catch (error: unknown) {
      customSonner({
        variant: 'error',
        text: 'Torrent client connection failed',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleTestSeriesDirectory = async () => {
    if (!mediaDir.trim()) {
      customSonner({
        variant: 'error',
        text: 'Series directory path is required',
      });
      return;
    }

    try {
      setIsTestingSeriesDirectory(true);
      const response = await rpc.api['series-directory'].verify.$post({
        json: { path: mediaDir },
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? 'Series directory test failed');
      }
      customSonner({ text: 'Series directory write and delete test passed' });
    } catch (error: unknown) {
      customSonner({
        variant: 'error',
        text: 'Series directory test failed',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsTestingSeriesDirectory(false);
    }
  };

  return (
    <div className='flex flex-row gap-4'>
      <div className='flex flex-col gap-2 w-1/3'>
        <h2 className='text-xl font-black text-zinc-300'>Download Settings</h2>
      </div>

      <div className='flex flex-col items-end gap-10 w-2/3'>
        <div className='flex flex-row w-full gap-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Torrent Client</h3>
            <select
              className='h-9 rounded-md border border-input bg-transparent px-3 text-sm'
              value={clientType}
              onChange={(event) =>
                setData((data) =>
                  data
                    ? {
                        ...data,
                        torrentClientType: event.target.value as
                          | 'transmission'
                          | 'qbittorrent',
                      }
                    : data,
                )
              }
            >
              <option value='transmission'>Transmission</option>
              <option value='qbittorrent'>qBittorrent</option>
            </select>
          </div>
        </div>

        <div className='grid grid-cols-2 w-full gap-6'>
          <div className='flex flex-col gap-4 col-span-2'>
            <h3 className='text-lg font-extrabold'>Connection URL</h3>
            <Input
              className='font-mono text-base'
              placeholder={
                clientType === 'transmission'
                  ? 'http://localhost:9091/transmission/rpc'
                  : 'http://localhost:8080'
              }
              value={clientUrl}
              onChange={(event) =>
                setData((data) =>
                  data
                    ? { ...data, torrentClientUrl: event.target.value }
                    : data,
                )
              }
            />
          </div>
          <div className='flex flex-col gap-4'>
            <h3 className='text-lg font-extrabold'>Username</h3>
            <Input
              value={clientUsername}
              autoComplete='username'
              onChange={(event) =>
                setData((data) =>
                  data
                    ? { ...data, torrentClientUsername: event.target.value }
                    : data,
                )
              }
            />
          </div>
          <div className='flex flex-col gap-4'>
            <h3 className='text-lg font-extrabold'>Password</h3>
            <Input
              type='password'
              value={clientPassword}
              autoComplete='current-password'
              onChange={(event) =>
                setData((data) =>
                  data
                    ? { ...data, torrentClientPassword: event.target.value }
                    : data,
                )
              }
            />
          </div>
          <Button
            variant='secondary'
            className='font-bold w-fit'
            disabled={isTestingConnection}
            onClick={handleTestConnection}
          >
            {isTestingConnection ? (
              <Loader2 className='w-4 h-4 animate-spin' />
            ) : (
              'Test Connection'
            )}
          </Button>
        </div>

        <div className='flex flex-row w-full gap-6 pt-4'>
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
              container and for selected torrent client.
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
            <Button
              type='button'
              variant='secondary'
              className='font-bold w-fit'
              disabled={isTestingSeriesDirectory}
              onClick={handleTestSeriesDirectory}
            >
              {isTestingSeriesDirectory ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                'Test Write and Delete'
              )}
            </Button>
            <p className='flex flex-row gap-2 items-center mt-6'>
              <Checkbox
                id='clean-empty-series-directories'
                checked={cleanEmptySeriesDirectories}
                onCheckedChange={(checked) =>
                  setData((data) =>
                    data
                      ? {
                          ...data,
                          cleanEmptySeriesDirectories: checked === true,
                        }
                      : data,
                  )
                }
              />
              <Label htmlFor='clean-empty-series-directories'>
                Remove empty directories daily
              </Label>
            </p>
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <p className='text-sm text-zinc-400'>
              Scans all nested directories once per day. The Series Directory
              itself is never removed.
            </p>
          </div>
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
