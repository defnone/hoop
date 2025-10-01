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
    if (items.length > 0) {
      setFilteredData(items);
    }
  }, [items]);

  useEffect(() => {
    if (!items || items.length === 0) return;
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
          Make sure you have properly configured rutracker.org, nnm-club and
          kinozal.tv in Jackett.
        </p>
        <div className='flex flex-col w-full max-w-[1000px]'>
          <div className='flex flex-row w-full gap-2'>
            <Input
              disabled={isLoading}
              placeholder='TV Show Name'
              autoFocus
              value={tvName}
              onChange={(e) => setTvName(e.target.value)}
              onKeyDown={handleEnter}
            />
            <Input
              disabled={isLoading}
              className='w-40'
              type='number'
              placeholder='Season'
              value={season}
              onChange={(e) =>
                setSeason(e.target.value === '' ? '' : Number(e.target.value))
              }
              onKeyDown={handleEnter}
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              <SearchIcon className='w-4 h-4' />
            </Button>
          </div>
          <div className='flex flex-row w-full gap-2 h-10 mb-5'>
            <CategoryPicker category={category} setCategory={setCategory} />
            <Separator orientation='vertical' className='flex mx-2 mt-3.5' />
            <TrackerPicker
              tracker={tracker}
              setTracker={setTracker}
              trackers={trackers}
            />
          </div>
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
