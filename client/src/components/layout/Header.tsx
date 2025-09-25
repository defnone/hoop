import { signOut } from '@/lib/auth-client';
import { Button } from '../ui/button';
import { Binoculars, Cog, LogOutIcon, Search } from 'lucide-react';
import customSonner from '@/components/CustomSonner';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router';
import { Logo } from './Logo';
import { useTorrentStore } from '@/stores/torrentStore';
import useSettings from '@/hooks/useSettings';
import { useEffect } from 'react';

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const lastSync = useTorrentStore((state) => state.lastSync);

  const { settingsData, errorSettings } = useSettings();

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          customSonner({
            text: 'Signed out successfully',
          });
        },
      },
    });
  };

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
          <h1 className='text-base font-extrabold tracking-tight'>
            <Logo width={50} />
          </h1>
          {lastSync && (
            <p className='text-sm text-muted-foreground ml-4 font-mono'>
              Last sync: {new Date(Number(lastSync)).toLocaleString()}
            </p>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <Button
            onClick={() => navigate('/discover')}
            size='sm'
            variant='outline'
            className={cn(
              pathname === '/discover' &&
                'bg-secondary text-secondary-foreground'
            )}>
            <Binoculars size={16} />
          </Button>

          <Separator orientation='vertical' className='h-4 mx-1' />

          <Button
            disabled={!settingsData?.jackettUrl || !settingsData.jackettApiKey}
            size='sm'
            variant='outline'
            onClick={() => navigate('/search')}
            className={cn(
              pathname === '/search' && 'bg-secondary text-secondary-foreground'
            )}>
            <Search size={16} />
          </Button>

          <Button
            size='sm'
            variant='outline'
            onClick={() => navigate('/settings')}
            className={cn(
              pathname === '/settings' &&
                'bg-secondary text-secondary-foreground'
            )}>
            <Cog size={16} />
          </Button>

          <Button size='sm' variant='outline' onClick={handleSignOut}>
            <LogOutIcon size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
