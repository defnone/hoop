import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { FileEntry, MarqueeStart, MarqueeState } from './types';
import {
  getIntersectingPaths,
  getMarqueeDistance,
  getMarqueeRect,
  isMarqueeBlockedTarget,
  mergePaths,
} from './utils';

export type FileSelection = {
  selectedPaths: ReadonlySet<string>;
  selectedEntries: FileEntry[];
  selectedEntry: FileEntry | null;
  marquee: MarqueeState | null;
  beginMarquee: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleContentClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  registerEntryElement: (path: string, node: HTMLButtonElement | null) => void;
  clearSelection: () => void;
  selectFocusedEntry: (path: string) => void;
  selectEntry: (
    path: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  selectContextEntry: (path: string) => void;
};

export function useFileSelection(entries: FileEntry[]): FileSelection {
  const [selectedPathsState, setSelectedPaths] = useState<string[]>([]);
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(
    null,
  );
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const entryRefs = useRef(new Map<string, HTMLElement>());
  const entriesRef = useRef<FileEntry[]>([]);
  const selectedPathsRef = useRef<string[]>([]);
  const marqueeStartRef = useRef<MarqueeStart | null>(null);
  const suppressNextEmptyClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);

  const clearSelection = (): void => {
    setSelectedPaths([]);
    setSelectionAnchorPath(null);
  };

  const visibleSelectedPaths = useMemo(
    () =>
      selectedPathsState.filter((path) =>
        entries.some((entry) => entry.path === path),
      ),
    [entries, selectedPathsState],
  );
  const selectedPaths = useMemo(
    () => new Set(visibleSelectedPaths),
    [visibleSelectedPaths],
  );
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedPaths.has(entry.path)),
    [entries, selectedPaths],
  );
  const selectedEntry =
    selectedEntries.length === 1 ? selectedEntries[0] : null;
  const isMarqueeActive = marquee !== null;

  useEffect(() => {
    entriesRef.current = entries;
    selectedPathsRef.current = visibleSelectedPaths;
  }, [entries, visibleSelectedPaths]);

  useEffect(() => {
    if (!isMarqueeActive) return;

    const handleMouseMove = (event: MouseEvent): void => {
      const start = marqueeStartRef.current;
      if (!start) return;
      const nextMarquee: MarqueeState = {
        startX: start.startX,
        startY: start.startY,
        currentX: event.clientX,
        currentY: event.clientY,
      };
      setMarquee(nextMarquee);
      const intersectingPaths = getIntersectingPaths(
        getMarqueeRect(nextMarquee),
        entriesRef.current,
        entryRefs.current,
      );
      setSelectedPaths(
        start.additive
          ? mergePaths(start.basePaths, intersectingPaths)
          : intersectingPaths,
      );
    };

    const handleMouseUp = (event: MouseEvent): void => {
      const start = marqueeStartRef.current;
      if (!start) return;
      const nextMarquee: MarqueeState = {
        startX: start.startX,
        startY: start.startY,
        currentX: event.clientX,
        currentY: event.clientY,
      };
      const didDrag = getMarqueeDistance(nextMarquee) >= 4;
      if (didDrag) {
        const intersectingPaths = getIntersectingPaths(
          getMarqueeRect(nextMarquee),
          entriesRef.current,
          entryRefs.current,
        );
        const nextPaths = start.additive
          ? mergePaths(start.basePaths, intersectingPaths)
          : intersectingPaths;
        setSelectedPaths(nextPaths);
        setSelectionAnchorPath(nextPaths[0] ?? null);
        suppressNextEmptyClickRef.current = true;
        suppressClickTimerRef.current = window.setTimeout(() => {
          suppressNextEmptyClickRef.current = false;
          suppressClickTimerRef.current = null;
        }, 0);
      } else if (!start.additive) {
        clearSelection();
      }
      marqueeStartRef.current = null;
      setMarquee(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMarqueeActive]);

  useEffect(
    () => () => {
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
    },
    [],
  );

  const registerEntryElement = (
    path: string,
    node: HTMLButtonElement | null,
  ): void => {
    if (node) entryRefs.current.set(path, node);
    else entryRefs.current.delete(path);
  };

  const selectEntry = (
    path: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void => {
    const clickedIndex = entries.findIndex((entry) => entry.path === path);
    const anchorIndex = selectionAnchorPath
      ? entries.findIndex((entry) => entry.path === selectionAnchorPath)
      : -1;
    const modifier = event.metaKey || event.ctrlKey;

    if (event.shiftKey && anchorIndex >= 0 && clickedIndex >= 0) {
      const rangeStart = Math.min(anchorIndex, clickedIndex);
      const rangeEnd = Math.max(anchorIndex, clickedIndex);
      const rangePaths = entries
        .slice(rangeStart, rangeEnd + 1)
        .map((entry) => entry.path);
      setSelectedPaths((current) =>
        modifier ? mergePaths(current, rangePaths) : rangePaths,
      );
      return;
    }

    if (modifier) {
      setSelectedPaths((current) =>
        current.includes(path)
          ? current.filter((currentPath) => currentPath !== path)
          : [...current, path],
      );
      setSelectionAnchorPath(path);
      return;
    }

    setSelectedPaths([path]);
    setSelectionAnchorPath(path);
  };

  const selectFocusedEntry = (path: string): void => {
    if (!entries.some((entry) => entry.path === path)) return;
    setSelectedPaths([path]);
    setSelectionAnchorPath(path);
  };

  const selectContextEntry = (path: string): void => {
    if (selectedPaths.has(path)) return;
    setSelectedPaths([path]);
    setSelectionAnchorPath(path);
  };

  const beginMarquee = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || isMarqueeBlockedTarget(event.target)) return;
    event.preventDefault();
    marqueeStartRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      additive: event.metaKey || event.ctrlKey,
      basePaths: selectedPathsRef.current,
    };
    setMarquee({
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    });
  };

  const handleContentClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (
      event.target !== event.currentTarget ||
      isMarqueeBlockedTarget(event.target)
    ) {
      return;
    }
    if (suppressNextEmptyClickRef.current) {
      suppressNextEmptyClickRef.current = false;
      return;
    }
    clearSelection();
  };

  return {
    selectedPaths,
    selectedEntries,
    selectedEntry,
    marquee,
    beginMarquee,
    handleContentClick,
    registerEntryElement,
    clearSelection,
    selectFocusedEntry,
    selectEntry,
    selectContextEntry,
  };
}
