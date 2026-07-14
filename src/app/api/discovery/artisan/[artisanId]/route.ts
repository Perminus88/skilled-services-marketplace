import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role client — same reasoning as the rest of /api/discovery/*:
// RLS only allows a user to read their own row, so fetching another
// user's (the artisan's) profile for display needs to bypass that.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ artisanId: string }> }
) {
  const { artisanId } = await params;

  if (!artisanId) {
    return NextResponse.json({ message: "artisanId is required." }, { status: 400 });
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, full_name, verification_status")
    .eq("id", artisanId)
    .eq("role", "artisan")
    .maybeSingle();

  if (userError) {
    console.error("[discovery/artisan] users query failed:", userError);
    return NextResponse.json({ message: "Failed to load artisan." }, { status: 500 });
  }

  // Only show verified artisans — same rule as the discovery list itself.
  // A client hitting this route with a stale/guessed ID for an
  // unverified or nonexistent artisan should see "not found", not a
  // partial or broken profile.
  if (!userRow || userRow.verification_status !== "verified") {
    return NextResponse.json({ message: "Artisan not found." }, { status: 404 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("artisan_profiles")
    .select("bio, years_experience, availability, starting_price, pricing_type, rating_avg, rating_count")
    .eq("user_id", artisanId)
    .maybeSingle();

  if (profileError || !profile) {
    console.error("[discovery/artisan] artisan_profiles query failed:", profileError);
    return NextResponse.json({ message: "Failed to load artisan profile." }, { status: 500 });
  }

  const { data: categoryLink } = await supabaseAdmin
    .from("artisan_categories")
    .select("category_id, categories(name, slug)")
    .eq("artisan_id", artisanId)
    .maybeSingle();

  const category = categoryLink?.categories as { name: string; slug: string } | undefined;

  return NextResponse.json(
    {
      artisan: {
        userId:          userRow.id,
        fullName:        userRow.full_name,
        bio:             profile.bio,
        yearsExperience: profile.years_experience,
        availability:    profile.availability,
        startingPrice:   profile.starting_price,
        pricingType:     profile.pricing_type,
        ratingAvg:       profile.rating_avg,
        ratingCount:     profile.rating_count,
        categoryId:      categoryLink?.category_id ?? null,
        categoryName:    category?.name ?? null,
      },
    },
    { status: 200 }
  );
}