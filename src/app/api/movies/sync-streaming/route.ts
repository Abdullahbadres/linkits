import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiLogging, json } from "@/lib/api";
import { AuthError, requireBearerAuth, requireAdmin } from "@/lib/auth";
import { logTransaction } from "@/lib/logger";
import {
  TMDB_IMAGE_BASE,
  TMDB_STREAMING_PROVIDER_DISCOVER,
  directorFromCredits,
  discoverTmdbIdsForProvider,
  fetchTmdbMovieDetail,
  fetchTmdbWatchProviderNames,
  resolveTmdbAuthFromEnv,
  yearFromReleaseDate,
} from "@/lib/tmdbCatalog";

type OmdbEnrichment = {
  year?: number;
  rating?: number;
  director?: string;
  actors?: string;
  production?: string;
};

const omdbCache = new Map<string, OmdbEnrichment>();

async function enrichFromOmdb(imdbId?: string | null): Promise<OmdbEnrichment> {
  if (!imdbId || !/^tt\d+$/i.test(imdbId)) return {};
  if (omdbCache.has(imdbId)) return omdbCache.get(imdbId) ?? {};

  const apiKey = process.env.OMDB_API_KEY ?? "thewdb";
  try {
    const response = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${apiKey}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return {};
    const payload = (await response.json()) as Record<string, string>;
    if (payload.Response !== "True") return {};

    const year = payload.Year ? Number(payload.Year.slice(0, 4)) : undefined;
    const rating = payload.imdbRating && payload.imdbRating !== "N/A" ? Number(payload.imdbRating) : undefined;
    const actors =
      payload.Actors && payload.Actors !== "N/A"
        ? payload.Actors.split(",")
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join(", ")
        : undefined;

    const out: OmdbEnrichment = {
      year: Number.isFinite(year ?? NaN) ? year : undefined,
      rating: Number.isFinite(rating ?? NaN) ? rating : undefined,
      director: payload.Director && payload.Director !== "N/A" ? payload.Director : undefined,
      actors,
      production: payload.Production && payload.Production !== "N/A" ? payload.Production : undefined,
    };
    omdbCache.set(imdbId, out);
    return out;
  } catch {
    return {};
  }
}

function stableExternalId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return (hash % 2147483646) + 1;
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

    const tmdbAuth = resolveTmdbAuthFromEnv();
    if (!tmdbAuth) {
      return json(
        {
          message:
            "TMDB is not configured. Set TMDB_ACCESS_TOKEN (Bearer read token) and/or TMDB_API_KEY in .env — see https://www.themoviedb.org/settings/api",
        },
        501,
      );
    }

    const watchRegion = process.env.TMDB_WATCH_REGION?.trim() || "US";
    const maxMoviesRaw = request.nextUrl.searchParams.get("limit");
    const maxMovies = Math.min(120, Math.max(10, Number(maxMoviesRaw) || 60));

    const uniqueIds = new Set<number>();
    for (const provider of TMDB_STREAMING_PROVIDER_DISCOVER) {
      const ids = await discoverTmdbIdsForProvider(provider.id, watchRegion, 1);
      for (const id of ids) uniqueIds.add(id);
      if (uniqueIds.size >= maxMovies + 80) break;
    }

    const tmdbIds = Array.from(uniqueIds).slice(0, maxMovies);
    if (tmdbIds.length === 0) {
      return json({ message: "No titles returned from TMDB discover.", synced: 0 }, 502);
    }

    let synced = 0;
    for (const tmdbId of tmdbIds) {
      const detail = await fetchTmdbMovieDetail(tmdbId);
      if (!detail?.title) continue;

      const providerNames = await fetchTmdbWatchProviderNames(tmdbId, watchRegion);
      const streamingProviders = providerNames.join(", ");
      const imdbId = detail.external_ids?.imdb_id ?? undefined;
      const omdb = await enrichFromOmdb(imdbId);

      const genreStr =
        detail.genres?.map((g) => g.name).filter(Boolean).join(", ") || "Hollywood";
      const year = omdb.year ?? yearFromReleaseDate(detail.release_date);
      const posterPath = detail.poster_path ? `${TMDB_IMAGE_BASE}${detail.poster_path}` : null;
      const director = omdb.director ?? directorFromCredits(detail);
      const imdbRating =
        omdb.rating !== undefined && Number.isFinite(omdb.rating)
          ? omdb.rating
          : detail.vote_average !== undefined && detail.vote_average > 0
            ? Math.round(detail.vote_average * 10) / 10
            : null;

      const movieKey = `tmdb:${tmdbId}`;
      const externalId = stableExternalId(movieKey);

      const payload = {
        source: "tmdb",
        tmdbId,
        imdbId: imdbId ?? null,
        title: detail.title,
        streamingProviders: providerNames,
      };

      await prisma.movie.upsert({
        where: { externalId },
        update: {
          title: detail.title,
          genre: genreStr,
          director: director ?? null,
          actors: omdb.actors ?? null,
          production: omdb.production ?? null,
          year: year ?? null,
          imdbRating,
          posterUrl: posterPath,
          streamingProviders: streamingProviders || null,
          sourcePayload: JSON.stringify(payload),
        },
        create: {
          externalId,
          title: detail.title,
          genre: genreStr,
          director: director ?? null,
          actors: omdb.actors ?? null,
          production: omdb.production ?? null,
          year: year ?? null,
          imdbRating,
          posterUrl: posterPath,
          streamingProviders: streamingProviders || null,
          sourcePayload: JSON.stringify(payload),
        },
      });
      synced += 1;

      // Light throttle to stay within TMDB fair-use
      await new Promise((r) => setTimeout(r, 40));
    }

    await logTransaction("SYNC_STREAMING_TMDB", { syncedCount: synced, region: watchRegion });
    return json({
      message: "Streaming catalog synced from TMDB (movies linked to IMDb via TMDB).",
      synced,
      region: watchRegion,
      note:
        "Titles and availability follow TMDB data for the selected region. Sale rows are stored in the local Sale table (see /api/sales).",
    });
  });
}