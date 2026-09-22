import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileContent,
  type FileContentActionProps,
  type FileContentSelectionProps,
} from './content';
import type { FileEntry } from './types';
import type { DirectorySizeResult } from './use-directory-sizes';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('FileContent', () => {
  it.each(['list', 'grid'] as const)(
    'uses the shared scroll area for %s view',
    async (viewMode) => {
      await act(async () => {
        root.render(
          <FileContent
            entries={[fileEntry]}
            directorySizes={new Map<string, DirectorySizeResult>()}
            viewMode={viewMode}
            selection={selection}
            state={{
              search: '',
              isPending: false,
              errorMessage: null,
              isConfigurationError: false,
            }}
            actions={actions}
          />,
        );
      });

      const fileContent = container.querySelector(
        '[data-testid="file-content"]',
      );
      const viewport = fileContent?.querySelector(
        '[data-radix-scroll-area-viewport]',
      );

      expect(fileContent).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(viewport?.querySelector('[data-file-item]')).not.toBeNull();
      expect(fileContent?.className).not.toContain('overflow-auto');
      expect(fileContent?.className).toContain('min-h-0');
      expect(fileContent?.className).toContain('min-w-0');
    },
  );

  it.each(['list', 'grid'] as const)(
    'uses a blue hover state for selected items in %s view',
    async (viewMode) => {
      const selectedEntry: FileEntry = {
        ...fileEntry,
        name: 'Selected episode.mkv',
        path: 'Selected episode.mkv',
      };
      const unselectedEntry: FileEntry = {
        ...fileEntry,
        name: 'Unselected episode.mkv',
        path: 'Unselected episode.mkv',
      };

      await act(async () => {
        root.render(
          <FileContent
            entries={[selectedEntry, unselectedEntry]}
            directorySizes={new Map<string, DirectorySizeResult>()}
            viewMode={viewMode}
            selection={{
              ...selection,
              selectedPaths: new Set([selectedEntry.path]),
            }}
            state={{
              search: '',
              isPending: false,
              errorMessage: null,
              isConfigurationError: false,
            }}
            actions={actions}
          />,
        );
      });

      const selectedItem = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Selected episode.mkv"]',
      );
      const unselectedItem = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Unselected episode.mkv"]',
      );
      const selectedHoverClass =
        viewMode === 'grid' ? 'hover:bg-sky-500/20' : 'hover:bg-blue-500/20';

      expect(selectedItem?.className).toContain('bg-blue-500/10');
      expect(selectedItem?.className).toContain(selectedHoverClass);
      expect(selectedItem?.className).not.toContain('hover:bg-white/[0.035]');
      expect(unselectedItem?.className).toContain('hover:bg-white/[0.035]');
      expect(unselectedItem?.className).not.toContain(selectedHoverClass);
    },
  );

  it.each(['list', 'grid'] as const)(
    'selects keyboard-focused items and opens directories with Enter in %s view',
    async (viewMode) => {
      const directoryEntry: FileEntry = {
        ...fileEntry,
        name: 'Shows',
        path: 'Shows',
        type: 'directory',
        size: null,
        isTorrentLinked: false,
      };
      const selectFocusedEntry = vi.fn();
      const onOpen = vi.fn();

      await act(async () => {
        root.render(
          <FileContent
            entries={[directoryEntry]}
            directorySizes={new Map<string, DirectorySizeResult>()}
            viewMode={viewMode}
            selection={{ ...selection, selectFocusedEntry }}
            state={{
              search: '',
              isPending: false,
              errorMessage: null,
              isConfigurationError: false,
            }}
            actions={{ ...actions, onOpen }}
          />,
        );
      });

      const directoryItem = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Shows"]',
      );
      if (!directoryItem) throw new Error('Missing directory item');

      await act(async () => {
        directoryItem.focus();
      });

      expect(selectFocusedEntry).toHaveBeenCalledWith(directoryEntry.path);

      const enterEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
      });
      await act(async () => directoryItem.dispatchEvent(enterEvent));

      expect(onOpen).toHaveBeenCalledWith(directoryEntry);
      expect(enterEvent.defaultPrevented).toBe(true);
    },
  );

  it('does not select items focused by pointer before click handles selection', async () => {
    const selectFocusedEntry = vi.fn();

    await act(async () => {
      root.render(
        <FileContent
          entries={[fileEntry]}
          directorySizes={new Map<string, DirectorySizeResult>()}
          viewMode='grid'
          selection={{ ...selection, selectFocusedEntry }}
          state={{
            search: '',
            isPending: false,
            errorMessage: null,
            isConfigurationError: false,
          }}
          actions={actions}
        />,
      );
    });

    const fileItem = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Episode 01.mkv"]',
    );
    if (!fileItem) throw new Error('Missing file item');

    await act(async () => {
      fileItem.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
      );
      fileItem.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      fileItem.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0 }),
      );
    });

    expect(selectFocusedEntry).not.toHaveBeenCalled();
  });

  it('opens settings for an unconfigured directory', async () => {
    const onOpenSettings = vi.fn();
    const onRetry = vi.fn();

    await act(async () => {
      root.render(
        <FileContent
          entries={[]}
          directorySizes={new Map<string, DirectorySizeResult>()}
          viewMode='grid'
          selection={selection}
          state={{
            search: '',
            isPending: false,
            errorMessage: 'Media directory is not configured',
            isConfigurationError: true,
          }}
          actions={{ ...actions, onOpenSettings, onRetry }}
        />,
      );
    });

    const settingsButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Open settings',
    );
    expect(settingsButton).toBeDefined();
    expect(container.textContent).not.toContain('Try again');

    await act(async () => settingsButton?.click());

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});

const fileEntry: FileEntry = {
  name: 'Episode 01.mkv',
  path: 'Episode 01.mkv',
  type: 'file',
  size: 1_500_000_000,
  modifiedAt: '2026-08-25T09:00:00.000Z',
  permissions: { readWrite: true, rename: true },
  isTorrentLinked: false,
};

const selection: FileContentSelectionProps = {
  selectedPaths: new Set<string>(),
  canRename: () => true,
  marquee: null,
  beginMarquee: () => undefined,
  handleContentClick: () => undefined,
  registerEntryElement: () => undefined,
  selectFocusedEntry: () => undefined,
  registerDirectorySizeElement: () => undefined,
  onSelect: () => undefined,
  onContextMenu: () => undefined,
};

const actions: FileContentActionProps = {
  canPaste: false,
  onRetry: () => undefined,
  onOpenSettings: () => undefined,
  onOpen: () => undefined,
  onCopy: () => undefined,
  onMove: () => undefined,
  onDelete: () => undefined,
  onRename: () => undefined,
  onPaste: () => undefined,
};
