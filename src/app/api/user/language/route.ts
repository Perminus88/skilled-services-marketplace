import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/request";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON." }, { status: 400 });
  }

  const locale = body.locale;
  if (!locale || !(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return NextResponse.json(
      { message: `locale must be one of: ${SUPPORTED_LOCALES.join(", ")}.` },
      { status: 422 }
    );
  }

  // Sync to the user's profile if they're logged in — non-fatal if it fails,
  // since the cookie alone already gives them the language change on this
  // device right away.
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.replace("Bearer ", "");

  if (accessToken) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: authResult } = await supabase.auth.getUser(accessToken);
      if (authResult.user) {
        await supabase
          .from("users")
          .update({ preferred_language: locale as SupportedLocale })
          .eq("id", authResult.user.id);
      }
    } catch (err) {
      console.warn("[user/language] Failed to sync preferred_language to DB:", err);
    }
  }

  const res = NextResponse.json({ locale }, { status: 200 });
  res.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
  return res;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}