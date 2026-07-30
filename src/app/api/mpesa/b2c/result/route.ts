// src/app/api/mpesa/b2c/result/route.ts
//
// Public webhook — Safaricom calls this after a B2C payout actually
// processes (success or failure). Matched back to a booking via
// OriginatorConversationID, which WE generated and saved at trigger time.
//
// Same ack-first, idempotent pattern as the STK callback route.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ACK = NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });

interface ResultParameter {
  Key: string;
  Value?: string | number;
}

interface B2CResultBody {
  Result?: {
    ResultType?: number;
    ResultCode?: number;
    ResultDesc?: string;
    OriginatorConversationID?: string;
    ConversationID?: string;
    TransactionID?: string;
    ResultParameters?: {
      ResultParameter?: ResultParameter[];
    };
  };
}

function findParam(items: ResultParameter[], key: string): string | number | undefined {
  return items.find((item) => item.Key === key)?.Value;
}

export async function POST(req: NextRequest) {
  let payload: B2CResultBody;
  try {
    payload = (await req.json()) as B2CResultBody;
  } catch {
    console.error("PAYOUT ERROR LOG: b2c/result received invalid JSON");
    return ACK;
  }

  console.log("PAYOUT CALLBACK LOG:", JSON.stringify(payload));

  const result = payload.Result;
  if (!result?.OriginatorConversationID) {
    console.error("PAYOUT ERROR LOG: b2c/result missing OriginatorConversationID:", JSON.stringify(payload));
    return ACK;
  }

  const { OriginatorConversationID, ResultCode, ResultDesc } = result;

  const supabase = getSupabaseAdmin();

  const { data: booking, error: lookupError } = await supabase
    .from("bookings")
    .select("id, payout_status")
    .eq("mpesa_payout_conversation_id", OriginatorConversationID)
    .maybeSingle();

  if (lookupError) {
    console.error("PAYOUT ERROR LOG: booking lookup failed in b2c/result:", lookupError);
    return ACK;
  }
  if (!booking) {
    console.error(
      "PAYOUT ERROR LOG: no booking found for OriginatorConversationID:", OriginatorConversationID
    );
    return ACK;
  }

  // Idempotency guard — Safaricom can retry callbacks.
  if (booking.payout_status !== "pending") {
    console.log(
      `PAYOUT CALLBACK LOG: booking ${booking.id} payout already resolved (${booking.payout_status}), skipping duplicate.`
    );
    return ACK;
  }

  if (ResultCode !== 0) {
    await supabase
      .from("bookings")
      .update({ payout_status: "failed" })
      .eq("id", booking.id);

    console.log(
      `PAYOUT CALLBACK LOG: booking ${booking.id} payout failed — ResultCode ${ResultCode}: ${ResultDesc}`
    );
    return ACK;
  }

  // Success — pull the M-Pesa transaction receipt out of the result params.
  const items = result.ResultParameters?.ResultParameter ?? [];
  const receipt = findParam(items, "TransactionReceipt");

  if (!receipt) {
    console.error(
      `PAYOUT ERROR LOG: ResultCode 0 but no TransactionReceipt for booking ${booking.id}:`,
      JSON.stringify(items)
    );
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      payout_status:                "completed",
      mpesa_payout_transaction_id:  receipt ? String(receipt) : null,
    })
    .eq("id", booking.id);

  if (updateError) {
    console.error("PAYOUT ERROR LOG: failed to mark payout completed:", updateError);
  } else {
    console.log(`PAYOUT CALLBACK LOG: booking ${booking.id} payout completed — receipt ${receipt}`);
  }

  return ACK;
}