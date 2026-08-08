import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import OneItem from '@/components/discover/OneItem';
import { TmdbDiscoverItem } from '@/types/tmdb';
import { cn } from '@/lib/utils';
import customSonner from '@/components/CustomSonner';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import useSettings from '@/hooks/useSettings';
import { ButtonGroup } from '@/components/ui/button-group';
import { SiThemoviedatabase } from 'react-icons/si';
import DiscoverSkeleton, {
  DISCOVER_GRID_CLASS_NAME,
} from '@/components/discover/DiscoverSkeleton';

export default function Discover() {
  const [searchParams, setSearchParams] = useSearchParams();
  const weeklyData =
    'https://hoop-tmdb-api.defnone.workers.dev/api/tmdb/weekly';
  const dailyData = 'https://hoop-tmdb-api.defnone.workers.dev/api/tmdb/daily';
  const { settingsData } = useSettings();
  const period = searchParams.get('period') === 'daily' ? 'daily' : 'weekly';

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['tmdb', period],
    staleTime: 60 * 60 * 1000,
    retry: 2,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<TmdbDiscoverItem[]> => {
      const response = await fetch(
        period === 'weekly' ? weeklyData : dailyData,
      );
      if (!response.ok) {
        throw new Error(`TMDB request failed with status ${response.status}`);
      }
      const json = await response.json();
      return json as TmdbDiscoverItem[];
    },
  });

  useEffect(() => {
    if (isError) {
      customSonner({
        variant: 'error',
        text: 'Failed to fetch data from TMDB: ' + error.message,
      });
    }
  }, [isError, error]);

  useEffect(() => {
    const queryPeriod = searchParams.get('period');
    if (queryPeriod !== 'weekly' && queryPeriod !== 'daily') {
      setSearchParams({ period: 'weekly' }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <>
      <div className='flex flex-col w-full'>
        <div className='flex flex-col gap-2 pb-5'>
          <h1 className='text-2xl font-black'>Discover</h1>
          <p className='text-base text-muted-foreground'>
            Discover trending TV shows from TMDB.
          </p>
        </div>

        <div className='w-full flex gap-2 pb-10'>
          <ButtonGroup>
            <Button
              size={'lg'}
              variant={period === 'weekly' ? 'secondary' : 'outline'}
              className={cn(
                'font-bold',
                period == 'weekly' ? 'border border-border' : '',
              )}
              onClick={() => setSearchParams({ period: 'weekly' })}
            >
              Last Week
            </Button>
            <Button
              size={'lg'}
              variant={period === 'daily' ? 'secondary' : 'outline'}
              className={cn(
                'font-bold',
                period == 'daily' ? 'border border-border' : '',
              )}
              onClick={() => setSearchParams({ period: 'daily' })}
            >
              Last 24h
            </Button>
          </ButtonGroup>
        </div>

        {isPending && !data ? (
          <DiscoverSkeleton />
        ) : isError && !data ? (
          <div
            role='alert'
            className='flex min-h-[300px] w-full flex-col items-center justify-center gap-4 rounded-md bg-muted/30 text-center'
          >
            <p className='text-muted-foreground'>
              Unable to load TMDB recommendations.
            </p>
            <Button variant='outline' onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className={DISCOVER_GRID_CLASS_NAME}>
            {data?.map((item, index) => (
              <div
                key={item.id}
                className={`${
                  index === 0 || index === 1
                    ? 'md:col-span-2 lg:col-span-2'
                    : ''
                }`}
              >
                <OneItem
                  item={item}
                  isBig={index === 0 || index === 1}
                  isJackettPrepared={Boolean(
                    settingsData?.jackettUrl && settingsData?.jackettApiKey,
                  )}
                />
              </div>
            ))}
          </div>
        )}
        <p className='flex items-center gap-2 text-sm text-muted-foreground pb-10'>
          <SiThemoviedatabase size={28} color='#01b4e4' aria-label='TMDB' />
          <span>
            This product uses the TMDB API but is not endorsed or certified by
            TMDB.{' '}
            <a
              href='https://www.themoviedb.org'
              target='_blank'
              rel='noreferrer'
              className='underline underline-offset-2 hover:text-foreground'
            >
              Visit TMDB
            </a>
          </span>
        </p>
      </div>
    </>
  );
}
