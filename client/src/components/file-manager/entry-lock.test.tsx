import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntryLock } from './entry-lock';
import {
  getEntryAccessibleLabel,
  type EntryLockProps,
} from './entry-lock.utils';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  installResizeObserverMock();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('EntryLock', () => {
  it('keeps lock trigger non-interactive and adds details to item label', async () => {
    const props: EntryLockProps = {
      permissionLimited: true,
      isTorrentLinked: false,
      ownership: {
        actual: { uid: 501, gid: 20, user: 'media', group: 'staff' },
        expected: { uid: 1000, gid: 1000, user: 'app', group: 'app' },
      },
    };

    await act(async () => {
      root.render(
        <button
          type='button'
          aria-label={getEntryAccessibleLabel('Restricted.mkv', props)}
        >
          <EntryLock {...props} />
        </button>,
      );
    });

    const trigger = getTrigger();
    expect(trigger.tagName).toBe('SPAN');
    expect(trigger.hasAttribute('tabindex')).toBe(false);
    expect(trigger.getAttribute('role')).toBeNull();
    expect(
      container.querySelector('button')?.getAttribute('aria-label'),
    ).toContain('Restricted.mkv. Permission denied');
    expect(
      container.querySelector('button')?.getAttribute('aria-label'),
    ).toContain('Actual owner: media:staff (UID:GID 501:20)');
    expect(
      container.querySelector('button')?.getAttribute('aria-label'),
    ).toContain('Expected owner: app:app (UID:GID 1000:1000)');
  });

  it('keeps torrent reason with permission details in one tooltip', async () => {
    await renderEntryLock({
      permissionLimited: true,
      isTorrentLinked: true,
      ownership: {
        actual: { uid: 0, gid: 0, user: null, group: null },
        expected: { uid: 1000, gid: 1000, user: null, group: null },
      },
    });

    const trigger = getTrigger();
    await act(async () => {
      trigger.dispatchEvent(new Event('pointermove', { bubbles: true }));
      await waitForTooltip();
    });

    const tooltip = getTooltip();
    expect(
      document.body.querySelectorAll('[data-testid="file-entry-lock-tooltip"]'),
    ).toHaveLength(1);
    expect(tooltip.textContent).toContain('Permission denied');
    expect(tooltip.textContent).toContain('Linked to torrent');
  });

  it('does not render owner tooltip when entry has write access', async () => {
    await renderEntryLock({
      permissionLimited: false,
      isTorrentLinked: false,
      ownership: {
        actual: { uid: 501, gid: 20, user: 'media', group: 'staff' },
        expected: { uid: 1000, gid: 1000, user: 'app', group: 'app' },
      },
    });

    expect(
      container.querySelector('[data-testid="file-entry-lock-trigger"]'),
    ).toBeNull();
  });
});

async function renderEntryLock(props: EntryLockProps): Promise<void> {
  await act(async () => {
    root.render(<EntryLock {...props} />);
  });
}

function getTrigger(): HTMLElement {
  const trigger = container.querySelector<HTMLElement>(
    '[data-testid="file-entry-lock-trigger"]',
  );
  if (!trigger) throw new Error('Missing lock trigger');
  return trigger;
}

function getTooltip(): HTMLElement {
  const tooltip = document.body.querySelector<HTMLElement>(
    '[data-testid="file-entry-lock-tooltip"]',
  );
  if (!tooltip) throw new Error('Missing lock tooltip');
  return tooltip;
}

async function waitForTooltip(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function installResizeObserverMock(): void {
  if (globalThis.ResizeObserver) return;
  class TestResizeObserver implements ResizeObserver {
    constructor(_callback: ResizeObserverCallback) {}

    disconnect(): void {}

    observe(_target: Element, _options?: ResizeObserverOptions): void {}

    unobserve(_target: Element): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
  });
}
