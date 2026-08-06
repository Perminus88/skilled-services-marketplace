import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// This route uploads an artisan's profile picture to Supabase Storage during
// signup — BEFORE the artisan_profiles row exists (that happens later in
// /api/register/artisan). It only needs a real userId from auth.signUp(),
// which the frontend already has by the time it calls this.
//
// Uses the service role key, same reasoning as /api/register/artisan: the
// browser has no session yet (email confirmation is required before login),
// so RLS-authenticated uploads aren't possible here.
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

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let formData: FormData;

  try {
    formData = await req.formData();
  } catch (parseError) {
    console.error("SUPABASE ERROR LOG: Failed to parse form data:", parseError);
    return NextResponse.json({ message: "Invalid form data." }, { status: 400 });
  }

  const file   = formData.get("file");
  const userId = formData.get("userId");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "file is required." }, { status: 422 });
  }
  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ message: "userId is required." }, { status: 422 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { message: "Only JPEG, PNG, or WebP images are allowed." },
      { status: 422 }
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { message: "Image must be smaller than 5MB." },
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

  // One fixed filename per user (not per-upload) so re-submitting the signup
  // form doesn't leave orphaned old images behind — upsert overwrites in place.
  const path = `${userId}/avatar.${extension}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("SUPABASE ERROR LOG: Avatar upload failed for userId =", userId, "| Error:", uploadError);
    return NextResponse.json(
      { message: "Failed to upload image. Please try again." },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);

  // Cache-bust so a re-uploaded avatar (same path, upsert:true) shows
  // immediately instead of a stale cached image.
  const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  return NextResponse.json({ avatarUrl }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}