// src/app/api/admin/payouts/route.ts
//
// GET — lists completed, payment-released bookings along with their
// payout status. Covers the whole lifecycle: not yet paid out, pending
// confirmation, completed, or failed (retryable).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { COMMISSION_RATE } from "@/lib/pricing";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();

  const authResult = await requireAdmin(req, supabase);
  if (authResult instanceof NextResponse) return authResult;

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(
      "id, description, quoted_price, commission_rate, service_fee, payout_status, mpesa_payout_transaction_id, artisan_id, client_id, completed_at"
    )
    .eq("status", "completed")
    .eq("payment_status", "released")
    .order("completed_at", { ascending: false });

  if (bookingsError) {
    console.error("PAYOUT ERROR LOG: bookings query failed:", bookingsError);
    return NextResponse.json({ message: "Failed to load payouts." }, { status: 500 });
  }
  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ payouts: [] }, { status: 200 });
  }

  const artisanIds = [...new Set(bookings.map((b) => b.artisan_id))];
  const clientIds  = [...new Set(bookings.map((b) => b.client_id))];
  const allUserIds = [...new Set([...artisanIds, ...clientIds])];

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, full_name, phone")
    .in("id", allUserIds);

  if (usersError) {
    console.error("PAYOUT ERROR LOG: users query failed:", usersError);
    // Non-fatal — payouts can still render with fallback names.
  }
  const userById = Object.fromEntries((users ?? []).map((u) => [u.id, u]));

  const payouts = bookings.map((b) => {
    const artisan = userById[b.artisan_id];
    const client  = userById[b.client_id];

    // Only trust the stored commission/fee as a historical record once the
    // payout has actually completed. Before that (not_started, pending, or
    // even a stale value left over from a prior failed attempt), always
    // show a live preview computed at the CURRENT rate — otherwise a
    // booking that was touched before the rate was finalized would keep
    // showing stale numbers indefinitely.
    const isFinalized = b.payout_status === "completed";
    const commissionRate = isFinalized && b.commission_rate != null
      ? b.commission_rate
      : COMMISSION_RATE;
    const serviceFee = isFinalized && b.service_fee != null
      ? b.service_fee
      : Math.round((b.quoted_price ?? 0) * commissionRate);
    const payoutAmount = (b.quoted_price ?? 0) - serviceFee;

    return {
      id:                  b.id,
      description:         b.description,
      quotedPrice:         b.quoted_price,
      commissionRate,
      serviceFee,
      payoutAmount,
      payoutStatus:        b.payout_status ?? "not_started",
      payoutTransactionId: b.mpesa_payout_transaction_id,
      completedAt:         b.completed_at,
      artisanName:         artisan?.full_name ?? "Unknown artisan",
      artisanPhone:        artisan?.phone ?? null,
      clientName:          client?.full_name ?? "Unknown client",
    };
  });

  return NextResponse.json({ payouts }, { status: 200 });
}