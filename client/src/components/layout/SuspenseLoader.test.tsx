import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import SuspenseLoader from './SuspenseLoader';

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

describe('SuspenseLoader', () => {
  it('uses the discover skeleton for the discover route', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/discover']}>
          <SuspenseLoader />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(
      container
        .querySelector('[role="status"]')
        ?.querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(10);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('keeps the generic spinner for other routes', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/search']}>
          <SuspenseLoader />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(
      container.querySelector('svg')?.classList.contains('animate-spin'),
    ).toBe(true);
  });
});
