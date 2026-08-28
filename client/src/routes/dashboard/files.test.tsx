import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserRouter,
  MemoryRouter,
  useLocation,
  useNavigationType,
  useNavigate,
} from 'react-router';
import {
  FILE_LIST_GRID_TEMPLATE,
  FILE_MANAGER_VIEW_MODE_STORAGE_KEY,
} from '@/components/file-manager/constants';
import FileManager from './files';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const {
  customSonnerMock,
  listMock,
  copyMock,
  moveMock,
  deleteMock,
  renameMock,
  renameBatchMock,
  directoryMock,
  sizesMock,
} = vi.hoisted(() => ({
  customSonnerMock: vi.fn(),
  listMock: vi.fn(),
  copyMock: vi.fn(),
  moveMock: vi.fn(),
  deleteMock: vi.fn(),
  renameMock: vi.fn(),
  renameBatchMock: vi.fn(),
  directoryMock: vi.fn(),
  sizesMock: vi.fn(),
}));

vi.mock('@/components/CustomSonner', () => ({
  default: customSonnerMock,
}));

vi.mock('@/lib/rpc', () => ({
  rpc: {
    api: {
      'file-manager': {
        $get: listMock,
        $delete: deleteMock,
        copy: { $post: copyMock },
        move: { $post: moveMock },
        rename: { $post: renameMock },
        'rename-batch': { $post: renameBatchMock },
        directory: { $post: directoryMock },
        sizes: { $post: sizesMock },
      },
    },
  },
}));

let container: HTMLDivElement;
let root: Root;
let storageMock: Storage;
let browserHistoryBaseline: { length: number; url: string };

