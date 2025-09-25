import { Button } from '@/components/ui/button';
import { useLocation, useNavigate } from 'react-router';

export default function SettingsMenu() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <div className='flex flex-col gap-4 pb-10'>
      <div className='flex flex-row gap-2 border-b pb-5 border-zinc-800'>
        <Button
          onClick={() => navigate('/settings')}
          variant={pathname === '/settings' ? 'secondary' : 'outline'}
          className='font-bold'>
          General
        </Button>

        <Button
          onClick={() => navigate('/settings/credentials')}
          variant={
            pathname === '/settings/credentials' ? 'secondary' : 'outline'
          }
          className='font-bold'>
          Trackers Credentials
        </Button>
      </div>
    </div>
  );
}
