import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TorrentState } from '@ctrl/shared-torrent';
import type { TorrentClientItemDto } from '@server/external/adapters/transmission';
import TransmissionSheet from './TransmissionSheet';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const longTorrentName =
  'This.is.a.very.long.torrent.name.that.must.stay.inside.the.sheet.and.keep.its.padding.mkv';

const { actionPutMock, getTorrentsMock } = vi.hoisted(() => ({
  actionPutMock: vi.fn(),
  getTorrentsMock: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpc: {
    api: {
      'torrent-client': {
        $get: getTorrentsMock,
        ':id': {
          action: {
            $put: actionPutMock,
          },
        },
      },
    },
  },
}));

vi.mock('@/components/CustomSonner', () => ({
  default: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  getTorrentsMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: [
        createTorrent({ name: longTorrentName }),
        createTorrent({
          id: 'fedora',
          name: 'Fedora.iso',
          state: TorrentState.paused,
        }),
      ],
    }),
  });
  actionPutMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      message: 'Tracker request sent',
    }),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('TransmissionSheet', () => {
  it('loads and displays Transmission transfers when opened', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TransmissionSheet />
        </QueryClientProvider>,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open Transmission transfers"]',
    );
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    expect(getTorrentsMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain(longTorrentName);
      });
    });
    expect(document.body.textContent).toContain('50%');
    expect(document.body.textContent).toContain('512 B of 1.0 KB (50%)');
    const torrentRow = document.body.querySelector<HTMLElement>(
      '[data-torrent-state="downloading"]',
    );
    expect(torrentRow?.className).toContain('bg-transfer-row');
    expect(torrentRow?.className).toContain('max-w-full');
    expect(torrentRow?.className).toContain('overflow-hidden');
    expect(torrentRow?.querySelector('p')?.className).toContain(
      'text-transfer-downloading',
    );
    expect(
      torrentRow?.querySelector<HTMLElement>('[data-slot="progress-indicator"]')
        ?.className,
    ).toContain('bg-transfer-downloading');
    expect(
      document.body.querySelector<HTMLElement>('[data-torrent-state="paused"]')
        ?.className,
    ).toContain('bg-transfer-row-alternate');
    expect(
      document.body.querySelector(
        `[aria-label="Pause transfer ${longTorrentName}"]`,
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector('[aria-label="Resume transfer Fedora.iso"]'),
    ).not.toBeNull();
    expect(torrentRow?.textContent).toContain('1.0 KB/s');
    expect(torrentRow?.textContent).toContain('0 B/s');
    expect(torrentRow?.textContent).toContain('From 2 peers');
    expect(torrentRow?.textContent).toContain('To 1 peer');
    const pausedTorrentRow = document.body.querySelector<HTMLElement>(
      '[data-torrent-state="paused"]',
    );
    expect(pausedTorrentRow?.textContent).not.toContain('From ');
    expect(pausedTorrentRow?.textContent).not.toContain('To ');

    const pauseButton = document.body.querySelector<HTMLButtonElement>(
      `[aria-label="Pause transfer ${longTorrentName}"]`,
    );
    await act(async () => {
      pauseButton?.click();
      await vi.waitFor(() => {
        expect(actionPutMock).toHaveBeenCalledWith({
          param: { id: 'hash' },
          json: { action: 'pause' },
        });
      });
    });
  });
});

function createTorrent(
  override: Partial<TorrentClientItemDto> = {},
): TorrentClientItemDto {
  return {
    id: 'hash',
    name: 'Ubuntu.iso',
    progress: 0.5,
    isCompleted: false,
    ratio: 0,
    dateAdded: '2026-06-27T00:00:00.000Z',
    dateCompleted: null,
    savePath: '/downloads',
    label: null,
    tags: [],
    state: TorrentState.downloading,
    stateMessage: '',
    uploadSpeed: 0,
    downloadSpeed: 1024,
    eta: 120,
    queuePosition: 0,
    connectedSeeds: 1,
    connectedPeers: 2,
    totalSeeds: 3,
    totalPeers: 4,
    totalSelected: 1024,
    totalSize: 1024,
    totalUploaded: 0,
    totalDownloaded: 512,
    ...override,
  };
}
