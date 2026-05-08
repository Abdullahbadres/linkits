import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiLogging, json } from "@/lib/api";
import { AuthError, requireBearerAuth, requireAdmin } from "@/lib/auth";
import { logTransaction } from "@/lib/logger";
import { enrichSampleMovieFromTmdb, resolveTmdbAuthFromEnv } from "@/lib/tmdbCatalog";

type SampleMovie = {
  id: number;
  title: string;
  genres?: string[] | string;
  genre?: string;
  director?: string;
  year?: number;
  imdbRating?: number;
  posterURL?: string;
  imdbId?: string;
  actors?: string;
  production?: string;
};

const SAMPLE_API_URLS = [
  { url: "https://api.sampleapis.com/movies/animation", fallbackGenre: "Animation" },
  { url: "https://api.sampleapis.com/movies/comedy", fallbackGenre: "Comedy" },
  { url: "https://api.sampleapis.com/movies/drama", fallbackGenre: "Drama" },
  { url: "https://api.sampleapis.com/movies/horror", fallbackGenre: "Horror" },
  { url: "https://api.sampleapis.com/movies/family", fallbackGenre: "Family" },
  { url: "https://api.sampleapis.com/movies/mystery", fallbackGenre: "Mystery" },
  { url: "https://api.sampleapis.com/movies/classic", fallbackGenre: "Classic" },
  { url: "https://api.sampleapis.com/movies/western", fallbackGenre: "Western" },
];
const posterHealthCache = new Map<string, boolean>();
type EnrichedMetadata = {
  year?: number;
  rating?: number;
  director?: string;
  actors?: string;
  production?: string;
};

const imdbMetadataCache = new Map<string, EnrichedMetadata>();
const TITLE_GENRE_OVERRIDES: Record<string, string[]> = {
  "kung fu panda 3": ["Animation", "Family", "Comedy"],
  "sausage party": ["Animation", "Comedy"],
};

