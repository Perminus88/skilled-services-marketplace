// src/app/api/admin/payouts/[bookingId]/trigger/route.ts
//
// Admin-only. Triggers a REAL B2C payout to the artisan for a completed,
// payment-released booking. This moves real money once B2C is live in
// production — the checks here are deliberately strict.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { triggerB2CPayout } from "@/lib/mpesa/b2c";
import { COMMISSION_RATE, computeCommission } from "@/lib/pricing";

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
  const supabase = getSupabaseAdmin();

  const authResult = await requireAdmin(req, supabase);
  if (authResult instanceof NextResponse) return authResult;

  // ── 1. Load the booking ───────────────────────────────────────────────────
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, artisan_id, status, payment_status, payout_status, quoted_price")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("PAYOUT ERROR LOG: booking lookup failed:", bookingError);
    return NextResponse.json({ message: "Failed to load booking." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ message: "Booking not found." }, { status: 404 });
  }

  // ── 2. Validate it's actually ready for payout ────────────────────────────
  if (booking.status !== "completed" || booking.payment_status !== "released") {
    return NextResponse.json(
      { message: "This booking isn't completed with payment released yet." },
      { status: 409 }
    );
  }
  if (!["not_started", "failed"].includes(booking.payout_status ?? "not_started")) {
    return NextResponse.json(
      { message: `Payout for this booking is already ${booking.payout_status}.` },
      { status: 409 }
    );
  }
  if (booking.quoted_price == null || booking.quoted_price <= 0) {
    console.error("PAYOUT ERROR LOG: booking has no valid quoted_price:", bookingId);
    return NextResponse.json({ message: "This booking is missing a valid price." }, { status: 500 });
  }

  // ── 3. Look up the artisan's phone (no FK on artisan_id — direct lookup) ──
  const { data: artisan, error: artisanError } = await supabase
    .from("users")
    .select("id, full_name, phone")
    .eq("id", booking.artisan_id)
    .maybeSingle();

  if (artisanError || !artisan || !artisan.phone) {
    console.error("PAYOUT ERROR LOG: artisan lookup failed or missing phone:", artisanError);
    return NextResponse.json({ message: "Couldn't find a valid phone number for this artisan." }, { status: 500 });
  }

  // ── 4. Compute the payout amount ──────────────────────────────────────────
  // Commission is 13% of the job price (T&Cs s.8). The KES 75 client booking
  // fee is separate platform revenue and is not part of this calculation.
  const serviceFee   = computeCommission(booking.quoted_price);
  const payoutAmount = booking.quoted_price - serviceFee;

  // ── 5. Trigger the real B2C payout ────────────────────────────────────────
  const originatorConversationId = `payout-${booking.id.slice(0, 8)}-${Date.now()}`;

  let b2cResult;
  try {
    b2cResult = await triggerB2CPayout({
      phone:                    artisan.phone,
      amount:                   payoutAmount,
      remarks:                  `Payout for booking ${booking.id.slice(0, 8)}`,
      originatorConversationId,
    });
  } catch (b2cError) {
    console.error("PAYOUT ERROR LOG: B2C trigger failed for booking", bookingId, ":", b2cError);

    // Record the failure so it shows up correctly in the admin UI and can be retried.
    await supabase
      .from("bookings")
      .update({ payout_status: "failed" })
      .eq("id", bookingId);

    return NextResponse.json(
      { message: b2cError instanceof Error ? b2cError.message : "Failed to initiate payout." },
      { status: 502 }
    );
  }

  // ── 6. Record the pending payout + commission audit trail ────────────────
  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      payout_status:                "pending",
      mpesa_payout_conversation_id: originatorConversationId,
      commission_rate:              COMMISSION_RATE,
      service_fee:                  serviceFee,
    })
    .eq("id", bookingId);

  if (updateError) {
    console.error(
      "PAYOUT ERROR LOG: B2C request accepted but failed to save tracking fields for booking",
      bookingId, ":", updateError
    );
  }

  return NextResponse.json(
    {
      message: "Payout initiated. Awaiting confirmation from M-Pesa.",
      conversationId: b2cResult.ConversationID,
      payoutAmount,
      serviceFee,
    },
    { status: 200 }
  );
}