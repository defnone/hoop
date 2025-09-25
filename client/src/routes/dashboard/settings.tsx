import customSonner from '@/components/CustomSonner';
import GeneralSettings from '@/components/settings/GeneralSettings';
import JackettSettings from '@/components/settings/JackettSettings';
import NotificationSettings from '@/components/settings/NotificationSettings';
import SettingsMenu from '@/components/settings/SettingsMenu';
import TorrentClientSettings from '@/components/settings/TorrentClientSettings';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import useSettings from '@/hooks/useSettings';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Settings() {
  const {
    settingsData,
    isLoadingSettings,
    errorSettings,
    saveSettings,
    isSavingSettings,
  } = useSettings();
  const [data, setData] = useState<typeof settingsData | undefined>();

  const handleSave = async () => {
    if (!data) return;
    await saveSettings(data);
  };

  useEffect(() => {
    if (settingsData) {
      setData(settingsData);
    }
  }, [settingsData]);

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

  if (!settingsData) {
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
