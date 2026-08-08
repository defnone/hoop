import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import Discover from './discover';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { customSonnerMock, useSettingsMock } = vi.hoisted(() => ({
  customSonnerMock: vi.fn(),
  useSettingsMock: vi.fn(() => ({ settingsData: null })),
}));

vi.mock('@/components/CustomSonner', () => ({
  default: customSonnerMock,
}));

vi.mock('@/hooks/useSettings', () => ({
  default: useSettingsMock,
}));

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  customSonnerMock.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Discover', () => {
  it('loads the selected TMDB period and uses the TMDB query key', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            title: 'Example',
            rating: 8.4,
            popularity: 42.7,
            backdropUrl: null,
            detailsUrl: 'https://www.themoviedb.org/tv/1',
            trailerUrl: null,
            imdbId: null,
          },
        ]),
        { status: 200 },
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/discover?period=daily']}>
            <Discover />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Example');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hoop-tmdb-api.defnone.workers.dev/api/tmdb/daily',
    );
    expect(queryClient.getQueryState(['tmdb', 'daily'])).toBeDefined();
    expect(document.body.textContent).toContain(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    );
    const attributionParagraph = container
      .querySelector('a[href="https://www.themoviedb.org"]')
      ?.closest('p');
    const header = container.querySelector('h1')?.parentElement;
    expect(
      header?.querySelector('a[href="https://www.themoviedb.org"]'),
    ).toBeNull();
    expect(attributionParagraph?.previousElementSibling?.className).toContain(
      'grid',
    );
    expect(attributionParagraph?.querySelector('svg')).not.toBeNull();
  });

  it('shows an accessible skeleton grid while TMDB data is loading', async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Discover />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    const loadingGrid = container.querySelector('[role="status"]');
    expect(loadingGrid).not.toBeNull();
    expect(loadingGrid?.getAttribute('aria-label')).toBe(
      'Loading discover items',
    );
    expect(loadingGrid?.getAttribute('aria-busy')).toBe('true');

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons).toHaveLength(10);
    expect(
      skeletons[0]?.parentElement?.classList.contains('md:col-span-2'),
    ).toBe(true);
    expect(
      skeletons[1]?.parentElement?.classList.contains('lg:col-span-2'),
    ).toBe(true);
    expect(skeletons[0]?.classList.contains('row-span-2')).toBe(true);
    expect(skeletons[0]?.classList.contains('h-[400px]')).toBe(true);
    expect(skeletons[1]?.classList.contains('h-[400px]')).toBe(true);
    expect(skeletons[2]?.classList.contains('h-[300px]')).toBe(true);
    expect(skeletons[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('reports non-OK TMDB responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retryDelay: 0,
        },
      },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Discover />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    await vi.waitFor(() => {
      expect(customSonnerMock).toHaveBeenCalledWith({
        variant: 'error',
        text: 'Failed to fetch data from TMDB: TMDB request failed with status 503',
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Unable to load TMDB recommendations.',
    );

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const retryButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Retry',
    );
    expect(retryButton).toBeDefined();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });
});
