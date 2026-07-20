// src/app/api/bookings/[bookingId]/mark-complete/route.ts
//
// Either the client or the artisan on a booking can call this.
//
// - Client marks complete  → instant finalize (payment released immediately).
// - Artisan marks complete → opens a 48-hour window (auto_release_at) giving
//   the client a chance to dispute before it auto-finalizes. It does NOT
//   finalize immediately — the client still needs to confirm, or let the
//   window elapse.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { finalizeBooking } from "@/lib/bookings/completion";

const AUTO_RELEASE_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  // ── 1. Authenticate ────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.replace("Bearer ", "");
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (initError) {
    console.error("BOOKING ERROR LOG: Supabase init failed:", initError);
    return NextResponse.json({ message: "Server configuration error." }, { status: 500 });
  }

  const { data: authResult, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authResult.user) {
    return NextResponse.json({ message: "Invalid or expired session." }, { status: 401 });
  }
  const callerId = authResult.user.id;

  // ── 2. Load the booking and figure out which party is calling ────────────
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, client_id, artisan_id, status, payment_status, client_marked_complete_at, artisan_marked_complete_at"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("BOOKING ERROR LOG: booking lookup failed in mark-complete:", bookingError);
    return NextResponse.json({ message: "Failed to load booking." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ message: "Booking not found." }, { status: 404 });
  }

  let role: "client" | "artisan";
  if (booking.client_id === callerId) {
    role = "client";
  } else if (booking.artisan_id === callerId) {
    role = "artisan";
  } else {
    return NextResponse.json({ message: "You don't have access to this booking." }, { status: 403 });
  }

  // ── 3. Only an active, paid-for booking can be marked complete ───────────
  if (!["confirmed", "in_progress"].includes(booking.status)) {
    return NextResponse.json(
      { message: `This booking is ${booking.status} and can't be marked complete.` },
      { status: 409 }
    );
  }
  if (booking.payment_status !== "held") {
    return NextResponse.json(
      { message: "Payment must be confirmed before this booking can be marked complete." },
      { status: 409 }
    );
  }

  // ── 4. Client marking complete ────────────────────────────────────────────
  if (role === "client") {
    if (booking.client_marked_complete_at) {
      return NextResponse.json({ message: "You've already marked this complete." }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ client_marked_complete_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (updateError) {
      console.error("BOOKING ERROR LOG: failed to set client_marked_complete_at:", updateError);
      return NextResponse.json({ message: "Failed to update booking." }, { status: 500 });
    }

    // Client confirming is always an instant finalize — whether they're the
    // first to mark it, or they're confirming after the artisan already did.
    try {
      await finalizeBooking(supabase, bookingId);
    } catch {
      return NextResponse.json({ message: "Failed to finalize booking." }, { status: 500 });
    }

    return NextResponse.json({ message: "Booking marked complete and payment released.", status: "completed" });
  }

  // ── 5. Artisan marking complete ───────────────────────────────────────────
  if (booking.artisan_marked_complete_at) {
    return NextResponse.json({ message: "You've already marked this complete." }, { status: 409 });
  }

  const now = new Date();

  // Defensive edge case: if the client already marked complete (shouldn't
  // normally be reachable since that path finalizes immediately) just
  // finalize now rather than opening a window on an already-agreed job.
  if (booking.client_marked_complete_at) {
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ artisan_marked_complete_at: now.toISOString() })
      .eq("id", bookingId);

    if (updateError) {
      console.error("BOOKING ERROR LOG: failed to set artisan_marked_complete_at:", updateError);
      return NextResponse.json({ message: "Failed to update booking." }, { status: 500 });
    }

    try {
      await finalizeBooking(supabase, bookingId);
    } catch {
      return NextResponse.json({ message: "Failed to finalize booking." }, { status: 500 });
    }

    return NextResponse.json({ message: "Booking marked complete and payment released.", status: "completed" });
  }

  // Normal path: open the 48-hour window.
  const autoReleaseAt = new Date(now.getTime() + AUTO_RELEASE_WINDOW_MS);

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      artisan_marked_complete_at: now.toISOString(),
      auto_release_at:            autoReleaseAt.toISOString(),
    })
    .eq("id", bookingId);

  if (updateError) {
    console.error("BOOKING ERROR LOG: failed to open auto-release window:", updateError);
    return NextResponse.json({ message: "Failed to update booking." }, { status: 500 });
  }

  return NextResponse.json({
    message: "Marked complete. The client has 48 hours to confirm or dispute before payment auto-releases.",
    status: "pending_client_confirmation",
    autoReleaseAt: autoReleaseAt.toISOString(),
  });
}