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
  const clientId = authResult.user.id;

  // Opportunistic sweep — finalizes any booking (across the whole app, not
  // just this client) whose 48h auto-release window has passed. Cheap
  // enough to run on every dashboard load until a real cron job exists.
  await releaseOverdueBookings(supabase);

  // No FK constraint exists on bookings.artisan_id -> users, so an
  // embedded PostgREST join (users!bookings_artisan_id_fkey(...)) isn't
  // possible here. Fetch bookings and artisan details separately, merge in code.
  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(
      "id, status, payment_status, quoted_price, client_booking_fee, description, scheduled_at, created_at, artisan_id, client_marked_complete_at, artisan_marked_complete_at, auto_release_at, dispute_reason"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (bookingsError) {
    console.error("[bookings/client-bookings] bookings query failed:", bookingsError);
    return NextResponse.json({ message: "Failed to load your bookings." }, { status: 500 });
  }

  const artisanIds = [...new Set((bookings ?? []).map((b) => b.artisan_id))];

  // Two separate lookups keyed by artisan id: identity (name, phone) from
  // `users`, and profile display data (photo) from `artisan_profiles`.
  let namesByArtisanId: Record<string, string> = {};
  let phonesByArtisanId: Record<string, string | null> = {};
  let avatarsByArtisanId: Record<string, string | null> = {};

  if (artisanIds.length > 0) {
    const { data: artisanUsers, error: artisanError } = await supabase
      .from("users")
      .select("id, full_name, phone")
      .in("id", artisanIds);

    if (artisanError) {
      console.error("[bookings/client-bookings] artisan users query failed:", artisanError);
      // Non-fatal — bookings can still render with fallback name/no contact buttons.
    } else {
      namesByArtisanId = Object.fromEntries(
        (artisanUsers ?? []).map((u) => [u.id, u.full_name])
      );
      phonesByArtisanId = Object.fromEntries(
        (artisanUsers ?? []).map((u) => [u.id, u.phone ?? null])
      );
    }

    const { data: artisanProfiles, error: profileError } = await supabase
      .from("artisan_profiles")
      .select("user_id, avatar_url")
      .in("user_id", artisanIds);

    if (profileError) {
      console.error("[bookings/client-bookings] artisan profiles query failed:", profileError);
      // Non-fatal — falls back to initials avatar on the client.
    } else {
      avatarsByArtisanId = Object.fromEntries(
        (artisanProfiles ?? []).map((p) => [p.user_id, p.avatar_url ?? null])
      );
    }
  }

  const merged = (bookings ?? []).map((b) => ({
    ...b,
    users: {
      full_name:  namesByArtisanId[b.artisan_id] ?? null,
      phone:      phonesByArtisanId[b.artisan_id] ?? null,
      avatar_url: avatarsByArtisanId[b.artisan_id] ?? null,
    },
  }));

  return NextResponse.json({ bookings: merged }, { status: 200 });
}