function normalizeMoviesPayload(payload: unknown): SampleMovie[] {
  if (Array.isArray(payload)) return payload as SampleMovie[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as SampleMovie[];
    if (Array.isArray(obj.results)) return obj.results as SampleMovie[];
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.replace(",", ".").trim();
      if (!normalized) continue;
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function normalizeMovie(rawMovie: unknown): SampleMovie | null {
  const obj = asRecord(rawMovie);
  const title = pickString(obj, ["title", "movie", "name"]);
  if (!title) return null;

  const idNumber = pickNumber(obj, ["id"]);
  const fallbackId = stableExternalId(normalizeTitleKey(title));
  const yearNumber = pickNumber(obj, ["year", "releaseYear", "release_year"]);
  const imdbRating = pickNumber(obj, ["imdbRating", "imdb_rating", "rating", "imdb"]);
  const poster =
    pickString(obj, ["posterURL", "posterUrl", "poster", "imageURL", "image", "img"]) ?? undefined;

  const normalized: SampleMovie = {
    id: idNumber ?? fallbackId,
    title,
    genre: typeof obj.genre === "string" ? obj.genre : undefined,
    genres: Array.isArray(obj.genres)
      ? (obj.genres.filter((x): x is string => typeof x === "string") as string[])
      : typeof obj.genres === "string"
        ? obj.genres
        : undefined,
    director: pickString(obj, ["director"]),
    actors: pickString(obj, ["actors", "cast"]),
    production: pickString(obj, ["production", "productionHouse", "studio"]),
    year: yearNumber,
    imdbRating,
    posterURL: poster,
    imdbId: pickString(obj, ["imdbId", "imdb_id"]),
  };

  return normalized;
}

async function fetchImdbMetadata(imdbId?: string): Promise<EnrichedMetadata> {
  if (!imdbId || !/^tt\d+$/i.test(imdbId)) return {};
  if (imdbMetadataCache.has(imdbId)) return imdbMetadataCache.get(imdbId) ?? {};

  const apiKey = process.env.OMDB_API_KEY ?? "thewdb";

  try {
    const response = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${apiKey}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return {};
    const payload = (await response.json()) as Record<string, string>;
    if (payload.Response !== "True") {
      const fallbackResponse = await fetch(`https://v3.sg.media-imdb.com/suggestion/i/${imdbId}.json`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!fallbackResponse.ok) return {};
      const fallbackPayload = (await fallbackResponse.json()) as { d?: Array<{ y?: number; id?: string }> };
      const match = fallbackPayload.d?.find((item) => item.id?.toLowerCase() === imdbId.toLowerCase()) ?? fallbackPayload.d?.[0];
      const fallbackMetadata: EnrichedMetadata = {
        year: typeof match?.y === "number" ? match.y : undefined,
      };
      imdbMetadataCache.set(imdbId, fallbackMetadata);
      return fallbackMetadata;
    }

    const year = payload.Year ? Number(payload.Year.slice(0, 4)) : undefined;
    const rating = payload.imdbRating && payload.imdbRating !== "N/A" ? Number(payload.imdbRating) : undefined;
    const actors =
      payload.Actors && payload.Actors !== "N/A"
        ? payload.Actors.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3).join(", ")
        : undefined;
    const metadata: EnrichedMetadata = {
      year: Number.isFinite(year ?? NaN) ? year : undefined,
      rating: Number.isFinite(rating ?? NaN) ? rating : undefined,
      director: payload.Director && payload.Director !== "N/A" ? payload.Director : undefined,
      actors,
      production: payload.Production && payload.Production !== "N/A" ? payload.Production : undefined,
    };
    imdbMetadataCache.set(imdbId, metadata);
    return metadata;
  } catch {
    return {};
  }
}

function normalizeGenre(movie: SampleMovie, fallbackGenre: string): string[] {
  const parts: string[] = [];
  if (movie.genre) parts.push(movie.genre);
  if (Array.isArray(movie.genres)) parts.push(...movie.genres);
  if (typeof movie.genres === "string") parts.push(movie.genres);

  const cleaned = parts.map((x) => x.trim()).filter(Boolean);
  if (cleaned.length > 0) return Array.from(new Set(cleaned));
  return [fallbackGenre];
}

async function isPosterReachable(url: string): Promise<boolean> {
  if (posterHealthCache.has(url)) return posterHealthCache.get(url) ?? false;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const ok = response.ok && (contentType.includes("image") || contentType === "");
    posterHealthCache.set(url, ok);
    return ok;
  } catch {
    posterHealthCache.set(url, false);
    return false;
  }
}

async function normalizePosterUrl(url?: string): Promise<string | null> {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  const reachable = await isPosterReachable(url);
  return reachable ? url : null;
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableExternalId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return (hash % 2147483646) + 1;
}

function applyTitleGenreOverrides(title: string, genres: string[]): string[] {
  const key = normalizeTitleKey(title);
  const override = TITLE_GENRE_OVERRIDES[key];
  if (!override) return genres;
  return Array.from(new Set(override));
}

