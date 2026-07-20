// src/app/api/bookings/process-auto-releases/route.ts
//
// Intended to be hit by a real scheduled job (e.g. Vercel Cron) on a
// regular interval (every few minutes is plenty, given this is a 48-hour
// window). This exists because the opportunistic sweep in the dashboard
// GET routes only runs when someone happens to load a dashboard — a
// booking with nobody checking in on it could otherwise sit past its
// auto_release_at indefinitely.
//
// NOT wired to a cron schedule yet — that's an infra step (e.g. adding a
// `vercel.json` cron entry pointing here, or an external scheduler) that
// needs to happen at deploy time, not something this route can set up
// itself. Protect this route with a shared secret before exposing it
// publicly — anyone who can call it can trigger payment releases early.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { releaseOverdueBookings } from "@/lib/bookings/completion";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: NextRequest) {
  // Simple shared-secret check — set CRON_SECRET in .env.local and pass it
  // as `Authorization: Bearer <CRON_SECRET>` from whatever scheduler calls
  // this. Without this, skip the check (dev convenience) but log a warning.
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const provided = req.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== expectedSecret) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
  } else {
    console.warn(
      "BOOKING WARNING: process-auto-releases called with no CRON_SECRET configured — anyone can hit this route."
    );
  }

  const supabase = getSupabaseAdmin();
  await releaseOverdueBookings(supabase);

  return NextResponse.json({ message: "Auto-release sweep complete." }, { status: 200 });
}