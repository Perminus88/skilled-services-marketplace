import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Supabase admin client — same reasoning as /api/register/artisan: uses the
// service role key so this route isn't blocked by RLS policies that only
// allow a user to read/write their own row.
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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ClientRegistrationBody {
  userId:   string;   // UUID — must already exist in auth.users (via signUp())
  fullName: string;
  phone:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateBody(body: Partial<ClientRegistrationBody>): string[] {
  const errs: string[] = [];

  if (!body.userId || typeof body.userId !== "string")
    errs.push("userId is required and must be a string.");

  if (!body.fullName || typeof body.fullName !== "string" || body.fullName.trim().length < 2)
    errs.push("fullName is required and must be at least 2 characters.");

  if (!body.phone || typeof body.phone !== "string")
    errs.push("phone is required.");

  return errs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Partial<ClientRegistrationBody>;

  try {
    body = (await req.json()) as Partial<ClientRegistrationBody>;
  } catch (parseError) {
    console.error("SUPABASE ERROR LOG: Failed to parse request body:", parseError);
    return NextResponse.json({ message: "Invalid JSON in request body." }, { status: 400 });
  }

  const validationErrors = validateBody(body);
  if (validationErrors.length > 0) {
    console.error("SUPABASE ERROR LOG: Request validation failed:", validationErrors);
    return NextResponse.json(
      { message: "Validation failed.", errors: validationErrors },
      { status: 422 }
    );
  }

  const data = body as ClientRegistrationBody;

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

  // Sanity check: confirm this user really was created with role = 'client'.
  // Guards against someone calling this route directly with an artisan's
  // userId — the trigger sets role at signup time, this route just fills in
  // the remaining profile fields, and shouldn't silently proceed if the
  // role doesn't match what this route is meant for.
  const { data: userRow, error: userLookupError } = await supabase
    .from("users")
    .select("role")
    .eq("id", data.userId)
    .maybeSingle();

  if (userLookupError) {
    console.error(
      "SUPABASE ERROR LOG: users lookup failed for userId =",
      data.userId,
      "| Error:",
      userLookupError
    );
    return NextResponse.json(
      { message: "Failed to verify account. Please try again." },
      { status: 500 }
    );
  }

  if (!userRow) {
    console.error("SUPABASE ERROR LOG: No users row found for userId =", data.userId);
    return NextResponse.json(
      { message: "Account not found. Please sign up again." },
      { status: 404 }
    );
  }

  if (userRow.role !== "client") {
    console.error(
      "SUPABASE ERROR LOG: userId",
      data.userId,
      "has role",
      userRow.role,
      "— expected 'client'."
    );
    return NextResponse.json(
      { message: "This account is not registered as a client." },
      { status: 422 }
    );
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({
      full_name: data.fullName.trim(),
      phone:     data.phone,
    })
    .eq("id", data.userId);

  if (updateError) {
    console.error(
      "SUPABASE ERROR LOG: users update failed for userId =",
      data.userId,
      "| Error:",
      updateError
    );
    return NextResponse.json(
      { message: "Failed to save your details. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { message: "Client account created successfully.", userId: data.userId },
    { status: 201 }
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}