import { SearchTopBar } from './SearchSearchBar';
import { SearchDataTable } from './SearchDataTable';
import { Dispatch, SetStateAction } from 'react';
import { JackettSearchResult } from '@/types/search';

export default function SearchTable({
  filteredData,
  search,
  setSearch,
  items,
  isLoading,
  currentSeason,
}: {
  filteredData: JackettSearchResult[];
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  items: JackettSearchResult[];
  isLoading: boolean;
  currentSeason: number | string;
}) {
  return (
    <>
      <SearchTopBar
        isLoading={isLoading}
        search={search}
        setSearch={setSearch}
        currentSeason={currentSeason}
      />
      <SearchDataTable
        isLoading={isLoading}
        data={items.length > 0 ? filteredData : []}
      />
    </>
  );
}
