import { TorrentItemDto } from '@server/features/torrent-item/torrent-item.types';
import { create } from 'zustand';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';

type torrentStore = {
  items: TorrentItemDto[];
  setItems: (items: TorrentItemDto[]) => void;
  status: Record<
    string,
    {
      data: NormalizedTorrent | undefined;
    }
  >;
  setStatus: (
    status: Record<
      string,
      {
        data: NormalizedTorrent | undefined;
      }
    >
  ) => void;
  startFetch: number;
  setStartFetch: (startFetch: number) => void;
  openId: number | null;
  setOpenId: (openId: number | null) => void;
  search: string;
  setSearch: (search: string) => void;
  filteredData: TorrentItemDto[];
  setFilteredData: (filteredData: TorrentItemDto[]) => void;
  lastSync: string | null;
  setLastSync: (lastSync: string) => void;
};

export const useTorrentStore = create<torrentStore>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  status: {},
  setStatus: (status) => set({ status }),
  startFetch: 0,
  setStartFetch: (startFetch) => set({ startFetch }),
  openId: null,
  setOpenId: (openId) => set({ openId }),
  search: '',
  setSearch: (search) => set({ search }),
  filteredData: [],
  setFilteredData: (filteredData) => set({ filteredData }),
  lastSync: null,
  setLastSync: (lastSync) => set({ lastSync }),
}));