beforeEach(() => {
  browserHistoryBaseline = {
    length: window.history.length,
    url: getBrowserUrl(),
  };
  const values = new Map<string, string>();
  storageMock = {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    },
    removeItem: (key: string): void => {
      values.delete(key);
    },
    clear: (): void => {
      values.clear();
    },
    key: (index: number): string | null => [...values.keys()][index] ?? null,
    get length(): number {
      return values.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storageMock,
  });
  storageMock.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  listMock.mockImplementation(() =>
    Promise.resolve(
      jsonResponse({
        success: true,
        data: {
          root: 'media',
          path: '',
          entries: [
            {
              name: 'Silo',
              path: 'Silo',
              type: 'directory',
              size: null,
              modifiedAt: '2026-08-25T10:00:00.000Z',
              permissions: { readWrite: true, rename: true },
              isTorrentLinked: false,
            },
            {
              name: 'Episode 01.mkv',
              path: 'Episode 01.mkv',
              type: 'file',
              size: 1_500_000_000,
              modifiedAt: '2026-08-25T09:00:00.000Z',
              permissions: { readWrite: true, rename: true },
              isTorrentLinked: false,
            },
            {
              name: 'Episode 02.mkv',
              path: 'Episode 02.mkv',
              type: 'file',
              size: 1_600_000_000,
              modifiedAt: '2026-08-25T08:00:00.000Z',
              permissions: { readWrite: true, rename: true },
              isTorrentLinked: false,
            },
            {
              name: 'Episode 03.mkv',
              path: 'Episode 03.mkv',
              type: 'file',
              size: 1_700_000_000,
              modifiedAt: '2026-08-25T07:00:00.000Z',
              permissions: { readWrite: true, rename: true },
              isTorrentLinked: false,
            },
          ],
        },
      }),
    ),
  );
  copyMock.mockResolvedValue(jsonResponse({ success: true, data: null }));
  moveMock.mockResolvedValue(jsonResponse({ success: true, data: null }));
  deleteMock.mockResolvedValue(jsonResponse({ success: true, data: null }));
  renameMock.mockResolvedValue(jsonResponse({ success: true, data: null }));
  renameBatchMock.mockResolvedValue(jsonResponse({ success: true, data: [] }));
  directoryMock.mockResolvedValue(jsonResponse({ success: true, data: null }));
  sizesMock.mockResolvedValue(jsonResponse({ success: true, data: [] }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  const addedEntries = window.history.length - browserHistoryBaseline.length;
  if (addedEntries > 0) {
    window.history.go(-addedEntries);
    await waitForHistoryUpdate();
  }
  window.history.replaceState(null, '', browserHistoryBaseline.url);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('FileManager', () => {
  it('renders configured locations and directory entries', async () => {
    await renderFileManager();

    expect(container.textContent).toContain('Media');
    expect(container.textContent).toContain('Downloads');
    expect(container.textContent).toContain('Silo');
    expect(container.textContent).toContain('Episode 01.mkv');
    expect(container.textContent).toContain('4 items');
  });

  it('initializes view mode from persisted storage and survives remount', async () => {
    window.localStorage.setItem(FILE_MANAGER_VIEW_MODE_STORAGE_KEY, 'list');
    await renderFileManager();

    expect(container.querySelector('[data-testid="file-list"]')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await renderFileManager();

    expect(
      window.localStorage.getItem(FILE_MANAGER_VIEW_MODE_STORAGE_KEY),
    ).toBe('list');
    expect(container.querySelector('[data-testid="file-list"]')).not.toBeNull();
  });

  it('writes view mode changes to namespaced storage key', async () => {
    await renderFileManager();
    const listButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="List view"]',
    );
    const gridButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Grid view"]',
    );

    await act(async () => listButton?.click());
    expect(
      window.localStorage.getItem(FILE_MANAGER_VIEW_MODE_STORAGE_KEY),
    ).toBe('list');
    await act(async () => gridButton?.click());
    expect(
      window.localStorage.getItem(FILE_MANAGER_VIEW_MODE_STORAGE_KEY),
    ).toBe('grid');
  });

  it('falls back to grid for invalid persisted view mode', async () => {
    window.localStorage.setItem(FILE_MANAGER_VIEW_MODE_STORAGE_KEY, 'columns');
    await renderFileManager();

    expect(container.querySelector('[data-testid="file-list"]')).toBeNull();
    expect(
      window.localStorage.getItem(FILE_MANAGER_VIEW_MODE_STORAGE_KEY),
    ).toBe('columns');
  });

  it('keeps view mode functional when storage access fails', async () => {
    const getItemSpy = vi
      .spyOn(storageMock, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('Storage unavailable', 'SecurityError');
      });
    const setItemSpy = vi
      .spyOn(storageMock, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Storage unavailable', 'SecurityError');
      });

    await renderFileManager();
    expect(container.querySelector('[data-testid="file-list"]')).toBeNull();
    const listButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="List view"]',
    );
    await act(async () => listButton?.click());
    expect(container.querySelector('[data-testid="file-list"]')).not.toBeNull();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('selects a contiguous range with Shift-click', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const last = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 03.mkv"]',
    );

    await act(async () => first?.click());
    expect(first?.getAttribute('aria-pressed')).toBe('true');
    await act(async () =>
      last?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, shiftKey: true }),
      ),
    );

    expect(
      container.querySelectorAll('[data-file-item][data-selected="true"]'),
    ).toHaveLength(3);
  });

  it('shows selected count and total size in status bar', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    expect(
      container.querySelector('[data-testid="file-manager-status"]')
        ?.textContent,
    ).toBe('1 item selected · 1.4 GB');

    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    expect(
      container.querySelector('[data-testid="file-manager-status"]')
        ?.textContent,
    ).toBe('2 items selected · 2.9 GB');
  });

  it('shows selected directory calculation progress and final total', async () => {
    listMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            root: 'media',
            path: '',
            entries: [
              {
                name: 'Series',
                path: 'Series',
                type: 'directory',
                size: null,
                modifiedAt: '2026-08-25T10:00:00.000Z',
                permissions: { readWrite: true, rename: true },
                isTorrentLinked: false,
              },
            ],
          },
        }),
      ),
    );
    const deferredSizes = createDeferred<Response>();
    sizesMock.mockReturnValueOnce(deferredSizes.promise);

    await renderFileManager();
    const series = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Series"]',
    );
    await act(async () => series?.click());
    expect(
      container.querySelector('[data-testid="file-manager-status"]')
        ?.textContent,
    ).toBe('1 item selected · Calculating…');

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    });
    expect(sizesMock).toHaveBeenCalledTimes(1);
    deferredSizes.resolve(
      jsonResponse({
        success: true,
        data: [
          {
            root: 'media',
            path: 'Series',
            size: 3_000_000_000,
            status: 'ready',
            calculatedAt: '2026-08-27T10:00:00.000Z',
          },
        ],
      }),
    );
    await act(async () => {
      await deferredSizes.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="file-manager-status"]')
        ?.textContent,
    ).toBe('1 item selected · 2.8 GB');
  });

  it('toggles individual selection with Cmd/Ctrl-click', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    expect(first?.getAttribute('aria-pressed')).toBe('true');
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    expect(second?.getAttribute('aria-pressed')).toBe('true');
    expect(
      container.querySelectorAll('[data-file-item][data-selected="true"]'),
    ).toHaveLength(2);

    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    expect(second?.getAttribute('aria-pressed')).toBe('false');
    expect(
      container.querySelectorAll('[data-file-item][data-selected="true"]'),
    ).toHaveLength(1);
  });

  it('selects intersecting items with a drag marquee', async () => {
    await renderFileManager();
    const items = [
      'Silo',
      'Episode 01.mkv',
      'Episode 02.mkv',
      'Episode 03.mkv',
    ].map((name, index) => {
      const item = container.querySelector<HTMLButtonElement>(
        `button[aria-label="${name}"]`,
      );
      if (!item) throw new Error(`Missing item ${name}`);
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
        x: index * 120,
        y: 0,
        left: index * 120,
        top: 0,
        right: index * 120 + 100,
        bottom: 90,
        width: 100,
        height: 90,
        toJSON: () => ({}),
      });
      return item;
    });
    const content = container.querySelector<HTMLDivElement>(
      '[data-testid="file-content"]',
    );
    expect(content).not.toBeNull();
    vi.spyOn(
      content as HTMLDivElement,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 600,
      bottom: 500,
      width: 600,
      height: 500,
      toJSON: () => ({}),
    });

    await act(async () => {
      content?.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        }),
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: 335,
          clientY: 80,
        }),
      );
    });
    expect(
      document.body.querySelector('[data-testid="selection-marquee"]'),
    ).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
          clientX: 335,
          clientY: 80,
        }),
      );
      content?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(items).toHaveLength(4);
    expect(
      container.querySelectorAll('[data-file-item][data-selected="true"]'),
    ).toHaveLength(3);
  });

  it('does not start marquee from toolbar controls', async () => {
    await renderFileManager();
    const actions = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Actions'),
    );

    await act(async () => {
      actions?.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        }),
      );
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: 335,
          clientY: 80,
        }),
      );
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          button: 0,
          clientX: 335,
          clientY: 80,
        }),
      );
    });

    expect(
      document.body.querySelector('[data-testid="selection-marquee"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-file-item][data-selected="true"]'),
    ).toHaveLength(0);
  });

  it('opens a folder on double click', async () => {
    await renderFileManager();
    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );

    expect(folder).not.toBeNull();
    await act(async () => {
      folder?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'media', path: 'Silo' },
    });
  });

  it('pushes folder and root navigation into the browser URL', async () => {
    await renderFileManager();
    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    const downloads = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Torrent downloads'),
    );

    await act(async () =>
      folder?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=media&path=Silo');

    await act(async () => downloads?.click());
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=downloads&path=');
  });

  it('restores location when browser history moves back and forward', async () => {
    await renderFileManager();
    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    await act(async () =>
      folder?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );

    const browserBack = container.querySelector<HTMLButtonElement>(
      '[data-testid="browser-back"]',
    );
    await act(async () => {
      browserBack?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files');
    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'media', path: '' },
    });

    const browserForward = container.querySelector<HTMLButtonElement>(
      '[data-testid="browser-forward"]',
    );
    await act(async () => {
      browserForward?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=media&path=Silo');
    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'media', path: 'Silo' },
    });
  });

  it('opens nested location from the initial URL', async () => {
    await renderFileManager('/files?root=downloads&path=Season%201/Part%202');

    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'downloads', path: 'Season 1/Part 2' },
    });
  });

  it('falls back to media for an invalid URL root', async () => {
    await renderFileManager('/files?root=archive&path=Season%201');

    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'media', path: 'Season 1' },
    });
  });

  it('treats external state-less navigation as a terminal history entry', async () => {
    await renderFileManager();
    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    await act(async () => {
      folder?.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
      );
      await waitForHistoryUpdate();
    });
    const downloads = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Torrent downloads'),
    );
    await act(async () => {
      downloads?.click();
      await waitForHistoryUpdate();
    });

    const externalNavigation = container.querySelector<HTMLButtonElement>(
      '[data-testid="external-files-navigation"]',
    );
    await act(async () => {
      externalNavigation?.click();
      await waitForHistoryUpdate();
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files');
    const forward = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Forward"]',
    );
    expect(forward?.disabled).toBe(true);

    const browserBack = container.querySelector<HTMLButtonElement>(
      '[data-testid="browser-back"]',
    );
    await act(async () => {
      browserBack?.click();
      await waitForHistoryUpdate();
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=downloads&path=');
    expect(forward?.disabled).toBe(true);

    await act(async () => {
      browserBack?.click();
      await waitForHistoryUpdate();
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=media&path=Silo');
    expect(forward?.disabled).toBe(false);

    const browserForward = container.querySelector<HTMLButtonElement>(
      '[data-testid="browser-forward"]',
    );
    await act(async () => {
      browserForward?.click();
      await waitForHistoryUpdate();
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=downloads&path=');
    expect(forward?.disabled).toBe(true);

    await act(async () => {
      browserForward?.click();
      await waitForHistoryUpdate();
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files');
    expect(forward?.disabled).toBe(true);
  });

  it('keeps indexed forward after an external /files push starts a new segment', async () => {
    await renderFileManager('/files?root=downloads&path=Seed');
    const externalNavigation = container.querySelector<HTMLButtonElement>(
      '[data-testid="external-files-navigation"]',
    );
    await act(async () => {
      externalNavigation?.click();
      await waitForHistoryUpdate();
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    });

    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    await act(async () => {
      folder?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await waitForHistoryUpdate();
    });
    const back = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Back"]',
    );
    await act(async () => {
      back?.click();
      await waitForHistoryUpdate();
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files');

    const forward = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Forward"]',
    );
    expect(forward?.disabled).toBe(false);
    await act(async () => {
      forward?.click();
      await waitForHistoryUpdate();
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=media&path=Silo');
  });

  it('keeps toolbar Back enabled for an external state-less /files entry', async () => {
    await renderFileManager();
    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    await act(async () => {
      folder?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await waitForHistoryUpdate();
    });
    const downloads = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Torrent downloads'),
    );
    await act(async () => {
      downloads?.click();
      await waitForHistoryUpdate();
    });
    const externalNavigation = container.querySelector<HTMLButtonElement>(
      '[data-testid="external-files-navigation"]',
    );
    await act(async () => {
      externalNavigation?.click();
      await waitForHistoryUpdate();
    });

    const back = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Back"]',
    );
    expect(back?.disabled).toBe(false);
    await act(async () => {
      back?.click();
      await waitForHistoryUpdate();
    });
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=downloads&path=');
  });

  it('switches location and pastes a copied item', async () => {
    await renderFileManager();
    const file = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const downloads = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Torrent downloads'),
    );

    await act(async () => file?.click());
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'c', metaKey: true }),
      );
    });
    await act(async () => downloads?.click());
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', metaKey: true }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(copyMock).toHaveBeenCalledWith({
      json: {
        source: { root: 'media', path: 'Episode 01.mkv' },
        destination: { root: 'downloads', path: 'Episode 01.mkv' },
      },
    });
  });

  it('copies every selected item into the clipboard and pastes all items', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );
    const downloads = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Torrent downloads'),
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'c', metaKey: true }),
      );
    });
    await act(async () => downloads?.click());
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', metaKey: true }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(copyMock).toHaveBeenCalledTimes(2);
    expect(copyMock).toHaveBeenNthCalledWith(1, {
      json: {
        source: { root: 'media', path: 'Episode 01.mkv' },
        destination: { root: 'downloads', path: 'Episode 01.mkv' },
      },
    });
    expect(copyMock).toHaveBeenNthCalledWith(2, {
      json: {
        source: { root: 'media', path: 'Episode 02.mkv' },
        destination: { root: 'downloads', path: 'Episode 02.mkv' },
      },
    });
  });

  it.each(['copy', 'move'] as const)(
    'retries only remaining clipboard items after a partial %s paste failure',
    async (operation) => {
      const operationMock = operation === 'move' ? moveMock : copyMock;
      const shortcut = operation === 'move' ? 'x' : 'c';
      operationMock
        .mockResolvedValueOnce(jsonResponse({ success: true, data: null }))
        .mockResolvedValueOnce(
          jsonResponse(
            { success: false, message: 'Destination already exists' },
            409,
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

      await renderFileManager();
      const first = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Episode 01.mkv"]',
      );
      const second = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Episode 02.mkv"]',
      );
      const downloads = [...container.querySelectorAll('button')].find(
        (button) => button.textContent?.includes('Torrent downloads'),
      );

      await act(async () => first?.click());
      await act(async () =>
        second?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, ctrlKey: true }),
        ),
      );
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: shortcut, metaKey: true }),
        );
      });
      await act(async () => {
        downloads?.click();
        await waitForHistoryUpdate();
      });
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'v', metaKey: true }),
        );
        await waitForHistoryUpdate();
      });

      expect(operationMock).toHaveBeenCalledTimes(2);

      await act(async () => {
        await waitForHistoryUpdate();
      });
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'v', metaKey: true }),
        );
        await waitForHistoryUpdate();
      });

      expect(operationMock).toHaveBeenCalledTimes(3);
      expect(operationMock).toHaveBeenNthCalledWith(3, {
        json: {
          source: { root: 'media', path: 'Episode 02.mkv' },
          destination: { root: 'downloads', path: 'Episode 02.mkv' },
        },
      });
    },
  );

  it('requires confirmation before deleting an item', async () => {
    await renderFileManager();
    const file = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );

    await act(async () => file?.click());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(document.body.textContent).toContain('Delete “Episode 01.mkv”?');
    const deleteButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Delete',
    );
    await act(async () => {
      deleteButton?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteMock).toHaveBeenCalledWith({
      json: {
        target: { root: 'media', path: 'Episode 01.mkv' },
      },
    });
  });

  it('requires one confirmation and deletes every selected item', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(document.body.textContent).toContain('Delete 2 items?');
    const deleteButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Delete',
    );
    await act(async () => {
      deleteButton?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenNthCalledWith(1, {
      json: { target: { root: 'media', path: 'Episode 01.mkv' } },
    });
    expect(deleteMock).toHaveBeenNthCalledWith(2, {
      json: { target: { root: 'media', path: 'Episode 02.mkv' } },
    });
  });

  it('retries only remaining items after a partial delete failure', async () => {
    deleteMock
      .mockResolvedValueOnce(jsonResponse({ success: true, data: null }))
      .mockResolvedValueOnce(
        jsonResponse({ success: false, message: 'Item is busy' }, 409),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    const deleteButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Delete',
    );
    await act(async () => {
      deleteButton?.click();
      await waitForHistoryUpdate();
    });

    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('Delete “Episode 02.mkv”?');

    const retryButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Delete',
    );
    await act(async () => {
      retryButton?.click();
      await waitForHistoryUpdate();
    });

    expect(deleteMock).toHaveBeenCalledTimes(3);
    expect(deleteMock).toHaveBeenNthCalledWith(3, {
      json: { target: { root: 'media', path: 'Episode 02.mkv' } },
    });
  });

  it('filters entries and switches to list view', async () => {
    await renderFileManager();
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter files"]',
    );
    const listButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="List view"]',
    );

    await act(async () => {
      listButton?.click();
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(search, 'Episode');
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    expect(container.textContent).not.toContain('Silo');
    expect(container.textContent).toContain('Episode 01.mkv');
    expect(container.textContent).toContain('Modified');
    expect(
      container.querySelector('[data-testid="file-list"]')?.className,
    ).not.toContain('rounded');
  });

  it('selects focused items without a ring and opens directories with Enter', async () => {
    await renderFileManager();
    const gridItem = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    expect(gridItem?.className).not.toContain('focus-visible');
    await act(async () => gridItem?.focus());
    expect(gridItem?.getAttribute('aria-pressed')).toBe('true');
    expect(gridItem?.className).toContain('bg-blue-500/10');

    const listButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="List view"]',
    );
    await act(async () => listButton?.click());
    const listFolder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    expect(listFolder?.className).not.toContain('focus-visible');
    await act(async () => listFolder?.focus());
    expect(listFolder?.getAttribute('aria-pressed')).toBe('true');
    expect(listFolder?.className).toContain('bg-blue-500/10');

    const enterEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    });
    await act(async () => listFolder?.dispatchEvent(enterEvent));

    expect(enterEvent.defaultPrevented).toBe(true);
    await act(async () => waitForHistoryUpdate());
    expect(
      container.querySelector('[data-testid="router-location"]')?.textContent,
    ).toBe('/files?root=media&path=Silo');
  });

  it('wraps grid names and keeps list metadata columns aligned', async () => {
    await renderFileManager();
    const gridItem = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const gridName = gridItem?.querySelector('span');

    expect(gridName?.className).toContain('break-words');
    expect(gridName?.className).not.toContain('truncate');
    expect(gridName?.className).not.toContain('line-clamp');

    const listButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="List view"]',
    );
    await act(async () => listButton?.click());

    const fileList = container.querySelector('[data-testid="file-list"]');
    const header = fileList?.firstElementChild;
    const row = fileList?.querySelector('[data-file-item]');

    expect(header?.className).toContain(FILE_LIST_GRID_TEMPLATE);
    expect(row?.className).toContain(FILE_LIST_GRID_TEMPLATE);
    expect(row?.children[1].className).toContain('whitespace-nowrap');
    expect(row?.children[2].className).toContain('whitespace-nowrap');
  });

  it('marks permission-limited and torrent-linked entries', async () => {
    listMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            root: 'media',
            path: '',
            entries: [
              {
                name: 'Restricted.mkv',
                path: 'Restricted.mkv',
                type: 'file',
                size: null,
                modifiedAt: null,
                permissions: {
                  readWrite: false,
                  rename: false,
                  ownership: {
                    actual: {
                      uid: 2001,
                      gid: 2002,
                      user: 'media-owner',
                      group: 'media-group',
                    },
                    expected: {
                      uid: 1000,
                      gid: 1000,
                      user: 'app-user',
                      group: 'app-group',
                    },
                  },
                },
                isTorrentLinked: false,
              },
              {
                name: 'Linked series',
                path: 'Linked series',
                type: 'directory',
                size: null,
                modifiedAt: '2026-08-25T10:00:00.000Z',
                permissions: { readWrite: true, rename: false },
                isTorrentLinked: true,
              },
            ],
          },
        }),
      ),
    );

    await renderFileManager();

    const restricted = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Restricted.mkv"]',
    );
    const linked = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Linked series"]',
    );
    expect(restricted?.className).toContain('opacity-60');
    expect(
      restricted?.querySelector(
        '[data-testid="file-entry-lock"][aria-label="Permission denied"]',
      ),
    ).not.toBeNull();
    expect(
      linked?.querySelector(
        '[data-testid="file-entry-lock"][aria-label="Permission denied"]',
      ),
    ).toBeNull();
    expect(
      linked?.querySelector(
        '[data-testid="file-entry-lock"][aria-label="Linked to torrent"]',
      ),
    ).not.toBeNull();

    expect(restricted?.getAttribute('aria-label')).toBe(
      'Restricted.mkv. Permission denied. Actual owner: media-owner:media-group (UID:GID 2001:2002). Expected owner: app-user:app-group (UID:GID 1000:1000)',
    );

    const listButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="List view"]',
    );
    await act(async () => listButton?.click());
    const listRestricted = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Restricted.mkv"]',
    );
    expect(listRestricted?.getAttribute('aria-label')).toBe(
      'Restricted.mkv. Permission denied. Actual owner: media-owner:media-group (UID:GID 2001:2002). Expected owner: app-user:app-group (UID:GID 1000:1000)',
    );
  });

  it('loads visible directory sizes in one batch and renders statuses', async () => {
    listMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            root: 'media',
            path: '',
            entries: [
              {
                name: 'Alpha',
                path: 'Alpha',
                type: 'directory',
                size: null,
                modifiedAt: '2026-08-25T10:00:00.000Z',
                permissions: { readWrite: true, rename: true },
                isTorrentLinked: false,
              },
              {
                name: 'Restricted',
                path: 'Restricted',
                type: 'directory',
                size: null,
                modifiedAt: null,
                permissions: { readWrite: true, rename: true },
                isTorrentLinked: false,
              },
              {
                name: 'Huge',
                path: 'Huge',
                type: 'directory',
                size: null,
                modifiedAt: null,
                permissions: { readWrite: true, rename: true },
                isTorrentLinked: false,
              },
              {
                name: 'Unavailable',
                path: 'Unavailable',
                type: 'directory',
                size: null,
                modifiedAt: null,
                permissions: { readWrite: true, rename: true },
                isTorrentLinked: false,
              },
            ],
          },
        }),
      ),
    );
    sizesMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [
          {
            root: 'media',
            path: 'Alpha',
            size: 4_096,
            status: 'ready',
            calculatedAt: '2026-08-27T10:00:00.000Z',
          },
          {
            root: 'media',
            path: 'Restricted',
            size: null,
            status: 'permission-denied',
            calculatedAt: null,
          },
          {
            root: 'media',
            path: 'Huge',
            size: null,
            status: 'too-large',
            calculatedAt: null,
          },
          {
            root: 'media',
            path: 'Unavailable',
            size: null,
            status: 'unavailable',
            calculatedAt: null,
          },
        ],
      }),
    );

    await renderFileManager();
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 120));
    });

    expect(sizesMock).toHaveBeenCalledWith({
      json: {
        locations: [
          { root: 'media', path: 'Alpha' },
          { root: 'media', path: 'Huge' },
          { root: 'media', path: 'Restricted' },
          { root: 'media', path: 'Unavailable' },
        ],
      },
    });
    expect(container.textContent).toContain('4.0 KB');
    expect(
      container.querySelector('[title="Permission denied"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[title="Directory is too large to calculate"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[title="Directory size unavailable"]'),
    ).not.toBeNull();
  });

  it('re-sorts directories when computed sizes arrive', async () => {
    listMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            root: 'media',
            path: '',
            entries: [
              {
                name: 'Alpha',
                path: 'Alpha',
                type: 'directory',
                size: null,
                modifiedAt: '2026-08-25T10:00:00.000Z',
                permissions: { readWrite: true, rename: true },
                isTorrentLinked: false,
              },
              {
                name: 'Beta',
                path: 'Beta',
                type: 'directory',
                size: null,
                modifiedAt: '2026-08-25T09:00:00.000Z',
                permissions: { readWrite: true, rename: true },
                isTorrentLinked: false,
              },
            ],
          },
        }),
      ),
    );
    const deferredSizes = createDeferred<Response>();
    sizesMock.mockReturnValueOnce(deferredSizes.promise);

    await renderFileManager();
    const sortButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sort files"]',
    );
    await act(async () => {
      sortButton?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      sortButton?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const sizeMenuItem = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === 'Size');
    await act(async () => sizeMenuItem?.click());

    expect(getFileItemNames()).toEqual(['Alpha', 'Beta']);
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    });
    deferredSizes.resolve(
      jsonResponse({
        success: true,
        data: [
          {
            root: 'media',
            path: 'Alpha',
            size: 1_000,
            status: 'ready',
            calculatedAt: '2026-08-27T10:00:00.000Z',
          },
          {
            root: 'media',
            path: 'Beta',
            size: 2_000,
            status: 'ready',
            calculatedAt: '2026-08-27T10:00:00.000Z',
          },
        ],
      }),
    );
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(getFileItemNames()).toEqual(['Beta', 'Alpha']);
  });

  it('disables rename for torrent-linked directories in Actions, context menu, and F2', async () => {
    listMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            root: 'media',
            path: '',
            entries: [
              {
                name: 'Linked series',
                path: 'Linked series',
                type: 'directory',
                size: null,
                modifiedAt: '2026-08-25T10:00:00.000Z',
                permissions: { readWrite: true, rename: false },
                isTorrentLinked: true,
              },
            ],
          },
        }),
      ),
    );

    await renderFileManager();
    const linked = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Linked series"]',
    );
    await act(async () => linked?.click());

    const actions = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Actions'),
    );
    await act(async () => {
      actions?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      actions?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const actionsRename = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes('Rename'));
    expect(actionsRename?.getAttribute('aria-disabled')).toBe('true');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      linked?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const contextRename = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes('Rename'));
    expect(contextRename?.getAttribute('aria-disabled')).toBe('true');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });
    expect(
      document.body.querySelector('input[aria-label="New name"]'),
    ).toBeNull();
  });

  it('opens the row context menu and renames an item in list view', async () => {
    await renderFileManager();
    const listButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="List view"]',
    );
    await act(async () => listButton?.click());
    const file = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );

    await act(async () => {
      file?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const renameItem = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes('Rename')) as
      | HTMLElement
      | undefined;
    expect(renameItem).toBeDefined();
    await act(async () => renameItem?.click());

    const nameInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="New name"]',
    );
    expect(nameInput?.value).toBe('Episode 01.mkv');
    await act(async () => {
      if (nameInput) setInputValue(nameInput, 'Renamed Episode.mkv');
    });
    const submit = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rename',
    );
    await act(async () => {
      submit?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(renameMock).toHaveBeenCalledWith({
      json: {
        target: { root: 'media', path: 'Episode 01.mkv' },
        name: 'Renamed Episode.mkv',
      },
    });
  });

  it('keeps context actions consistent between grid and list items', async () => {
    await renderFileManager();
    const expectedActions = ['Copy', 'Cut', 'Paste', 'Rename', 'Delete'];
    const gridItem = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );

    await act(async () => {
      gridItem?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    for (const action of expectedActions) {
      expect(
        [...document.body.querySelectorAll('[role="menuitem"]')].some((item) =>
          item.textContent?.includes(action),
        ),
      ).toBe(true);
    }

    const listButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="List view"]',
    );
    await act(async () => listButton?.click());
    const listItem = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    await act(async () => {
      listItem?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    for (const action of expectedActions) {
      expect(
        [...document.body.querySelectorAll('[role="menuitem"]')].some((item) =>
          item.textContent?.includes(action),
        ),
      ).toBe(true);
    }
  });

  it('moves a cut item through the clipboard', async () => {
    await renderFileManager();
    const file = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const downloads = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Torrent downloads'),
    );

    await act(async () => file?.click());
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'x', ctrlKey: true }),
      );
    });
    await act(async () => downloads?.click());
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(moveMock).toHaveBeenCalledWith({
      json: {
        source: { root: 'media', path: 'Episode 01.mkv' },
        destination: { root: 'downloads', path: 'Episode 01.mkv' },
      },
    });
  });

  it('keeps a move item available for retry after a rolled-back move failure', async () => {
    moveMock
      .mockResolvedValueOnce(
        jsonResponse({ success: false, message: 'Permission denied' }, 422),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    await renderFileManager();
    const file = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const downloads = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Torrent downloads'),
    );

    await act(async () => file?.click());
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'x', ctrlKey: true }),
      );
    });
    await act(async () => downloads?.click());
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(customSonnerMock).toHaveBeenCalledWith({
      variant: 'error',
      text: 'Permission denied',
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(moveMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a published move item after destination-preserved failure', async () => {
    moveMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: false,
            message:
              'Move incomplete; source was not removed and destination was preserved',
            outcome: 'destination-preserved',
          },
          422,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );
    const downloads = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Torrent downloads'),
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'x', ctrlKey: true }),
      );
    });
    await act(async () => downloads?.click());
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
      );
      await waitForHistoryUpdate();
    });

    expect(moveMock).toHaveBeenCalledTimes(1);
    expect(customSonnerMock).toHaveBeenCalledWith({
      variant: 'error',
      text: 'Move incomplete; source was not removed and destination was preserved',
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
      );
      await waitForHistoryUpdate();
    });

    expect(moveMock).toHaveBeenCalledTimes(2);
    expect(moveMock).toHaveBeenNthCalledWith(2, {
      json: {
        source: { root: 'media', path: 'Episode 02.mkv' },
        destination: { root: 'downloads', path: 'Episode 02.mkv' },
      },
    });
  });

  it.each(['move', 'copy'] as const)(
    'shows the backend permission error for %s in an error toast',
    async (operation) => {
      const operationMock = operation === 'move' ? moveMock : copyMock;
      operationMock.mockResolvedValueOnce(
        jsonResponse({ success: false, message: 'Permission denied' }, 422),
      );

      await renderFileManager();
      const file = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Episode 01.mkv"]',
      );
      const downloads = [...container.querySelectorAll('button')].find(
        (button) => button.textContent?.includes('Torrent downloads'),
      );

      await act(async () => file?.click());
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: operation === 'move' ? 'x' : 'c',
            ctrlKey: true,
          }),
        );
      });
      await act(async () => downloads?.click());
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });

      expect(operationMock).toHaveBeenCalledWith({
        json: {
          source: { root: 'media', path: 'Episode 01.mkv' },
          destination: { root: 'downloads', path: 'Episode 01.mkv' },
        },
      });
      expect(customSonnerMock).toHaveBeenCalledWith({
        variant: 'error',
        text: 'Permission denied',
      });
      expect(
        container.querySelector('[data-testid="router-location"]')?.textContent,
      ).toBe('/files?root=downloads&path=');
    },
  );

  it('opens rename with F2 for the selected item', async () => {
    await renderFileManager();
    const file = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );

    await act(async () => file?.click());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });

    const nameInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="New name"]',
    );
    expect(nameInput?.value).toBe('Episode 01.mkv');
    await act(async () => {
      nameInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
      );
    });
    expect(document.body.textContent).not.toContain('Delete “Episode 01.mkv”?');
  });

  it('opens batch rename with F2 for multiple selected items', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });

    expect(
      document.body.querySelector('button[aria-label="Rename mode"]'),
    ).not.toBeNull();
    expect(document.body.querySelectorAll('select[aria-label]')).toHaveLength(
      0,
    );
    expect(document.body.textContent).toContain('Rename 2 items');
  });

  it('changes batch rename mode through the shadcn Select', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });

    const modeTrigger = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Rename mode"]',
    );
    installSelectDomPolyfills();
    await act(async () => {
      modeTrigger?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      modeTrigger?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const addOption = [
      ...document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((option) => option.textContent === 'Add Text');
    expect(addOption).not.toBeUndefined();
    expect(
      [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].some(
        (option) => option.textContent === 'Replace Pattern',
      ),
    ).toBe(true);
    await act(async () => {
      addOption?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      addOption?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(
      document.body.querySelector('input[aria-label="Find text"]'),
    ).toBeNull();
    expect(
      document.body.querySelector('input[aria-label="Text to add"]'),
    ).not.toBeNull();
  });

  it('opens batch rename from a selected item context menu', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      first?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const renameItem = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes('Rename'));
    expect(renameItem?.getAttribute('aria-disabled')).not.toBe('true');
    await act(async () => renameItem?.click());

    expect(document.body.textContent).toContain('Rename 2 items');
    expect(
      document.body.querySelector('button[aria-label="Rename mode"]'),
    ).not.toBeNull();
  });

  it('closes batch rename when browser navigation emits popstate', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });
    expect(
      document.body.querySelector('button[aria-label="Rename mode"]'),
    ).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(
      document.body.querySelector('button[aria-label="Rename mode"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-file-item][data-selected="true"]'),
    ).toHaveLength(0);
  });

  it('previews and submits replace-text batch rename in sorted selection order', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });

    const findInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Find text"]',
    );
    const replacementInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Replacement text"]',
    );
    await act(async () => {
      if (findInput) setInputValue(findInput, 'Episode');
      if (replacementInput) setInputValue(replacementInput, 'Scene');
    });

    expect(document.body.textContent).toContain('Scene 01.mkv');
    expect(document.body.textContent).toContain('Scene 02.mkv');

    const submit = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rename items',
    );
    await act(async () => {
      submit?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(renameBatchMock).toHaveBeenCalledWith({
      json: {
        root: 'media',
        items: [
          { path: 'Episode 01.mkv', name: 'Scene 01.mkv' },
          { path: 'Episode 02.mkv', name: 'Scene 02.mkv' },
        ],
      },
    });
  });

  it('previews and submits digit wildcard batch rename', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });

    const modeTrigger = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Rename mode"]',
    );
    installSelectDomPolyfills();
    await act(async () => {
      modeTrigger?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      modeTrigger?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const patternOption = [
      ...document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((option) => option.textContent === 'Replace Pattern');
    expect(patternOption).not.toBeUndefined();
    await act(async () => {
      patternOption?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      patternOption?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const findInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Pattern"]',
    );
    const replacementInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Replacement text"]',
    );
    await act(async () => {
      if (findInput) setInputValue(findInput, 'Episode %%');
      if (replacementInput) setInputValue(replacementInput, '$1x');
    });

    expect(document.body.textContent).toContain(
      '%% matches digits; $1…$9 reuse matches.',
    );
    expect(document.body.textContent).toContain('01x.mkv');
    expect(document.body.textContent).toContain('02x.mkv');

    const submit = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rename items',
    );
    await act(async () => {
      submit?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(renameBatchMock).toHaveBeenCalledWith({
      json: {
        root: 'media',
        items: [
          { path: 'Episode 01.mkv', name: '01x.mkv' },
          { path: 'Episode 02.mkv', name: '02x.mkv' },
        ],
      },
    });
  });

  it('previews full-name patterns and blocks invalid generated basenames', async () => {
    const entries = [
      {
        name: 'some.text.01.video',
        path: 'some.text.01.video',
        type: 'file' as const,
        size: 1,
        modifiedAt: null,
        permissions: { readWrite: true, rename: true },
        isTorrentLinked: false,
      },
      {
        name: 'some.text.01.video.mkv',
        path: 'some.text.01.video.mkv',
        type: 'file' as const,
        size: 1,
        modifiedAt: null,
        permissions: { readWrite: true, rename: true },
        isTorrentLinked: false,
      },
    ];
    listMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: { root: 'media', path: '', entries },
        }),
      ),
    );

    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="some.text.01.video"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="some.text.01.video.mkv"]',
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });

    const modeTrigger = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Rename mode"]',
    );
    installSelectDomPolyfills();
    await act(async () => {
      modeTrigger?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      modeTrigger?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const patternOption = [
      ...document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((option) => option.textContent === 'Replace Pattern');
    await act(async () => {
      patternOption?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      patternOption?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const patternInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Pattern"]',
    );
    const replacementInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Replacement text"]',
    );
    await act(async () => {
      if (patternInput) setInputValue(patternInput, 'some.text.%%.video');
      if (replacementInput) setInputValue(replacementInput, 'E$1');
    });

    expect(document.body.textContent).toContain('some.text.%%.video → E$1');
    expect(document.body.textContent).toContain('E01');
    expect(document.body.textContent).toContain('E01.mkv');

    await act(async () => {
      if (replacementInput) setInputValue(replacementInput, '/$1');
    });
    expect(document.body.textContent).toContain(
      'Names must be a single non-empty basename',
    );
    const submit = [
      ...document.body.querySelectorAll<HTMLButtonElement>('button'),
    ].find((button) => button.textContent === 'Rename items');
    expect(submit?.disabled).toBe(true);
    await act(async () => submit?.click());
    expect(renameBatchMock).not.toHaveBeenCalled();
  });

  it('opens batch rename from the Actions toolbar for selected items', async () => {
    await renderFileManager();
    const first = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 02.mkv"]',
    );
    const actions = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Actions'),
    );

    await act(async () => first?.click());
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    await act(async () => {
      actions?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      actions?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const renameItem = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes('Rename'));
    expect(renameItem?.getAttribute('aria-disabled')).not.toBe('true');

    await act(async () => renameItem?.click());
    expect(
      document.body.querySelector('button[aria-label="Rename mode"]'),
    ).not.toBeNull();
  });

  it('shows a local validation message when more than 100 items are selected', async () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({
      name: `Item ${String(index + 1).padStart(3, '0')}.txt`,
      path: `Item ${String(index + 1).padStart(3, '0')}.txt`,
      type: 'file' as const,
      size: 1,
      modifiedAt: null,
      permissions: { readWrite: true, rename: true },
      isTorrentLinked: false,
    }));
    listMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: { root: 'media', path: '', entries },
        }),
      ),
    );

    await renderFileManager();
    const items = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-file-item]'),
    ];
    await act(async () => {
      items.forEach((item, index) => {
        item.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            ctrlKey: index > 0,
          }),
        );
      });
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
    });

    expect(document.body.textContent).toContain(
      'Cannot rename more than 100 items',
    );
    const submit = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rename items',
    );
    expect(submit?.hasAttribute('disabled')).toBe(true);
    expect(renameBatchMock).not.toHaveBeenCalled();
  });

  it('offers rename in the Actions dropdown', async () => {
    await renderFileManager();
    const file = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    const actions = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Actions'),
    );

    await act(async () => file?.click());
    await act(async () => {
      actions?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      actions?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(
      [...document.body.querySelectorAll('[role="menuitem"]')].some((item) =>
        item.textContent?.includes('Rename'),
      ),
    ).toBe(true);
  });

  it('offers New Folder in the Actions dropdown with its shortcut', async () => {
    await renderFileManager();
    const actions = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Actions'),
    );

    await act(async () => {
      actions?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      actions?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const newFolderItem = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes('New Folder'));
    expect(newFolderItem?.textContent).toContain('⇧⌘N');
  });

  it('creates a folder in the current nested location from the shortcut', async () => {
    await renderFileManager();
    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    await act(async () => {
      folder?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const listCallsBeforeCreate = listMock.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'n',
          metaKey: true,
          shiftKey: true,
        }),
      );
    });

    const nameInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="New folder name"]',
    );
    expect(nameInput?.value).toBe('New Folder');
    await act(async () => {
      if (nameInput) setInputValue(nameInput, 'Season 1');
    });
    const createButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Create folder',
    );
    await act(async () => {
      createButton?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(directoryMock).toHaveBeenCalledWith({
      json: {
        location: { root: 'media', path: 'Silo' },
        name: 'Season 1',
      },
    });
    expect(listMock.mock.calls.length).toBeGreaterThan(listCallsBeforeCreate);
    expect(
      document.body.querySelector('input[aria-label="New folder name"]'),
    ).toBeNull();
  });

  it('uses the initial URL location for New Folder payload', async () => {
    await renderFileManager('/files?root=downloads&path=Season%201');
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'n',
          metaKey: true,
          shiftKey: true,
        }),
      );
    });

    const createButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Create folder',
    );
    await act(async () => {
      createButton?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(directoryMock).toHaveBeenCalledWith({
      json: {
        location: { root: 'downloads', path: 'Season 1' },
        name: 'New Folder',
      },
    });
  });

  it('disables New Folder submission for an empty name', async () => {
    await renderFileManager();
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'N',
          ctrlKey: true,
          shiftKey: true,
        }),
      );
    });
    const nameInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="New folder name"]',
    );
    expect(nameInput).not.toBeNull();
    if (nameInput) setInputValue(nameInput, '   ');

    const createButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Create folder',
    ) as HTMLButtonElement | undefined;
    expect(createButton?.disabled).toBe(true);
    expect(directoryMock).not.toHaveBeenCalled();
  });

  it('keeps New Folder open when the API rejects the request', async () => {
    directoryMock.mockResolvedValueOnce(
      jsonResponse({ success: false, message: 'Folder already exists' }, 409),
    );
    await renderFileManager();
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'n',
          metaKey: true,
          shiftKey: true,
        }),
      );
    });
    const nameInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="New folder name"]',
    );
    const createButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Create folder',
    );
    await act(async () => {
      createButton?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(directoryMock).toHaveBeenCalledTimes(1);
    expect(nameInput?.isConnected).toBe(true);
  });

  it('supports back and forward navigation history', async () => {
    await renderFileManager();
    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    await act(async () =>
      folder?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );

    const back = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Back"]',
    );
    await act(async () => back?.click());
    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'media', path: '' },
    });

    const forward = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Forward"]',
    );
    await act(async () => forward?.click());
    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'media', path: 'Silo' },
    });
  });

  it('syncs real browser history and resets selection and search on popstate', async () => {
    window.history.replaceState(null, '', '/files');
    await renderFileManager('/files', 'browser');
    const folder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Silo"]',
    );
    await act(async () => {
      folder?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await waitForHistoryUpdate();
    });
    await act(async () => {
      await waitForHistoryUpdate();
    });
    expect(getBrowserUrl()).toBe('/files?root=media&path=Silo');

    const file = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    await act(async () => file?.click());
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter files"]',
    );
    await act(async () => {
      if (search) setInputValue(search, 'Episode');
    });
    expect(search?.value).toBe('Episode');
    const selectedFile = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    await act(async () => selectedFile?.click());
    expect(selectedFile?.getAttribute('data-selected')).toBe('true');

    await act(async () => {
      window.history.back();
      await waitForHistoryUpdate();
    });
    expect(getBrowserUrl()).toBe('/files');
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Filter files"]',
      )?.value,
    ).toBe('');
    expect(
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Episode 01.mkv"]')
        ?.getAttribute('data-selected'),
    ).toBe('false');
    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'media', path: '' },
    });

    await act(async () => {
      window.history.forward();
      await waitForHistoryUpdate();
    });
    expect(getBrowserUrl()).toBe('/files?root=media&path=Silo');
    expect(listMock).toHaveBeenLastCalledWith({
      query: { root: 'media', path: 'Silo' },
    });
  });

  it('shows an empty folder state', async () => {
    listMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { root: 'media', path: '', entries: [] },
      }),
    );

    await renderFileManager();

    expect(container.textContent).toContain('Folder is empty');
  });

  it('shows directory errors', async () => {
    listMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, message: 'Configured directory is unavailable' },
        400,
      ),
    );

    await renderFileManager();

    expect(container.textContent).toContain('Cannot open folder');
    expect(container.textContent).toContain(
      'Configured directory is unavailable',
    );
    expect(container.textContent).toContain('Try again');
  });

  it.each([
    ['media', 'Media directory is not configured'],
    ['downloads', 'Download directory is not configured'],
  ] as const)(
    'opens settings when %s directory is not configured',
    async (root, message) => {
      listMock.mockResolvedValueOnce(
        jsonResponse({ success: false, message }, 400),
      );

      await renderFileManager(`/files?root=${root}`);

      expect(container.textContent).not.toContain('Try again');
      const settingsButton = [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Open settings',
      );
      expect(settingsButton).toBeDefined();

      await act(async () => settingsButton?.click());

      expect(
        container.querySelector('[data-testid="router-location"]')?.textContent,
      ).toBe('/settings');
    },
  );

  it('does not retry deterministic directory errors', async () => {
    listMock.mockResolvedValueOnce(
      jsonResponse({ success: false, message: 'Directory not found' }, 404),
    );

    await renderFileManager();

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Directory not found');
  });

  it('retries transient directory errors with a bounded attempt count', async () => {
    listMock
      .mockResolvedValueOnce(
        jsonResponse({ success: false, message: 'Backend unavailable' }, 503),
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: false, message: 'Backend unavailable' }, 503),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { root: 'media', path: '', entries: [] },
        }),
      );

    await renderFileManager();
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(listMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain('Folder is empty');
  });
});

