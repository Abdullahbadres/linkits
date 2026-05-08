/**
 * TMDB catalog helpers: discover titles available on major streaming providers (US region by default).
 * Docs: https://developer.themoviedb.org/reference/discover-movie
 *
 * Auth: set TMDB_ACCESS_TOKEN (Bearer, read token) and/or TMDB_API_KEY (v3 query param).
 * If TMDB_ACCESS_TOKEN is set, it is preferred over the API key.
 */

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

/** Watch provider IDs (US) — Netflix, Prime Video, HBO Max, Hulu, Disney+, Apple TV+ */
export const TMDB_STREAMING_PROVIDER_DISCOVER = [
  { id: 8, name: "Netflix" },
  { id: 119, name: "Prime Video" },
  { id: 384, name: "HBO Max" },
  { id: 15, name: "Hulu" },
  { id: 337, name: "Disney+" },
  { id: 350, name: "Apple TV+" },
] as const;

export type TmdbAuthResolved = { kind: "bearer"; token: string } | { kind: "apiKey"; key: string };

/**
 * Resolves TMDB credentials from env (server-side).
 * Bearer read access token takes precedence over v3 api_key.
 */
export function resolveTmdbAuthFromEnv(): TmdbAuthResolved | null {
  const token =
    process.env.TMDB_ACCESS_TOKEN?.trim() ||
    process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (token) return { kind: "bearer", token };
  const key = process.env.TMDB_API_KEY?.trim();
  if (key) return { kind: "apiKey", key };
  return null;
}

async function tmdbFetch(url: URL, timeoutMs: number): Promise<Response> {
  const auth = resolveTmdbAuthFromEnv();
  if (!auth) {
    return new Response(JSON.stringify({ status_message: "No TMDB credentials" }), { status: 401 });
  }
  const headers = new Headers();
  if (auth.kind === "bearer") {
    headers.set("Authorization", `Bearer ${auth.token}`);
  } else {
    url.searchParams.set("api_key", auth.key);
  }
  return fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers,
  });
}

type TmdbDiscoverResult = {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
};

type TmdbDiscoverResponse = { results?: TmdbDiscoverResult[]; total_pages?: number };

export async function discoverTmdbIdsForProvider(
  providerId: number,
  watchRegion: string,
  maxPages: number,
): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL("https://api.themoviedb.org/3/discover/movie");
    url.searchParams.set("with_watch_providers", String(providerId));
    url.searchParams.set("watch_region", watchRegion);
    url.searchParams.set("sort_by", "popularity.desc");
    url.searchParams.set("page", String(page));
    const res = await tmdbFetch(url, 15000);
    if (!res.ok) break;
    const data = (await res.json()) as TmdbDiscoverResponse;
    const batch = data.results ?? [];
    for (const r of batch) {
      if (typeof r.id === "number") ids.push(r.id);
    }
    if (batch.length === 0 || (data.total_pages && page >= data.total_pages)) break;
  }
  return ids;
}

type TmdbMovieDetail = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  genres?: { name: string }[];
  credits?: {
    crew?: { job?: string; name?: string }[];
    cast?: { name?: string }[];
  };
  external_ids?: { imdb_id?: string | null };
  production_companies?: { name?: string }[];
};

type TmdbWatchProvidersResponse = {
  results?: Record<
    string,
    {
      flatrate?: { provider_name: string }[];
      rent?: { provider_name: string }[];
      buy?: { provider_name: string }[];
    }
  >;
};

export async function fetchTmdbMovieDetail(tmdbId: number): Promise<TmdbMovieDetail | null> {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  url.searchParams.set("append_to_response", "credits,external_ids");
  url.searchParams.set("language", "en-US");
  const res = await tmdbFetch(url, 15000);
  if (!res.ok) return null;
  return (await res.json()) as TmdbMovieDetail;
}

