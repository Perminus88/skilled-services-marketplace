import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Lets a logged-in artisan replace their profile picture from the dashboard.
// Unlike /api/upload/artisan-avatar (used during signup, before a session
// exists), this route runs AFTER login — so it verifies a real Bearer token
// and updates artisan_profiles.avatar_url directly, in one step.
// ─────────────────────────────────────────────────────────────────────────────

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

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
  const userId = authResult.user.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (parseError) {
    console.error("SUPABASE ERROR LOG: Failed to parse form data:", parseError);
    return NextResponse.json({ message: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "file is required." }, { status: 422 });
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

  // Same fixed-path-per-user convention as the signup upload route, so
  // switching photos overwrites in place rather than accumulating old files.
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
  const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("artisan_profiles")
    .update({ avatar_url: avatarUrl })
    .eq("user_id", userId);

  if (updateError) {
    console.error("SUPABASE ERROR LOG: artisan_profiles avatar_url update failed for userId =", userId, "| Error:", updateError);
    return NextResponse.json(
      { message: "Image uploaded but failed to save to your profile. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ avatarUrl }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}