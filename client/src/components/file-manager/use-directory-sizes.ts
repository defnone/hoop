import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FileEntry, FileRoot } from './types';

export const directorySizeStatuses = [
  'ready',
  'permission-denied',
  'too-large',
  'unavailable',
] as const;
export type DirectorySizeStatus = (typeof directorySizeStatuses)[number];

export type DirectorySizeResult = {
  path: string;
  size: number | null;
  status: DirectorySizeStatus;
  calculatedAt: string | null;
};

export type DirectorySizeFetcher = (
  root: FileRoot,
  paths: string[],
) => Promise<DirectorySizeResult[]>;

export type DirectorySizeRegistration = (
  path: string,
  node: HTMLElement | null,
) => void;

export type UseDirectorySizesParams = {
  root: FileRoot;
  locationPath: string;
  listingUpdatedAt: number;
  entries: FileEntry[];
  fetchSizes: DirectorySizeFetcher;
};

export type UseDirectorySizesResult = {
  directorySizes: ReadonlyMap<string, DirectorySizeResult>;
  registerDirectorySizeElement: DirectorySizeRegistration;
  requestDirectorySize: (path: string) => void;
  releaseDirectorySize: (path: string) => void;
};

const DIRECTORY_SIZE_BATCH_DELAY_MS = 80;
const DIRECTORY_SIZE_BATCH_LIMIT = 32;
const DIRECTORY_SIZE_STALE_TIME_MS = 60_000;
const DIRECTORY_SIZE_GC_TIME_MS = 10 * 60_000;

