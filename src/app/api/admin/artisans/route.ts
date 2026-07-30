// src/app/api/admin/artisans/route.ts
//
// GET /api/admin/artisans?status=pending|verified|rejected  (defaults to 'pending')
//
// Follows the project's established pattern of fetching related tables
// separately and merging in code, rather than relying on embedded
// PostgREST joins — this codebase has been bitten before by assuming FKs
// exist where they don't (see: bookings.artisan_id). Safer to be explicit.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const VALID_STATUSES = ["pending", "verified", "rejected"] as const;
type Status = (typeof VALID_STATUSES)[number];

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  const authResult = await requireAdmin(req, supabase);
  if (authResult instanceof NextResponse) return authResult;

  const statusParam = req.nextUrl.searchParams.get("status") ?? "pending";
  const status: Status = VALID_STATUSES.includes(statusParam as Status)
    ? (statusParam as Status)
    : "pending";

  // ── 1. Users matching this role + status ──────────────────────────────────
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, full_name, phone")
    .eq("role", "artisan")
    .eq("verification_status", status)
    .order("id", { ascending: false }); // no created_at column confirmed on users — id ordering is a stable-enough fallback

  if (usersError) {
    console.error("ADMIN ERROR LOG: users query failed:", usersError);
    return NextResponse.json({ message: "Failed to load artisans." }, { status: 500 });
  }
  if (!users || users.length === 0) {
    return NextResponse.json({ artisans: [] }, { status: 200 });
  }

  const userIds = users.map((u) => u.id);

  // ── 2. Their profiles ──────────────────────────────────────────────────────
  const { data: profiles, error: profilesError } = await supabase
    .from("artisan_profiles")
    .select(
      "user_id, bio, years_experience, availability, starting_price, pricing_type, rating_avg, rating_count"
    )
    .in("user_id", userIds);

  if (profilesError) {
    console.error("ADMIN ERROR LOG: artisan_profiles query failed:", profilesError);
    return NextResponse.json({ message: "Failed to load artisan profiles." }, { status: 500 });
  }
  const profileByUserId = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));

  // ── 3. Their trade category names ────────────────────────────────────────
  const { data: links, error: linksError } = await supabase
    .from("artisan_categories")
    .select("artisan_id, category_id")
    .in("artisan_id", userIds);

  if (linksError) {
    console.error("ADMIN ERROR LOG: artisan_categories query failed:", linksError);
    // Non-fatal — artisans can still render without a trade label.
  }

  let categoryNameById: Record<number, string> = {};
  const categoryIds = [...new Set((links ?? []).map((l) => l.category_id))];
  if (categoryIds.length > 0) {
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name")
      .in("id", categoryIds);

    if (categoriesError) {
      console.error("ADMIN ERROR LOG: categories query failed:", categoriesError);
    } else {
      categoryNameById = Object.fromEntries((categories ?? []).map((c) => [c.id, c.name]));
    }
  }

  const categoryNameByArtisanId: Record<string, string> = {};
  for (const link of links ?? []) {
    categoryNameByArtisanId[link.artisan_id] = categoryNameById[link.category_id] ?? "Unknown trade";
  }

  // ── 4. Merge ─────────────────────────────────────────────────────────────
  const artisans = users.map((u) => {
    const profile = profileByUserId[u.id];
    return {
      id:               u.id,
      fullName:         u.full_name,
      phone:            u.phone,
      categoryName:     categoryNameByArtisanId[u.id] ?? "Unknown trade",
      bio:              profile?.bio ?? "",
      yearsExperience:  profile?.years_experience ?? null,
      availability:     profile?.availability ?? null,
      startingPrice:    profile?.starting_price ?? null,
      pricingType:      profile?.pricing_type ?? null,
      ratingAvg:        profile?.rating_avg ?? 0,
      ratingCount:      profile?.rating_count ?? 0,
    };
  });

  return NextResponse.json({ artisans }, { status: 200 });
}