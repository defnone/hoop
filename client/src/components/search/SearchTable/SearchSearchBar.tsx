import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ArrowLeft, Eraser, ListFilter } from 'lucide-react';
import { Dispatch, SetStateAction, useEffect } from 'react';

interface SearchSearchBarProps {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  isLoading: boolean;
  currentSeason: number | string;
}

export function SearchTopBar({
  search,
  setSearch,
  isLoading,
  currentSeason,
}: SearchSearchBarProps) {
  const handleQualityChange = (prev: string, q: string) => {
    if (prev.match(/\s?\d{3,4}p\s?/i)) {
      return prev.trim().replace(/\d{3,4}p/i, `${q}`);
    } else {
      return prev.trim() + ` ${q}`;
    }
  };

  const inputQualityMatch = (q: number) => {
    return search.match(new RegExp(`\\s?${q}p\\s?`, 'i')) ? true : false;
  };

  useEffect(() => {
    if (search.match(/S\d+/i) && currentSeason)
      setSearch((prev) => prev.replace(/S\d+/i, `S${currentSeason}`));
  }, [currentSeason]);

  return (
    <div className='flex items-center pt-7 w-full'>
      <div className='flex items-center gap-2 w-full'>
        <ButtonGroup className='relative flex'>
          <InputGroup className='w-72 rounded-md h-10'>
            <InputGroupAddon align={'inline-start'}>
              <ListFilter className='h-3 w-3' />
            </InputGroupAddon>
            <InputGroupInput
              disabled={isLoading}
              placeholder='Filter by title (or part of it)'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Button
            size={'icon-lg'}
            variant={'outline'}
            onClick={() => setSearch('')}>
            <Eraser strokeWidth={3} className='w-4 h-4 text-zinc-400' />
          </Button>
        </ButtonGroup>

        <ArrowLeft strokeWidth={3} className='w-4 h-4 ml-2 text-zinc-400' />

        <ButtonGroup className='h-10 flex items-center justify-center ml-2'>
          {currentSeason && (
            <Button
              variant={'outline'}
              size={'lg'}
              onClick={() =>
                setSearch((prev) => `S${currentSeason} ${prev.trim()}`)
              }
              disabled={(search.match(/S\d+/i) ? true : false) || isLoading}>
              S{currentSeason}
            </Button>
          )}
          <Button
            variant={'outline'}
            size={'lg'}
            onClick={() =>
              setSearch((prev) => handleQualityChange(prev, '720p'))
            }
            disabled={inputQualityMatch(720)}>
            720p
          </Button>
          <Button
            variant={'outline'}
            size={'lg'}
            onClick={() =>
              setSearch((prev) => handleQualityChange(prev, '1080p'))
            }
            disabled={inputQualityMatch(1080)}>
            1080p
          </Button>
          <Button
            variant={'outline'}
            size={'lg'}
            onClick={() =>
              setSearch((prev) => handleQualityChange(prev, '2160p'))
            }
            disabled={inputQualityMatch(2160)}>
            2160p
          </Button>
        </ButtonGroup>
      </div>

      <div className='flex items-center gap-2 mr-auto'></div>
    </div>
  );
}
