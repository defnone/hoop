import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CategoryPicker from '@/components/search/CategoryPicker';
import { useEffect, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import SearchTable from '@/components/search/SearchTable';
import customSonner from '@/components/CustomSonner';
import TrackerPicker from '@/components/search/TrackerPicker';
import { Separator } from '@/components/ui/separator';
import { useNavigate, useSearchParams } from 'react-router';
import { getJackett } from '@/lib/getJackett';
import { JackettSearchResult } from '@/types/search';
import useSettings from '@/hooks/useSettings';
import { ButtonGroup } from '@/components/ui/button-group';

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
  const [filteredData, setFilteredData] = useState<JackettSearchResult[]>([]);
  const [isFirstRender, setIsFirstRender] = useState(true);
  const [tracker, setTracker] = useState<string>('all');
  const [resultsByTracker, setResultsByTracker] = useState<
    Record<string, number>
  >({});

  const [trackers, setTrackers] = useState([
    { value: 'all', label: 'All' },
    { value: 'rutracker', label: 'Rutracker' },
    { value: 'noname-club', label: 'NNM-Club' },
  ]);

  useEffect(() => {
    if (tvName.length === 0) return;
    if (isFirstRender) {
      if (searchQuery) {
        setIsFirstRender(false);
        void handleSearch();
        return;
      }
      setIsFirstRender(false);
      return;
    }
    handleSearch();
  }, [category, tracker]);

  useEffect(() => {
    if (!items || items.length === 0) {
      setResultsByTracker({});
      setFilteredData([]);
      return;
    }
    setResultsByTracker(
      items.reduce(
        (acc: Record<string, number>, item) => {
          acc[item.TrackerId] = (acc[item.TrackerId] || 0) + 1;
          return acc;
        },
        { all: items.length }
      )
    );
    setFilteredData(items);
    const filtered = items.filter((item) =>
      item.Title.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredData(filtered);
  }, [search, items]);

  useEffect(() => {
    void refetchSettings();
    if (isLoadingSettings) return;

    if (!settingsData?.jackettUrl) {
      customSonner({
        variant: 'error',
        text: 'Looks like Jackett is not configured',
        description: 'Please configure Jackett in the settings.',
        delayDuration: 10000,
      });

      router('/settings');
      return;
    }

    const isKinozalInMenu = trackers.some(
      (tracker) => tracker.value === 'kinozal'
    );

    if (
      settingsData?.kinozalUsername &&
      settingsData?.kinozalPassword &&
      !isKinozalInMenu
    ) {
      setTrackers([...trackers, { value: 'kinozal', label: 'Kinozal' }]);
    }
  }, [settingsData, trackers]);

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
      setIsFirstRender(false);
    } catch (error) {
      customSonner({
        variant: 'error',
        text: 'Error while searching',
        description: 'Please check your Jackett configuration. ' + error,
      });
      setIsLoading(false);
    }
  };

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
            <Input
              disabled={isLoading}
              placeholder='TV Show Name'
              autoFocus
              value={tvName}
              className='w-full'
              onChange={(e) => setTvName(e.target.value)}
              onKeyDown={handleEnter}
            />
            {filteredData.length > 0 && (
              <div className='absolute top-1 right-55 h-8 bg-muted px-3 rounded-md flex items-center gap-2 text-sm text-white z-20'>
                {`${filteredData.length} results`}
              </div>
            )}

            <Input
              disabled={isLoading}
              className='w-40 max-w-40'
              type='number'
              placeholder='Season'
              value={season}
              onChange={(e) =>
                setSeason(e.target.value === '' ? '' : Number(e.target.value))
              }
              onKeyDown={handleEnter}
            />
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
