import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  directorySizeQueryKey,
  getObservedDirectoryPath,
  useDirectorySizes,
  type DirectorySizeResult,
  type DirectorySizeFetcher,
} from './use-directory-sizes';
import type { FileEntry } from './types';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalIntersectionObserver: typeof IntersectionObserver;

beforeEach(() => {
  originalIntersectionObserver = globalThis.IntersectionObserver;
  MockIntersectionObserver.latest = null;
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: originalIntersectionObserver,
  });
  vi.useRealTimers();
});

describe('useDirectorySizes', () => {
  it('looks up observed directory paths directly from their elements', () => {
    const node = document.createElement('button');
    const pathsByNode = new WeakMap<Element, string>();
    pathsByNode.set(node, 'One');
    const getSpy = vi.spyOn(pathsByNode, 'get');

    expect(getObservedDirectoryPath(pathsByNode, node)).toBe('One');
    expect(getSpy).toHaveBeenCalledTimes(1);
    getSpy.mockRestore();
  });

  it('continues requesting sizes after StrictMode effect replay', async () => {
    vi.useFakeTimers();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async (_rootName, paths) =>
      paths.map((path) => ({
        path,
        size: 4_096,
        status: 'ready',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      })),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <StrictMode>
          <QueryClientProvider client={queryClient}>
            <DirectorySizeHarness fetchSizes={fetchSizes} />
          </QueryClientProvider>
        </StrictMode>,
      );
    });

    expect(MockIntersectionObserver.latest?.observed.size).toBe(2);

    await loadVisibleSizes();

    expect(fetchSizes).toHaveBeenCalledTimes(1);
  });

  it('batches visible directory requests and caches each result', async () => {
    vi.useFakeTimers();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async (rootName, paths) =>
      paths.map((path) => ({
        path,
        size: rootName === 'media' ? 4_096 : null,
        status: rootName === 'media' ? 'ready' : 'permission-denied',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      })),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectorySizeHarness fetchSizes={fetchSizes} />
        </QueryClientProvider>,
      );
    });
    expect(MockIntersectionObserver.latest?.observed.size).toBe(2);

    await act(async () => {
      MockIntersectionObserver.latest?.triggerVisible();
      vi.advanceTimersByTime(80);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSizes).toHaveBeenCalledTimes(1);
    expect(fetchSizes).toHaveBeenCalledWith('media', ['One', 'Two']);
    expect(
      container.querySelector('[data-testid="one-size"]')?.textContent,
    ).toBe('ready');
    expect(
      container.querySelector('[data-testid="two-size"]')?.textContent,
    ).toBe('ready');

    await act(async () => {
      MockIntersectionObserver.latest?.triggerVisible();
      vi.advanceTimersByTime(80);
    });
    expect(fetchSizes).toHaveBeenCalledTimes(1);
  });

  it('re-fetches a visible stale cache once and renders the updated size', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async (_rootName, paths) =>
      paths.map((path) => ({
        path,
        size: 8_192,
        status: 'ready',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      })),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData<DirectorySizeResult>(
      directorySizeQueryKey('media', '', 'One', 1),
      {
        path: 'One',
        size: 4_096,
        status: 'ready',
        calculatedAt: '2026-08-27T09:00:00.000Z',
      },
      { updatedAt: 0 },
    );

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SizeValueHarness fetchSizes={fetchSizes} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      MockIntersectionObserver.latest?.triggerVisible();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="one-size"]')?.textContent,
    ).toBe('4096');

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      vi.advanceTimersByTime(80);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSizes).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('[data-testid="one-size"]')?.textContent,
    ).toBe('8192');

    await act(async () => {
      MockIntersectionObserver.latest?.triggerVisible();
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });
    expect(fetchSizes).toHaveBeenCalledTimes(1);
  });

  it('prioritizes selected offscreen directories within batch limit', async () => {
    vi.useFakeTimers();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async (_rootName, paths) =>
      paths.map((path) => ({
        path,
        size: 4_096,
        status: 'ready',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      })),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PriorityDirectorySizeHarness fetchSizes={fetchSizes} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      MockIntersectionObserver.latest?.triggerVisible();
      vi.advanceTimersByTime(80);
      await Promise.resolve();
      await Promise.resolve();
    });

    const requestedPaths = fetchSizes.mock.calls[0]?.[1] ?? [];
    expect(requestedPaths).toHaveLength(32);
    expect(requestedPaths).toContain('Selected offscreen');
    expect(requestedPaths).not.toContain('Visible 32');
  });

  it('deduplicates selected requests during unrelated in-flight updates', async () => {
    vi.useFakeTimers();
    const selectedSizes = createDeferred<DirectorySizeResult[]>();
    const unrelatedSizes = createDeferred<DirectorySizeResult[]>();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async (_rootName, paths) =>
      paths.includes('Selected')
        ? selectedSizes.promise
        : unrelatedSizes.promise,
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InFlightDirectorySizeHarness fetchSizes={fetchSizes} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSizes).toHaveBeenCalledTimes(1);
    expect(fetchSizes.mock.calls[0]?.[1]).toEqual(['Selected']);

    await act(async () => {
      MockIntersectionObserver.latest?.triggerVisible();
      vi.advanceTimersByTime(80);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSizes).toHaveBeenCalledTimes(2);
    const unrelatedPaths = fetchSizes.mock.calls[1]?.[1] ?? [];
    unrelatedSizes.resolve(
      unrelatedPaths.map((path) => ({
        path,
        size: 8_192,
        status: 'ready',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      })),
    );
    await act(async () => {
      await unrelatedSizes.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    const selectedCalls = fetchSizes.mock.calls.filter((call) =>
      call[1].includes('Selected'),
    );
    expect(selectedCalls).toHaveLength(1);

    selectedSizes.resolve([
      {
        path: 'Selected',
        size: 16_384,
        status: 'ready',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      },
    ]);
    await act(async () => {
      await selectedSizes.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSizes).toHaveBeenCalledTimes(2);
  });

  it('clears local sizes and re-requests visible directories after refresh', async () => {
    vi.useFakeTimers();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async (_rootName, paths) =>
      paths.map((path) => ({
        path,
        size: 4_096,
        status: 'ready',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      })),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectorySizeHarness fetchSizes={fetchSizes} listingUpdatedAt={1} />
        </QueryClientProvider>,
      );
    });
    await loadVisibleSizes();
    expect(fetchSizes).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectorySizeHarness fetchSizes={fetchSizes} listingUpdatedAt={2} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="one-size"]')?.textContent,
    ).toBe('pending');

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(80);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSizes).toHaveBeenCalledTimes(2);
  });

  it('marks paths missing from a settled response as unavailable', async () => {
    vi.useFakeTimers();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async (_rootName, paths) =>
      paths
        .filter((path) => path === 'One')
        .map((path) => ({
          path,
          size: 4_096,
          status: 'ready',
          calculatedAt: '2026-08-27T10:00:00.000Z',
        })),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectorySizeHarness fetchSizes={fetchSizes} />
        </QueryClientProvider>,
      );
    });
    await loadVisibleSizes();

    expect(
      container.querySelector('[data-testid="one-size"]')?.textContent,
    ).toBe('ready');
    expect(
      container.querySelector('[data-testid="two-size"]')?.textContent,
    ).toBe('unavailable');
    expect(
      queryClient.getQueryData<DirectorySizeResult>(
        directorySizeQueryKey('media', '', 'Two', 1),
      ),
    ).toMatchObject({ path: 'Two', status: 'unavailable', size: null });
  });

  it('marks requested paths unavailable after an RPC error', async () => {
    vi.useFakeTimers();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async () => {
      throw new Error('Network error');
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectorySizeHarness fetchSizes={fetchSizes} />
        </QueryClientProvider>,
      );
    });
    await loadVisibleSizes();

    expect(
      container.querySelector('[data-testid="one-size"]')?.textContent,
    ).toBe('unavailable');
    expect(
      container.querySelector('[data-testid="two-size"]')?.textContent,
    ).toBe('unavailable');
    expect(
      queryClient.getQueryData<DirectorySizeResult>(
        directorySizeQueryKey('media', '', 'One', 1),
      ),
    ).toMatchObject({ path: 'One', status: 'unavailable', size: null });

    await act(async () => {
      MockIntersectionObserver.latest?.triggerVisible();
      vi.advanceTimersByTime(80);
    });
    expect(fetchSizes).toHaveBeenCalledTimes(1);
  });

  it('ignores an in-flight response after unmount', async () => {
    vi.useFakeTimers();
    const deferredSizes = createDeferred<DirectorySizeResult[]>();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(() => deferredSizes.promise);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectorySizeHarness fetchSizes={fetchSizes} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      MockIntersectionObserver.latest?.triggerVisible();
      vi.advanceTimersByTime(80);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSizes).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    deferredSizes.resolve([
      {
        path: 'One',
        size: 4_096,
        status: 'ready',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      },
    ]);
    await act(async () => {
      await deferredSizes.promise;
      await Promise.resolve();
    });

    expect(
      queryClient.getQueryData(directorySizeQueryKey('media', '', 'One', 1)),
    ).toBeUndefined();
  });

  it('ignores observer callbacks from a previous location', async () => {
    vi.useFakeTimers();
    const fetchSizes = vi.fn<DirectorySizeFetcher>(async (_rootName, paths) =>
      paths.map((path) => ({
        path,
        size: 4_096,
        status: 'ready',
        calculatedAt: '2026-08-27T10:00:00.000Z',
      })),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectorySizeHarness fetchSizes={fetchSizes} />
        </QueryClientProvider>,
      );
    });
    const previousObserver = MockIntersectionObserver.latest;
    const previousTarget = [...(previousObserver?.observed ?? [])][0];
    if (!previousObserver || !previousTarget) {
      throw new Error('Missing previous intersection observer target');
    }

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectorySizeHarness
            fetchSizes={fetchSizes}
            locationPath='Nested'
            listingUpdatedAt={2}
            entries={[nestedEntry]}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
    previousObserver.triggerTarget(previousTarget);
    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });

    expect(fetchSizes).not.toHaveBeenCalled();
  });
});

