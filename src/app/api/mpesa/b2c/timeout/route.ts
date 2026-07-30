// src/app/api/mpesa/b2c/timeout/route.ts
//
// Public webhook — Safaricom's QueueTimeOutURL, called if a B2C request
// times out while queued (rare, but distinct from a normal failure result
// on /b2c/result). Payload shape isn't fully documented by Safaricom, so
// this parses defensively and matches the same OriginatorConversationID
// field the result callback uses.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ACK = NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    console.error("PAYOUT ERROR LOG: b2c/timeout received invalid JSON");
    return ACK;
  }

  console.log("PAYOUT TIMEOUT LOG:", JSON.stringify(payload));

  // Try both plausible shapes — a direct field or nested under Result,
  // matching the same convention as the result callback.
  const body = payload as Record<string, unknown>;
  const result = (body.Result as Record<string, unknown>) ?? body;
  const originatorConversationId =
    (result.OriginatorConversationID as string | undefined) ??
    (body.OriginatorConversationID as string | undefined);

  if (!originatorConversationId) {
    console.error("PAYOUT ERROR LOG: b2c/timeout missing OriginatorConversationID:", JSON.stringify(payload));
    return ACK;
  }

  const supabase = getSupabaseAdmin();

  const { data: booking, error: lookupError } = await supabase
    .from("bookings")
    .select("id, payout_status")
    .eq("mpesa_payout_conversation_id", originatorConversationId)
    .maybeSingle();

  if (lookupError || !booking) {
    console.error("PAYOUT ERROR LOG: booking lookup failed/missing in b2c/timeout:", lookupError);
    return ACK;
  }

  if (booking.payout_status !== "pending") {
    return ACK; // already resolved elsewhere — don't overwrite
  }

  await supabase
    .from("bookings")
    .update({ payout_status: "failed" })
    .eq("id", booking.id);

  console.log(`PAYOUT TIMEOUT LOG: booking ${booking.id} payout timed out, marked failed.`);
  return ACK;
}