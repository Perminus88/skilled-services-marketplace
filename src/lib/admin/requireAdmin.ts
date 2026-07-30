// src/lib/admin/requireAdmin.ts
//
// Shared auth check for admin-only routes. Verifies the bearer token is
// valid AND that the user's role in `users` is 'admin'. Returns either the
// admin's user ID (success) or a ready-to-return NextResponse (failure) so
// callers can do:
//
//   const result = await requireAdmin(req, supabase);
//   if (result instanceof NextResponse) return result;
//   const adminId = result;

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseAdmin = SupabaseClient<any, any, any>;

export async function requireAdmin(
  req: NextRequest,
  supabase: SupabaseAdmin
): Promise<string | NextResponse> {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.replace("Bearer ", "");

  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { data: authResult, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authResult.user) {
    return NextResponse.json({ message: "Invalid or expired session." }, { status: 401 });
  }

  const { data, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("id", authResult.user.id)
    .maybeSingle();

  const userRow = data as { role: string } | null;

  if (userError) {
    console.error("ADMIN ERROR LOG: role lookup failed:", userError);
    return NextResponse.json({ message: "Failed to verify admin access." }, { status: 500 });
  }
  if (!userRow || userRow.role !== "admin") {
    return NextResponse.json({ message: "Admin access required." }, { status: 403 });
  }

  return authResult.user.id;
}