function DirectorySizeHarness({
  fetchSizes,
  listingUpdatedAt = 1,
  locationPath = '',
  entries: harnessEntries = entries,
}: {
  fetchSizes: DirectorySizeFetcher;
  listingUpdatedAt?: number;
  locationPath?: string;
  entries?: FileEntry[];
}) {
  const { directorySizes, registerDirectorySizeElement } = useDirectorySizes({
    root: 'media',
    locationPath,
    listingUpdatedAt,
    entries: harnessEntries,
    fetchSizes,
  });
  return (
    <>
      <button
        type='button'
        ref={(node) =>
          registerDirectorySizeElement(harnessEntries[0]?.path ?? '', node)
        }
      />
      <button
        type='button'
        ref={(node) =>
          registerDirectorySizeElement(harnessEntries[1]?.path ?? '', node)
        }
      />
      <output data-testid='one-size'>
        {directorySizes.get(harnessEntries[0]?.path ?? '')?.status ?? 'pending'}
      </output>
      <output data-testid='two-size'>
        {directorySizes.get(harnessEntries[1]?.path ?? '')?.status ?? 'pending'}
      </output>
    </>
  );
}

function SizeValueHarness({
  fetchSizes,
}: {
  fetchSizes: DirectorySizeFetcher;
}) {
  const { directorySizes, registerDirectorySizeElement } = useDirectorySizes({
    root: 'media',
    locationPath: '',
    listingUpdatedAt: 1,
    entries: [entries[0]],
    fetchSizes,
  });
  return (
    <>
      <button
        type='button'
        ref={(node) => registerDirectorySizeElement('One', node)}
      />
      <output data-testid='one-size'>
        {directorySizes.get('One')?.size ?? 'pending'}
      </output>
    </>
  );
}

