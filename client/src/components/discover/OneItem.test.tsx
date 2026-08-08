import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import OneItem from './OneItem';
import type { TmdbDiscoverItem } from '@/types/tmdb';

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

describe('OneItem', () => {
  it('renders a fallback when the backdrop is missing', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <OneItem
            item={createItem({ backdropUrl: null })}
            isBig={false}
            isJackettPrepared={false}
          />
        </MemoryRouter>,
      );
    });

    expect(document.body.textContent).toContain('No backdrop available');
    expect(container.querySelector('img')).toBeNull();
    expect(document.body.textContent).not.toContain('Popularity');
    expect(document.body.textContent).toContain('42.7');
  });

  it('keeps optional TMDB, IMDb, and trailer links', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <OneItem
            item={createItem({
              backdropUrl: 'https://image.tmdb.org/backdrop.jpg',
              trailerUrl: 'https://youtube.com/watch?v=trailer',
              imdbId: 'tt1234567',
            })}
            isBig={false}
            isJackettPrepared={false}
          />
        </MemoryRouter>,
      );
    });

    const card = container.firstElementChild;
    expect(card).not.toBeNull();

    await act(async () => {
      card?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://image.tmdb.org/backdrop.jpg',
    );
    expect(
      container.querySelector('[aria-label="Open Example on TMDB"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Open Example on IMDb"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Watch Example trailer"]'),
    ).not.toBeNull();
  });

  it('supports image loading and Jackett search actions', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <OneItem
            item={createItem({
              backdropUrl: 'https://image.tmdb.org/backdrop.jpg',
            })}
            isBig={true}
            isJackettPrepared={true}
          />
        </MemoryRouter>,
      );
    });

    const card = container.firstElementChild;
    const image = container.querySelector('img');
    const backgroundSearch = container.querySelector(
      '[aria-label="Search Example"]',
    );

    await act(async () => {
      image?.dispatchEvent(new Event('load'));
      card?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    const torrentSearch = container.querySelector(
      '[aria-label="Search torrents for Example"]',
    );
    expect(torrentSearch).not.toBeNull();

    await act(async () => {
      torrentSearch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      backgroundSearch?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
  });
});

function createItem(
  overrides: Partial<TmdbDiscoverItem> = {},
): TmdbDiscoverItem {
  return {
    id: 1,
    title: 'Example',
    rating: 8.4,
    popularity: 42.7,
    backdropUrl: null,
    detailsUrl: 'https://www.themoviedb.org/tv/1',
    trailerUrl: null,
    imdbId: null,
    ...overrides,
  };
}
