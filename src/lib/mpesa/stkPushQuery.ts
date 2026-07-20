// src/lib/mpesa/stkPushQuery.ts
// Queries Daraja directly for the status of a previously-initiated STK push.
// Useful as a fallback/reconciliation tool when a callback is delayed, lost,
// or (as with the shared sandbox) times out even though the underlying
// transaction may have actually gone through.

import { getDarajaAccessToken } from "./auth";

const STK_QUERY_URL =
  "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query";

interface StkQueryResult {
  ResponseCode:        string;
  ResponseDescription: string;
  MerchantRequestID:   string;
  CheckoutRequestID:   string;
  ResultCode:          string; // note: string here, unlike the callback's numeric ResultCode
  ResultDesc:          string;
}

function buildTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function buildPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
}

export async function queryStkPushStatus(checkoutRequestId: string): Promise<StkQueryResult> {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;

  if (!shortcode || !passkey) {
    throw new Error("Missing MPESA_SHORTCODE or MPESA_PASSKEY in environment variables");
  }

  const timestamp = buildTimestamp();
  const password  = buildPassword(shortcode, passkey, timestamp);
  const token     = await getDarajaAccessToken();

  const response = await fetch(STK_QUERY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password:          password,
      Timestamp:         timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("MPESA ERROR LOG: STK query request failed:", data);
    throw new Error(data.errorMessage || "STK push query failed.");
  }

  return data as StkQueryResult;
}