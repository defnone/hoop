import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { DashboardLayout } from './layout';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn<
    () => {
      data: { session: { id: string } } | null;
      isPending: boolean;
    }
  >(),
}));

vi.mock('@/lib/auth-client', () => ({
  useSession: useSessionMock,
}));

vi.mock('@/components/layout/Header', () => ({
  default: () => <div data-testid='header'>Header</div>,
}));

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
  vi.clearAllMocks();
});

describe('DashboardLayout', () => {
  it('shows the discover skeleton while the session is loading', async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true });

    await renderLayout('/discover');

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(
      container
        .querySelector('[role="status"]')
        ?.querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(10);
    expect(container.querySelector('[data-testid="header"]')).toBeNull();
  });

  it('renders nothing for a settled unauthenticated session', async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });

    await renderLayout('/discover');

    expect(container.childElementCount).toBe(0);
  });
});

async function renderLayout(path: string): Promise<void> {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path='/discover' element={<div>Discover route</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
}