export async function POST(request: NextRequest) {
  return withApiLogging(request, async () => {
    try {
      const auth = await requireBearerAuth(request);
      requireAdmin(auth);
    } catch (e) {
      if (e instanceof AuthError) return json({ message: e.message }, e.status);
      throw e;
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "Movie" WHERE "externalId" > 2147483647 OR "externalId" < 0`,
    );

    const aggregated = new Map<string, { movie: SampleMovie; genres: Set<string> }>();
    let lastStatus = 500;

    for (const source of SAMPLE_API_URLS) {
      const response = await fetch(source.url, { cache: "no-store" });
      lastStatus = response.status;
      if (!response.ok) continue;
      const raw = await response.json();
      const movies = normalizeMoviesPayload(raw);
      for (const item of movies) {
        const movie = normalizeMovie(item);
        if (!movie) continue;
        if (!movie?.id || !movie?.title) continue;
        const genres = applyTitleGenreOverrides(
          movie.title,
          normalizeGenre(movie, source.fallbackGenre),
        );
        const movieKey = `${normalizeTitleKey(movie.title)}::${movie.year ?? "na"}`;
        const existing = aggregated.get(movieKey);
        if (!existing) {
          aggregated.set(movieKey, { movie, genres: new Set(genres) });
        } else {
          genres.forEach((g) => existing.genres.add(g));
          if (!existing.movie.posterURL && movie.posterURL) existing.movie.posterURL = movie.posterURL;
          if (!existing.movie.imdbRating && movie.imdbRating) existing.movie.imdbRating = movie.imdbRating;
          if (!existing.movie.director && movie.director) existing.movie.director = movie.director;
          if (!existing.movie.year && movie.year) existing.movie.year = movie.year;
        }
      }
    }

    if (aggregated.size === 0) {
      return json(
        {
          message: "External movie source returned empty or unsupported format",
          lastStatus,
        },
        502,
      );
    }

    const tmdbAuth = resolveTmdbAuthFromEnv();
    const watchRegion = process.env.TMDB_WATCH_REGION?.trim() || "US";
    let tmdbEnriched = 0;

    let synced = 0;
    for (const [movieKey, item] of aggregated.entries()) {
      const movie = item.movie;
      const externalId = stableExternalId(movieKey);
      const imdbMetadata = await fetchImdbMetadata(movie.imdbId);

      let tmdb = null;
      if (tmdbAuth) {
        tmdb = await enrichSampleMovieFromTmdb(movie.title, movie.year, watchRegion);
        if (tmdb) tmdbEnriched += 1;
        await new Promise((r) => setTimeout(r, 110));
      }

      const genreSet = new Set(item.genres);
      for (const g of tmdb?.genres ?? []) genreSet.add(g);
      const mergedGenres = Array.from(genreSet).join(", ");

      const finalYear = movie.year ?? imdbMetadata.year ?? tmdb?.year;
      const finalRating = movie.imdbRating ?? imdbMetadata.rating ?? tmdb?.imdbRating;
      const finalDirector = movie.director ?? imdbMetadata.director ?? tmdb?.director;
      const finalActors = movie.actors ?? imdbMetadata.actors ?? tmdb?.actors;
      const finalProduction = movie.production ?? imdbMetadata.production ?? tmdb?.production;

      let cleanPosterUrl = await normalizePosterUrl(movie.posterURL);
      if (!cleanPosterUrl && tmdb?.posterUrl) {
        cleanPosterUrl = await normalizePosterUrl(tmdb.posterUrl);
      }

      const streamingPatch =
        tmdb?.streamingProviders && tmdb.streamingProviders.length > 0
          ? { streamingProviders: tmdb.streamingProviders }
          : {};

      await prisma.movie.upsert({
        where: { externalId },
        update: {
          title: movie.title,
          genre: mergedGenres,
          director: finalDirector,
          actors: finalActors,
          production: finalProduction,
          year: finalYear,
          imdbRating: finalRating,
          posterUrl: cleanPosterUrl,
          sourcePayload: JSON.stringify(movie),
          ...streamingPatch,
        },
        create: {
          externalId,
          title: movie.title,
          genre: mergedGenres,
          director: finalDirector,
          actors: finalActors,
          production: finalProduction,
          year: finalYear,
          imdbRating: finalRating,
          posterUrl: cleanPosterUrl,
          sourcePayload: JSON.stringify(movie),
          ...streamingPatch,
        },
      });
      synced += 1;
    }

    /* Keep movies from other sources (e.g. TMDB streaming sync); only Sample API rows were refreshed above via upsert. */

    await logTransaction("SYNC_MOVIES", { syncedCount: synced, tmdbEnrichedCount: tmdbAuth ? tmdbEnriched : undefined });
    const body: Record<string, unknown> = { message: "Movies synced", synced };
    if (tmdbAuth) {
      body.tmdbEnriched = tmdbEnriched;
      body.tmdbWatchRegion = watchRegion;
    }
    return json(body);
  });
}
