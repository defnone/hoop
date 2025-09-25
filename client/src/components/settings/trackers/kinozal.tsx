import customSonner from '@/components/CustomSonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { rpc } from '@/lib/rpc';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function KinozalSettings({
  kinozalSettings,
  setKinozalSettings,
}: {
  kinozalSettings: {
    username: string;
    password: string;
  };
  setKinozalSettings: (settings: {
    username: string;
    password: string;
  }) => void;
}) {
  const [isTesting, setIsTesting] = useState(false);

  const testKinozalConnection = async () => {
    if (!kinozalSettings.username || !kinozalSettings.password) {
      customSonner({
        variant: 'error',
        text: 'Kinozal username and password are required',
      });
      return;
    }

    try {
      setIsTesting(true);
      const response = await rpc.api.trackers.kinozal.verify.$post({
        json: {
          username: kinozalSettings.username,
          password: kinozalSettings.password,
        },
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        customSonner({
          variant: 'error',
          text: payload?.message ?? 'Failed to validate Kinozal credentials',
        });
        return;
      }

      customSonner({ text: 'Kinozal credentials are valid' });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : String(error);
      customSonner({
        variant: 'error',
        text: 'Failed to validate Kinozal credentials',
        description,
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className='flex flex-row gap-4'>
      <div className='flex flex-col gap-2 w-1/3'>
        <h2 className='text-xl font-black text-zinc-300'>
          Kinozal Credentials
        </h2>
      </div>

      <div className='flex flex-col items-end gap-10 w-2/3'>
        <div className='flex flex-row w-full gap-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Login</h3>
            <Input
              className='font-mono text-base'
              placeholder='Login'
              value={kinozalSettings.username}
              onChange={(e) =>
                setKinozalSettings({
                  ...kinozalSettings,
                  username: e.target.value,
                })
              }
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <h3 className='text-lg font-extrabold'>Password</h3>
            <Input
              className='font-mono text-base'
              placeholder='Password'
              value={kinozalSettings.password}
              type='password'
              onChange={(e) =>
                setKinozalSettings({
                  ...kinozalSettings,
                  password: e.target.value,
                })
              }
            />
          </div>
        </div>

        <div className='flex flex-row w-full gap-6 border-t border-zinc-800 pt-6'>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <Button
              variant='secondary'
              className='font-bold'
              onClick={testKinozalConnection}>
              {isTesting ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                'Test Credentials'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
