// src/app/api/mpesa/test-auth/route.ts
// TEMPORARY — for verifying the Daraja OAuth helper works end to end.
// Hits Daraja's sandbox, gets a token, and confirms it back.
// Safe to delete once STK push is confirmed working, or keep it around
// as a quick health check for the M-Pesa credentials.

import { NextResponse } from "next/server";
import { getDarajaAccessToken } from "@/lib/mpesa/auth";

export async function GET() {
  try {
    const token = await getDarajaAccessToken();

    return NextResponse.json({
      message: "Daraja OAuth token retrieved successfully.",
      tokenPreview: `${token.slice(0, 12)}...`, // never return the full token
      tokenLength: token.length,
    });
  } catch (error) {
    console.error("MPESA ERROR LOG: test-auth route failed:", error);
    return NextResponse.json(
      { message: "Failed to get Daraja OAuth token.", error: String(error) },
      { status: 500 }
    );
  }
}