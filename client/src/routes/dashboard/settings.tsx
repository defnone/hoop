import customSonner from '@/components/CustomSonner';
import GeneralSettings from '@/components/settings/GeneralSettings';
import JackettSettings from '@/components/settings/JackettSettings';
import NotificationSettings from '@/components/settings/NotificationSettings';
import SettingsMenu from '@/components/settings/SettingsMenu';
import TorrentClientSettings from '@/components/settings/TorrentClientSettings';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import useSettings from '@/hooks/useSettings';
import type { DbUserSettings } from '@server/db/app/app-schema';
import { Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export default function Settings() {
  const {
    settingsData,
    isLoadingSettings,
    errorSettings,
    saveSettings,
    isSavingSettings,
  } = useSettings();
  const [pendingData, setPendingData] = useState<DbUserSettings | undefined>();
  const data = pendingData ?? settingsData ?? undefined;

  const setData: Dispatch<SetStateAction<DbUserSettings | null | undefined>> =
    useCallback(
      (next) => {
        setPendingData((currentData) => {
          const resolvedCurrentData = currentData ?? settingsData ?? undefined;

          if (typeof next === 'function') {
            const updater = next as (
              prevState: DbUserSettings | null | undefined
            ) => DbUserSettings | null | undefined;
            const updated = updater(resolvedCurrentData);
            return updated ?? undefined;
          }

          return next ?? undefined;
        });
      },
      [settingsData]
    );

  const handleSave = async () => {
    if (!data) return;
    await saveSettings(data);
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

  if (isLoadingSettings) {
    return (
      <>
        <div className='flex flex-col w-full'>
          <SettingsMenu />
        </div>
        <div className='flex flex-col gap-4 mx-auto mt-[30vh]'>
          <Loader2 className='w-10 h-10 animate-spin' />
        </div>
      </>
    );
  }

  if (!data) {
    customSonner({
      variant: 'error',
      text: 'Error while loading settings',
    });
    return null;
  }

  return (
    <>
      <SettingsMenu />
      <GeneralSettings
        syncInterval={data?.syncInterval ?? 0}
        setData={setData}
      />
      <Separator className='my-12' />
      <TorrentClientSettings
        downloadDir={data?.downloadDir ?? ''}
        mediaDir={data?.mediaDir ?? ''}
        deleteAfterDownload={data?.deleteAfterDownload ?? false}
        setData={setData}
      />
      <Separator className='my-12' />
      <NotificationSettings
        telegramId={data?.telegramId ?? 0}
        botToken={data?.botToken ?? ''}
        setData={setData}
      />
      <Separator className='my-12' />
      <JackettSettings
        jackettUrl={data?.jackettUrl ?? ''}
        jackettApiKey={data?.jackettApiKey ?? ''}
        setData={setData}
      />
      <Separator className='my-12' />
      <Button
        className='w-fit my-10 flex font-extrabold ml-auto'
        size='lg'
        onClick={handleSave}>
        {isSavingSettings ? (
          <Loader2 className='w-4 h-4 animate-spin' />
        ) : (
          'Save Settings'
        )}
      </Button>
    </>
  );
}
