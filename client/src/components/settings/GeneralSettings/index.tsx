import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import ChangeEmail from './ChangeEmail';
import ChangePassword from './ChangePassword';
import { DbUserSettings } from '@server/db/app/app-schema';

export default function GeneralSettings({
  syncInterval,
  setData,
}: {
  syncInterval: number;
  setData: React.Dispatch<
    React.SetStateAction<DbUserSettings | undefined | null>
  >;
}) {
  const { data: sessionData } = useSession();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setData((prevData) => {
      if (!prevData) return undefined;
      return {
        ...prevData,
        syncInterval: parseInt(e.target.value) || 0,
      };
    });
  };

  return (
    <div className='flex flex-row gap-4'>
      <div className='flex flex-col gap-2 w-1/3'>
        <h2 className='text-xl font-black text-zinc-300'>General Settings</h2>
      </div>

      <div className='flex flex-col items-end gap-12 w-2/3'>
        <div className='flex flex-row w-full gap-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Login</h3>
            {sessionData?.user?.email ? (
              <p className='text-base font-medium mt-1 text-zinc-200'>
                {sessionData?.user?.email}
              </p>
            ) : (
              <div className='flex w-28 h-7 bg-zinc-800 animate-pulse rounded-md'></div>
            )}
            <ChangeEmail>
              <Button variant='secondary' className='font-bold'>
                Change Email
              </Button>
            </ChangeEmail>
          </div>
          <div className='flex flex-col w-1/2 gap-2'></div>
        </div>

        <div className='flex flex-row w-full gap-6 border-t border-zinc-800 pt-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Password</h3>
            <ChangePassword>
              <Button className='mt-2 font-bold' variant='secondary'>
                Change Password
              </Button>
            </ChangePassword>
          </div>
          <div className='flex flex-col w-1/2 gap-2'></div>
        </div>

        <div className='flex flex-row w-full gap-6 border-t border-zinc-800 pt-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>
              Torrents Sync Interval (minutes)
            </h3>
            <Input
              placeholder='Sync Interval (minutes)'
              type='number'
              value={syncInterval}
              onChange={handleChange}
              className='font-mono text-base'
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2'></div>
        </div>
      </div>
    </div>
  );
}
