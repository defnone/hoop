import type {
  ClipboardState,
  FileEntry,
  Location,
  SortMode,
  ViewMode,
} from '../types';

export type FileToolbarProps = {
  location: Location;
  historyAvailable: boolean;
  futureAvailable: boolean;
  viewMode: ViewMode;
  sortMode: SortMode;
  search: string;
  isBusy: boolean;
  selectedEntry: FileEntry | null;
  selectedCount: number;
  canRenameSelected: boolean;
  clipboard: ClipboardState | null;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (location: Location) => void;
  onRefresh: () => void;
  onSearch: (value: string) => void;
  onViewMode: (mode: ViewMode) => void;
  onSortMode: (mode: SortMode) => void;
  onNewFolder: () => void;
  onCopy: () => void;
  onMove: () => void;
  onPaste: () => void;
  onRename: () => void;
  onDelete: () => void;
};
