import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useId } from 'react';

export default function TrackerPicker({
  tracker,
  setTracker,
  trackers,
}: {
  tracker: string;
  setTracker: React.Dispatch<React.SetStateAction<string>>;
  trackers: { value: string; label: string }[];
}) {
  const id = useId();

  const items = trackers;

  return (
    <fieldset className='space-y-4'>
      <RadioGroup className='grid grid-cols-4 gap-2 pt-4' defaultValue='all'>
        {items.map((item) => (
          <label
            key={`${id}-${item.value}`}
            className='relative flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-input px-2 py-3 text-center shadow-sm shadow-black/5 outline-offset-2 transition-colors has-[[data-disabled]]:cursor-not-allowed has-[[data-state=checked]]:border-transparent has-[[data-state=checked]]:bg-accent has-[[data-disabled]]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring/70'>
            <RadioGroupItem
              id={`${id}-${item.value}`}
              value={item.value}
              className='sr-only after:absolute after:inset-0'
              onClick={() => setTracker(item.value)}
            />
            <p
              className={
                'text-xs font-extrabold leading-none ' +
                (tracker === item.value
                  ? ' text-primary'
                  : ' text-muted-foreground')
              }>
              {item.label}
            </p>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