async function renderFileManager(
  initialPath = '/files',
  routerType: 'memory' | 'browser' = 'memory',
): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  const manager = (
    <QueryClientProvider client={queryClient}>
      <RouterProbe />
      <FileManager />
    </QueryClientProvider>
  );
  await act(async () => {
    root.render(
      routerType === 'browser' ? (
        <BrowserRouter>{manager}</BrowserRouter>
      ) : (
        <MemoryRouter initialEntries={[initialPath]}>{manager}</MemoryRouter>
      ),
    );
  });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function RouterProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid='router-location'>
        {`${location.pathname}${location.search}`}
      </output>
      <output data-testid='router-navigation'>
        {`${navigationType}:${JSON.stringify(location.state)}`}
      </output>
      <button
        type='button'
        data-testid='browser-back'
        onClick={() => navigate(-1)}
      />
      <button
        type='button'
        data-testid='browser-forward'
        onClick={() => navigate(1)}
      />
      <button
        type='button'
        data-testid='external-files-navigation'
        onClick={() => navigate('/files')}
      />
    </>
  );
}

function getBrowserUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getFileItemNames(): string[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[data-file-item]')]
    .map((item) => item.getAttribute('aria-label'))
    .filter((name): name is string => name !== null);
}

async function waitForHistoryUpdate(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value: T): void => {
      if (!resolvePromise)
        throw new Error('Deferred promise is not initialized');
      resolvePromise(value);
    },
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function installSelectDomPolyfills(): void {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: (): void => undefined,
  });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: (): boolean => false,
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: (): void => undefined,
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: (): void => undefined,
  });
}
