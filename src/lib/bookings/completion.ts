// src/lib/bookings/completion.ts
//
// Shared logic for finalizing a booking's completion + payment release.
// Used both by the explicit "mark complete" route and by the opportunistic
// auto-release sweep (for the 48-hour artisan-initiated window).

import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseAdmin = SupabaseClient<any, any, any>;

// Finalizes a single booking: marks it completed and releases payment.
//
// Scoped to status IN ('confirmed','in_progress') AND payment_status='held'
// at write time — defense-in-depth against a race between a dispute being
// filed and an in-flight finalize call. If the booking has already moved
// to 'disputed' (or anything else) by the time this runs, the update
// simply matches zero rows and this throws instead of silently pretending
// success.
//
// NOTE: this does NOT trigger an actual B2C payout to the artisan — that's
// a deliberately separate, later phase (manual for now). This just flips
// the booking's own state to reflect that funds are ready to be paid out.
export async function finalizeBooking(supabase: SupabaseAdmin, bookingId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status:          "completed",
      payment_status:  "released",
      completed_at:    new Date().toISOString(),
      auto_release_at: null,
    })
    .eq("id", bookingId)
    .in("status", ["confirmed", "in_progress"])
    .eq("payment_status", "held")
    .select("id");

  if (error) {
    console.error("BOOKING ERROR LOG: failed to finalize booking", bookingId, ":", error);
    throw error;
  }

  if (!data || data.length === 0) {
    // Booking existed but didn't match the guard — most likely it was
    // disputed (or already completed) between the caller's own status
    // check and this write. Treat as a real failure so the caller's
    // catch block surfaces a message rather than claiming success.
    const notEligibleError = new Error(
      `Booking ${bookingId} was no longer eligible for finalize (status/payment_status changed).`
    );
    console.error("BOOKING ERROR LOG:", notEligibleError.message);
    throw notEligibleError;
  }
}

// Opportunistic sweep: finalizes any booking whose 48-hour auto-release
// window has passed. Called at the top of the client/artisan booking-list
// routes so this self-heals on read without needing a real cron job wired
// up yet. (In production this should ALSO be triggered by a scheduled job
// so it doesn't depend on someone loading a dashboard — see the
// process-auto-releases route for the entry point to hook up to a cron.)
export async function releaseOverdueBookings(supabase: SupabaseAdmin) {
  const { data: rawData, error } = await supabase
    .from("bookings")
    .update({
      status:          "completed",
      payment_status:  "released",
      completed_at:    new Date().toISOString(),
      auto_release_at: null,
    })
    .lte("auto_release_at", new Date().toISOString())
    .eq("payment_status", "held")
    .in("status", ["confirmed", "in_progress"])
    .select("id");

  const data = rawData as { id: string }[] | null;

  if (error) {
    // Non-fatal — this is a best-effort background sweep. Log loudly but
    // don't block whatever the caller was actually trying to do.
    console.error("BOOKING ERROR LOG: auto-release sweep failed:", error);
    return;
  }

  if (data && data.length > 0) {
    console.log(
      `BOOKING LOG: auto-released ${data.length} booking(s) past their 48h window:`,
      data.map((b) => b.id)
    );
  }
}