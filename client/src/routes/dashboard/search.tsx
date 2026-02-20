import { Button } from '@/components/ui/button';
import CategoryPicker from '@/components/search/CategoryPicker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, SearchIcon } from 'lucide-react';
import SearchTable from '@/components/search/SearchTable';
import customSonner from '@/components/CustomSonner';
import TrackerPicker from '@/components/search/TrackerPicker';
import { Separator } from '@/components/ui/separator';
import { useNavigate, useSearchParams } from 'react-router';
import { getJackett } from '@/lib/getJackett';
import { JackettSearchResult } from '@/types/search';
import useSettings from '@/hooks/useSettings';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const router = useNavigate();

  const searchQuery = searchParams.get('query');
  const seasonQuery = searchParams.get('season');

  const { settingsData, isLoadingSettings, refetchSettings } = useSettings();

  const [category, setCategory] = useState(5000);
  const [isLoading, setIsLoading] = useState(false);
  const [tvName, setTvName] = useState(searchQuery || '');
  const [season, setSeason] = useState<number | string>(seasonQuery || '');
  const [items, setItems] = useState<JackettSearchResult[]>([]);
  const [search, setSearch] = useState('');
  const [tracker, setTracker] = useState<string>('all');
  const isFirstRenderRef = useRef(true);

  const trackers = useMemo(() => {
    const defaultTrackers = [
      { value: 'all', label: 'All' },
      { value: 'rutracker', label: 'Rutracker' },
      { value: 'noname-club', label: 'NNM-Club' },
    ];

    if (settingsData?.kinozalUsername && settingsData?.kinozalPassword) {
      return [...defaultTrackers, { value: 'kinozal', label: 'Kinozal' }];
    }

    return defaultTrackers;
  }, [settingsData?.kinozalPassword, settingsData?.kinozalUsername]);

  const handleSearch = async () => {
    if (tvName.length === 0) return;
    try {
      setIsLoading(true);
      const data = await getJackett(
        tvName,
        parseInt(season as string),
        category,
        tracker
      );
      const sortedData = data?.sort((a, b) => b.Seeders - a.Seeders);
      setItems(sortedData || []);
      setIsLoading(false);
    } catch (error) {
      customSonner({
        variant: 'error',
        text: 'Error while searching',
        description: 'Please check your Jackett configuration. ' + error,
      });
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      if (searchQuery && tvName.length > 0) {
        queueMicrotask(() => {
          void handleSearch();
        });
      }
      return;
    }
    if (tvName.length === 0) return;
    queueMicrotask(() => {
      void handleSearch();
    });
  }, [category, tracker]);

  const searchFilteredData = useMemo(() => {
    return items.filter((item) => {
      if (item.Title.match(/S\d+-\d+/i)) return false; // Multiple seasons in title, skip
      const phrases = search.toLowerCase().split(' ');
      for (const phrase of phrases) {
        if (!phrase.length) continue;
        if (!item.Title.toLowerCase().includes(phrase)) return false;
      }
      return true;
    });
  }, [items, search]);

  const filteredData = search.length > 0 ? searchFilteredData : items;

  const resultsByTracker = useMemo(() => {
    if (searchFilteredData.length === 0) {
      return {};
    }

    const trackerCounts = searchFilteredData.reduce(
      (acc: Record<string, number>, item) => {
        acc[item.TrackerId] = (acc[item.TrackerId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      all: searchFilteredData.length,
      ...trackerCounts,
    };
  }, [searchFilteredData]);

  useEffect(() => {
    void refetchSettings();
  }, [refetchSettings]);

  useEffect(() => {
    if (isLoadingSettings) return;

    if (!settingsData?.jackettUrl) {
      customSonner({
        variant: 'error',
        text: 'Looks like Jackett is not configured',
        description: 'Please configure Jackett in the settings.',
        delayDuration: 10000,
      });

      router('/settings');
    }
  }, [isLoadingSettings, router, settingsData?.jackettUrl]);

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  useEffect(() => {
    // Keep URL search params in sync with local state.
    // - If tvName is empty: remove both 'query' and 'season'.
    // - If season is empty: remove only 'season'.
    // - Avoid redundant history entries when nothing changes.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const before = next.toString();

        if (!tvName) {
          next.delete('query');
          next.delete('season');
        } else {
          next.set('query', tvName);
          if (season === '' || season === undefined || season === null) {
            next.delete('season');
          } else {
            next.set('season', String(season));
          }
        }

        return next.toString() === before ? prev : next;
      },
      { replace: true }
    );
  }, [tvName, season, setSearchParams]);

  return (
    <>
      <div className='flex flex-col w-full pb-10 gap-4'>
        <h1 className='text-2xl font-black text-zinc-100'>Jackett Search</h1>
        <p className='text-zinc-400 mb-1'>
          Make sure you have properly configured the RuTracker, NNM-Club, and
          Kinozal indexers in Jackett.
        </p>
        <div className='flex flex-col w-full max-w-[1000px]'>
          <ButtonGroup className='w-full relative'>
            <InputGroup className='w-full h-10'>
              <InputGroupInput
                disabled={isLoading}
                placeholder='TV Show Name'
                autoFocus
                value={tvName}
                onChange={(e) => setTvName(e.target.value)}
                onKeyDown={handleEnter}
              />
              <InputGroupAddon align='inline-end'>
                {isLoading && <Loader2 className='w-4 h-4 animate-spin' />}
              </InputGroupAddon>
            </InputGroup>
            <InputGroup className='w-30 max-w-30 h-10'>
              <InputGroupInput
                disabled={isLoading}
                className=''
                type='number'
                placeholder='Season'
                value={season}
                onChange={(e) =>
                  setSeason(e.target.value === '' ? '' : Number(e.target.value))
                }
                onKeyDown={handleEnter}
              />
            </InputGroup>
            <Button
              onClick={handleSearch}
              disabled={isLoading}
              size={'icon-lg'}
              className='w-14'
              variant={'secondary'}>
              <SearchIcon strokeWidth={4} className='w-4 h-4' />
            </Button>
          </ButtonGroup>

          <ButtonGroup className='h-10 mt-5 flex items-center justify-center'>
            <CategoryPicker category={category} setCategory={setCategory} />
            <Separator orientation='vertical' className='flex mx-2  h-10' />
            <TrackerPicker
              tracker={tracker}
              setTracker={setTracker}
              trackers={trackers}
              resultsByTracker={resultsByTracker}
            />
          </ButtonGroup>
        </div>
        <SearchTable
          currentSeason={season}
          filteredData={filteredData}
          search={search}
          setSearch={setSearch}
          items={items}
          isLoading={isLoading}
        />
      </div>
    </>
  );
}
