import { signOut } from '@/lib/auth-client';
import { Button } from '../ui/button';
import { Binoculars, Cog, LogOutIcon, RefreshCw, Search } from 'lucide-react';
import customSonner from '@/components/CustomSonner';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router';
import { Logo } from './Logo';
import { useTorrentStore } from '@/stores/torrentStore';
import useSettings from '@/hooks/useSettings';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/lib/rpc';
import TransmissionSheet from '@/components/TransmissionSheet';

async function handleSignOut() {
  await signOut({
    fetchOptions: {
      onSuccess: () => {
        customSonner({
          text: 'Signed out successfully',
        });
      },
    },
  });
}

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const lastSync = useTorrentStore((state) => state.lastSync);
  const setLastSync = useTorrentStore((state) => state.setLastSync);
  const setStartFetch = useTorrentStore((state) => state.setStartFetch);
  const isSyncRunning = useTorrentStore((state) => state.isSyncRunning);
  const setIsSyncRunning = useTorrentStore((state) => state.setIsSyncRunning);
  const { settingsData, errorSettings } = useSettings();
  const queryClient = useQueryClient();
  const { data: syncStatusResponse } = useQuery({
    queryKey: ['torrent-sync-status'],
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () => (await rpc.api.torrents.sync.$get()).json(),
  });
  const syncMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await rpc.api.torrents.sync.$post();
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? 'Failed to start torrent sync');
      }
    },
    onSuccess: () => {
      customSonner({ text: 'Sync started' });
      setIsSyncRunning(true);
      setStartFetch(getCurrentTimestamp());
      void queryClient.invalidateQueries({ queryKey: ['torrent-sync-status'] });
    },
    onError: (error) => {
      customSonner({
        variant: 'error',
        text: error.message || 'Failed to start sync',
      });
    },
  });
  const isSyncButtonDisabled = syncMutation.isPending || isSyncRunning;

  const lastSyncLabel = lastSync
    ? new Date(Number(lastSync)).toLocaleString()
    : null;

  useEffect(() => {
    const syncStatus = syncStatusResponse?.data;
    if (!syncStatus) return;

    if (syncStatus.lastSync) {
      setLastSync(syncStatus.lastSync);
    }
    setIsSyncRunning(syncStatus.isRunning);
  }, [setIsSyncRunning, setLastSync, syncStatusResponse]);

  useEffect(() => {
    if (errorSettings) {
      customSonner({
        variant: 'error',
        text: 'Error while loading settings',
        description: errorSettings.message,
      });
    }
  }, [errorSettings]);

  return (
    <div className='mb-10 w-full flex h-[70px] items-center border-b border-border '>
      <div className='w-full mx-auto container flex flex-row justify-between px-[1%]'>
        <div className='flex items-center gap-2'>
          <button
            type='button'
            className='text-base font-extrabold tracking-tight cursor-pointer bg-transparent p-0'
            onClick={() => {
              setStartFetch(getCurrentTimestamp());
              navigate('/');
            }}
          >
            <Logo width={50} />
          </button>
          {lastSyncLabel && (
            <p className='text-sm text-muted-foreground ml-4 font-mono'>
              Last sync: {lastSyncLabel}
            </p>
          )}
          <Button
            type='button'
            size='icon-sm'
            variant='secondary'
            aria-label='Start torrent sync'
            className='ml-3'
            title={
              isSyncRunning ? 'Torrent sync is running' : 'Start torrent sync'
            }
            disabled={isSyncButtonDisabled}
            onClick={() => syncMutation.mutate()}
          >
            <RefreshCw
              strokeWidth={3}
              className={cn(isSyncButtonDisabled && 'animate-spin')}
            />
          </Button>
        </div>
        <div className='flex items-center gap-2'>
          <TransmissionSheet />

          <Separator orientation='vertical' className='h-4 mx-1' />

          <Button
            onClick={() => navigate('/discover?period=weekly')}
            size='icon'
            variant='outline'
            className={cn(
              pathname === '/discover' &&
                'bg-secondary text-secondary-foreground',
            )}
          >
            <Binoculars strokeWidth={2} size={16} />
          </Button>

          <Separator orientation='vertical' className='h-4 mx-1' />

          <Button
            disabled={!settingsData?.jackettUrl || !settingsData.jackettApiKey}
            size='icon'
            variant='outline'
            onClick={() => navigate('/search')}
            className={cn(
              pathname === '/search' &&
                'bg-secondary text-secondary-foreground',
            )}
          >
            <Search strokeWidth={3} size={16} />
          </Button>

          <Button
            size='icon'
            variant='outline'
            onClick={() => navigate('/settings')}
            className={cn(
              pathname === '/settings' &&
                'bg-secondary text-secondary-foreground',
            )}
          >
            <Cog strokeWidth={2} size={16} />
          </Button>

          <Button size='icon' variant='outline' onClick={handleSignOut}>
            <LogOutIcon strokeWidth={3} size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function getCurrentTimestamp() {
  return Date.now();
}
