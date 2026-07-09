import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS. Required here because
// search_nearby_artisans is SECURITY INVOKER by default, so calling it
// with the anon/authenticated key would hit the "own row only" RLS
// policies on users/artisan_profiles/artisan_categories and silently
// return nothing for other artisans.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SearchParams {
  lat: number;
  lng: number;
  radiusKm: number;
  categorySlug: string | null;
  search: string | null;
  onlyAvailable: boolean;
  limit: number;
  offset: number;
}

function parseSearchParams(url: URL): SearchParams | { error: string } {
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");

  if (!latRaw || !lngRaw) {
    return { error: "lat and lng are required." };
  }

  const lat = parseFloat(latRaw);
  const lng = parseFloat(lngRaw);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return { error: "Invalid latitude." };
  }
  if (isNaN(lng) || lng < -180 || lng > 180) {
    return { error: "Invalid longitude." };
  }

  const radiusKmRaw = url.searchParams.get("radiusKm");
  const radiusKm = radiusKmRaw ? parseFloat(radiusKmRaw) : 50;
  if (isNaN(radiusKm) || radiusKm <= 0 || radiusKm > 500) {
    return { error: "radiusKm must be between 0 and 500." };
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : 20;
  if (isNaN(limit) || limit <= 0 || limit > 50) {
    return { error: "limit must be between 1 and 50." };
  }

  const offsetRaw = url.searchParams.get("offset");
  const offset = offsetRaw ? parseInt(offsetRaw, 10) : 0;
  if (isNaN(offset) || offset < 0) {
    return { error: "offset must be >= 0." };
  }

  return {
    lat,
    lng,
    radiusKm,
    categorySlug: url.searchParams.get("category") || null,
    search: url.searchParams.get("search")?.trim() || null,
    onlyAvailable: url.searchParams.get("onlyAvailable") === "true",
    limit,
    offset,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = parseSearchParams(url);

  if ("error" in parsed) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("search_nearby_artisans", {
    client_lat: parsed.lat,
    client_lng: parsed.lng,
    radius_km: parsed.radiusKm,
    filter_category_slug: parsed.categorySlug,
    search_term: parsed.search,
    only_available: parsed.onlyAvailable,
    limit_count: parsed.limit,
    offset_count: parsed.offset,
  });

  if (error) {
    console.error("[discovery/search] rpc error:", error);
    return NextResponse.json(
      { message: "Failed to search artisans. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ artisans: data ?? [] }, { status: 200 });
}