import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS. categories currently only allows
// SELECT for authenticated users, and since we don't yet know whether a
// "client" auth flow exists in this app, this route keeps the discovery
// page's category filter working regardless.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug")
    .order("name", { ascending: true });

  if (error) {
    console.error("[discovery/categories] query failed:", error);
    return NextResponse.json(
      { message: "Failed to load categories. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ categories: data ?? [] }, { status: 200 });
}