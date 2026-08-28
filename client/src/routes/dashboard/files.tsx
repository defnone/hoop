import customSonner from '@/components/CustomSonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useLocation as useRouterLocation,
  useNavigationType,
  useNavigate,
  type Location as RouterLocation,
} from 'react-router';
import { rpc } from '@/lib/rpc';
import { FileContent } from '@/components/file-manager/content';
import {
  FileManagerDialogs,
  type BatchRenameFormState,
} from '@/components/file-manager/dialogs';
import { FileSidebar } from '@/components/file-manager/sidebar';
import { FileToolbar } from '@/components/file-manager/toolbar/main';
import type {
  ClipboardState,
  DirectoryData,
  FileEntry,
  Location,
  SortMode,
} from '@/components/file-manager/types';
import { usePersistedViewMode } from '@/components/file-manager/use-persisted-view-mode';
import { useFileSelection } from '@/components/file-manager/use-file-selection';
import {
  useDirectorySizes,
  type DirectorySizeResult,
} from '@/components/file-manager/use-directory-sizes';
import {
  canRenameEntry,
  compareEntries,
  formatSelectedSizeSummary,
  getBatchRenameOptions,
  getBatchRenamePreview,
  getBatchRenameValidationMessage,
  getSelectedSizeSummary,
  isEditableElement,
  joinPath,
  openEntry,
  rootLabel,
} from '@/components/file-manager/utils';
import type { BatchRenamePreview } from '@/components/file-manager/utils';

type MutationOperation =
  | 'copy'
  | 'move'
  | 'delete'
  | 'rename'
  | 'rename-batch'
  | 'directory';

type BatchRenameMutationItem = {
  path: string;
  name: string;
};

type MutationRequest = {
  operation: MutationOperation;
  clipboard: ClipboardState | null;
  deleteTargets: FileEntry[];
  renameBatchItems?: BatchRenameMutationItem[];
};

type PartialMutationOutcome = 'destination-preserved';

type PartialMutationProgress =
  | {
      type: 'clipboard';
      remaining: ClipboardState['items'];
      outcome?: PartialMutationOutcome;
    }
  | {
      type: 'delete';
      remaining: FileEntry[];
    };

type FileManagerHistoryState = {
  fileManagerHistoryIndex: number;
};

const DEFAULT_BATCH_RENAME_FORM: BatchRenameFormState = {
  mode: 'replace',
  replaceFind: '',
  replaceReplacement: '',
  addText: '',
  addPosition: 'before',
  formatName: '',
  format: 'name-index',
  formatPosition: 'after',
  startNumber: 1,
};

const DIRECTORY_QUERY_MAX_RETRIES = 2;
const DESTINATION_PRESERVED_MESSAGE =
  'Move incomplete; source was not removed and destination was preserved';

