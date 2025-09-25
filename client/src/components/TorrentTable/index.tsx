import { TorrentTopBar } from './TorrentTableTopBar';
import { TorrentTableData } from './TorrentTableData';
import { useEffect } from 'react';
import { TorrentTableSkeleton } from './TorrentTableSkeleton';
import { useTorrentStore } from '@/stores/torrentStore';
import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/rpc';
import customSonner from '@/components/CustomSonner';

export default function TorrentTable() {
  const startFetch = useTorrentStore((state) => state.startFetch);
  const search = useTorrentStore((state) => state.search);
  const setFilteredData = useTorrentStore((state) => state.setFilteredData);
  const setItems = useTorrentStore((state) => state.setItems);
  const setStatus = useTorrentStore((state) => state.setStatus);
  const items = useTorrentStore((state) => state.items);
  const setLastSync = useTorrentStore((state) => state.setLastSync);

  const {
    data: dataResponse,
    isLoading,
    refetch,
    error,
  } = useQuery({
    queryKey: ['torrents'],
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () =>
      (
        await rpc.api.torrents.$get({ query: { page: '1', limit: '1000' } })
      ).json(),
  });

  useEffect(() => {
    if (dataResponse?.data?.items) {
      setItems(dataResponse.data.items);
    }
    if (dataResponse?.data?.status) {
      setStatus(dataResponse?.data?.status);
    }
    if (dataResponse?.data?.lastSync) {
      setLastSync(dataResponse?.data?.lastSync);
    }
  }, [dataResponse]);

  // Search filter
  useEffect(() => {
    if (!items || items.length === 0) {
      setFilteredData([]);
      return;
    }
    setFilteredData(
      items.filter((item) =>
        item.title.toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [search, items]);

  // Manual refetch on external trigger without changing the key
  useEffect(() => {
    if (startFetch) {
      void refetch();
    }
  }, [startFetch, refetch]);

  useEffect(() => {
    if (error) {
      customSonner({
        variant: 'error',
        text: error.message || 'An error occurred',
        delayDuration: 8000,
      });
    }
  }, [error]);

  return (
    <>
      <TorrentTopBar />
      {isLoading && !dataResponse && <TorrentTableSkeleton />}
      {dataResponse && <TorrentTableData />}
    </>
  );
}
