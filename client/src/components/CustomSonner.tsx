import { CircleCheck, CircleX, XIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const VariantIcons: Record<'success' | 'error', ReactElement> = {
  success: (
    <CircleCheck
      className='mt-0.5 shrink-0 text-emerald-500'
      size={16}
      aria-hidden='true'
    />
  ),
  error: (
    <CircleX
      className='mt-0.5 shrink-0 text-red-500'
      size={16}
      aria-hidden='true'
    />
  ),
};

interface CustomSonnerProps {
  variant?: keyof typeof VariantIcons;
  text: string;
  description?: string;
  delayDuration?: number;
}

export default function customSonner({
  variant = 'success',
  text,
  description,
  delayDuration,
}: CustomSonnerProps) {
  return toast.custom(
    (t) => (
      <div className='bg-background text-foreground w-full rounded-md border px-4 py-3 shadow-lg sm:w-[var(--width)]'>
        <div className='flex gap-2'>
          <div className='flex grow gap-3'>
            {VariantIcons[variant]}
            <div className='flex grow flex-col gap-1'>
              <p className='text-sm font-medium'>{text}</p>
              {description ? (
                <p className='text-sm text-muted-foreground'>{description}</p>
              ) : null}
            </div>
          </div>
          <Button
            variant='ghost'
            className='group -my-1.5 -me-2 size-8 shrink-0 p-0 hover:bg-transparent'
            onClick={() => toast.dismiss(t)}
            aria-label='Close banner'>
            <XIcon
              size={16}
              className='opacity-60 transition-opacity group-hover:opacity-100'
              aria-hidden='true'
            />
          </Button>
        </div>
      </div>
    ),
    {
      duration: delayDuration || 5000,
    }
  );
}
