import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useFileSelection } from './use-file-selection';
import type { FileEntry } from './types';

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

describe('useFileSelection', () => {
  it.each(['vertical', 'horizontal'] as const)(
    'ignores scrollbar %s drag events',
    async (orientation) => {
      await renderSelectionHarness();
      const fileItem = getElement<HTMLButtonElement>('[data-file-item]');

      await act(async () => {
        fileItem.click();
      });

      const thumb = getElement<HTMLSpanElement>('[data-testid="scroll-thumb"]');
      const scrollbar = getElement<HTMLDivElement>('[data-testid="scrollbar"]');
      scrollbar.dataset.orientation = orientation;

      await act(async () => {
        thumb.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            button: 0,
            clientX: 20,
            clientY: 20,
          }),
        );
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 180,
            clientY: 180,
          }),
        );
        window.dispatchEvent(
          new MouseEvent('mouseup', {
            bubbles: true,
            button: 0,
            clientX: 180,
            clientY: 180,
          }),
        );
      });

      expect(getElement('[data-testid="marquee-state"]').textContent).toBe(
        'idle',
      );
      expect(getElement('[data-testid="selected-count"]').textContent).toBe(
        '1',
      );
    },
  );

  it('still starts a marquee from the blank viewport', async () => {
    await renderSelectionHarness();
    const viewport = getElement<HTMLDivElement>('[data-testid="viewport"]');

    await act(async () => {
      viewport.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        }),
      );
    });

    expect(getElement('[data-testid="marquee-state"]').textContent).toBe(
      'active',
    );
  });

  it('selects focused entry as a regular single selection', async () => {
    await act(async () => {
      root.render(<FocusSelectionHarness />);
    });

    const first = getElement<HTMLButtonElement>(
      '[data-testid="focus-first-entry"]',
    );
    const second = getElement<HTMLButtonElement>(
      '[data-testid="focus-second-entry"]',
    );
    const focusSecond = getElement<HTMLButtonElement>(
      '[data-testid="select-focused-second"]',
    );

    await act(async () => first.click());
    await act(async () =>
      second.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      ),
    );
    expect(getElement('[data-testid="selected-count"]').textContent).toBe('2');

    await act(async () => focusSecond.click());

    expect(getElement('[data-testid="selected-count"]').textContent).toBe('1');
    expect(getElement('[data-testid="selected-paths"]').textContent).toBe(
      secondFileEntry.path,
    );
  });
});

async function renderSelectionHarness(): Promise<void> {
  await act(async () => {
    root.render(<SelectionHarness />);
  });
}

function SelectionHarness() {
  const selection = useFileSelection([fileEntry]);
  return (
    <div
      data-testid='viewport'
      onMouseDown={selection.beginMarquee}
      onClick={selection.handleContentClick}
    >
      <button
        type='button'
        data-file-item='true'
        ref={(node) => selection.registerEntryElement(fileEntry.path, node)}
        onClick={(event) => selection.selectEntry(fileEntry.path, event)}
      >
        {fileEntry.name}
      </button>
      <div data-testid='scrollbar' data-orientation='vertical'>
        <span data-testid='scroll-thumb' />
      </div>
      <output data-testid='marquee-state'>
        {selection.marquee ? 'active' : 'idle'}
      </output>
      <output data-testid='selected-count'>
        {selection.selectedPaths.size}
      </output>
    </div>
  );
}

function FocusSelectionHarness() {
  const entries = [fileEntry, secondFileEntry];
  const selection = useFileSelection(entries);
  return (
    <div>
      {entries.map((entry, index) => (
        <button
          key={entry.path}
          type='button'
          data-file-item='true'
          data-testid={`focus-${index === 0 ? 'first' : 'second'}-entry`}
          onClick={(event) => selection.selectEntry(entry.path, event)}
        >
          {entry.name}
        </button>
      ))}
      <button
        type='button'
        data-testid='select-focused-second'
        onClick={() => selection.selectFocusedEntry(secondFileEntry.path)}
      >
        Select focused second entry
      </button>
      <output data-testid='selected-count'>
        {selection.selectedPaths.size}
      </output>
      <output data-testid='selected-paths'>
        {[...selection.selectedPaths].join('|')}
      </output>
    </div>
  );
}

function getElement<T extends HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const fileEntry: FileEntry = {
  name: 'Episode 01.mkv',
  path: 'Episode 01.mkv',
  type: 'file',
  size: 1_500_000_000,
  modifiedAt: '2026-08-25T09:00:00.000Z',
  permissions: { readWrite: true, rename: true },
  isTorrentLinked: false,
};

const secondFileEntry: FileEntry = {
  ...fileEntry,
  name: 'Episode 02.mkv',
  path: 'Episode 02.mkv',
};