function PriorityDirectorySizeHarness({
  fetchSizes,
}: {
  fetchSizes: DirectorySizeFetcher;
}) {
  const { registerDirectorySizeElement, requestDirectorySize } =
    useDirectorySizes({
      root: 'media',
      locationPath: '',
      listingUpdatedAt: 1,
      entries: priorityEntries,
      fetchSizes,
    });

  useEffect(() => {
    requestDirectorySize('Selected offscreen');
  }, [requestDirectorySize]);

  return (
    <>
      {priorityEntries
        .filter((entry) => entry.path !== 'Selected offscreen')
        .map((entry) => (
          <button
            key={entry.path}
            type='button'
            ref={(node) => registerDirectorySizeElement(entry.path, node)}
          />
        ))}
    </>
  );
}

function InFlightDirectorySizeHarness({
  fetchSizes,
}: {
  fetchSizes: DirectorySizeFetcher;
}) {
  const {
    directorySizes,
    registerDirectorySizeElement,
    requestDirectorySize,
    releaseDirectorySize,
  } = useDirectorySizes({
    root: 'media',
    locationPath: '',
    listingUpdatedAt: 1,
    entries: inFlightEntries,
    fetchSizes,
  });

  useEffect(() => {
    requestDirectorySize('Selected');
    return () => releaseDirectorySize('Selected');
  }, [directorySizes, releaseDirectorySize, requestDirectorySize]);

  return (
    <>
      {inFlightEntries
        .filter((entry) => entry.path !== 'Selected')
        .map((entry) => (
          <button
            key={entry.path}
            type='button'
            ref={(node) => registerDirectorySizeElement(entry.path, node)}
          />
        ))}
    </>
  );
}

