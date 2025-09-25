import SettingsMenu from '@/components/settings/SettingsMenu';
import KinozalSettings from '@/components/settings/trackers/kinozal';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import useSettings from '@/hooks/useSettings';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function CredentialsSettings() {
  const { settingsData, saveSettings, isSavingSettings, isLoadingSettings } =
    useSettings();
  const [data, setData] = useState<typeof settingsData | undefined>();

  useEffect(() => {
    if (settingsData) {
      setData(settingsData);
    }
  }, [settingsData]);

  const handleKinozalSettingsChange = (settings: {
    username: string;
    password: string;
  }) => {
    if (!data) return;
    setData({
      ...data,
      kinozalUsername: settings.username,
      kinozalPassword: settings.password,
    });
  };

  const handleSave = async () => {
    if (!data) return;
    await saveSettings(data);
  };

  if (isLoadingSettings) {
    return (
      <div className='flex flex-col w-full'>
        <SettingsMenu />
        <div className='flex flex-col gap-4 mx-auto mt-[30vh]'>
          <Loader2 className='w-10 h-10 animate-spin' />
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <>
      <div className='flex flex-col w-full pb-10'>
        <SettingsMenu />
        <KinozalSettings
          kinozalSettings={{
            username: data?.kinozalUsername ?? '',
            password: data?.kinozalPassword ?? '',
          }}
          setKinozalSettings={handleKinozalSettingsChange}
        />
        <Separator className='my-12' />
        <Button
          className='w-fit my-10 font-extrabold ml-auto'
          size='lg'
          onClick={handleSave}>
          {isSavingSettings ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>
    </>
  );
}
