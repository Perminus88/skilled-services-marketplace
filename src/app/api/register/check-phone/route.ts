import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/register/check-phone
//
// Checks whether a phone number is already tied to an existing account,
// BEFORE the frontend calls supabase.auth.signUp(). This exists specifically
// to avoid orphaned auth accounts: previously, signUp() ran first, and only
// afterward did /api/register/artisan discover the phone was taken — by
// which point a real auth.users row already existed for an email the
// artisan couldn't easily reuse (signUp() rejects an already-registered
// email, even if artisan_profiles was never actually completed for it).
//
// This route uses the SERVICE ROLE key so it can read `public.users`
// regardless of RLS policies — same reasoning as the main registration route.
// ─────────────────────────────────────────────────────────────────────────────

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface CheckPhoneBody {
  phone: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Partial<CheckPhoneBody>;

  try {
    body = (await req.json()) as Partial<CheckPhoneBody>;
  } catch (parseError) {
    console.error("SUPABASE ERROR LOG: Failed to parse request body:", parseError);
    return NextResponse.json(
      { message: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  if (!body.phone || typeof body.phone !== "string") {
    return NextResponse.json(
      { message: "phone is required." },
      { status: 422 }
    );
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (initError) {
    console.error("SUPABASE ERROR LOG: Failed to initialise Supabase client:", initError);
    return NextResponse.json(
      { message: "Server configuration error. Contact support." },
      { status: 500 }
    );
  }

  const { data: existingUser, error: lookupError } = await supabase
    .from("users")
    .select("id")
    .eq("phone", body.phone)
    .maybeSingle();

  if (lookupError) {
    console.error(
      "SUPABASE ERROR LOG: check-phone lookup failed for",
      body.phone,
      "| Error:",
      lookupError
    );
    return NextResponse.json(
      { message: "Failed to verify phone number. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { available: !existingUser },
    { status: 200 }
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}