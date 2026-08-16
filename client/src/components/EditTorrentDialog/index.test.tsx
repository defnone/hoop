import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TorrentItemDto } from '@server/features/torrent-item/torrent-item.types';
import EditTorrentDialog from './index';
import { useTorrentStore } from '@/stores/torrentStore';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type SettingsData = {
  torrentClientType: 'transmission' | 'qbittorrent';
  botToken: string | null;
  telegramId: number | null;
};

const { navigateMock, useSettingsMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useSettingsMock: vi.fn<() => { settingsData: SettingsData | null }>(),
}));

vi.mock('@/hooks/useSettings', () => ({
  default: useSettingsMock,
}));

vi.mock('@/lib/rpc', () => ({
  rpc: {},
}));

vi.mock('@/components/CustomSonner', () => ({
  default: vi.fn(),
}));

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  useSettingsMock.mockReturnValue({
    settingsData: {
      torrentClientType: 'qbittorrent',
      botToken: null,
      telegramId: null,
    },
  });
  useTorrentStore.setState({ items: [createTorrent()] });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useTorrentStore.setState({ items: [] });
  vi.clearAllMocks();
});

describe('EditTorrentDialog', () => {
  it('uses configured torrent client name in add action', async () => {
    await act(async () => {
      root.render(
        <EditTorrentDialog
          id={1}
          openId={1}
          dialogOpen={true}
          setDialogOpen={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain('Add to qBittorrent');
    expect(document.body.textContent).not.toContain('Add to Transmission');
  });
});

function createTorrent(
  overrides: Partial<TorrentItemDto> = {},
): TorrentItemDto {
  return {
    id: 1,
    trackerId: 'tracker-id',
    tracker: 'tracker',
    title: 'Example torrent',
    rawTitle: 'Example torrent raw title',
    url: 'https://example.com/torrent',
    files: [],
    season: 1,
    haveEpisodes: [],
    totalEpisodes: 1,
    trackedEpisodes: [1],
    magnet: 'magnet:?xt=urn:btih:example',
    errorMessage: null,
    notifyOnTitleChange: false,
    notifyOnMagnetChange: false,
    notifyOnDownloadComplete: true,
    controlStatus: 'idle',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}
