import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  // ── 1. Verify the caller is a real, authenticated client ─────────────────
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.replace("Bearer ", "");

  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (initError) {
    console.error("SUPABASE ERROR LOG: init failed:", initError);
    return NextResponse.json({ message: "Server configuration error." }, { status: 500 });
  }

  const { data: authResult, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authResult.user) {
    return NextResponse.json({ message: "Invalid or expired session." }, { status: 401 });
  }
  const clientId = authResult.user.id;

  // ── 2. Load the booking and confirm this client actually owns it ─────────
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, client_id, status, quoted_price")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("SUPABASE ERROR LOG: booking lookup failed:", bookingError);
    return NextResponse.json({ message: "Failed to load booking." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ message: "Booking not found." }, { status: 404 });
  }
  if (booking.client_id !== clientId) {
    return NextResponse.json({ message: "You don't have access to this booking." }, { status: 403 });
  }

  // ── 3. Only a 'quoted' booking with a real price can be accepted here ────
  // Flat-price bookings never pass through 'quoted' — they go straight
  // from 'requested' to 'confirmed' via the artisan's accept action, so
  // this route only ever applies to the custom_quote/both path.
  if (booking.status !== "quoted") {
    return NextResponse.json(
      { message: `This booking is ${booking.status}, not awaiting quote acceptance.` },
      { status: 409 }
    );
  }
  if (booking.quoted_price == null) {
    console.error("SUPABASE ERROR LOG: booking is 'quoted' but has no quoted_price:", bookingId);
    return NextResponse.json({ message: "This booking is missing a price. Please contact support." }, { status: 500 });
  }

  // ── 4. Move to confirmed. payment_status → 'pending' signals STK push
  // is needed next (not yet built — this just records the booking has
  // reached the point of requiring payment).
  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "confirmed", payment_status: "pending" })
    .eq("id", bookingId);

  if (updateError) {
    console.error("SUPABASE ERROR LOG: accept-quote update failed:", updateError);
    return NextResponse.json({ message: "Failed to accept quote." }, { status: 500 });
  }

  return NextResponse.json(
    { message: "Quote accepted.", status: "confirmed", quotedPrice: booking.quoted_price },
    { status: 200 }
  );
}