// src/app/api/mpesa/query-status/[bookingId]/route.ts
//
// Manual reconciliation endpoint. Asks Daraja directly what the real status
// of a booking's last STK push attempt is, independent of whether our
// callback route ever received (or will receive) a webhook for it.
//
// Does NOT currently write back to the DB — it's read-only/diagnostic for
// now. Once we've confirmed it behaves as expected, this can be wired to
// auto-correct payment_status if Daraja's record disagrees with ours.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { queryStkPushStatus } from "@/lib/mpesa/stkPushQuery";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(
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
    console.error("MPESA ERROR LOG: Supabase init failed:", initError);
    return NextResponse.json({ message: "Server configuration error." }, { status: 500 });
  }

  const { data: authResult, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authResult.user) {
    return NextResponse.json({ message: "Invalid or expired session." }, { status: 401 });
  }

  // ── 2. Load the booking and confirm this client owns it ──────────────────
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, client_id, payment_status, mpesa_checkout_request_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("MPESA ERROR LOG: booking lookup failed in query-status:", bookingError);
    return NextResponse.json({ message: "Failed to load booking." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ message: "Booking not found." }, { status: 404 });
  }
  if (booking.client_id !== authResult.user.id) {
    return NextResponse.json({ message: "You don't have access to this booking." }, { status: 403 });
  }
  if (!booking.mpesa_checkout_request_id) {
    return NextResponse.json(
      { message: "No payment attempt has been made on this booking yet." },
      { status: 409 }
    );
  }

  // ── 3. Ask Daraja directly ────────────────────────────────────────────────
  try {
    const result = await queryStkPushStatus(booking.mpesa_checkout_request_id);
    return NextResponse.json({
      ourRecordedStatus: booking.payment_status,
      daraja: {
        resultCode: result.ResultCode,
        resultDesc: result.ResultDesc,
      },
    });
  } catch (queryError) {
    console.error("MPESA ERROR LOG: query-status failed for booking", bookingId, ":", queryError);
    return NextResponse.json(
      { message: queryError instanceof Error ? queryError.message : "Query failed." },
      { status: 502 }
    );
  }
}