export interface TmdbDiscoverItem {
  id: number;
  title: string;
  rating: number;
  popularity: number;
  backdropUrl: string | null;
  detailsUrl: string;
  trailerUrl: string | null;
  imdbId: string | null;
}
