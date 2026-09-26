"use client";

import dynamic from "next/dynamic";

const DiscoveryMap = dynamic(() => import("./DiscoveryMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search, MapPin, Loader2, AlertTriangle,
  Briefcase, RefreshCw, List, Map as MapIcon, Wrench
} from "lucide-react";
import { ArtisanListCard, CategoryPills, type ArtisanCardData } from "@/app/_components/ArtisanListCard";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface Artisan extends ArtisanCardData {
  years_experience: number | null;
  latitude: number;
  longitude: number;
}

type LocationStatus = "loading" | "success" | "error" | "denied";
type ViewMode = "list" | "map";

const FALLBACK_COORDS = { latitude: -1.0467, longitude: 37.15 };
const RADIUS_KM = 50;
const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function DiscoveryPageInner() {
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get("category") ?? "");
  const [searchTerm, setSearchTerm] = useState<string>(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState<string>(searchParams.get("search") ?? "");

  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("loading");

  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [selectedArtisanId, setSelectedArtisanId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

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

  function handleLocationChange(newCoords: { lat: number; lng: number }) {
    setCoords({ latitude: newCoords.lat, longitude: newCoords.lng });
    setLocationStatus("success");
  }

  function resetToGPSLocation() {
    if (!("geolocation" in navigator)) {
      setCoords(FALLBACK_COORDS);
      setLocationStatus("error");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationStatus("success");
      },
      (err) => {
        setCoords(FALLBACK_COORDS);
        setLocationStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-6xl">

        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-[#F5B700] font-black text-base leading-none select-none">
            <Wrench size={16} />
          </div>
          <span className="text-sm font-bold text-slate-900 tracking-tight">
            Huduma Connect
          </span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Find a trusted artisan near you</h1>
            <p className="mt-1 text-sm text-slate-500">
              {locationStatus === "loading" && "Getting your location…"}
              {locationStatus === "success" && "Showing artisans near your current location."}
              {(locationStatus === "denied" || locationStatus === "error") &&
                "Showing artisans near Murang'a — enable location for results near you."}
            </p>
          </div>

          {/* View toggle */}
          <div className="flex flex-shrink-0 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <List size={13} /> List
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "map" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <MapIcon size={13} /> Map
            </button>
          </div>
        </div>

        <div className="relative mt-5">
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

        <div className="mt-3">
          <CategoryPills
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
        </div>

        <div className="mt-6">
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

          {viewMode === "list" ? (
            loading ? (
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
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {artisans.length} artisan{artisans.length === 1 ? "" : "s"} near you
                </p>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {artisans.map((a) => (
                    <ArtisanListCard key={a.user_id} artisan={a} />
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
            )
          ) : (
            <div className="h-[calc(100vh-320px)] min-h-[400px]">
              {coords ? (
                <>
                  <button
                    onClick={resetToGPSLocation}
                    className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700"
                  >
                    <MapPin size={12} /> Use my current location
                  </button>
                  <DiscoveryMap
                    center={{ lat: coords.latitude, lng: coords.longitude }}
                    artisans={artisans}
                    selectedId={selectedArtisanId}
                    onSelectMarker={setSelectedArtisanId}
                    onLocationChange={handleLocationChange}
                  />
                </>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary above it in the App
// Router — this wraps the real page so initial filters (?category=,
// ?search=) from links like the landing page's hero search work correctly.
export default function DiscoveryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />
        </div>
      }
    >
      <DiscoveryPageInner />
    </Suspense>
  );
}