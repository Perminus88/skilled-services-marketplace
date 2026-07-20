// src/app/api/mpesa/stk-push/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { triggerStkPush } from "@/lib/mpesa/stkPush";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface StkPushBody {
  bookingId: string;
  phone:     string; // may be edited by the client from their stored default
}

export async function POST(req: NextRequest) {
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
  const clientId = authResult.user.id;

  // ── 2. Parse + validate body ──────────────────────────────────────────────
  let body: Partial<StkPushBody>;
  try {
    body = (await req.json()) as Partial<StkPushBody>;
  } catch {
    return NextResponse.json({ message: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!body.bookingId || typeof body.bookingId !== "string") {
    return NextResponse.json({ message: "bookingId is required." }, { status: 422 });
  }
  if (!body.phone || typeof body.phone !== "string") {
    return NextResponse.json({ message: "phone is required." }, { status: 422 });
  }

  // ── 3. Load the booking and confirm this client actually owns it ─────────
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, client_id, status, payment_status, quoted_price")
    .eq("id", body.bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("MPESA ERROR LOG: booking lookup failed:", bookingError);
    return NextResponse.json({ message: "Failed to load booking." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ message: "Booking not found." }, { status: 404 });
  }
  if (booking.client_id !== clientId) {
    return NextResponse.json({ message: "You don't have access to this booking." }, { status: 403 });
  }

  // ── 4. Only a 'confirmed' booking with payment still 'pending' can be paid ──
  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { message: `This booking is ${booking.status}, not ready for payment.` },
      { status: 409 }
    );
  }
  if (booking.payment_status !== "pending" && booking.payment_status !== "failed") {
    return NextResponse.json(
      { message: `Payment for this booking is already ${booking.payment_status}.` },
      { status: 409 }
    );
  }
  if (booking.quoted_price == null || booking.quoted_price <= 0) {
    console.error("MPESA ERROR LOG: booking is confirmed but has no valid quoted_price:", body.bookingId);
    return NextResponse.json({ message: "This booking is missing a valid price." }, { status: 500 });
  }

  // ── 5. Trigger the STK push ───────────────────────────────────────────────
  let stkResult;
  try {
    stkResult = await triggerStkPush({
      phone:            body.phone,
      amount:           booking.quoted_price,
      accountReference: `BK-${booking.id.slice(0, 8)}`,
      transactionDesc:  "Service payment",
    });
  } catch (stkError) {
    console.error("MPESA ERROR LOG: STK push failed for booking", body.bookingId, ":", stkError);
    return NextResponse.json(
      { message: stkError instanceof Error ? stkError.message : "Failed to initiate payment." },
      { status: 502 }
    );
  }

  // ── 6. Store the CheckoutRequestID so the callback route can match it back ──
  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      mpesa_checkout_request_id: stkResult.CheckoutRequestID,
      payment_status:            "pending", // reset in case this is a retry after a 'failed' attempt
    })
    .eq("id", body.bookingId);

  if (updateError) {
    // The push already went out to the customer's phone at this point —
    // don't fail the response, but log loudly since the callback won't be
    // matchable to this booking without this value saved.
    console.error(
      "MPESA ERROR LOG: STK push succeeded but failed to save CheckoutRequestID for booking",
      body.bookingId,
      ":",
      updateError
    );
  }

  return NextResponse.json(
    {
      message: "Payment request sent. Check your phone to complete it.",
      checkoutRequestId: stkResult.CheckoutRequestID,
    },
    { status: 200 }
  );
}