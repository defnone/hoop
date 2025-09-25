import customSonner from '@/components/CustomSonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { rpc } from '@/lib/rpc';
import { Loader2 } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';

import { DbUserSettings } from '@server/db/app/app-schema';

type JackettSettingsProps = {
  jackettUrl: string;
  jackettApiKey: string;
  setData: Dispatch<SetStateAction<DbUserSettings | null | undefined>>;
};

export default function JackettSettings({
  jackettUrl,
  jackettApiKey,
  setData,
}: JackettSettingsProps) {
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingApiKey, setIsTestingApiKey] = useState(false);

  const validateUrl = (value: string) => {
    try {
      return Boolean(new URL(value));
    } catch {
      return false;
    }
  };

  const testConnection = async () => {
    if (!jackettUrl) {
      customSonner({ variant: 'error', text: 'Jackett URL is required' });
      return;
    }

    if (!validateUrl(jackettUrl)) {
      customSonner({
        variant: 'error',
        text: 'Invalid Jackett URL. It should include the protocol.',
      });
      return;
    }

    try {
      setIsTestingConnection(true);
      const response = await rpc.api.jackett.verify.connection.$post({
        json: { jackettUrl },
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        customSonner({
          variant: 'error',
          text: payload?.message ?? 'Failed to test Jackett connection',
        });
        return;
      }

      customSonner({
        text: 'Jackett connection successful',
      });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : String(error);
      customSonner({
        variant: 'error',
        text: 'Failed to test Jackett connection',
        description,
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const testApiKey = async () => {
    if (!jackettUrl || !jackettApiKey) {
      customSonner({
        variant: 'error',
        text: 'Jackett URL and API key are required',
      });
      return;
    }

    if (!validateUrl(jackettUrl)) {
      customSonner({
        variant: 'error',
        text: 'Invalid Jackett URL. It should include the protocol.',
      });
      return;
    }

    try {
      setIsTestingApiKey(true);
      const response = await rpc.api.jackett.verify['api-key'].$post({
        json: { jackettUrl, jackettApiKey },
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        customSonner({
          variant: 'error',
          text: payload?.message ?? 'Failed to validate Jackett API key',
        });
        return;
      }

      customSonner({ text: 'Jackett API key is valid' });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : String(error);
      customSonner({
        variant: 'error',
        text: 'Failed to validate Jackett API key',
        description,
      });
    } finally {
      setIsTestingApiKey(false);
    }
  };

  return (
    <div className='flex flex-row gap-4'>
      <div className='flex flex-col gap-2 w-1/3'>
        <h2 className='text-xl font-black text-zinc-300'>Jackett Settings</h2>
      </div>

      <div className='flex flex-col items-end gap-10 w-2/3'>
        <div className='flex flex-row w-full gap-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Jackett URL</h3>
            <Input
              className='font-mono text-base'
              placeholder='http://localhost:9117'
              value={jackettUrl}
              onChange={(e) =>
                setData((data) => {
                  if (!data) return data;
                  return {
                    ...data,
                    jackettUrl: e.target.value,
                  };
                })
              }
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <Button
              variant='secondary'
              className='font-bold'
              onClick={testConnection}
              disabled={isTestingConnection}>
              {isTestingConnection ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                'Test Connection'
              )}
            </Button>
          </div>
        </div>

        <div className='flex flex-row w-full gap-6 border-t border-zinc-800 pt-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Jackett API Key</h3>
            <Input
              className='font-mono text-base'
              placeholder='Jackett API Key'
              value={jackettApiKey}
              onChange={(e) =>
                setData((data) => {
                  if (!data) return data;
                  return {
                    ...data,
                    jackettApiKey: e.target.value,
                  };
                })
              }
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <Button
              variant='secondary'
              className='font-bold'
              onClick={testApiKey}
              disabled={isTestingApiKey}>
              {isTestingApiKey ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                'Test API Key'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
