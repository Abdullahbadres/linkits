"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validatePasswordStrength } from "@/lib/passwordStrength";
import { PasswordField } from "@/components/PasswordField";
import { PasswordStrengthHints } from "@/components/PasswordStrengthHints";

type Movie = {
  id: number;
  title: string;
  genre: string;
  director?: string | null;
  actors?: string | null;
  production?: string | null;
  year?: number | null;
  imdbRating?: number | null;
  posterUrl?: string | null;
};
type SaleRecord = {
  id: number;
  customerName: string;
  status: string;
  saleDate: string;
  movie: Movie;
  user?: { id: number; username: string };
};
type AuthUser = { id: number; username: string; role: string; createdAt: string };
const MOVIES_PER_PAGE = 6;

const MOVIE_SEARCH_PLACEHOLDER = "Search movie, genre, year, actor, director, production...";

/** UI labels for persisted status values (RENTED | RETURNED | OVERDUE). */
const DIGITAL_SALE_STATUS_LABELS: Record<string, string> = {
  RENTED: "Sold",
  RETURNED: "Refunded",
  OVERDUE: "Overdue",
};

function labelDigitalSaleStatus(status: string): string {
  return DIGITAL_SALE_STATUS_LABELS[status] ?? status;
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Text search only (title, genre tags, year, cast, director, production). */
function movieMatchesTextSearch(m: Movie, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (q.length === 0) return true;
  const genres = m.genre
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const yearText = m.year ? String(m.year) : "";
  const actors = (m.actors ?? "").toLowerCase();
  const director = (m.director ?? "").toLowerCase();
  const production = (m.production ?? "").toLowerCase();
  return (
    m.title.toLowerCase().includes(q) ||
    genres.some((g) => g.toLowerCase().includes(q)) ||
    yearText.includes(q) ||
    actors.includes(q) ||
    director.includes(q) ||
    production.includes(q)
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [token] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""));
  const [movies, setMovies] = useState<Movie[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedProduction, setSelectedProduction] = useState("All");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileUsername, setProfileUsername] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [showProfilePassword, setShowProfilePassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const autoSyncAttemptedRef = useRef(false);
  const [showModal, setShowModal] = useState(false);
  const [saleMovieSearch, setSaleMovieSearch] = useState("");
  const [saleMovieDropdownOpen, setSaleMovieDropdownOpen] = useState(false);
  const [form, setForm] = useState({ movieId: "", customerName: "", status: "RENTED", saleDate: "" });
  const saleMovieComboRef = useRef<HTMLDivElement>(null);
  const saleMovieSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  const fetchAll = useCallback(async (bearer: string) => {
    setLoading(true);
    const headers = { Authorization: `Bearer ${bearer}` };
    const [mRes, rRes, uRes] = await Promise.all([
      fetch("/api/movies", { headers }),
      fetch("/api/sales", { headers }),
      fetch("/api/auth/profile", { headers }),
    ]);
    if (mRes.status === 401 || rRes.status === 401) {
      localStorage.removeItem("token");
      document.cookie = "token=; path=/; max-age=0";
      router.push("/login");
      return;
    }
    const mData = await mRes.json();
    const rData = await rRes.json();
    const uData = await uRes.json().catch(() => ({ data: null }));
    setMovies(mData.data ?? []);
    setSales(rData.data ?? []);
    setUser(uData.data ?? null);
    setProfileUsername(uData.data?.username ?? "");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    const id = setTimeout(() => {
      void fetchAll(token);
    }, 0);
    return () => clearTimeout(id);
  }, [token, fetchAll]);

  const kpi = useMemo(
    () => ({
      movies: movies.length,
      soldCount: sales.filter((r) => r.status === "RENTED").length,
      customers: new Set(sales.map((r) => r.customerName)).size,
    }),
    [movies, sales],
  );

  const isAdmin = user?.role === "ADMIN";

  const openNewSaleForMovie = useCallback((movieId: number) => {
    setForm({
      movieId: String(movieId),
      customerName: "",
      status: "RENTED",
      saleDate: toDatetimeLocalValue(new Date()),
    });
    setSaleMovieSearch("");
    setSaleMovieDropdownOpen(false);
    setShowModal(true);
  }, []);

  const syncMovies = useCallback(async () => {
    if (!token) return;
    setSyncing(true);
    setSyncError("");
    try {
      const res = await fetch("/api/movies/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          res.status === 403
            ? (body.message ?? "Only administrators can sync the catalog.")
            : (body.message ?? "Failed to sync movies");
        setSyncError(msg);
        return;
      }
      await fetchAll(token);
    } catch {
      setSyncError("Unable to reach sync endpoint");
    } finally {
      setSyncing(false);
    }
  }, [token, fetchAll]);

  useEffect(() => {
    if (!token || loading) return;
    if (movies.length === 0 && !syncing && !autoSyncAttemptedRef.current) {
      autoSyncAttemptedRef.current = true;
      const id = setTimeout(() => {
        void syncMovies();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [token, loading, movies.length, syncing, syncMovies]);

  async function createSale(e: React.FormEvent) {
    e.preventDefault();
    if (!form.movieId.trim()) return;
    await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        movieId: Number(form.movieId),
        customerName: form.customerName,
        saleDate: new Date(form.saleDate).toISOString(),
        status: form.status,
      }),
    });
    setShowModal(false);
    setSaleMovieSearch("");
    setSaleMovieDropdownOpen(false);
    setForm({ movieId: "", customerName: "", status: "RENTED", saleDate: "" });
    await fetchAll(token);
  }

  function logout() {
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; max-age=0";
    router.push("/login");
  }

  async function updateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setProfileSaving(true);
    setProfileMessage("");
    const pwd = profilePassword.trim();
    if (pwd) {
      const strengthErrors = validatePasswordStrength(pwd);
      if (strengthErrors.length > 0) {
        setProfileMessage(strengthErrors.join(". "));
        setProfileSaving(false);
        return;
      }
    }
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: profileUsername.trim() || undefined,
          password: pwd || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const extra = Array.isArray(data.errors) ? data.errors.join(". ") : "";
        setProfileMessage(extra ? `${data.message ?? "Failed"}: ${extra}` : (data.message ?? "Failed to update profile"));
        return;
      }
      setUser(data.data);
      setProfilePassword("");
      setProfileMessage("Profile updated successfully");
    } catch {
      setProfileMessage("Unable to update profile");
    } finally {
      setProfileSaving(false);
    }
  }

  const filteredMovies = movies.filter((m) => {
    const genres = m.genre
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const genreMatch = selectedGenre === "All" || genres.includes(selectedGenre);
    const productionMatch = selectedProduction === "All" || (m.production ?? "").trim() === selectedProduction;
    return genreMatch && productionMatch && movieMatchesTextSearch(m, search);
  });

  const moviesForSaleSelect = useMemo(
    () => movies.filter((m) => movieMatchesTextSearch(m, saleMovieSearch)),
    [movies, saleMovieSearch],
  );

  useEffect(() => {
    if (!saleMovieDropdownOpen) return;
    saleMovieSearchInputRef.current?.focus();
  }, [saleMovieDropdownOpen]);

  useEffect(() => {
    if (!saleMovieDropdownOpen) return;
    function handlePointerDown(e: MouseEvent) {
      const el = saleMovieComboRef.current;
      if (el && !el.contains(e.target as Node)) {
        setSaleMovieDropdownOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSaleMovieDropdownOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [saleMovieDropdownOpen]);

  const selectedSaleMovie = useMemo(() => {
    if (!form.movieId) return null;
    const id = Number(form.movieId);
    if (Number.isNaN(id)) return null;
    return movies.find((m) => m.id === id) ?? null;
  }, [movies, form.movieId]);

  const trendingMovies = useMemo(() => {
    return [...filteredMovies].sort((a, b) => {
      const ratingDiff = (b.imdbRating ?? 0) - (a.imdbRating ?? 0);
      if (ratingDiff !== 0) return ratingDiff;
      return (b.year ?? 0) - (a.year ?? 0);
    });
  }, [filteredMovies]);

  const genres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => {
      m.genre
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((g) => set.add(g));
    });
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [movies]);

  const moviesByGenre = useMemo(() => {
    const bucket = new Map<string, Movie[]>();
    filteredMovies.forEach((movie) => {
      movie.genre
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((tag) => {
          if (!bucket.has(tag)) bucket.set(tag, []);
          bucket.get(tag)?.push(movie);
        });
    });
    return Array.from(bucket.entries())
      .filter(([, list]) => list.length > 0)
      .sort((a, b) => b[1].length - a[1].length);
  }, [filteredMovies]);

  const productions = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => {
      const p = (m.production ?? "").trim();
      if (p) set.add(p);
    });
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [movies]);

  if (loading) {
    return <main className="grid min-h-screen place-items-center text-slate-300">Loading sales dashboard...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1600px] space-y-4 md:space-y-6">
        <header className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-brand-700 to-indigo-800 p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold md:text-3xl">Blu-ray Digital Copy Sales</h1>
              <p className="mt-2 max-w-2xl text-sm text-indigo-100/95">
                This site sells Blu-ray releases that include a redeemable digital copy.
                {isAdmin ? " As an administrator you can sync the catalog and review every team member’s sales." : " You only see sales you recorded; admins see all sales in the admin dashboard view."}
              </p>
            </div>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/20"
                aria-label="Open user menu"
              >
                ☰
              </button>
              {menuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl">
                  <p className="px-2 py-1 text-xs text-slate-400">Logged in as</p>
                  <p className="px-2 pb-2 text-sm font-semibold text-slate-100">{user?.username ?? "Unknown User"}</p>
                  <button
                    onClick={() => {
                      setShowProfileModal(true);
                      setMenuOpen(false);
                    }}
                    className="w-full rounded px-2 py-2 text-left text-sm hover:bg-slate-800"
                  >
                    Change Profile Information
                  </button>
                  <button onClick={logout} className="mt-1 w-full rounded px-2 py-2 text-left text-sm text-rose-300 hover:bg-slate-800">
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-indigo-100">
            <span>
              Logged in as <span className="font-semibold">{user?.username ?? "Unknown"}</span>
            </span>
            {isAdmin ? (
              <span className="rounded bg-amber-500/25 px-2 py-0.5 text-xs font-semibold text-amber-100">Admin — all team sales</span>
            ) : (
              <span className="rounded bg-slate-600/60 px-2 py-0.5 text-xs font-medium text-slate-200">Team — your sales only</span>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {isAdmin ? (
              <button
                onClick={syncMovies}
                disabled={syncing}
                className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-60"
              >
                {syncing ? "Syncing..." : "Sync Movies from Sample API"}
              </button>
            ) : null}
            <button
              onClick={() => {
                setSaleMovieSearch("");
                setSaleMovieDropdownOpen(false);
                setShowModal(true);
              }}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold hover:bg-emerald-400"
            >
              New sale
            </button>
          </div>
          {syncError ? <p className="mt-3 text-sm text-rose-200">{syncError}</p> : null}
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Titles in catalog" value={kpi.movies} />
          <KpiCard label="Sold" value={kpi.soldCount} />
          <KpiCard label="Buyers" value={kpi.customers} />
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Catalog & availability (reference)</h2>
              <input
                placeholder={MOVIE_SEARCH_PLACEHOLDER}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm md:w-72"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {genres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => setSelectedGenre(genre)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedGenre === genre ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {productions.map((production) => (
                <button
                  key={production}
                  onClick={() => setSelectedProduction(production)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedProduction === production ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {production}
                </button>
              ))}
            </div>
          </div>

          <GenreCarouselRow title="Trending Now" movies={trendingMovies} onNewSale={openNewSaleForMovie} />
          {moviesByGenre.slice(0, 8).map(([genreName, list]) => (
            <GenreCarouselRow key={genreName} title={genreName} movies={list} onNewSale={openNewSaleForMovie} />
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 xl:col-span-3">
            <h2 className="mb-3 text-lg font-semibold">Catalog snapshot</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMovies.slice(0, 6).map((m) => (
                <MovieCard key={m.id} movie={m} onNewSale={openNewSaleForMovie} />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 xl:col-span-2">
            <h2 className="mb-1 text-lg font-semibold">{isAdmin ? "All sales (team)" : "My sales"}</h2>
            <div className="space-y-2">
              {sales.slice(0, isAdmin ? 25 : 10).map((r) => (
                <div key={r.id} className="rounded-lg bg-slate-800 p-3 text-sm">
                  {isAdmin ? (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Recorded by <span className="text-slate-300">{r.user?.username ?? "—"}</span>
                    </p>
                  ) : null}
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Buyer</p>
                  <p className="font-semibold text-slate-100">{r.customerName}</p>
                  <p className="mt-1 text-slate-300">{r.movie?.title ?? "Unknown title"}</p>
                  <p className="mt-1 text-slate-400">
                    {new Date(r.saleDate).toLocaleString()} · {labelDigitalSaleStatus(r.status)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {showModal ? (
        <div className="fixed inset-0 grid place-items-center bg-black/70 p-4">
          <form onSubmit={createSale} className="w-full max-w-md rounded-xl bg-slate-900 p-5">
            <h3 className="mb-4 text-lg font-semibold">Record digital copy sale</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="sale-buyer" className="mb-1 block text-xs text-slate-400">
                  Buyer name
                </label>
                <input
                  id="sale-buyer"
                  placeholder="Buyer name"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                  value={form.customerName}
                  onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                  required
                />
              </div>
              <div className="relative z-10" ref={saleMovieComboRef}>
                <span className="mb-1 block text-xs text-slate-400">Movie</span>
                <button
                  type="button"
                  id="sale-movie-select-trigger"
                  aria-expanded={saleMovieDropdownOpen}
                  aria-haspopup="listbox"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left text-sm outline-none ring-brand-500 transition focus:ring-2"
                  onClick={() => setSaleMovieDropdownOpen((open) => !open)}
                >
                  <span className={selectedSaleMovie ? "text-slate-100" : "text-slate-500"}>
                    {selectedSaleMovie ? selectedSaleMovie.title : "Select movie"}
                  </span>
                  <span className="shrink-0 text-slate-400" aria-hidden>
                    {saleMovieDropdownOpen ? "▲" : "▼"}
                  </span>
                </button>
                {saleMovieDropdownOpen ? (
                  <div
                    role="listbox"
                    aria-labelledby="sale-movie-select-trigger"
                    className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-600 bg-slate-900 shadow-xl ring-1 ring-black/40"
                  >
                    <div className="border-b border-slate-700 p-2">
                      <label htmlFor="sale-movie-filter" className="sr-only">
                        Filter movies by text
                      </label>
                      <input
                        id="sale-movie-filter"
                        ref={saleMovieSearchInputRef}
                        type="search"
                        placeholder={MOVIE_SEARCH_PLACEHOLDER}
                        autoComplete="off"
                        className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm outline-none ring-brand-500 focus:ring-1"
                        value={saleMovieSearch}
                        onChange={(e) => {
                          const next = e.target.value;
                          setSaleMovieSearch(next);
                          setForm((p) => {
                            if (!p.movieId) return p;
                            const id = Number(p.movieId);
                            if (Number.isNaN(id)) return p;
                            const selected = movies.find((m) => m.id === id);
                            if (!selected || !movieMatchesTextSearch(selected, next)) {
                              return { ...p, movieId: "" };
                            }
                            return p;
                          });
                        }}
                      />
                      {saleMovieSearch.trim() !== "" ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {moviesForSaleSelect.length} movies match
                        </p>
                      ) : null}
                    </div>
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {moviesForSaleSelect.length === 0 ? (
                        <li className="px-3 py-3 text-sm text-slate-500">No movies match your search</li>
                      ) : (
                        moviesForSaleSelect.map((m) => {
                          const isActive = form.movieId === String(m.id);
                          return (
                            <li key={m.id}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                className={`w-full px-3 py-2 text-left text-sm ${
                                  isActive ? "bg-brand-600/30 text-white" : "text-slate-200 hover:bg-slate-800"
                                }`}
                                onClick={() => {
                                  setForm((p) => ({ ...p, movieId: String(m.id) }));
                                  setSaleMovieDropdownOpen(false);
                                }}
                              >
                                {m.title}
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div>
                <label htmlFor="sale-datetime" className="mb-1 block text-xs text-slate-400">
                  Sale date & time
                </label>
                <input
                  id="sale-datetime"
                  type="datetime-local"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                  value={form.saleDate}
                  onChange={(e) => setForm((p) => ({ ...p, saleDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="sale-status" className="mb-1 block text-xs text-slate-400">
                  Order status
                </label>
                <select
                  id="sale-status"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="RENTED">{DIGITAL_SALE_STATUS_LABELS.RENTED}</option>
                  <option value="RETURNED">{DIGITAL_SALE_STATUS_LABELS.RETURNED}</option>
                  <option value="OVERDUE">{DIGITAL_SALE_STATUS_LABELS.OVERDUE}</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setSaleMovieSearch("");
                  setSaleMovieDropdownOpen(false);
                }}
                className="rounded-lg border border-slate-700 px-3 py-2"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-brand-600 px-3 py-2 font-semibold">
                Save sale
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showProfileModal ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/70 p-4">
          <form onSubmit={updateProfile} className="w-full max-w-md rounded-xl bg-slate-900 p-5">
            <h3 className="mb-4 text-lg font-semibold">Change Profile Information</h3>
            <div className="space-y-3">
              <input
                placeholder="New username"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                value={profileUsername}
                onChange={(e) => setProfileUsername(e.target.value)}
              />
              <PasswordField
                label="New password (optional)"
                id="profile-new-password"
                value={profilePassword}
                onChange={setProfilePassword}
                showPassword={showProfilePassword}
                onToggleShow={() => setShowProfilePassword((p) => !p)}
                autoComplete="new-password"
              />
              {profilePassword.trim().length > 0 ? (
                <div className="rounded-lg border border-slate-700/80 bg-slate-800/50 px-3 py-2">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Password requirements</p>
                  <PasswordStrengthHints password={profilePassword} />
                </div>
              ) : null}
              {profileMessage ? <p className="text-sm text-slate-300">{profileMessage}</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowProfileModal(false);
                  setProfileMessage("");
                  setShowProfilePassword(false);
                }}
                className="rounded-lg border border-slate-700 px-3 py-2"
              >
                Close
              </button>
              <button type="submit" disabled={profileSaving} className="rounded-lg bg-brand-600 px-3 py-2 font-semibold disabled:opacity-60">
                {profileSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MoviePoster({ posterUrl, title }: { posterUrl?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!posterUrl || failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/placeholder-poster.svg"
        alt={`${title} poster placeholder`}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={posterUrl}
      alt={title}
      className="h-full w-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function GenreCarouselRow({
  title,
  movies,
  onNewSale,
}: {
  title: string;
  movies: Movie[];
  onNewSale: (movieId: number) => void;
}) {
  const [start, setStart] = useState(0);
  const canPrev = start > 0;
  const canNext = start + MOVIES_PER_PAGE < movies.length;
  const page = movies.slice(start, start + MOVIES_PER_PAGE);

  if (movies.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold md:text-lg">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStart((prev) => Math.max(0, prev - MOVIES_PER_PAGE))}
            disabled={!canPrev}
            className="rounded-md bg-slate-800 px-2 py-1 text-sm disabled:opacity-40"
          >
            ◀
          </button>
          <button
            onClick={() => setStart((prev) => (canNext ? prev + MOVIES_PER_PAGE : prev))}
            disabled={!canNext}
            className="rounded-md bg-slate-800 px-2 py-1 text-sm disabled:opacity-40"
          >
            ▶
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {page.map((movie) => (
          <MovieCard key={`${title}-${movie.id}`} movie={movie} onNewSale={onNewSale} />
        ))}
      </div>
    </section>
  );
}

function MovieCard({ movie, onNewSale }: { movie: Movie; onNewSale: (movieId: number) => void }) {
  const imdbUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(movie.title)}`;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-800/80">
      <div className="aspect-[16/10] bg-slate-700">
        <MoviePoster posterUrl={movie.posterUrl} title={movie.title} />
      </div>
      <div className="space-y-1 p-3 text-sm">
        <p className="line-clamp-1 font-semibold">{movie.title}</p>
        <p className="line-clamp-1 text-slate-400">{movie.genre}</p>
        <p className="line-clamp-1 text-slate-400">Director: {movie.director ?? "N/A"}</p>
        <p className="line-clamp-2 text-slate-400">Actors: {movie.actors ?? "N/A"}</p>
        <p className="line-clamp-1 text-slate-400">Production: {movie.production ?? "N/A"}</p>
        <div className="flex items-center justify-between text-slate-300">
          <span>{movie.year ?? "-"}</span>
          <a
            className="underline decoration-dotted underline-offset-2 hover:text-white"
            href={imdbUrl}
            target="_blank"
            rel="noreferrer"
            title={`Open ${movie.title} on IMDb`}
          >
            IMDb: {movie.imdbRating ?? "N/A"}
          </a>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <a
            className="inline-block rounded bg-brand-600 px-2 py-1 text-center text-xs font-semibold hover:bg-brand-500"
            target="_blank"
            rel="noreferrer"
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${movie.title} trailer`)}`}
          >
            Watch Trailer
          </a>
          <button
            type="button"
            onClick={() => onNewSale(movie.id)}
            className="w-full rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  );
}
