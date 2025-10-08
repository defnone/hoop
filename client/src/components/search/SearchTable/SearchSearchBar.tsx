import { Input } from '@/components/ui/input';
import { ListFilter } from 'lucide-react';
import { Dispatch, SetStateAction } from 'react';

interface SearchSearchBarProps {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  isLoading: boolean;
}

export function SearchTopBar({
  search,
  setSearch,
  isLoading,
}: SearchSearchBarProps) {
  return (
    <div className='flex items-center pt-5 w-full'>
      <div className='flex items-center gap-2 w-full'>
        <div className='relative'>
          <Input
            disabled={isLoading}
            placeholder='Filter by title (or part of it)'
            className='w-64 rounded-md pl-8'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ListFilter
            size={16}
            className='absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground'
          />
        </div>
      </div>

      <div className='flex items-center gap-2'></div>
    </div>
  );
}
