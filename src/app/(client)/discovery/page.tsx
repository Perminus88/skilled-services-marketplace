"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search, MapPin, Star, Loader2, AlertTriangle,
  Briefcase, ChevronDown, RefreshCw, SlidersHorizontal,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface Artisan {
  user_id: string;
  full_name: string;
  bio: string | null;
  years_experience: number | null;
  availability: "available" | "busy" | "offline" | null;
  starting_price: number | null;
  pricing_type: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  category_name: string | null;
  category_slug: string | null;
  distance_km: number;
}

type LocationStatus = "loading" | "success" | "error" | "denied";

// Fallback used if geolocation fails — Murang'a center, matching the
// coordinates already used as a default elsewhere in this app.
const FALLBACK_COORDS = { latitude: -1.0467, longitude: 37.15 };
const RADIUS_KM = 50;
const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

function formatPricingType(type: string | null): string {
  if (type === "flat") return "Flat rate";
  if (type === "custom_quote") return "Custom quote";
  if (type === "both") return "Flat rate + quotes";
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ArtisanCard({ artisan }: { artisan: Artisan }) {
  const initials = artisan.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5 transition-shadow hover:shadow-md"
      style={{ borderTop: "4px solid #0D9488" }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-700">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-semibold text-slate-900">
                {artisan.full_name}
              </p>
              {artisan.availability === "available" && (
                <span className="flex-shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                  Available
                </span>
              )}
            </div>
            {artisan.category_name && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <Briefcase size={11} />
                {artisan.category_name}
              </p>
            )}
          </div>
        </div>

        {artisan.bio && (
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {artisan.bio}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <MapPin size={11} className="text-slate-400" />
            {formatDistance(artisan.distance_km)}
          </span>
          {artisan.rating_count ? (
            <span className="flex items-center gap-1">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              {artisan.rating_avg?.toFixed(1)}
              <span className="text-slate-400">({artisan.rating_count})</span>
            </span>
          ) : (
            <span className="text-slate-400">No reviews yet</span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            {artisan.starting_price != null ? (
              <p className="text-sm font-bold text-slate-900">
                From KES {artisan.starting_price.toLocaleString()}
              </p>
            ) : (
              <p className="text-sm font-semibold text-slate-400">Quote on request</p>
            )}
            <p className="text-[11px] text-slate-400">
              {formatPricingType(artisan.pricing_type)}
            </p>
          </div>
          <button className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-700">
            View profile
          </button>
        </div>
      </div>
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400 sm:h-full">
      <div className="text-center">
        <MapPin size={22} className="mx-auto mb-2 text-slate-300" />
        Map view coming soon
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("loading");

  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [hasMore, setHasMore] = useState<boolean>(true);

  // ── Debounce free-text search input ──────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ── Categories, via the new API route (works regardless of client auth) ──
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch("/api/discovery/categories");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message ?? "Failed to load categories.");
        setCategories(json.categories ?? []);
      } catch (err) {
        console.error("[discovery] categories fetch failed:", err);
      }
    }
    loadCategories();
  }, []);

  // ── Geolocation, with silent fallback to Murang'a center ────────────────
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setCoords(FALLBACK_COORDS);
      setLocationStatus("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("success");
      },
      (err) => {
        setCoords(FALLBACK_COORDS);
        setLocationStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  // ── Fetch artisans whenever filters or location change ──────────────────
  const fetchArtisans = useCallback(
    async (offset: number, append: boolean) => {
      if (!coords) return;

      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");

      const params = new URLSearchParams({
        lat: String(coords.latitude),
        lng: String(coords.longitude),
        radiusKm: String(RADIUS_KM),
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (selectedCategory) params.set("category", selectedCategory);
      if (debouncedSearch) params.set("search", debouncedSearch);

      try {
        const res = await fetch(`/api/discovery/search?${params.toString()}`);
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json.message ?? "Failed to load artisans.");
        }

        const results: Artisan[] = json.artisans ?? [];
        setArtisans((prev) => (append ? [...prev, ...results] : results));
        setHasMore(results.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load artisans.");
        if (!append) setArtisans([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [coords, selectedCategory, debouncedSearch]
  );

  useEffect(() => {
    if (coords) fetchArtisans(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, selectedCategory, debouncedSearch]);

  function handleLoadMore() {
    fetchArtisans(artisans.length, true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-6xl">

        {/* Header */}
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-[#F5B700] font-black text-base leading-none select-none">
            G
          </div>
          <span className="text-sm font-bold text-slate-900 tracking-tight">
            Skilled services marketplace
          </span>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">Find a trusted artisan near you</h1>
        <p className="mt-1 text-sm text-slate-500">
          {locationStatus === "loading" && "Getting your location…"}
          {locationStatus === "success" && "Showing artisans near your current location."}
          {(locationStatus === "denied" || locationStatus === "error") &&
            "Showing artisans near Murang'a — enable location for results near you."}
        </p>

        {/* Filters */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={15} />
            </div>
            <input
              type="text"
              placeholder="Search by name or trade…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="relative sm:w-56">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <SlidersHorizontal size={15} />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="">All trades</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <ChevronDown size={14} />
            </div>
          </div>
        </div>

        {/* Body: results + map */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">

          {/* Results */}
          <div>
            {error && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="text-sm text-red-700">{error}</p>
                  <button
                    onClick={() => fetchArtisans(0, false)}
                    className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800"
                  >
                    <RefreshCw size={11} /> Try again
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : artisans.length === 0 && !error ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                <Briefcase size={26} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No artisans found nearby</p>
                <p className="mt-1 text-xs text-slate-400">
                  Try a different trade or clearing your search.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {artisans.map((a) => (
                    <ArtisanCard key={a.user_id} artisan={a} />
                  ))}
                </div>

                {hasMore && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Loading…
                        </>
                      ) : (
                        "Load more"
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Map placeholder */}
          <div className="lg:sticky lg:top-8 lg:h-[calc(100vh-220px)]">
            <MapPlaceholder />
          </div>
        </div>
      </div>
    </div>
  );
}