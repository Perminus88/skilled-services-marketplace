// src/app/api/admin/artisans/[artisanId]/verify/route.ts
//
// POST body: { action: "approve" | "reject" }
// Sets users.verification_status accordingly. Admin-only.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ artisanId: string }> }
) {
  const { artisanId } = await params;
  const supabase = getSupabaseAdmin();

  const authResult = await requireAdmin(req, supabase);
  if (authResult instanceof NextResponse) return authResult;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON in request body." }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ message: "action must be 'approve' or 'reject'." }, { status: 422 });
  }

  const newStatus = body.action === "approve" ? "verified" : "rejected";

  // Confirm the target is actually an artisan before touching their status —
  // avoids accidentally verifying/rejecting a client or admin account if
  // the wrong ID somehow gets passed in.
  const { data: targetUser, error: lookupError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", artisanId)
    .maybeSingle();

  if (lookupError) {
    console.error("ADMIN ERROR LOG: target user lookup failed:", lookupError);
    return NextResponse.json({ message: "Failed to load user." }, { status: 500 });
  }
  if (!targetUser) {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }
  if (targetUser.role !== "artisan") {
    return NextResponse.json({ message: "This user is not an artisan." }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ verification_status: newStatus })
    .eq("id", artisanId);

  if (updateError) {
    console.error("ADMIN ERROR LOG: verification_status update failed:", updateError);
    return NextResponse.json({ message: "Failed to update verification status." }, { status: 500 });
  }

  return NextResponse.json({ message: `Artisan ${newStatus}.`, status: newStatus }, { status: 200 });
}