export async function fetchTmdbWatchProviderNames(tmdbId: number, region: string): Promise<string[]> {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers`);
  const res = await tmdbFetch(url, 12000);
  if (!res.ok) return [];
  const data = (await res.json()) as TmdbWatchProvidersResponse;
  const regionData = data.results?.[region];
  if (!regionData) return [];
  const names = new Set<string>();
  for (const list of [regionData.flatrate, regionData.rent, regionData.buy]) {
    if (!list) continue;
    for (const p of list) {
      if (p.provider_name) names.add(p.provider_name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function directorFromCredits(detail: TmdbMovieDetail): string | undefined {
  const crew = detail.credits?.crew;
  if (!crew) return undefined;
  const d = crew.find((c) => c.job === "Director");
  return d?.name;
}

export function yearFromReleaseDate(releaseDate?: string): number | undefined {
  if (!releaseDate || releaseDate.length < 4) return undefined;
  const y = Number(releaseDate.slice(0, 4));
  return Number.isFinite(y) ? y : undefined;
}

/** Extra fields merged into Sample API sync when TMDB credentials are set. */
export type TmdbSampleSyncEnrichment = {
  year?: number;
  imdbRating?: number;
  director?: string;
  actors?: string;
  production?: string;
  posterUrl?: string | null;
  genres?: string[];
  streamingProviders?: string;
};

type TmdbSearchMovieItem = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
};

type TmdbSearchResponse = { results?: TmdbSearchMovieItem[] };

function normalizeTitleForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreTmdbSearchResult(
  queryNorm: string,
  item: TmdbSearchMovieItem,
  preferredYear?: number,
): number {
  const titles = [item.title, item.original_title].filter((x): x is string => typeof x === "string" && x.length > 0);
  let best = 0;
  for (const t of titles) {
    const tn = normalizeTitleForMatch(t);
    let s = 0;
    if (tn === queryNorm) s += 100;
    else if (tn.includes(queryNorm) || queryNorm.includes(tn)) s += 55;
    else {
      const qw = new Set(queryNorm.split(" ").filter(Boolean));
      const tw = new Set(tn.split(" ").filter(Boolean));
      let overlap = 0;
      for (const w of qw) {
        if (tw.has(w)) overlap += 1;
      }
      if (qw.size > 0) s += Math.min(45, (overlap / qw.size) * 45);
    }
    const ry = yearFromReleaseDate(item.release_date);
    if (preferredYear !== undefined && ry !== undefined && Math.abs(ry - preferredYear) <= 1) {
      s += 35;
    }
    if (s > best) best = s;
  }
  return best;
}

async function searchTmdbMovieResults(title: string, year?: number): Promise<TmdbSearchMovieItem[]> {
  const q = title.trim().slice(0, 100);
  if (!q) return [];

  async function fetchOne(useYear: boolean): Promise<TmdbSearchMovieItem[]> {
    const url = new URL("https://api.themoviedb.org/3/search/movie");
    url.searchParams.set("query", q);
    url.searchParams.set("page", "1");
    if (useYear && year !== undefined && Number.isFinite(year)) {
      url.searchParams.set("year", String(year));
    }
    const res = await tmdbFetch(url, 12000);
    if (!res.ok) return [];
    const data = (await res.json()) as TmdbSearchResponse;
    return data.results ?? [];
  }

  let results = await fetchOne(true);
  if (results.length === 0 && year !== undefined) {
    results = await fetchOne(false);
  }
  return results;
}

function pickBestTmdbIdFromSearch(title: string, year: number | undefined, results: TmdbSearchMovieItem[]): number | null {
  const queryNorm = normalizeTitleForMatch(title);
  let bestId: number | null = null;
  let bestScore = 0;
  for (const item of results) {
    if (typeof item.id !== "number") continue;
    const sc = scoreTmdbSearchResult(queryNorm, item, year);
    if (sc > bestScore) {
      bestScore = sc;
      bestId = item.id;
    }
  }
  if (bestScore < 36 || bestId === null) return null;
  return bestId;
}

/**
 * Search TMDB by title (+ optional year), then load detail + watch providers for Sample API sync enrichment.
 */
export async function enrichSampleMovieFromTmdb(
  title: string,
  preferredYear: number | undefined,
  watchRegion: string,
): Promise<TmdbSampleSyncEnrichment | null> {
  if (!resolveTmdbAuthFromEnv()) return null;

  const results = await searchTmdbMovieResults(title, preferredYear);
  const tmdbId = pickBestTmdbIdFromSearch(title, preferredYear, results);
  if (tmdbId === null) return null;

  const detail = await fetchTmdbMovieDetail(tmdbId);
  if (!detail?.title) return null;

  const providerNames = await fetchTmdbWatchProviderNames(tmdbId, watchRegion);
  const streamingProviders = providerNames.length > 0 ? providerNames.join(", ") : undefined;

  const castNames =
    detail.credits?.cast
      ?.map((c) => c.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0)
      .slice(0, 4)
      .join(", ") || undefined;

  const production =
    detail.production_companies
      ?.map((c) => c.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0)
      .slice(0, 2)
      .join(", ") || undefined;

  const genres = detail.genres?.map((g) => g.name).filter(Boolean);
  const year = yearFromReleaseDate(detail.release_date);
  const vote = detail.vote_average;
  const imdbRating =
    vote !== undefined && vote > 0 ? Math.round(vote * 10) / 10 : undefined;

  const posterUrl = detail.poster_path ? `${TMDB_IMAGE_BASE}${detail.poster_path}` : null;

  return {
    year,
    imdbRating,
    director: directorFromCredits(detail),
    actors: castNames,
    production,
    posterUrl,
    genres: genres && genres.length > 0 ? genres : undefined,
    streamingProviders,
  };
}
