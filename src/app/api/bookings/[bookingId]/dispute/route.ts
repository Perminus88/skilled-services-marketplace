// src/app/api/bookings/[bookingId]/dispute/route.ts
//
// Client-only. "Report an Issue" — freezes escrow by moving the booking to
// status = 'disputed'. This alone keeps it out of releaseOverdueBookings()
// (which only touches 'confirmed'/'in_progress'), and finalizeBooking()
// also now re-checks status itself as defense-in-depth against a race
// between a dispute and an in-flight finalize call.
//
// Resolving the dispute (admin reviewing evidence, releasing or refunding)
// is a separate, later phase — this route only ever freezes.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface DisputeBody {
  reason?: string;
}

const MIN_REASON_LENGTH = 10;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

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
  const clientId = authResult.user.id;

  let body: DisputeBody;
  try {
    body = (await req.json()) as DisputeBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON in request body." }, { status: 400 });
  }

  const reason = body.reason?.trim();
  if (!reason || reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      { message: `Please describe the issue (at least ${MIN_REASON_LENGTH} characters).` },
      { status: 422 }
    );
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, client_id, status, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("BOOKING ERROR LOG: booking lookup failed in dispute:", bookingError);
    return NextResponse.json({ message: "Failed to load booking." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ message: "Booking not found." }, { status: 404 });
  }
  if (booking.client_id !== clientId) {
    return NextResponse.json({ message: "You don't have access to this booking." }, { status: 403 });
  }

  // Only a job that's actually underway, with money actually held, can be
  // disputed — matches the window a client would realistically have
  // something to report about.
  if (!["confirmed", "in_progress"].includes(booking.status)) {
    return NextResponse.json(
      { message: `This booking is ${booking.status} and can't be disputed.` },
      { status: 409 }
    );
  }
  if (booking.payment_status !== "held") {
    return NextResponse.json(
      { message: "This booking doesn't have payment held yet." },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      status:          "disputed",
      dispute_reason:  reason,
      disputed_at:     new Date().toISOString(),
      auto_release_at: null, // stop any pending 48h auto-release window
    })
    .eq("id", bookingId)
    .in("status", ["confirmed", "in_progress"]); // re-check at write time too

  if (updateError) {
    console.error("BOOKING ERROR LOG: dispute update failed:", updateError);
    return NextResponse.json({ message: "Failed to file dispute." }, { status: 500 });
  }

  return NextResponse.json(
    { message: "Dispute filed. Our team will review this and get in touch.", status: "disputed" },
    { status: 200 }
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}