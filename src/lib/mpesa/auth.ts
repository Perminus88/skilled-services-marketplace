// src/lib/mpesa/auth.ts
// Daraja OAuth token helper — exchanges consumer key/secret for a
// short-lived access token required before any Daraja API call (STK push, etc.)

const DARAJA_AUTH_URL =
  "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

interface DarajaTokenResponse {
  access_token: string;
  expiry_in: string; // seconds, as a string, from Safaricom
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

// Simple in-memory cache so we're not hitting Daraja for a new token
// on every single request. Fine for a single dev server / single
// serverless instance; not a distributed cache.
let cachedToken: CachedToken | null = null;

export async function getDarajaAccessToken(): Promise<string> {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      "Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET in environment variables"
    );
  }

  // Return cached token if still valid (with a 60s safety buffer)
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64"
  );

  const response = await fetch(DARAJA_AUTH_URL, {
    method: "GET",
    headers: {
      Authorization: `Basic ${credentials}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("MPESA ERROR LOG: Daraja OAuth request failed:", errorText);
    throw new Error(`Daraja OAuth request failed (${response.status})`);
  }

  const data: DarajaTokenResponse = await response.json();

  if (!data.access_token) {
    throw new Error("Daraja OAuth response missing access_token");
  }

  const expiresInMs = parseInt(data.expiry_in, 10) * 1000;

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  };

  return data.access_token;
}