import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CreateBookingBody {
  clientId:    string;
  artisanId:   string;
  categoryId:  number;
  description: string;
  scheduledAt?: string;
  latitude:    number;
  longitude:   number;
}

// Bookings in these states represent an active, unresolved engagement
// between a specific client and artisan — used both to block duplicate
// requests and (later) to check for scheduling conflicts.
const ACTIVE_BOOKING_STATUSES = ["requested", "quoted", "confirmed", "in_progress"];

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateBody(body: Partial<CreateBookingBody>): string[] {
  const errs: string[] = [];

  if (!body.clientId || typeof body.clientId !== "string")
    errs.push("clientId is required.");
  if (!body.artisanId || typeof body.artisanId !== "string")
    errs.push("artisanId is required.");
  if (!body.categoryId || typeof body.categoryId !== "number")
    errs.push("categoryId is required and must be a number.");
  if (!body.description || typeof body.description !== "string" || body.description.trim().length < 5)
    errs.push("description is required and must be at least 5 characters.");
  if (typeof body.latitude !== "number" || typeof body.longitude !== "number")
    errs.push("latitude and longitude must be numbers.");

  if (body.scheduledAt !== undefined) {
    const parsed = new Date(body.scheduledAt);
    if (isNaN(parsed.getTime())) errs.push("scheduledAt must be a valid date/time.");
  }

  return errs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Partial<CreateBookingBody>;

  try {
    body = (await req.json()) as Partial<CreateBookingBody>;
  } catch {
    return NextResponse.json({ message: "Invalid JSON in request body." }, { status: 400 });
  }

  const validationErrors = validateBody(body);
  if (validationErrors.length > 0) {
    return NextResponse.json(
      { message: "Validation failed.", errors: validationErrors },
      { status: 422 }
    );
  }

  const data = body as CreateBookingBody;

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (initError) {
    console.error("SUPABASE ERROR LOG: Failed to initialise Supabase client:", initError);
    return NextResponse.json({ message: "Server configuration error." }, { status: 500 });
  }

  // ── 1. Confirm the client is real and actually a client ──────────────────
  const { data: clientRow, error: clientError } = await supabase
    .from("users")
    .select("role")
    .eq("id", data.clientId)
    .maybeSingle();

  if (clientError) {
    console.error("SUPABASE ERROR LOG: client lookup failed:", clientError);
    return NextResponse.json({ message: "Failed to verify client account." }, { status: 500 });
  }
  if (!clientRow || clientRow.role !== "client") {
    return NextResponse.json({ message: "Invalid client account." }, { status: 422 });
  }

  // ── 2. Confirm the artisan is real, verified, and fetch pricing + availability ──
  const { data: artisanUser, error: artisanUserError } = await supabase
    .from("users")
    .select("role, verification_status")
    .eq("id", data.artisanId)
    .maybeSingle();

  if (artisanUserError) {
    console.error("SUPABASE ERROR LOG: artisan lookup failed:", artisanUserError);
    return NextResponse.json({ message: "Failed to verify artisan account." }, { status: 500 });
  }
  if (!artisanUser || artisanUser.role !== "artisan" || artisanUser.verification_status !== "verified") {
    return NextResponse.json(
      { message: "This artisan is not currently available for booking." },
      { status: 422 }
    );
  }

  const { data: artisanProfile, error: profileError } = await supabase
    .from("artisan_profiles")
    .select("pricing_type, starting_price, availability")
    .eq("user_id", data.artisanId)
    .maybeSingle();

  if (profileError || !artisanProfile) {
    console.error("SUPABASE ERROR LOG: artisan_profiles lookup failed:", profileError);
    return NextResponse.json({ message: "Failed to load artisan pricing." }, { status: 500 });
  }

  // 'offline' means not taking work right now — block outright.
  // 'busy' still allows a request through; the artisan can decide whether
  // to accept it, since "busy today" doesn't necessarily mean "unwilling
  // to be asked about a later job."
  if (artisanProfile.availability === "offline") {
    return NextResponse.json(
      { message: "This artisan isn't accepting bookings right now." },
      { status: 422 }
    );
  }

  // ── 3. Block duplicate active requests between this client + artisan ─────
  const { data: existingActive, error: existingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("client_id", data.clientId)
    .eq("artisan_id", data.artisanId)
    .in("status", ACTIVE_BOOKING_STATUSES)
    .maybeSingle();

  if (existingError) {
    console.error("SUPABASE ERROR LOG: duplicate-check query failed:", existingError);
    return NextResponse.json({ message: "Failed to verify booking status." }, { status: 500 });
  }
  if (existingActive) {
    return NextResponse.json(
      { message: "You already have an active booking with this artisan." },
      { status: 409 }
    );
  }

  // ── 4. Determine starting quoted_price ────────────────────────────────────
  const quotedPrice = artisanProfile.pricing_type === "flat" ? artisanProfile.starting_price : null;

  // ── 5. Build booking location as WKT, same pattern as artisan_profiles ───
  const clientLocationWKT = `SRID=4326;POINT(${data.longitude} ${data.latitude})`;

  // ── 6. Insert the booking ──────────────────────────────────────────────
  const { data: booking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      client_id:      data.clientId,
      artisan_id:     data.artisanId,
      category_id:    data.categoryId,
      description:    data.description.trim(),
      status:          "requested",
      quoted_price:    quotedPrice,
      scheduled_at:    data.scheduledAt ?? null,
      client_location: clientLocationWKT,
      payment_status:  "not_required",
    })
    .select("id, status, quoted_price")
    .single();

  if (insertError) {
    console.error("SUPABASE ERROR LOG: booking insert failed:", insertError);
    return NextResponse.json({ message: "Failed to create booking. Please try again." }, { status: 500 });
  }

  return NextResponse.json(
    {
      message:     "Booking request sent.",
      bookingId:   booking.id,
      status:      booking.status,
      quotedPrice: booking.quoted_price,
    },
    { status: 201 }
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}