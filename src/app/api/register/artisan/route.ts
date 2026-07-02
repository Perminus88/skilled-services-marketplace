import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Supabase admin client
//
// We use the SERVICE ROLE key here (not the anon key) so this route can write
// to `categories`, `artisan_profiles`, and `artisan_categories` without being
// blocked by row-level security policies that govern authenticated clients.
// This file runs only on the server — the service role key is never exposed
// to the browser.
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
    auth: {
      // Prevent the server-side client from trying to persist a session
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PricingMode = "flat" | "custom_quote" | "both";

interface ArtisanRegistrationBody {
  // Identity
  userId:    string;   // UUID — must already exist in auth.users
  fullName:  string;
  phone:     string;

  // Trade
  tradeSkill:          string;   // known category name OR "other"
  customCategoryName?: string;   // present only when tradeSkill === "other"

  // Business
  yearsExperience: number;
  pricingMode:     PricingMode;
  startingPrice:   number;
  bio?:            string;

  // Location
  latitude:  number;
  longitude: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a human-readable category name into a URL-safe slug.
 * e.g. "House Cleaner" → "house-cleaner"
 *      "AC Repair & Service" → "ac-repair-service"
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")   // strip special chars
    .replace(/\s+/g, "-")            // spaces → hyphens
    .replace(/-+/g, "-");            // collapse multiple hyphens
}

/**
 * Validates the required fields in the request body.
 * Returns an array of human-readable error strings (empty = valid).
 */
function validateBody(body: Partial<ArtisanRegistrationBody>): string[] {
  const errs: string[] = [];

  if (!body.userId || typeof body.userId !== "string")
    errs.push("userId is required and must be a string.");

  if (!body.fullName || typeof body.fullName !== "string" || body.fullName.trim().length < 2)
    errs.push("fullName is required and must be at least 2 characters.");

  if (!body.phone || typeof body.phone !== "string")
    errs.push("phone is required.");

  if (!body.tradeSkill || typeof body.tradeSkill !== "string")
    errs.push("tradeSkill is required.");

  if (body.tradeSkill === "other") {
    if (!body.customCategoryName || typeof body.customCategoryName !== "string" || body.customCategoryName.trim().length < 2)
      errs.push("customCategoryName is required when tradeSkill is 'other' and must be at least 2 characters.");
  }

  if (body.yearsExperience === undefined || typeof body.yearsExperience !== "number" || body.yearsExperience < 0 || body.yearsExperience > 60)
    errs.push("yearsExperience must be a number between 0 and 60.");

  if (!body.pricingMode || !["flat", "custom_quote", "both"].includes(body.pricingMode as string))
    errs.push("pricingMode must be one of: flat, custom_quote, both.");

  if (!body.startingPrice || typeof body.startingPrice !== "number" || body.startingPrice <= 0)
    errs.push("startingPrice must be a positive number.");

  if (typeof body.latitude !== "number" || typeof body.longitude !== "number")
    errs.push("latitude and longitude must be numbers.");

  return errs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Parse request body ───────────────────────────────────────────────────
  let body: Partial<ArtisanRegistrationBody>;

  try {
    body = (await req.json()) as Partial<ArtisanRegistrationBody>;
  } catch (parseError) {
    console.error("SUPABASE ERROR LOG: Failed to parse request body:", parseError);
    return NextResponse.json(
      { message: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  // ── 2. Validate ─────────────────────────────────────────────────────────────
  const validationErrors = validateBody(body);
  if (validationErrors.length > 0) {
    console.error("SUPABASE ERROR LOG: Request validation failed:", validationErrors);
    return NextResponse.json(
      { message: "Validation failed.", errors: validationErrors },
      { status: 422 }
    );
  }

  // Cast to the full type — safe because validateBody() already confirmed all
  // required fields are present and well-typed.
  const data = body as ArtisanRegistrationBody;

  // ── 3. Initialise Supabase admin client ─────────────────────────────────────
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

  // ── 4. Resolve category ID ──────────────────────────────────────────────────
  //
  // Two paths:
  //   A) tradeSkill is a known value  → look up the existing category by name.
  //   B) tradeSkill === "other"        → insert a new row into `categories`,
  //      then use the newly created ID.
  //
  let categoryId: number;

  if (data.tradeSkill !== "other") {
    // ── Path A: look up existing category ────────────────────────────────────
    console.log(`[register/artisan] Looking up category: "${data.tradeSkill}"`);

    const { data: categoryRow, error: categoryLookupError } = await supabase
      .from("categories")
      .select("id")
      .eq("name", data.tradeSkill)
      .single();

    if (categoryLookupError) {
      console.error(
        "SUPABASE ERROR LOG: Category lookup failed for tradeSkill =",
        data.tradeSkill,
        "| Error:",
        categoryLookupError
      );
      return NextResponse.json(
        { message: `Category "${data.tradeSkill}" not found. Please try again or select Other.` },
        { status: 404 }
      );
    }

    categoryId = categoryRow.id as number;
    console.log(`[register/artisan] Resolved category ID: ${categoryId}`);

  } else {
    // ── Path B: insert a new custom category ──────────────────────────────────
    const rawName  = data.customCategoryName!.trim();
    const slug     = toSlug(rawName);

    console.log(`[register/artisan] Inserting custom category: name="${rawName}", slug="${slug}"`);

    // Check first: another artisan might have already submitted the same custom
    // category. Re-use it rather than creating a duplicate.
    const { data: existingCategory, error: existingLookupError } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();         // maybeSingle() returns null (not an error) if no row exists

    if (existingLookupError) {
      console.error(
        "SUPABASE ERROR LOG: Duplicate-check query failed for custom category slug =",
        slug,
        "| Error:",
        existingLookupError
      );
      return NextResponse.json(
        { message: "Failed to verify custom category. Please try again." },
        { status: 500 }
      );
    }

    if (existingCategory) {
      // Re-use the existing category rather than inserting a duplicate
      categoryId = existingCategory.id as number;
      console.log(`[register/artisan] Re-using existing category for slug "${slug}", ID: ${categoryId}`);

    } else {
      // Insert the new category row
      const { data: newCategory, error: categoryInsertError } = await supabase
        .from("categories")
        .insert({ name: rawName, slug })
        .select("id")
        .single();

      if (categoryInsertError) {
        console.error(
          "SUPABASE ERROR LOG: Failed to insert custom category:",
          { name: rawName, slug },
          "| Error:",
          categoryInsertError
        );
        return NextResponse.json(
          { message: "Failed to save your custom trade category. Please try again." },
          { status: 500 }
        );
      }

      categoryId = newCategory.id as number;
      console.log(`[register/artisan] New category inserted with ID: ${categoryId}`);
    }
  }

  // ── 5. Upsert artisan_profiles ──────────────────────────────────────────────
  //
  // We upsert (not insert) so that a partially completed registration can be
  // resumed without creating a duplicate profile row.
  //
  console.log(`[register/artisan] Upserting artisan_profiles for userId: ${data.userId}`);

  const { error: profileError } = await supabase
    .from("artisan_profiles")
    .upsert(
      {
        user_id:           data.userId,
        bio:               data.bio?.trim() ?? "",
        years_experience:  data.yearsExperience,
        availability:      "offline",            // default until they toggle it on
        starting_price:    data.startingPrice,
        pricing_type:      data.pricingMode,
        base_location_lat: data.latitude,
        base_location_lng: data.longitude,
        rating_avg:        0,
        rating_count:      0,
      },
      { onConflict: "user_id" }   // safe re-submission: update rather than error
    );

  if (profileError) {
    console.error(
      "SUPABASE ERROR LOG: artisan_profiles upsert failed for userId =",
      data.userId,
      "| Error:",
      profileError
    );
    return NextResponse.json(
      { message: "Failed to save artisan profile. Please try again." },
      { status: 500 }
    );
  }

  console.log(`[register/artisan] artisan_profiles upserted successfully.`);

  // ── 6. Update users table with name + phone ─────────────────────────────────
  //
  // The `users` table holds shared identity fields. We update rather than
  // insert because the row was created by Supabase Auth when the user signed up.
  //
  console.log(`[register/artisan] Updating users table for userId: ${data.userId}`);

  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      full_name:           data.fullName.trim(),
      phone:               data.phone,
      verification_status: "pending",
    })
    .eq("id", data.userId);

  if (userUpdateError) {
    console.error(
      "SUPABASE ERROR LOG: users table update failed for userId =",
      data.userId,
      "| Error:",
      userUpdateError
    );
    // Non-fatal for the overall flow — profile was already saved.
    // Log it, but continue so the artisan isn't left in a broken state.
    console.warn("[register/artisan] Continuing despite users update failure.");
  } else {
    console.log(`[register/artisan] users table updated successfully.`);
  }

  // ── 7. Link artisan to category in artisan_categories ──────────────────────
  //
  // upsert with ignoreDuplicates prevents a unique-constraint error if the
  // artisan somehow submits the form twice.
  //
  console.log(
    `[register/artisan] Linking userId ${data.userId} → categoryId ${categoryId} in artisan_categories`
  );

  const { error: linkError } = await supabase
    .from("artisan_categories")
    .upsert(
      {
        artisan_id:  data.userId,
        category_id: categoryId,
      },
      { onConflict: "artisan_id, category_id", ignoreDuplicates: true }
    );

  if (linkError) {
    console.error(
      "SUPABASE ERROR LOG: artisan_categories link failed for",
      { artisan_id: data.userId, category_id: categoryId },
      "| Error:",
      linkError
    );
    return NextResponse.json(
      { message: "Failed to link your trade category. Please try again." },
      { status: 500 }
    );
  }

  console.log(`[register/artisan] artisan_categories linked successfully.`);

  // ── 8. Return success ───────────────────────────────────────────────────────
  console.log(`[register/artisan] Registration complete for userId: ${data.userId}`);

  return NextResponse.json(
    {
      message:    "Artisan profile created successfully.",
      userId:     data.userId,
      categoryId,
      // Echo back the resolved category name so the client can display it
      categoryName:
        data.tradeSkill === "other"
          ? data.customCategoryName!.trim()
          : data.tradeSkill,
    },
    { status: 201 }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reject non-POST methods explicitly
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ message: "Method not allowed." }, { status: 405 });
}