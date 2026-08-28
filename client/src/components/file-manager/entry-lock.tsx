import { Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getEntryLockTooltipLines,
  type EntryLockProps,
} from './entry-lock.utils';

export function EntryLock({
  permissionLimited,
  isTorrentLinked,
  ownership,
}: EntryLockProps) {
  const tooltipLines = getEntryLockTooltipLines(
    permissionLimited,
    isTorrentLinked,
    ownership,
  );
  if (tooltipLines.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid='file-entry-lock-trigger'
          className='ml-1 inline-flex align-[-2px] text-zinc-500'
        >
          <Lock
            data-testid='file-entry-lock'
            aria-label={
              permissionLimited ? 'Permission denied' : 'Linked to torrent'
            }
            className='size-3.5'
            strokeWidth={2}
            aria-hidden='true'
          />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side='top'
        align='center'
        data-testid='file-entry-lock-tooltip'
        className='space-y-1'
      >
        {tooltipLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
