import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DiscoverSkeleton from './DiscoverSkeleton';

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

describe('DiscoverSkeleton', () => {
  it('renders ten accessible skeleton cards with the discover layout', async () => {
    await act(async () => {
      root.render(<DiscoverSkeleton />);
    });

    const loadingGrid = container.querySelector('[role="status"]');
    expect(loadingGrid?.getAttribute('aria-label')).toBe(
      'Loading discover items',
    );
    expect(loadingGrid?.getAttribute('aria-busy')).toBe('true');

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons).toHaveLength(10);
    expect(
      skeletons[0]?.parentElement?.classList.contains('md:col-span-2'),
    ).toBe(true);
    expect(skeletons[1]?.classList.contains('h-[400px]')).toBe(true);
    expect(skeletons[2]?.classList.contains('h-[300px]')).toBe(true);
    expect(skeletons[0]?.classList.contains('bg-muted/60')).toBe(true);
    expect(skeletons[0]?.classList.contains('border-zinc-700')).toBe(false);
    expect(skeletons[0]?.childElementCount).toBe(0);
    expect(skeletons[0]?.getAttribute('aria-hidden')).toBe('true');
  });
});
