// src/app/api/artisan/availability/route.ts
//
// POST body: { availability: "available" | "busy" | "offline" }
// An artisan can only update their OWN availability.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VALID_STATUSES = ["available", "busy", "offline"] as const;
type Status = (typeof VALID_STATUSES)[number];

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
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

  let body: { availability?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON in request body." }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(body.availability as Status)) {
    return NextResponse.json(
      { message: "availability must be 'available', 'busy', or 'offline'." },
      { status: 422 }
    );
  }

  const { error: updateError } = await supabase
    .from("artisan_profiles")
    .update({ availability: body.availability })
    .eq("user_id", authResult.user.id);

  if (updateError) {
    console.error("ARTISAN ERROR LOG: availability update failed:", updateError);
    return NextResponse.json({ message: "Failed to update availability." }, { status: 500 });
  }

  return NextResponse.json({ message: "Availability updated.", availability: body.availability }, { status: 200 });
}