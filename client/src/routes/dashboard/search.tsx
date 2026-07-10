import { Button } from '@/components/ui/button';
import CategoryPicker from '@/components/search/CategoryPicker';
import { useEffect, useState } from 'react';
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

  const trackers = getTrackerOptions(
    Boolean(settingsData?.kinozalUsername && settingsData?.kinozalPassword),
  );

  const handleSearch = async (
    nextCategory: number = category,
    nextTracker: string = tracker,
  ) => {
    if (tvName.length === 0) return;
    try {
      setIsLoading(true);
      const data = await getJackett(
        tvName,
        parseInt(season as string),
        nextCategory,
        nextTracker,
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
    queueMicrotask(() => {
      void handleSearch();
    });
    // URL-provided search should run once after the initial render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCategoryChange = (nextCategory: number) => {
    setCategory(nextCategory);
    if (tvName.length > 0) {
      void handleSearch(nextCategory, tracker);
    }
  };

  const handleTrackerChange = (nextTracker: string) => {
    setTracker(nextTracker);
    if (tvName.length > 0) {
      void handleSearch(category, nextTracker);
    }
  };

  const searchFilteredData = filterSearchResults(items, search);

  const filteredData = search.length > 0 ? searchFilteredData : items;

  const resultsByTracker = countResultsByTracker(searchFilteredData);

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
      void handleSearch();
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
      { replace: true },
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
              onClick={() => void handleSearch()}
              disabled={isLoading}
              size={'icon-lg'}
              className='w-14'
              variant={'secondary'}
            >
              <SearchIcon strokeWidth={4} className='w-4 h-4' />
            </Button>
          </ButtonGroup>

          <ButtonGroup className='h-10 mt-5 flex items-center justify-center'>
            <CategoryPicker
              category={category}
              setCategory={handleCategoryChange}
            />
            <Separator orientation='vertical' className='flex mx-2  h-10' />
            <TrackerPicker
              tracker={tracker}
              setTracker={handleTrackerChange}
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

type TrackerOption = {
  value: string;
  label: string;
};

function getTrackerOptions(includeKinozal: boolean): TrackerOption[] {
  const defaultTrackers = [
    { value: 'all', label: 'All' },
    { value: 'rutracker', label: 'Rutracker' },
    { value: 'noname-club', label: 'NNM-Club' },
  ];

  return includeKinozal
    ? [...defaultTrackers, { value: 'kinozal', label: 'Kinozal' }]
    : defaultTrackers;
}

function filterSearchResults(
  items: JackettSearchResult[],
  search: string,
): JackettSearchResult[] {
  const phrases = search.toLowerCase().split(' ');

  return items.filter((item) => {
    if (item.Title.match(/S\d+-\d+/i)) return false;

    return phrases.every(
      (phrase) => !phrase.length || item.Title.toLowerCase().includes(phrase),
    );
  });
}

function countResultsByTracker(
  items: JackettSearchResult[],
): Record<string, number> {
  if (items.length === 0) return {};

  const trackerCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.TrackerId] = (counts[item.TrackerId] || 0) + 1;
    return counts;
  }, {});

  return {
    all: items.length,
    ...trackerCounts,
  };
}
