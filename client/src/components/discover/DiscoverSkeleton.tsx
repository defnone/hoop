import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export const DISCOVER_GRID_CLASS_NAME =
  'w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 rounded-md pb-10';

const DISCOVER_SKELETON_COUNT = 10;

export default function DiscoverSkeleton() {
  return (
    <div
      className={DISCOVER_GRID_CLASS_NAME}
      role='status'
      aria-label='Loading discover items'
      aria-busy='true'
    >
      {Array.from({ length: DISCOVER_SKELETON_COUNT }, (_, index) => {
        const isBig = index === 0 || index === 1;
        return (
          <div
            key={`skeleton-${index}`}
            className={isBig ? 'md:col-span-2 lg:col-span-2' : ''}
          >
            <Skeleton
              aria-hidden='true'
              className={cn(
                'w-full bg-muted/60',
                isBig ? 'row-span-2 h-[400px]' : 'h-[300px]',
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

export function DiscoverPageSkeleton() {
  return (
    <div className='flex w-full flex-col'>
      <div className='flex flex-col gap-2 pb-5' aria-hidden='true'>
        <Skeleton className='h-8 w-32 bg-muted/60' />
        <Skeleton className='h-5 w-72 max-w-full bg-muted/60' />
      </div>
      <Skeleton aria-hidden='true' className='mb-10 h-10 w-56 bg-muted/60' />
      <DiscoverSkeleton />
    </div>
  );
}
