"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight } from "lucide-react";
import { ArtisanListCard, CategoryPills, type ArtisanCardData } from "./ArtisanListCard";

// Fixed default location — matches the discovery page's own fallback
// (Murang'a) for consistency. No geolocation prompt on the landing page;
// asking for location before a visitor has even decided to sign up is
// intrusive for a first impression. Real, accurate location-based search
// happens once someone clicks through to /discovery.
const FALLBACK_COORDS = { latitude: -1.0467, longitude: 37.15 };
const PREVIEW_COUNT = 6;

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface Artisan extends ArtisanCardData {
  years_experience: number | null;
}

export function LandingArtisanPreview({ categories }: { categories: Category[] }) {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({
        lat: String(FALLBACK_COORDS.latitude),
        lng: String(FALLBACK_COORDS.longitude),
        radiusKm: "50",
        limit: String(PREVIEW_COUNT),
        offset: "0",
      });
      if (selectedCategory) params.set("category", selectedCategory);

      try {
        const res = await fetch(`/api/discovery/search?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        setArtisans(res.ok ? (json.artisans ?? []) : []);
      } catch (err) {
        console.error("[landing] artisan preview fetch failed:", err);
        setArtisans([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedCategory]);

  return (
    <div>
      <CategoryPills
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : artisans.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No artisans found for this trade yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {artisans.map((a) => (
              <ArtisanListCard key={a.user_id} artisan={a} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/discovery"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-700"
        >
          See all artisans near you
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}