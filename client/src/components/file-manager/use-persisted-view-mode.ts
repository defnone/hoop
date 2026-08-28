import { useState } from 'react';
import { FILE_MANAGER_VIEW_MODE_STORAGE_KEY } from './constants';
import type { ViewMode } from './types';

export function usePersistedViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);

  const updateViewMode = (mode: ViewMode): void => {
    setViewMode(mode);
    writeViewMode(mode);
  };

  return [viewMode, updateViewMode];
}

function readViewMode(): ViewMode {
  try {
    const storedMode = window.localStorage.getItem(
      FILE_MANAGER_VIEW_MODE_STORAGE_KEY,
    );
    return storedMode === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function writeViewMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(FILE_MANAGER_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}