export function useDirectorySizes({
  root,
  locationPath,
  listingUpdatedAt,
  entries,
  fetchSizes,
}: UseDirectorySizesParams): UseDirectorySizesResult {
  const queryClient = useQueryClient();
  const locationKey = JSON.stringify([root, locationPath]);
  const listingVersionKey = JSON.stringify([locationKey, listingUpdatedAt]);
  const directoryPaths = useMemo(
    () =>
      new Set(
        entries
          .filter((entry) => entry.type === 'directory' && entry.size === null)
          .map((entry) => entry.path),
      ),
    [entries],
  );
  const [directorySizes, setDirectorySizes] = useState<
    Map<string, DirectorySizeResult>
  >(() => getInitialDirectorySizes(entries));
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const pendingPathsRef = useRef(new Set<string>());
  const requestedPathsRef = useRef(new Set<string>());
  const inFlightPathsRef = useRef(new Set<string>());
  const priorityPathsRef = useRef(new Set<string>());
  const priorityWatchedPathsRef = useRef(new Set<string>());
  const expiryTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const mountedRef = useRef(true);
  const pathsByNodeRef = useRef(new WeakMap<Element, string>());
  const locationKeyRef = useRef(locationKey);
  const listingVersionKeyRef = useRef(listingVersionKey);
  const requestGenerationRef = useRef(0);
  const flushPathsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const queuePathRef = useRef<
    (path: string, expectedVersion: string, priority: boolean) => void
  >(() => undefined);
  const visiblePathsRef = useRef(new Map<string, Set<string>>());

  useEffect(() => {
    mountedRef.current = true;
    const expiryTimers = expiryTimersRef.current;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      for (const timer of expiryTimers.values()) clearTimeout(timer);
      expiryTimers.clear();
    };
  }, []);

  const scheduleFlush = useCallback((): void => {
    if (!mountedRef.current) return;
    if (timeoutRef.current !== null) return;
    timeoutRef.current = setTimeout(() => {
      void flushPathsRef.current();
    }, DIRECTORY_SIZE_BATCH_DELAY_MS);
  }, []);

  const scheduleDirectorySizeExpiry = useCallback(
    (path: string, dataUpdatedAt = Date.now()): void => {
      const previousTimer = expiryTimersRef.current.get(path);
      if (previousTimer !== undefined) clearTimeout(previousTimer);
      const delay = Math.max(
        0,
        DIRECTORY_SIZE_STALE_TIME_MS - (Date.now() - dataUpdatedAt),
      );
      const expectedLocationKey = locationKey;
      const expectedVersionKey = listingVersionKey;
      const expectedGeneration = requestGenerationRef.current;
      const timer = setTimeout(() => {
        expiryTimersRef.current.delete(path);
        if (
          !mountedRef.current ||
          locationKeyRef.current !== expectedLocationKey ||
          listingVersionKeyRef.current !== expectedVersionKey ||
          requestGenerationRef.current !== expectedGeneration
        ) {
          return;
        }
        requestedPathsRef.current.delete(path);
        const isVisible =
          visiblePathsRef.current.get(expectedLocationKey)?.has(path) ?? false;
        const isPriorityWatched = priorityWatchedPathsRef.current.has(path);
        if (!isVisible && !isPriorityWatched) return;
        queuePathRef.current(path, expectedVersionKey, isPriorityWatched);
      }, delay);
      expiryTimersRef.current.set(path, timer);
    },
    [listingVersionKey, locationKey],
  );

  const flushPaths = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;
    timeoutRef.current = null;
    const requestGeneration = requestGenerationRef.current;
    const paths = [
      ...new Set([...priorityPathsRef.current, ...pendingPathsRef.current]),
    ].slice(0, DIRECTORY_SIZE_BATCH_LIMIT);
    for (const path of paths) {
      pendingPathsRef.current.delete(path);
      inFlightPathsRef.current.add(path);
      priorityPathsRef.current.delete(path);
    }
    if (paths.length === 0) return;

    try {
      const sortedPaths = [...paths].sort();
      const results = await queryClient.fetchQuery<DirectorySizeResult[]>({
        queryKey: directorySizeBatchQueryKey(
          root,
          locationPath,
          listingUpdatedAt,
          sortedPaths,
        ),
        queryFn: () => fetchSizes(root, sortedPaths),
        staleTime: DIRECTORY_SIZE_STALE_TIME_MS,
        gcTime: DIRECTORY_SIZE_GC_TIME_MS,
        retry: false,
      });
      if (
        !mountedRef.current ||
        locationKeyRef.current !== locationKey ||
        listingVersionKeyRef.current !== listingVersionKey ||
        requestGenerationRef.current !== requestGeneration
      ) {
        return;
      }
      for (const path of paths) inFlightPathsRef.current.delete(path);
      const resultsByPath = new Map(
        results.map((result) => [result.path, result]),
      );
      const settledResults = paths.map(
        (path) =>
          resultsByPath.get(path) ?? createUnavailableDirectorySize(path),
      );
      setDirectorySizes((current) => {
        const next = new Map(current);
        for (const result of settledResults) next.set(result.path, result);
        return next;
      });
      for (const result of settledResults) {
        queryClient.setQueryData(
          directorySizeQueryKey(
            root,
            locationPath,
            result.path,
            listingUpdatedAt,
          ),
          result,
        );
        scheduleDirectorySizeExpiry(result.path);
      }
    } catch {
      if (
        !mountedRef.current ||
        locationKeyRef.current !== locationKey ||
        listingVersionKeyRef.current !== listingVersionKey ||
        requestGenerationRef.current !== requestGeneration
      ) {
        return;
      }
      for (const path of paths) inFlightPathsRef.current.delete(path);
      const unavailableResults = paths.map(createUnavailableDirectorySize);
      setDirectorySizes((current) => {
        const next = new Map(current);
        for (const result of unavailableResults) next.set(result.path, result);
        return next;
      });
      for (const result of unavailableResults) {
        queryClient.setQueryData(
          directorySizeQueryKey(
            root,
            locationPath,
            result.path,
            listingUpdatedAt,
          ),
          result,
        );
        scheduleDirectorySizeExpiry(result.path);
      }
    }

    if (
      !mountedRef.current ||
      locationKeyRef.current !== locationKey ||
      listingVersionKeyRef.current !== listingVersionKey ||
      requestGenerationRef.current !== requestGeneration
    ) {
      return;
    }
    if (pendingPathsRef.current.size > 0) {
      scheduleFlush();
    }
  }, [
    fetchSizes,
    listingUpdatedAt,
    listingVersionKey,
    locationKey,
    locationPath,
    queryClient,
    root,
    scheduleDirectorySizeExpiry,
    scheduleFlush,
  ]);

  useEffect(() => {
    flushPathsRef.current = flushPaths;
  }, [flushPaths]);

  const queuePath = useCallback(
    (path: string, expectedVersion: string, priority: boolean): void => {
      if (!mountedRef.current) return;
      if (listingVersionKeyRef.current !== expectedVersion) return;
      if (locationKeyRef.current !== locationKey) return;
      if (!directoryPaths.has(path)) return;
      if (inFlightPathsRef.current.has(path)) return;
      const cached = readCachedDirectorySize(
        queryClient,
        root,
        locationPath,
        listingUpdatedAt,
        path,
      );
      if (requestedPathsRef.current.has(path)) {
        if (cached) {
          if (priority && pendingPathsRef.current.has(path)) {
            priorityPathsRef.current.add(path);
          }
          scheduleDirectorySizeExpiry(path, cached.dataUpdatedAt);
          return;
        }
        requestedPathsRef.current.delete(path);
        if (priority && pendingPathsRef.current.has(path)) {
          priorityPathsRef.current.add(path);
        }
      }

      if (cached) {
        requestedPathsRef.current.add(path);
        setDirectorySizes((current) => {
          if (current.get(path) === cached.result) return current;
          const next = new Map(current);
          next.set(path, cached.result);
          return next;
        });
        scheduleDirectorySizeExpiry(path, cached.dataUpdatedAt);
        return;
      }

      requestedPathsRef.current.add(path);
      pendingPathsRef.current.add(path);
      if (priority) priorityPathsRef.current.add(path);
      scheduleFlush();
    },
    [
      directoryPaths,
      listingUpdatedAt,
      locationKey,
      locationPath,
      queryClient,
      root,
      scheduleDirectorySizeExpiry,
      scheduleFlush,
    ],
  );

  useEffect(() => {
    queuePathRef.current = queuePath;
  }, [queuePath]);

  const queueVisiblePath = useCallback(
    (path: string, expectedVersion = listingVersionKey): void => {
      queuePath(path, expectedVersion, false);
    },
    [listingVersionKey, queuePath],
  );

  const requestDirectorySize = useCallback(
    (path: string): void => {
      if (!directoryPaths.has(path)) return;
      priorityWatchedPathsRef.current.add(path);
      queuePath(path, listingVersionKey, true);
    },
    [directoryPaths, listingVersionKey, queuePath],
  );

  const releaseDirectorySize = useCallback(
    (path: string): void => {
      priorityWatchedPathsRef.current.delete(path);
      priorityPathsRef.current.delete(path);
      const isVisible =
        visiblePathsRef.current.get(locationKey)?.has(path) ?? false;
      if (isVisible) return;

      if (pendingPathsRef.current.delete(path)) {
        requestedPathsRef.current.delete(path);
      }
      const expiryTimer = expiryTimersRef.current.get(path);
      if (expiryTimer !== undefined) {
        clearTimeout(expiryTimer);
        expiryTimersRef.current.delete(path);
      }
    },
    [locationKey],
  );

  const registerDirectorySizeElement = useCallback<DirectorySizeRegistration>(
    (path, node): void => {
      const previous = nodesRef.current.get(path);
      if (previous && previous !== node) {
        observerRef.current?.unobserve(previous);
        pathsByNodeRef.current.delete(previous);
      }
      if (!node) {
        nodesRef.current.delete(path);
        return;
      }
      nodesRef.current.set(path, node);
      pathsByNodeRef.current.set(node, path);
      observerRef.current?.observe(node);
      if (typeof IntersectionObserver === 'undefined') {
        getVisiblePaths(visiblePathsRef.current, locationKey).add(path);
        queueVisiblePath(path, listingVersionKey);
      }
    },
    [listingVersionKey, locationKey, queueVisiblePath],
  );

  useEffect(() => {
    if (listingVersionKeyRef.current === listingVersionKey) return;
    locationKeyRef.current = locationKey;
    listingVersionKeyRef.current = listingVersionKey;
    requestGenerationRef.current += 1;
    pendingPathsRef.current.clear();
    requestedPathsRef.current.clear();
    inFlightPathsRef.current.clear();
    priorityPathsRef.current.clear();
    priorityWatchedPathsRef.current.clear();
    for (const timer of expiryTimersRef.current.values()) clearTimeout(timer);
    expiryTimersRef.current.clear();
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setDirectorySizes(getInitialDirectorySizes(entries));

    const generation = requestGenerationRef.current;
    const visiblePaths = [
      ...getVisiblePaths(visiblePathsRef.current, locationKey),
    ];
    queueMicrotask(() => {
      if (
        !mountedRef.current ||
        listingVersionKeyRef.current !== listingVersionKey ||
        requestGenerationRef.current !== generation
      ) {
        return;
      }
      for (const path of visiblePaths) {
        queueVisiblePath(path, listingVersionKey);
      }
    });
  }, [entries, listingVersionKey, locationKey, queueVisiblePath]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observerLocationKey = locationKey;
    const observerVersionKey = listingVersionKey;
    const observerGeneration = requestGenerationRef.current;

    const observer = new IntersectionObserver(
      (observations) => {
        if (
          !mountedRef.current ||
          locationKeyRef.current !== observerLocationKey ||
          listingVersionKeyRef.current !== observerVersionKey ||
          requestGenerationRef.current !== observerGeneration
        ) {
          return;
        }
        const visiblePaths = getVisiblePaths(
          visiblePathsRef.current,
          observerLocationKey,
        );
        for (const observation of observations) {
          const path = getObservedDirectoryPath(
            pathsByNodeRef.current,
            observation.target,
          );
          if (!path) continue;
          if (observation.isIntersecting) {
            visiblePaths.add(path);
            queueVisiblePath(path, observerVersionKey);
          } else {
            visiblePaths.delete(path);
          }
        }
      },
      { rootMargin: '160px' },
    );
    observerRef.current = observer;
    for (const node of nodesRef.current.values()) observer.observe(node);

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [listingVersionKey, locationKey, queueVisiblePath]);

  return {
    directorySizes,
    registerDirectorySizeElement,
    requestDirectorySize,
    releaseDirectorySize,
  };
}

