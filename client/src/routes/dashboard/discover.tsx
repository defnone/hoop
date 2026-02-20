import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OneItem from '@/components/discover/OneItem';
import { TraktWatchedShow } from '@/types/trakt';
import { cn } from '@/lib/utils';
import customSonner from '@/components/CustomSonner';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import useSettings from '@/hooks/useSettings';
import { ButtonGroup } from '@/components/ui/button-group';

export default function Discover() {
  const [searchParams, setSearchParams] = useSearchParams();
  const weeklyData = 'https://hoop-api.defnone.workers.dev/api/trakt/weekly';
  const dailyData = 'https://hoop-api.defnone.workers.dev/api/trakt/daily';
  const { settingsData } = useSettings();
  const period = searchParams.get('period') === 'daily' ? 'daily' : 'weekly';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['trakt', period],
    staleTime: 60 * 60 * 1000,
    retry: 10,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const data = await fetch(period === 'weekly' ? weeklyData : dailyData);
      const json = await data.json();
      return json as TraktWatchedShow[];
    },
  });

  useEffect(() => {
    if (isError) {
      customSonner({
        variant: 'error',
        text: 'Failed to fetch data from Trakt: ' + error,
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
            Discover new shows on Trakt that other users have most watched.
          </p>
        </div>

        <div className='w-full flex gap-2 pb-10'>
          <ButtonGroup>
            <Button
              size={'lg'}
              variant={period === 'weekly' ? 'secondary' : 'outline'}
              className={cn(
                'font-bold',
                period == 'weekly' ? 'border border-border' : ''
              )}
              onClick={() => setSearchParams({ period: 'weekly' })}>
              Last Week
            </Button>
            <Button
              size={'lg'}
              variant={period === 'daily' ? 'secondary' : 'outline'}
              className={cn(
                'font-bold',
                period == 'daily' ? 'border border-border' : ''
              )}
              onClick={() => setSearchParams({ period: 'daily' })}>
              Last 24h
            </Button>
          </ButtonGroup>
        </div>

        {isLoading && (
          <div className='flex justify-center items-center w-full h-[50vh]'>
            <Loader2 className='w-10 h-10 animate-spin ' />
          </div>
        )}
        <div className='w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 rounded-md pb-10'>
          {!isLoading &&
            data?.map((item, index) => (
              <div
                key={item.show.ids.trakt}
                className={`${
                  index === 0 || index === 1
                    ? 'md:col-span-2 lg:col-span-2'
                    : ''
                }`}>
                <OneItem
                  item={item}
                  isBig={index === 0 || index === 1}
                  isJackettPrepared={Boolean(
                    settingsData?.jackettUrl && settingsData?.jackettApiKey
                  )}
                />
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
