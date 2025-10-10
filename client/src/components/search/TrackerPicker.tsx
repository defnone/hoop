import { cn } from '@/lib/utils';
import { useId } from 'react';
import { ButtonGroup } from '../ui/button-group';
import { Button } from '../ui/button';

export default function TrackerPicker({
  tracker,
  setTracker,
  trackers,
  resultsByTracker,
}: {
  tracker: string;
  setTracker: React.Dispatch<React.SetStateAction<string>>;
  trackers: { value: string; label: string }[];
  resultsByTracker: Record<string, number>;
}) {
  const id = useId();
  const items = trackers;

  return (
    <ButtonGroup className=''>
      {items.map((item) => (
        <Button
          className={cn(
            ' font-bold',
            tracker === item.value && 'border border-border'
          )}
          variant={tracker === item.value ? 'secondary' : 'outline'}
          key={`${id}-${item.value}`}
          onClick={() => setTracker(item.value)}>
          {item.label}{' '}
          {resultsByTracker[item.value] > 0 &&
            (tracker === 'all' || tracker === item.value) && (
              <span className='text-xs rounded-2xl bg-zinc-700 p-1 min-w-6'>
                {resultsByTracker[item.value] || 0}
              </span>
            )}
        </Button>
      ))}
    </ButtonGroup>
  );
}
