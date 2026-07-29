import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { TorrentItemDto } from '@server/features/torrent-item/torrent-item.types';

export type NotificationSettingsValue = Pick<
  TorrentItemDto,
  'notifyOnTitleChange' | 'notifyOnMagnetChange' | 'notifyOnDownloadComplete'
>;

type NotificationSettingsProps = {
  value: NotificationSettingsValue;
  disabled: boolean;
  onChange: (value: NotificationSettingsValue) => void;
};

export default function NotificationSettings({
  value,
  disabled,
  onChange,
}: NotificationSettingsProps) {
  return (
    <div className='flex flex-col gap-4 py-2'>
      <NotificationOption
        id='notify-title-change'
        label='When title changes'
        checked={value.notifyOnTitleChange}
        disabled={disabled}
        onCheckedChange={(checked) =>
          onChange({ ...value, notifyOnTitleChange: checked })
        }
      />
      <NotificationOption
        id='notify-magnet-change'
        label='When magnet changes'
        checked={value.notifyOnMagnetChange}
        disabled={disabled}
        onCheckedChange={(checked) =>
          onChange({ ...value, notifyOnMagnetChange: checked })
        }
      />
      <NotificationOption
        id='notify-download-complete'
        label='When download completes'
        checked={value.notifyOnDownloadComplete}
        disabled={disabled}
        onCheckedChange={(checked) =>
          onChange({ ...value, notifyOnDownloadComplete: checked })
        }
      />
    </div>
  );
}

// --- Option ---------------------------------------------------------------

function NotificationOption({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className='flex items-center gap-3'>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(nextValue) => onCheckedChange(nextValue === true)}
      />
      <Label htmlFor={id} className='cursor-pointer text-sm text-zinc-300'>
        {label}
      </Label>
    </div>
  );
}
