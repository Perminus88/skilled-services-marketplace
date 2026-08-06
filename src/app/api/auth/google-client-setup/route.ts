import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.replace("Bearer ", "");

  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: authResult, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authResult.user) {
    return NextResponse.json({ message: "Invalid or expired session." }, { status: 401 });
  }
  const user = authResult.user;

  // Safety check: if this email already belongs to a real artisan (they have
  // an artisan_profiles row), don't touch their role — just leave them as-is.
  // handle_new_user()'s default 'artisan' role is correct for them already.
  const { data: artisanProfile } = await supabase
    .from("artisan_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (artisanProfile) {
    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({ role: userRow?.role ?? "artisan" }, { status: 200 });
  }

  // No artisan profile — safe to treat this as a client. Google's
  // user_metadata typically includes full_name (and/or name) — use it to
  // fill in a display name if one isn't already set.
  const googleName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  const { data: existingUserRow } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from("users")
    .update({
      role: "client",
      ...((!existingUserRow?.full_name && googleName) && { full_name: googleName }),
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("SUPABASE ERROR LOG: google-client-setup update failed for userId =", user.id, "| Error:", updateError);
    return NextResponse.json({ message: "Failed to finish setting up your account." }, { status: 500 });
  }

  return NextResponse.json({ role: "client" }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}