const entries: FileEntry[] = [
  {
    name: 'One',
    path: 'One',
    type: 'directory',
    size: null,
    modifiedAt: '2026-08-27T10:00:00.000Z',
    permissions: { readWrite: true, rename: true },
    isTorrentLinked: false,
  },
  {
    name: 'Two',
    path: 'Two',
    type: 'directory',
    size: null,
    modifiedAt: '2026-08-27T10:00:00.000Z',
    permissions: { readWrite: true, rename: true },
    isTorrentLinked: false,
  },
];

const nestedEntry: FileEntry = {
  name: 'Nested item',
  path: 'Nested item',
  type: 'directory',
  size: null,
  modifiedAt: '2026-08-27T10:00:00.000Z',
  permissions: { readWrite: true, rename: true },
  isTorrentLinked: false,
};

const priorityEntries: FileEntry[] = [
  ...Array.from(
    { length: 33 },
    (_, index): FileEntry => ({
      name: `Visible ${String(index + 1).padStart(2, '0')}`,
      path: `Visible ${String(index + 1).padStart(2, '0')}`,
      type: 'directory',
      size: null,
      modifiedAt: '2026-08-27T10:00:00.000Z',
      permissions: { readWrite: true, rename: true },
      isTorrentLinked: false,
    }),
  ),
  {
    name: 'Selected offscreen',
    path: 'Selected offscreen',
    type: 'directory',
    size: null,
    modifiedAt: '2026-08-27T10:00:00.000Z',
    permissions: { readWrite: true, rename: true },
    isTorrentLinked: false,
  },
];

const inFlightEntries: FileEntry[] = [
  ...Array.from(
    { length: 32 },
    (_, index): FileEntry => ({
      name: `Visible ${String(index + 1).padStart(2, '0')}`,
      path: `Visible ${String(index + 1).padStart(2, '0')}`,
      type: 'directory',
      size: null,
      modifiedAt: '2026-08-27T10:00:00.000Z',
      permissions: { readWrite: true, rename: true },
      isTorrentLinked: false,
    }),
  ),
  {
    name: 'Selected',
    path: 'Selected',
    type: 'directory',
    size: null,
    modifiedAt: '2026-08-27T10:00:00.000Z',
    permissions: { readWrite: true, rename: true },
    isTorrentLinked: false,
  },
];

class MockIntersectionObserver {
  static latest: MockIntersectionObserver | null = null;
  readonly observed = new Set<HTMLElement>();
  private readonly callback: (entries: IntersectionObserverEntry[]) => void;

  constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
    this.callback = callback;
    MockIntersectionObserver.latest = this;
  }

  observe(target: Element): void {
    if (target instanceof HTMLElement) this.observed.add(target);
  }

  unobserve(target: Element): void {
    if (target instanceof HTMLElement) this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }

  triggerVisible(): void {
    this.callback([...this.observed].map(createIntersectionEntry));
  }

  triggerTarget(target: HTMLElement): void {
    this.callback([createIntersectionEntry(target)]);
  }
}

function createIntersectionEntry(target: Element): IntersectionObserverEntry {
  return {
    boundingClientRect: new DOMRect(),
    intersectionRatio: 1,
    intersectionRect: new DOMRect(),
    isIntersecting: true,
    rootBounds: null,
    target,
    time: Date.now(),
  };
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

async function loadVisibleSizes(): Promise<void> {
  await act(async () => {
    MockIntersectionObserver.latest?.triggerVisible();
    vi.advanceTimersByTime(80);
    await Promise.resolve();
    await Promise.resolve();
  });
}
