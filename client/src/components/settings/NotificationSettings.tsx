import { Input } from '@/components/ui/input';
import { DbUserSettings } from '@server/db/app/app-schema';

export default function NotificationSettings({
  telegramId,
  botToken,
  setData,
}: {
  telegramId: number;
  botToken: string;
  setData: React.Dispatch<
    React.SetStateAction<DbUserSettings | null | undefined>
  >;
}) {
  return (
    <div className='flex flex-row gap-4'>
      <div className='flex flex-col gap-2 w-1/3'>
        <h2 className='text-xl font-black text-zinc-300'>
          Notification Settings
        </h2>
      </div>

      <div className='flex flex-col items-end gap-10 w-2/3'>
        <div className='flex flex-row w-full gap-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Telegram Bot Token</h3>
            <Input
              className='font-mono text-base'
              placeholder='Telegram Bot Token'
              value={botToken}
              onChange={(e) =>
                setData((data) => {
                  if (!data) return;
                  return {
                    ...data,
                    botToken: e.target.value,
                  };
                })
              }
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <p className='text-sm text-zinc-400'>
              Get your bot token from{' '}
              <a
                href='https://t.me/BotFather'
                target='_blank'
                className='text-blue-500'>
                BotFather
              </a>
              .
            </p>
          </div>
        </div>

        <div className='flex flex-row w-full gap-6 border-t border-zinc-800 pt-6'>
          <div className='flex flex-col w-1/2 gap-4'>
            <h3 className='text-lg font-extrabold'>Telegram Chat ID</h3>
            <Input
              className='font-mono text-base'
              placeholder='Telegram Chat ID'
              value={telegramId}
              onChange={(e) =>
                setData((data) => {
                  if (!data) return;
                  return {
                    ...data,
                    telegramId: parseInt(e.target.value),
                  };
                })
              }
            />
          </div>
          <div className='flex flex-col w-1/2 gap-2 justify-end'>
            <p className='text-sm text-zinc-400'>
              Get your chat ID from{' '}
              <a
                href='https://t.me/userinfobot'
                target='_blank'
                className='text-blue-500'>
                Userinfobot
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
