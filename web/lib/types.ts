/** Shared API types — keep in sync with workers/api/src/routes/parts.ts. */

export interface Part {
  id: number;
  part_number: string;
  description: string;
  category: string | null;
  make: string;
  price_usd: number | null;
  stock_status: string | null;
  source_file: string;
}

export interface PartsSearchResponse {
  results: Part[];
  next_cursor: string | null;
  /**
   * Total number of matches for the *first* page only (cursor === null).
   * 0 when paginating; clients should not display a "of Y" count after
   * the first page (we don't recompute on every page for cost reasons).
   */
  total_estimate: number;
}

export interface PartsFacetsResponse {
  makes: string[];
  categories: string[];
}

export interface ApiError {
  error: { code: string; message: string; hint?: string };
}
