import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Action = "accept" | "decline" | "quote";

interface RespondBody {
  action: Action;
  price?: number;   // required when action === 'quote'
}

const ACTIONS: Action[] = ["accept", "decline", "quote"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  // ── 1. Verify the caller is a real, authenticated artisan ────────────────
  // Unlike prior routes, we can't trust a bare artisanId from the body here
  // — this action changes booking state, so we need to know who is
  // actually making the request, not who they claim to be.
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
  const artisanId = authResult.user.id;

  // ── 2. Parse + validate body ──────────────────────────────────────────────
  let body: Partial<RespondBody>;
  try {
    body = (await req.json()) as Partial<RespondBody>;
  } catch {
    return NextResponse.json({ message: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!body.action || !ACTIONS.includes(body.action as Action)) {
    return NextResponse.json({ message: "action must be one of: accept, decline, quote." }, { status: 422 });
  }
  if (body.action === "quote" && (typeof body.price !== "number" || body.price <= 0)) {
    return NextResponse.json({ message: "A valid price is required to send a quote." }, { status: 422 });
  }

  // ── 3. Load the booking and confirm this artisan actually owns it ────────
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, artisan_id, status, quoted_price")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("SUPABASE ERROR LOG: booking lookup failed:", bookingError);
    return NextResponse.json({ message: "Failed to load booking." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ message: "Booking not found." }, { status: 404 });
  }
  if (booking.artisan_id !== artisanId) {
    // Deliberately generic — don't confirm/deny existence details to a
    // non-owner beyond what they already know from the URL.
    return NextResponse.json({ message: "You don't have access to this booking." }, { status: 403 });
  }

  // ── 4. Look up pricing type — determines what "accept" actually means ────
  const { data: artisanProfile } = await supabase
    .from("artisan_profiles")
    .select("pricing_type")
    .eq("user_id", artisanId)
    .maybeSingle();

  const pricingType = artisanProfile?.pricing_type;

  // ── 5. State machine — only certain transitions are legal from 'requested' ──
  if (booking.status !== "requested") {
    return NextResponse.json(
      { message: `This booking is already ${booking.status} and can't be responded to again.` },
      { status: 409 }
    );
  }

  if (body.action === "decline") {
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "declined" })
      .eq("id", bookingId);

    if (updateError) {
      console.error("SUPABASE ERROR LOG: decline update failed:", updateError);
      return NextResponse.json({ message: "Failed to decline booking." }, { status: 500 });
    }
    return NextResponse.json({ message: "Booking declined.", status: "declined" }, { status: 200 });
  }

  if (body.action === "quote") {
    // Sending a custom quote only makes sense for custom_quote/both
    // artisans — flat-rate artisans already had a price set at creation.
    if (pricingType === "flat") {
      return NextResponse.json(
        { message: "This booking already has a fixed price. Use accept or decline." },
        { status: 422 }
      );
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "quoted", quoted_price: body.price })
      .eq("id", bookingId);

    if (updateError) {
      console.error("SUPABASE ERROR LOG: quote update failed:", updateError);
      return NextResponse.json({ message: "Failed to send quote." }, { status: 500 });
    }
    return NextResponse.json(
      { message: "Quote sent.", status: "quoted", quotedPrice: body.price },
      { status: 200 }
    );
  }

  // body.action === "accept"
  // Only valid directly from 'requested' when the price is already fixed
  // (flat pricing). custom_quote/both artisans must use 'quote' first —
  // the client then accepts that quote separately (a different, future
  // client-facing route), which is what actually moves it to 'confirmed'
  // for that pricing path.
  if (pricingType !== "flat") {
    return NextResponse.json(
      { message: "Send a quote first — this booking doesn't have a fixed price yet." },
      { status: 422 }
    );
  }

  // payment_status moves to 'pending' here to signal "STK push needed
  // next" — the actual M-Pesa trigger isn't built yet (next phase), this
  // just records that a booking has reached the point of needing payment.
  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "confirmed", payment_status: "pending" })
    .eq("id", bookingId);

  if (updateError) {
    console.error("SUPABASE ERROR LOG: accept update failed:", updateError);
    return NextResponse.json({ message: "Failed to accept booking." }, { status: 500 });
  }

  return NextResponse.json(
    { message: "Booking accepted.", status: "confirmed", quotedPrice: booking.quoted_price },
    { status: 200 }
  );
}