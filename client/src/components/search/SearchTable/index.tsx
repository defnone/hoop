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
}: {
  filteredData: JackettSearchResult[];
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  items: JackettSearchResult[];
  isLoading: boolean;
}) {
  return (
    <>
      <SearchTopBar
        isLoading={isLoading}
        search={search}
        setSearch={setSearch}
      />
      <SearchDataTable
        isLoading={isLoading}
        data={items.length > 0 ? filteredData : []}
      />
    </>
  );
}
