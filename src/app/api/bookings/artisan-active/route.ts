import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { releaseOverdueBookings } from "@/lib/bookings/completion";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.replace("Bearer ", "");

  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: authResult, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authResult.user) {
    return NextResponse.json({ message: "Invalid or expired session." }, { status: 401 });
  }
  const artisanId = authResult.user.id;

  await releaseOverdueBookings(supabase);

  // client_id has a named FK (bookings_client_id_fkey), so the embedded
  // join is safe here — unlike artisan_id, which has none.
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, status, payment_status, quoted_price, description, scheduled_at, created_at, client_id, client_marked_complete_at, artisan_marked_complete_at, auto_release_at, users!bookings_client_id_fkey(full_name)"
    )
    .eq("artisan_id", artisanId)
    .in("status", ["confirmed", "in_progress"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[bookings/artisan-active] query failed:", error);
    return NextResponse.json({ message: "Failed to load active jobs." }, { status: 500 });
  }

  // Confirmed: Supabase JS client returns geography columns as raw EWKB
  // hex, NOT GeoJSON — so we extract lat/lng via a SQL function using
  // ST_Y/ST_X instead (same proven pattern as search_nearby_artisans).
  const { data: locations, error: locError } = await supabase.rpc(
    "get_artisan_active_locations",
    { p_artisan_id: artisanId }
  );

  if (locError) {
    console.error("[bookings/artisan-active] location rpc failed:", locError);
  }

  type LocationRow = {
    booking_id: string;
    client_lat: number | null;
    client_lng: number | null;
    artisan_lat: number | null;
    artisan_lng: number | null;
  };

  type LatLng = { lat: number; lng: number };

  const locationByBookingId = new Map<
    string,
    { clientLocation: LatLng | null; artisanLocation: LatLng | null }
  >(
    ((locations ?? []) as LocationRow[]).map((row) => [
      row.booking_id,
      {
        clientLocation:
          row.client_lat != null && row.client_lng != null
            ? { lat: row.client_lat, lng: row.client_lng }
            : null,
        artisanLocation:
          row.artisan_lat != null && row.artisan_lng != null
            ? { lat: row.artisan_lat, lng: row.artisan_lng }
            : null,
      },
    ])
  );

  const enriched = (data ?? []).map((booking) => {
    const loc = locationByBookingId.get(booking.id);
    return {
      ...booking,
      clientLocation: loc?.clientLocation ?? null,
      artisanLocation: loc?.artisanLocation ?? null,
    };
  });

  return NextResponse.json({ bookings: enriched }, { status: 200 });
}