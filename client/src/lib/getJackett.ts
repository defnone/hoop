import { JackettSearchResult } from '@/types/search';
import { rpc } from '@/lib/rpc';

export async function getJackett(
  query: string,
  season: number,
  category = 5000,
  tracker = 'rutracker'
): Promise<JackettSearchResult[] | null> {
  const res = await rpc.api.jackett.search.$get({
    query: {
      query,
      season:
        Number.isFinite(season) && season > 0 ? String(season) : undefined,
      category: String(category),
      tracker,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch data from Jackett: ${res.status}`);
  }
  const json = (await res.json()) as {
    success: boolean;
    data?: JackettSearchResult[];
  };
  return json.data ?? null;
}
