// src/lib/mpesa/stkPush.ts
// Builds and sends an STK push (Lipa Na M-Pesa Online) request via Daraja.
// Requires a valid OAuth token from getDarajaAccessToken() first.

import { getDarajaAccessToken } from "./auth";

const STK_PUSH_URL =
  "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

interface StkPushParams {
  phone:             string;  // any reasonable Kenyan format — normalized internally
  amount:            number;
  accountReference:  string;  // shown to the customer, e.g. a booking short-id
  transactionDesc:   string;
}

interface StkPushSuccess {
  MerchantRequestID:   string;
  CheckoutRequestID:   string;
  ResponseCode:        string;
  ResponseDescription: string;
  CustomerMessage:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone normalization
// Daraja requires format 2547XXXXXXXX (or 2541XXXXXXXX for newer Safaricom
// ranges) — no leading 0, no +, no spaces. Clients may have stored their
// number as 07..., +2547..., 2547..., or with spaces/dashes, so we normalize
// before every request rather than trusting what's in the DB.
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeMpesaPhone(rawPhone: string): string | null {
  const digitsOnly = rawPhone.replace(/[^\d]/g, "");

  let normalized: string;
  if (digitsOnly.startsWith("254") && digitsOnly.length === 12) {
    normalized = digitsOnly;
  } else if (digitsOnly.startsWith("0") && digitsOnly.length === 10) {
    normalized = `254${digitsOnly.slice(1)}`;
  } else if (digitsOnly.length === 9) {
    // e.g. "712345678" with no leading 0 or country code
    normalized = `254${digitsOnly}`;
  } else {
    return null;
  }

  // Kenyan mobile numbers start 2547 or 2541 after normalization
  if (!/^254[17]\d{8}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Password: Base64(Shortcode + Passkey + Timestamp), per Daraja spec
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerStkPush(params: StkPushParams): Promise<StkPushSuccess> {
  const shortcode    = process.env.MPESA_SHORTCODE;
  const passkey      = process.env.MPESA_PASSKEY;
  const callbackUrl  = process.env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    throw new Error(
      "Missing MPESA_SHORTCODE, MPESA_PASSKEY, or MPESA_CALLBACK_URL in environment variables"
    );
  }

  const normalizedPhone = normalizeMpesaPhone(params.phone);
  if (!normalizedPhone) {
    throw new Error(`"${params.phone}" is not a valid Kenyan phone number for M-Pesa.`);
  }

  // M-Pesa requires whole-shilling amounts — no decimals
  const amount = Math.round(params.amount);
  if (amount <= 0) {
    throw new Error(`Invalid payment amount: ${params.amount}`);
  }

  const timestamp = buildTimestamp();
  const password  = buildPassword(shortcode, passkey, timestamp);
  const token     = await getDarajaAccessToken();

  const response = await fetch(STK_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   "CustomerPayBillOnline",
      Amount:            amount,
      PartyA:            normalizedPhone,
      PartyB:            shortcode,
      PhoneNumber:       normalizedPhone,
      CallBackURL:       callbackUrl,
      AccountReference:  params.accountReference.slice(0, 12), // Daraja caps this at 12 chars
      TransactionDesc:   params.transactionDesc.slice(0, 13),  // Daraja caps this at 13 chars
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.ResponseCode !== "0") {
    console.error("MPESA ERROR LOG: STK push request failed:", data);
    throw new Error(
      data.errorMessage || data.ResponseDescription || "STK push request failed."
    );
  }

  return data as StkPushSuccess;
}