export default function FileManager() {
  const routerLocation = useRouterLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useMemo(
    () => parseFileManagerLocation(routerLocation.search),
    [routerLocation.search],
  );
  const historyState = getFileManagerHistoryState(routerLocation.state);
  const historyIndex = historyState?.fileManagerHistoryIndex ?? 0;
  const [maxHistoryIndex, setMaxHistoryIndex] = useState(historyIndex);
  const [externalTerminalKey, setExternalTerminalKey] = useState<string | null>(
    null,
  );
  const internalNavigationRef = useRef(false);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<FileEntry[]>([]);
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [batchRenameTargets, setBatchRenameTargets] = useState<FileEntry[]>([]);
  const [batchRenameForm, setBatchRenameForm] = useState<BatchRenameFormState>(
    DEFAULT_BATCH_RENAME_FORM,
  );
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('New Folder');
  const [viewMode, setViewMode] = usePersistedViewMode();
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [search, setSearch] = useState('');

  const directoryQuery = useQuery({
    queryKey: ['file-manager', location.root, location.path],
    queryFn: async (): Promise<DirectoryData> => {
      const response = await rpc.api['file-manager'].$get({
        query: { root: location.root, path: location.path },
      });
      const body = await response.json();
      if (!response.ok || !body.success || !body.data) {
        throw new DirectoryQueryError(
          body.message ?? 'Failed to open directory',
          response.status,
        );
      }
      return body.data;
    },
    retry: shouldRetryDirectoryQuery,
  });

  const filteredEntries = useMemo(() => {
    const listedEntries = directoryQuery.data?.entries ?? [];
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return listedEntries.filter((entry) =>
      entry.name.toLocaleLowerCase().includes(normalizedSearch),
    );
  }, [directoryQuery.data?.entries, search]);

  const fetchDirectorySizes = useCallback(
    async (
      root: Location['root'],
      paths: string[],
    ): Promise<DirectorySizeResult[]> => {
      const response = await rpc.api['file-manager'].sizes.$post({
        json: {
          locations: paths.map((path) => ({ root, path })),
        },
      });
      const body = await response.json();
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.message ?? 'Failed to calculate directory sizes');
      }
      return body.data;
    },
    [],
  );

  const directorySizeState = useDirectorySizes({
    root: location.root,
    locationPath: location.path,
    listingUpdatedAt: directoryQuery.dataUpdatedAt,
    entries: filteredEntries,
    fetchSizes: fetchDirectorySizes,
  });

  const entries = useMemo(
    () =>
      [...filteredEntries].sort((left, right) =>
        compareEntries(
          left,
          right,
          sortMode,
          directorySizeState.directorySizes,
        ),
      ),
    [directorySizeState.directorySizes, filteredEntries, sortMode],
  );

  const batchRenameOptions = useMemo(
    () => getBatchRenameOptions(batchRenameForm),
    [batchRenameForm],
  );
  const batchRenamePreview: BatchRenamePreview[] = useMemo(
    () => getBatchRenamePreview(batchRenameTargets, batchRenameOptions),
    [batchRenameOptions, batchRenameTargets],
  );
  const batchRenameValidationMessage = useMemo(
    () =>
      getBatchRenameValidationMessage(batchRenamePreview, batchRenameOptions),
    [batchRenameOptions, batchRenamePreview],
  );

  const selection = useFileSelection(entries);
  const requestDirectorySize = directorySizeState.requestDirectorySize;
  const releaseDirectorySize = directorySizeState.releaseDirectorySize;
  const selectedDirectoryPathKey = [
    ...new Set(
      selection.selectedEntries
        .filter((entry) => entry.type === 'directory' && entry.size === null)
        .map((entry) => entry.path),
    ),
  ]
    .sort()
    .join('\u0000');
  const requestDirectorySizeRef = useRef(requestDirectorySize);
  const releaseDirectorySizeRef = useRef(releaseDirectorySize);
  useEffect(() => {
    requestDirectorySizeRef.current = requestDirectorySize;
    releaseDirectorySizeRef.current = releaseDirectorySize;
  }, [releaseDirectorySize, requestDirectorySize]);
  useEffect(() => {
    const selectedDirectoryPaths = selectedDirectoryPathKey
      ? selectedDirectoryPathKey.split('\u0000')
      : [];
    for (const path of selectedDirectoryPaths) {
      requestDirectorySizeRef.current(path);
    }
    return () => {
      for (const path of selectedDirectoryPaths) {
        releaseDirectorySizeRef.current(path);
      }
    };
  }, [selectedDirectoryPathKey]);

  const selectedSizeSummary = useMemo(
    () =>
      getSelectedSizeSummary(
        selection.selectedEntries,
        directorySizeState.directorySizes,
      ),
    [directorySizeState.directorySizes, selection.selectedEntries],
  );
  const clearSelectionRef = useRef(selection.clearSelection);
  useEffect(() => {
    clearSelectionRef.current = selection.clearSelection;
  }, [selection.clearSelection]);

  useEffect(() => {
    if (internalNavigationRef.current) {
      internalNavigationRef.current = false;
      return;
    }
    if (
      historyState !== null ||
      navigationType === 'POP' ||
      maxHistoryIndex <= 0
    ) {
      return;
    }
    // Mark state-less push after indexed entries as terminal file history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExternalTerminalKey(routerLocation.key);
  }, [historyState, maxHistoryIndex, navigationType, routerLocation.key]);

  useEffect(() => {
    const handlePopState = (): void => {
      clearSelectionRef.current();
      setSearch('');
      setBatchRenameTargets([]);
      setBatchRenameForm(DEFAULT_BATCH_RENAME_FORM);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const mutateEntry = useMutation<void, Error, MutationRequest>({
    mutationFn: async ({
      operation,
      clipboard: mutationClipboard,
      deleteTargets: mutationDeleteTargets,
      renameBatchItems,
    }): Promise<void> => {
      if (operation === 'delete') {
        for (let index = 0; index < mutationDeleteTargets.length; index += 1) {
          const target = mutationDeleteTargets[index];
          if (!target) continue;
          try {
            const response = await rpc.api['file-manager'].$delete({
              json: {
                target: { root: location.root, path: target.path },
              },
            });
            const body = await response.json();
            if (!response.ok || !body.success) {
              throw new Error(body.message ?? 'Failed to delete item');
            }
          } catch (error) {
            throw new PartialMutationError(
              getMutationErrorMessage(Object(error), 'Failed to delete item'),
              {
                type: 'delete',
                remaining: mutationDeleteTargets.slice(index),
              },
            );
          }
        }
        return;
      }

      if (operation === 'rename') {
        if (!renameTarget) return;
        const response = await rpc.api['file-manager'].rename.$post({
          json: {
            target: { root: location.root, path: renameTarget.path },
            name: renameName.trim(),
          },
        });
        const body = await response.json();
        if (!response.ok || !body.success) {
          throw new Error(body.message ?? 'Failed to rename item');
        }
        return;
      }

      if (operation === 'rename-batch') {
        const response = await rpc.api['file-manager']['rename-batch'].$post({
          json: {
            root: location.root,
            items: renameBatchItems ?? [],
          },
        });
        const body = await response.json();
        if (!response.ok || !body.success) {
          throw new Error(body.message ?? 'Failed to rename items');
        }
        return;
      }

      if (operation === 'directory') {
        const response = await rpc.api['file-manager'].directory.$post({
          json: {
            location: { root: location.root, path: location.path },
            name: newFolderName.trim(),
          },
        });
        const body = await response.json();
        if (!response.ok || !body.success) {
          throw new Error(body.message ?? 'Failed to create folder');
        }
        return;
      }

      if (!mutationClipboard) return;
      for (let index = 0; index < mutationClipboard.items.length; index += 1) {
        const item = mutationClipboard.items[index];
        if (!item) continue;
        try {
          const request = {
            json: {
              source: { root: item.root, path: item.path },
              destination: {
                root: location.root,
                path: joinPath(location.path, item.name),
              },
            },
          };
          const response =
            operation === 'copy'
              ? await rpc.api['file-manager'].copy.$post(request)
              : await rpc.api['file-manager'].move.$post(request);
          const body = await response.json();
          if (!response.ok || !body.success) {
            const outcome =
              operation === 'move' ? getMutationOutcome(body) : undefined;
            throw new MutationResponseError(
              body.message ??
                (outcome === 'destination-preserved'
                  ? DESTINATION_PRESERVED_MESSAGE
                  : `Failed to ${operation} item`),
              outcome,
            );
          }
        } catch (error) {
          const outcome =
            error instanceof MutationResponseError ? error.outcome : undefined;
          throw new PartialMutationError(
            getMutationErrorMessage(
              Object(error),
              `Failed to ${operation} item`,
            ),
            {
              type: 'clipboard',
              remaining:
                outcome === 'destination-preserved'
                  ? mutationClipboard.items.slice(index + 1)
                  : mutationClipboard.items.slice(index),
              ...(outcome ? { outcome } : {}),
            },
          );
        }
      }
    },
    onSuccess: async (_, { operation }) => {
      await queryClient.invalidateQueries({ queryKey: ['file-manager'] });
      selection.clearSelection();
      setDeleteTargets([]);
      setRenameTarget(null);
      setRenameName('');
      setBatchRenameTargets([]);
      setBatchRenameForm(DEFAULT_BATCH_RENAME_FORM);
      if (operation === 'directory') {
        setNewFolderOpen(false);
        setNewFolderName('New Folder');
      }
      if (operation === 'move') setClipboard(null);
      customSonner({
        text:
          operation === 'delete'
            ? 'Item deleted'
            : operation === 'rename'
              ? 'Item renamed'
              : operation === 'rename-batch'
                ? 'Items renamed'
                : operation === 'directory'
                  ? 'Folder created'
                  : operation === 'copy'
                    ? 'Item copied'
                    : 'Item moved',
      });
    },
    onError: (error: Error, request: MutationRequest) => {
      if (error instanceof PartialMutationError) {
        const progress = error.progress;
        if (progress.type === 'delete') {
          setDeleteTargets((currentTargets) =>
            currentTargets === request.deleteTargets
              ? progress.remaining
              : currentTargets,
          );
        } else {
          setClipboard((currentClipboard) =>
            currentClipboard === request.clipboard && currentClipboard
              ? progress.remaining.length > 0
                ? { ...currentClipboard, items: progress.remaining }
                : null
              : currentClipboard,
          );
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['file-manager'] });
      const message =
        error instanceof PartialMutationError &&
        error.progress.type === 'clipboard' &&
        error.progress.outcome === 'destination-preserved'
          ? DESTINATION_PRESERVED_MESSAGE
          : error.message;
      customSonner({ variant: 'error', text: message });
    },
  });

  const isOperationBusy = directoryQuery.isFetching || mutateEntry.isPending;
  const isExternalStateLessEntry =
    historyState === null &&
    maxHistoryIndex > 0 &&
    (navigationType !== 'POP' || routerLocation.key === externalTerminalKey);
  const currentHistoryIndex = isExternalStateLessEntry
    ? maxHistoryIndex + 1
    : historyIndex;
  const effectiveMaxHistoryIndex = isExternalStateLessEntry
    ? currentHistoryIndex
    : maxHistoryIndex;

  const navigateTo = (next: Location): void => {
    if (next.root === location.root && next.path === location.path) return;
    const nextHistoryIndex = currentHistoryIndex + 1;
    internalNavigationRef.current = true;
    setExternalTerminalKey(null);
    navigate(
      {
        pathname: '/files',
        search: serializeFileManagerLocation(next),
      },
      { state: { fileManagerHistoryIndex: nextHistoryIndex } },
    );
    setMaxHistoryIndex(nextHistoryIndex);
    resetTransientState();
  };

  const goBack = (): void => {
    if (currentHistoryIndex <= 0) return;
    resetTransientState();
    navigate(-1);
  };

  const goForward = (): void => {
    if (currentHistoryIndex >= effectiveMaxHistoryIndex) return;
    resetTransientState();
    navigate(1);
  };

  const resetTransientState = (): void => {
    selection.clearSelection();
    setSearch('');
    setBatchRenameTargets([]);
    setBatchRenameForm(DEFAULT_BATCH_RENAME_FORM);
  };

  const copySelected = (
    mode: ClipboardState['mode'],
    entry?: FileEntry,
  ): void => {
    const targetEntries =
      entry && !selection.selectedPaths.has(entry.path)
        ? [entry]
        : selection.selectedEntries;
    if (targetEntries.length === 0) return;
    if (entry && !selection.selectedPaths.has(entry.path)) {
      selection.selectContextEntry(entry.path);
    }
    setClipboard({
      mode,
      items: targetEntries.map((target) => ({
        root: location.root,
        path: target.path,
        name: target.name,
      })),
    });
  };

  const requestDelete = (entry?: FileEntry): void => {
    const targetEntries =
      entry && !selection.selectedPaths.has(entry.path)
        ? [entry]
        : selection.selectedEntries;
    if (targetEntries.length === 0) return;
    if (entry && !selection.selectedPaths.has(entry.path)) {
      selection.selectContextEntry(entry.path);
    }
    setDeleteTargets(targetEntries);
  };

  const startRename = (entry: FileEntry): void => {
    if (!canRenameEntry(entry)) return;
    const isOnlySelected =
      selection.selectedEntries.length === 1 &&
      selection.selectedPaths.has(entry.path);
    if (!isOnlySelected) selection.selectContextEntry(entry.path);
    setRenameTarget(entry);
    setRenameName(entry.name);
  };

  const startBatchRename = (): void => {
    if (
      selection.selectedEntries.length < 2 ||
      selection.selectedEntries.some((entry) => !canRenameEntry(entry))
    ) {
      return;
    }
    setRenameTarget(null);
    setRenameName('');
    setBatchRenameForm(DEFAULT_BATCH_RENAME_FORM);
    setBatchRenameTargets(selection.selectedEntries);
  };

  const closeBatchRename = (): void => {
    setBatchRenameTargets([]);
    setBatchRenameForm(DEFAULT_BATCH_RENAME_FORM);
  };

  const submitBatchRename = (): void => {
    if (
      mutateEntry.isPending ||
      batchRenameValidationMessage !== null ||
      batchRenamePreview.length < 2
    ) {
      return;
    }
    mutateEntry.mutate({
      operation: 'rename-batch',
      clipboard,
      deleteTargets,
      renameBatchItems: batchRenamePreview.map(({ path, newName }) => ({
        path,
        name: newName,
      })),
    });
  };

  const paste = (): void => {
    if (!clipboard || mutateEntry.isPending) return;
    mutateEntry.mutate({
      operation: clipboard.mode,
      clipboard,
      deleteTargets,
    });
  };

  const openNewFolder = (): void => {
    setNewFolderName('New Folder');
    setNewFolderOpen(true);
  };

  const closeNewFolder = (): void => {
    setNewFolderOpen(false);
    setNewFolderName('New Folder');
  };

  const createFolder = (): void => {
    if (mutateEntry.isPending || !newFolderName.trim()) return;
    mutateEntry.mutate({
      operation: 'directory',
      clipboard,
      deleteTargets,
    });
  };

  const handleSearch = (value: string): void => {
    if (value !== search) selection.clearSelection();
    setSearch(value);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableElement(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLocaleLowerCase() === 'c') {
        event.preventDefault();
        copySelected('copy');
      }
      if (modifier && event.key.toLocaleLowerCase() === 'x') {
        event.preventDefault();
        copySelected('move');
      }
      if (modifier && event.key.toLocaleLowerCase() === 'v') {
        event.preventDefault();
        paste();
      }
      if (modifier && event.shiftKey && event.key.toLocaleLowerCase() === 'n') {
        event.preventDefault();
        openNewFolder();
      }
      if (event.key === 'Delete' && selection.selectedEntries.length > 0) {
        requestDelete();
      }
      if (
        event.key === 'F2' &&
        selection.selectedEntries.length > 1 &&
        selection.selectedEntries.every(canRenameEntry)
      ) {
        event.preventDefault();
        startBatchRename();
      } else if (
        event.key === 'F2' &&
        selection.selectedEntries.length === 1 &&
        selection.selectedEntry &&
        canRenameEntry(selection.selectedEntry)
      ) {
        event.preventDefault();
        startRename(selection.selectedEntry);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <main className='flex h-[calc(100vh-70px)] min-h-[540px] overflow-hidden bg-[#111214]'>
      <FileSidebar
        location={location}
        clipboard={clipboard}
        onNavigate={navigateTo}
      />

      <section className='flex min-w-0 flex-1 flex-col'>
        <FileToolbar
          location={location}
          historyAvailable={currentHistoryIndex > 0}
          futureAvailable={currentHistoryIndex < effectiveMaxHistoryIndex}
          viewMode={viewMode}
          sortMode={sortMode}
          search={search}
          isBusy={isOperationBusy}
          selectedEntry={selection.selectedEntry}
          selectedCount={selection.selectedEntries.length}
          canRenameSelected={Boolean(
            selection.selectedEntries.length > 0 &&
              selection.selectedEntries.every(canRenameEntry),
          )}
          clipboard={clipboard}
          onBack={goBack}
          onForward={goForward}
          onNavigate={navigateTo}
          onRefresh={() => void directoryQuery.refetch()}
          onSearch={handleSearch}
          onViewMode={setViewMode}
          onSortMode={setSortMode}
          onNewFolder={openNewFolder}
          onCopy={() => copySelected('copy')}
          onMove={() => copySelected('move')}
          onPaste={paste}
          onRename={() => {
            if (selection.selectedEntries.length > 1) {
              startBatchRename();
            } else if (selection.selectedEntry) {
              startRename(selection.selectedEntry);
            }
          }}
          onDelete={() => requestDelete()}
        />

        <FileContent
          entries={entries}
          directorySizes={directorySizeState.directorySizes}
          viewMode={viewMode}
          selection={{
            selectedPaths: selection.selectedPaths,
            marquee: selection.marquee,
            beginMarquee: selection.beginMarquee,
            handleContentClick: selection.handleContentClick,
            registerEntryElement: selection.registerEntryElement,
            selectFocusedEntry: selection.selectFocusedEntry,
            registerDirectorySizeElement:
              directorySizeState.registerDirectorySizeElement,
            canRename: (entry) => {
              if (!canRenameEntry(entry)) return false;
              if (selection.selectedEntries.length <= 1) return true;
              return selection.selectedPaths.has(entry.path)
                ? selection.selectedEntries.every(canRenameEntry)
                : true;
            },
            onSelect: selection.selectEntry,
            onContextMenu: selection.selectContextEntry,
          }}
          state={{
            search,
            isPending: directoryQuery.isPending,
            errorMessage: directoryQuery.isError
              ? directoryQuery.error.message
              : null,
            isConfigurationError:
              directoryQuery.isError &&
              isDirectoryConfigurationError(
                directoryQuery.error,
                location.root,
              ),
          }}
          actions={{
            canPaste: Boolean(clipboard),
            onRetry: () => void directoryQuery.refetch(),
            onOpenSettings: () => navigate('/settings'),
            onOpen: (entry) => openEntry(entry, location.root, navigateTo),
            onCopy: (entry) => copySelected('copy', entry),
            onMove: (entry) => copySelected('move', entry),
            onDelete: (entry) => requestDelete(entry),
            onRename: (entry) => {
              if (
                selection.selectedEntries.length > 1 &&
                selection.selectedPaths.has(entry.path)
              ) {
                startBatchRename();
              } else {
                startRename(entry);
              }
            },
            onPaste: paste,
          }}
        />

        <footer className='flex h-8 shrink-0 items-center justify-between border-t border-white/8 bg-[#151619] px-4 text-[11px] text-zinc-500'>
          <span data-testid='file-manager-status'>
            {selection.selectedEntries.length > 0
              ? formatSelectedSizeSummary(selectedSizeSummary)
              : `${entries.length} items`}
          </span>
          <span className='truncate pl-4'>
            {selection.selectedEntry?.name ?? rootLabel(location.root)}
          </span>
        </footer>
      </section>

      <FileManagerDialogs
        deleteTargets={deleteTargets}
        renameTarget={renameTarget}
        renameName={renameName}
        batchRenameTargets={batchRenameTargets}
        batchRenameForm={batchRenameForm}
        batchRenamePreview={batchRenamePreview}
        batchRenameValidationMessage={batchRenameValidationMessage}
        newFolderOpen={newFolderOpen}
        newFolderName={newFolderName}
        isPending={mutateEntry.isPending}
        onCloseDelete={() => setDeleteTargets([])}
        onDelete={() =>
          mutateEntry.mutate({
            operation: 'delete',
            clipboard,
            deleteTargets,
          })
        }
        onCloseRename={() => {
          setRenameTarget(null);
          setRenameName('');
        }}
        onRenameNameChange={setRenameName}
        onRename={() =>
          mutateEntry.mutate({
            operation: 'rename',
            clipboard,
            deleteTargets,
          })
        }
        onCloseBatchRename={closeBatchRename}
        onBatchRenameFormChange={setBatchRenameForm}
        onBatchRename={submitBatchRename}
        onCloseNewFolder={closeNewFolder}
        onNewFolderNameChange={setNewFolderName}
        onNewFolder={createFolder}
      />
    </main>
  );
}

class PartialMutationError extends Error {
  readonly progress: PartialMutationProgress;

  constructor(message: string, progress: PartialMutationProgress) {
    super(message);
    this.name = 'PartialMutationError';
    this.progress = progress;
  }
}

class MutationResponseError extends Error {
  readonly outcome?: PartialMutationOutcome;

  constructor(message: string, outcome?: PartialMutationOutcome) {
    super(message);
    this.name = 'MutationResponseError';
    this.outcome = outcome;
  }
}

class DirectoryQueryError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DirectoryQueryError';
    this.status = status;
  }
}

function shouldRetryDirectoryQuery(
  failureCount: number,
  error: Error,
): boolean {
  if (
    error instanceof DirectoryQueryError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }
  return failureCount < DIRECTORY_QUERY_MAX_RETRIES;
}

function isDirectoryConfigurationError(
  error: Error,
  root: Location['root'],
): boolean {
  return (
    error instanceof DirectoryQueryError &&
    error.message ===
      (root === 'media'
        ? 'Media directory is not configured'
        : 'Download directory is not configured')
  );
}

function getMutationErrorMessage(error: object, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getMutationOutcome(body: object): PartialMutationOutcome | undefined {
  return isDestinationPreservedResponse(body) ? body.outcome : undefined;
}

function isDestinationPreservedResponse(
  body: object,
): body is { outcome: 'destination-preserved' } {
  return 'outcome' in body && body.outcome === 'destination-preserved';
}

function parseFileManagerLocation(search: string): Location {
  const searchParams = new URLSearchParams(search);
  return {
    root: searchParams.get('root') === 'downloads' ? 'downloads' : 'media',
    path: searchParams.get('path') ?? '',
  };
}

function serializeFileManagerLocation(location: Location): string {
  const searchParams = new URLSearchParams();
  searchParams.set('root', location.root);
  searchParams.set('path', location.path);
  return `?${searchParams.toString()}`;
}

function getFileManagerHistoryState(
  state: RouterLocation['state'],
): FileManagerHistoryState | null {
  if (
    !state ||
    typeof state !== 'object' ||
    !('fileManagerHistoryIndex' in state)
  ) {
    return null;
  }

  const index = (state as FileManagerHistoryState).fileManagerHistoryIndex;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0
    ? { fileManagerHistoryIndex: index }
    : null;
}
