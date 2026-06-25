import customSonner from '@/components/CustomSonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { rpc } from '@/lib/rpc';
import type { DbUserSettings } from '@server/db/app/app-schema';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type FlareSolverrSettingsProps = {
  enabled: boolean;
  serverUrl: string;
  timeoutSeconds: number;
  setData: Dispatch<SetStateAction<DbUserSettings | null | undefined>>;
};

export default function FlareSolverrSettings({
  enabled,
  serverUrl,
  timeoutSeconds,
  setData,
}: FlareSolverrSettingsProps) {
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const handleTestConnection = async () => {
    if (!enabled) {
      customSonner({ variant: 'error', text: 'FlareSolverr is disabled' });
      return;
    }

    if (!serverUrl) {
      customSonner({ variant: 'error', text: 'FlareSolverr URL is required' });
      return;
    }

    if (!isValidUrl(serverUrl)) {
      customSonner({
        variant: 'error',
        text: 'Invalid FlareSolverr URL. It should include the protocol.',
      });
      return;
    }

    try {
      setIsTestingConnection(true);
      const response = await rpc.api.flaresolverr.verify.$post({
        json: {
          flaresolverrUrl: serverUrl,
          timeoutSeconds,
        },
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        customSonner({
          variant: 'error',
          text: payload?.message ?? 'Failed to test FlareSolverr connection',
        });
      } else {
        customSonner({ text: 'FlareSolverr connection successful' });
      }
    } catch (error) {
      const description =
        error instanceof Error ? error.message : String(error);
      customSonner({
        variant: 'error',
        text: 'Failed to test FlareSolverr connection',
        description,
      });
    }
    setIsTestingConnection(false);
  };

  return (
    <div className='flex flex-row gap-4'>
      <div className='flex flex-col gap-2 w-1/3'>
        <h2 className='text-xl font-black text-zinc-300'>
          FlareSolverr Settings
        </h2>
      </div>

      <div className='flex flex-col gap-10 w-2/3'>
        <div className='flex flex-col gap-4'>
          <div className='flex items-center gap-3'>
            <Checkbox
              id='flaresolverr-enabled'
              checked={enabled}
              onCheckedChange={(checked) =>
                setData((data) => {
                  if (!data) return data;
                  return {
                    ...data,
                    flaresolverrEnabled: checked === true,
                  };
                })
              }
            />
            <Label htmlFor='flaresolverr-enabled'>Enable FlareSolverr</Label>
          </div>
        </div>

        <div className='flex flex-row w-full gap-6 border-t border-zinc-800 pt-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Server URL</h3>
            <Input
              className='font-mono text-base'
              placeholder='http://localhost:8191'
              value={serverUrl}
              disabled={!enabled}
              onChange={(event) =>
                setData((data) => {
                  if (!data) return data;
                  return {
                    ...data,
                    flaresolverrUrl: event.target.value,
                  };
                })
              }
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <Button
              variant='secondary'
              className='font-bold'
              onClick={handleTestConnection}
              disabled={!enabled || isTestingConnection}
            >
              {isTestingConnection ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                'Test Connection'
              )}
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-4 border-t border-zinc-800 pt-6'>
          <h3 className='text-lg font-extrabold'>Timeout (seconds)</h3>
          <Input
            className='w-40 font-mono text-base'
            type='number'
            min={1}
            max={300}
            value={timeoutSeconds}
            disabled={!enabled}
            onChange={(event) =>
              setData((data) => {
                if (!data) return data;
                return {
                  ...data,
                  flaresolverrTimeoutSeconds: parseTimeoutSeconds(
                    event.target.value,
                  ),
                };
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

// Helpers

function isValidUrl(value: string): boolean {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}

function parseTimeoutSeconds(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 60;
  return Math.min(Math.max(parsed, 1), 300);
}
