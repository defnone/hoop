import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TorrentState } from '@ctrl/shared-torrent';
import type { TorrentClientItemDto } from '@server/external/adapters/torrent-client';
import TorrentClientSheet, {
  RemoveTorrentDialog,
  type TorrentRemovalRequest,
} from './TorrentClientSheet';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const longTorrentName =
  'This.is.a.very.long.torrent.name.that.must.stay.inside.the.sheet.and.keep.its.padding.mkv';

const { actionPutMock, addTorrentMock, getTorrentsMock, getSettingsMock } =
  vi.hoisted(() => ({
    actionPutMock: vi.fn(),
    addTorrentMock: vi.fn(),
    getTorrentsMock: vi.fn(),
    getSettingsMock: vi.fn(),
  }));

vi.mock('@/lib/rpc', () => ({
  rpc: {
    api: {
      'torrent-client': {
        $get: getTorrentsMock,
        add: {
          $post: addTorrentMock,
        },
        ':id': {
          action: {
            $put: actionPutMock,
          },
        },
      },
      settings: {
        $get: getSettingsMock,
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
  getSettingsMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: { downloadDir: '/settings/downloads' },
    }),
  });
  addTorrentMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      message: 'Torrent added to client',
    }),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('TorrentClientSheet', () => {
  it('keeps transfer caches isolated by client type', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TorrentClientSheet clientType='qbittorrent' />
        </QueryClientProvider>,
      );
    });

    expect(
      queryClient.getQueryState(['torrent-client-transfers', 'qbittorrent']),
    ).toBeDefined();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TorrentClientSheet clientType='transmission' />
        </QueryClientProvider>,
      );
    });

    expect(
      queryClient.getQueryState(['torrent-client-transfers', 'transmission']),
    ).toBeDefined();
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['torrent-client-transfers'] }),
    ).toHaveLength(2);
  });

  it('loads and displays selected client transfers when opened', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TorrentClientSheet clientType='qbittorrent' />
        </QueryClientProvider>,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open qBittorrent transfers"]',
    );
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    expect(getTorrentsMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain(longTorrentName);
        expect(document.body.textContent).toContain('qBittorrent');
        expect(document.body.textContent).toContain('Now');
      });
    });
    expect(document.body.textContent).not.toContain('Average since added');
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
    const title = document.body.querySelector('[data-slot="sheet-title"]');
    const addButton = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="Add download to qBittorrent"]',
    );
    const titleGroup = title?.parentElement;
    expect(titleGroup?.className).toContain('inline-flex');
    expect(titleGroup?.className).toContain('w-fit');
    expect(titleGroup?.className).toContain('max-w-full');
    expect(title?.className).not.toContain('flex-1');
    expect(addButton?.parentElement).toBe(title?.parentElement);
    expect(addButton?.previousElementSibling).toBe(title);
    expect(addButton?.className).toContain('size-8');
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

  it('opens manual add dialog with settings directory and submits a magnet', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TorrentClientSheet clientType='qbittorrent' />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open qBittorrent transfers"]',
        )
        ?.click();
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(
          document.body.querySelector(
            '[aria-label="Add download to qBittorrent"]',
          ),
        ).not.toBeNull();
      });
    });

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>(
          '[aria-label="Add download to qBittorrent"]',
        )
        ?.click();
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(
          document.body.querySelector<HTMLInputElement>(
            '#torrent-download-directory',
          )?.value,
        ).toBe('/settings/downloads');
      });
    });

    const magnetInput =
      document.body.querySelector<HTMLInputElement>('#magnet-link');
    expect(magnetInput).not.toBeNull();
    await act(async () => {
      if (!magnetInput) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(magnetInput, 'magnet:?xt=urn:btih:0123456789abcdef');
      magnetInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      const addButton = Array.from(
        document.body.querySelectorAll('button'),
      ).find((button) => button.textContent?.includes('Add download'));
      addButton?.click();
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(addTorrentMock).toHaveBeenCalledWith({
          form: {
            magnet: 'magnet:?xt=urn:btih:0123456789abcdef',
            downloadDir: '/settings/downloads',
          },
        });
      });
    });
  });

  it('keeps torrent client sheet open when manual add dialog is cancelled', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TorrentClientSheet clientType='qbittorrent' />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open qBittorrent transfers"]',
        )
        ?.click();
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(
          document.body.querySelector(
            '[aria-label="Add download to qBittorrent"]',
          ),
        ).not.toBeNull();
      });
    });

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>(
          '[aria-label="Add download to qBittorrent"]',
        )
        ?.click();
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain(
          'Add download to qBittorrent',
        );
      });
    });

    const cancelButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.trim() === 'Cancel');
    expect(cancelButton).not.toBeUndefined();
    await act(async () => {
      if (cancelButton) clickWithPointer(cancelButton);
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(document.body.textContent).not.toContain(
          'Add download to qBittorrent',
        );
      });
    });
    expect(
      document.body.querySelector('[data-slot="sheet-content"]'),
    ).not.toBeNull();

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>(
          '[aria-label="Add download to qBittorrent"]',
        )
        ?.click();
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain(
          'Add download to qBittorrent',
        );
      });
    });

    const dialogCloseButton = document.body.querySelector<HTMLButtonElement>(
      '[data-slot="dialog-close"]',
    );
    expect(dialogCloseButton).not.toBeNull();
    await act(async () => {
      if (dialogCloseButton) clickWithPointer(dialogCloseButton);
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(document.body.textContent).not.toContain(
          'Add download to qBittorrent',
        );
      });
    });
    expect(
      document.body.querySelector('[data-slot="sheet-content"]'),
    ).not.toBeNull();
  });
});

describe('RemoveTorrentDialog', () => {
  it('keeps destructive copy while the dialog closes', async () => {
    const request: TorrentRemovalRequest = {
      torrent: createTorrent(),
      deleteData: true,
    };

    await act(async () => {
      root.render(
        <RemoveTorrentDialog
          request={request}
          isPending={false}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          clientName='qBittorrent'
        />,
      );
    });
    expect(document.body.textContent).toContain('Remove Torrent and Data?');

    await act(async () => {
      root.render(
        <RemoveTorrentDialog
          request={null}
          isPending={false}
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          clientName='qBittorrent'
        />,
      );
    });
    expect(document.body.textContent).not.toContain('Remove Torrent?');
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
    peersSendingToUs: 2,
    peersGettingFromUs: 1,
    totalSeeds: 3,
    totalPeers: 4,
    totalSelected: 1024,
    totalSize: 1024,
    totalUploaded: 0,
    totalDownloaded: 512,
    ...override,
  };
}

function clickWithPointer(button: HTMLButtonElement): void {
  button.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
  );
  button.dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, button: 0 }),
  );
  button.click();
}
