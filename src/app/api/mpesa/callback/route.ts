// src/app/api/mpesa/callback/route.ts
//
// Public webhook — Safaricom calls this directly, no bearer token involved.
// This is the ONLY place payment_status ever moves from 'pending' to
// 'held' or 'failed'. Nothing else in the app should set those values.
//
// Daraja requires a fast 200 response with {ResultCode: 0} regardless of
// what happened on our end — if we don't ack quickly, or ack with an
// error, Safaricom will retry the callback repeatedly. So: always ack,
// do our real work in a way that's safe to run more than once.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// The standard "we got it" response Daraja expects back.
const ACK = NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });

interface CallbackMetadataItem {
  Name:  string;
  Value?: string | number;
}

interface StkCallbackBody {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: CallbackMetadataItem[];
      };
    };
  };
}

function findMetadataValue(items: CallbackMetadataItem[], name: string): string | number | undefined {
  return items.find((item) => item.Name === name)?.Value;
}

export async function POST(req: NextRequest) {
  let payload: StkCallbackBody;
  try {
    payload = (await req.json()) as StkCallbackBody;
  } catch {
    console.error("MPESA ERROR LOG: callback received invalid JSON");
    return ACK; // Still ack — a malformed retry isn't worth Safaricom hammering us over.
  }

  // Log the raw payload every time — this is the audit trail for real
  // money moving. Cheap insurance if something needs reconstructing later.
  console.log("MPESA CALLBACK LOG:", JSON.stringify(payload));

  const stkCallback = payload.Body?.stkCallback;
  if (!stkCallback?.CheckoutRequestID) {
    console.error("MPESA ERROR LOG: callback missing CheckoutRequestID:", JSON.stringify(payload));
    return ACK;
  }

  const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (initError) {
    console.error("MPESA ERROR LOG: Supabase init failed in callback:", initError);
    return ACK;
  }

  // ── Find the booking this callback belongs to ───────────────────────────
  const { data: booking, error: lookupError } = await supabase
    .from("bookings")
    .select("id, payment_status")
    .eq("mpesa_checkout_request_id", CheckoutRequestID)
    .maybeSingle();

  if (lookupError) {
    console.error("MPESA ERROR LOG: booking lookup failed in callback:", lookupError);
    return ACK;
  }
  if (!booking) {
    // Shouldn't normally happen — every CheckoutRequestID we get back from
    // Daraja was saved against a booking at STK-push time. Log loudly so
    // it's visible, but there's nothing more we can do without a booking to
    // update.
    console.error(
      "MPESA ERROR LOG: no booking found for CheckoutRequestID:", CheckoutRequestID
    );
    return ACK;
  }

  // ── Idempotency guard ────────────────────────────────────────────────────
  // Safaricom can call this more than once for the same transaction. Once
  // we've already moved this booking off 'pending', don't process again.
  if (booking.payment_status !== "pending") {
    console.log(
      `MPESA CALLBACK LOG: booking ${booking.id} already resolved (${booking.payment_status}), skipping duplicate callback.`
    );
    return ACK;
  }

  // ── Payment failed / cancelled / timed out ──────────────────────────────
  if (ResultCode !== 0) {
    const { error: failUpdateError } = await supabase
      .from("bookings")
      .update({ payment_status: "failed" })
      .eq("id", booking.id);

    if (failUpdateError) {
      console.error("MPESA ERROR LOG: failed to mark booking as failed:", failUpdateError);
    } else {
      console.log(
        `MPESA CALLBACK LOG: booking ${booking.id} payment failed — ResultCode ${ResultCode}: ${ResultDesc}`
      );
    }
    return ACK;
  }

  // ── Payment succeeded ────────────────────────────────────────────────────
  const items = stkCallback.CallbackMetadata?.Item ?? [];
  const receiptNumber = findMetadataValue(items, "MpesaReceiptNumber");

  if (!receiptNumber) {
    // ResultCode 0 with no receipt number would be very unusual — Daraja
    // always includes it on success. Log it clearly rather than silently
    // storing a null receipt.
    console.error(
      `MPESA ERROR LOG: ResultCode 0 but no MpesaReceiptNumber for booking ${booking.id}:`,
      JSON.stringify(items)
    );
  }

  const { error: successUpdateError } = await supabase
    .from("bookings")
    .update({
      payment_status:       "held",
      // Activates the previously-unused 'in_progress' status — this is
      // the moment the job officially starts, now that payment is secured.
      status:               "in_progress",
      mpesa_receipt_number: receiptNumber ? String(receiptNumber) : null,
    })
    .eq("id", booking.id);

  if (successUpdateError) {
    console.error("MPESA ERROR LOG: failed to mark booking as held:", successUpdateError);
  } else {
    console.log(
      `MPESA CALLBACK LOG: booking ${booking.id} payment held — receipt ${receiptNumber}`
    );
  }

  return ACK;
}