export function directorySizeQueryKey(
  root: FileRoot,
  locationPath: string,
  path: string,
  listingUpdatedAt = 0,
) {
  return [
    'file-manager',
    'directory-size',
    root,
    locationPath,
    listingUpdatedAt,
    path,
  ] as const;
}

export function getObservedDirectoryPath(
  pathsByNode: Pick<WeakMap<Element, string>, 'get'>,
  target: Element,
): string | null {
  return pathsByNode.get(target) ?? null;
}

function directorySizeBatchQueryKey(
  root: FileRoot,
  locationPath: string,
  listingUpdatedAt: number,
  paths: string[],
) {
  return [
    'file-manager',
    'directory-sizes',
    root,
    locationPath,
    listingUpdatedAt,
    paths.join('\u0000'),
  ] as const;
}

function readCachedDirectorySize(
  queryClient: ReturnType<typeof useQueryClient>,
  root: FileRoot,
  locationPath: string,
  listingUpdatedAt: number,
  path: string,
): { result: DirectorySizeResult; dataUpdatedAt: number } | null {
  const queryState = queryClient.getQueryState<DirectorySizeResult>(
    directorySizeQueryKey(root, locationPath, path, listingUpdatedAt),
  );
  if (!queryState?.data) return null;
  if (Date.now() - queryState.dataUpdatedAt >= DIRECTORY_SIZE_STALE_TIME_MS) {
    return null;
  }
  return { result: queryState.data, dataUpdatedAt: queryState.dataUpdatedAt };
}

function getInitialDirectorySizes(
  entries: FileEntry[],
): Map<string, DirectorySizeResult> {
  const sizes = new Map<string, DirectorySizeResult>();
  for (const entry of entries) {
    if (entry.type !== 'directory' || entry.size === null) continue;
    sizes.set(entry.path, {
      path: entry.path,
      size: entry.size,
      status: 'ready',
      calculatedAt: entry.modifiedAt,
    });
  }
  return sizes;
}

function createUnavailableDirectorySize(path: string): DirectorySizeResult {
  return {
    path,
    size: null,
    status: 'unavailable',
    calculatedAt: null,
  };
}

function getVisiblePaths(
  pathsByLocation: Map<string, Set<string>>,
  locationKey: string,
): Set<string> {
  const paths = pathsByLocation.get(locationKey);
  if (paths) return paths;
  const nextPaths = new Set<string>();
  pathsByLocation.set(locationKey, nextPaths);
  return nextPaths;
}
