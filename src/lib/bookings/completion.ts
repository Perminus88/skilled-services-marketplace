// src/lib/bookings/completion.ts
//
// Shared logic for finalizing a booking's completion + payment release.
// Used both by the explicit "mark complete" route and by the opportunistic
// auto-release sweep (for the 48-hour artisan-initiated window).

import { createClient } from "@supabase/supabase-js";

type SupabaseAdmin = ReturnType<typeof createClient>;

// Finalizes a single booking: marks it completed and releases payment.
// NOTE: this does NOT trigger an actual B2C payout to the artisan — that's
// a deliberately separate, later phase (manual for now). This just flips
// the booking's own state to reflect that funds are ready to be paid out.
export async function finalizeBooking(supabase: SupabaseAdmin, bookingId: string) {
  const { error } = await supabase
    .from("bookings")
    .update({
      status:          "completed",
      payment_status:  "released",
      completed_at:    new Date().toISOString(),
      auto_release_at: null,
    })
    .eq("id", bookingId);

  if (error) {
    console.error("BOOKING ERROR LOG: failed to finalize booking", bookingId, ":", error);
    throw error;
  }
}

// Opportunistic sweep: finalizes any booking whose 48-hour auto-release
// window has passed. Called at the top of the client/artisan booking-list
// routes so this self-heals on read without needing a real cron job wired
// up yet. (In production this should ALSO be triggered by a scheduled job
// so it doesn't depend on someone loading a dashboard — see the
// process-auto-releases route for the entry point to hook up to a cron.)
export async function releaseOverdueBookings(supabase: SupabaseAdmin) {
  const { data, error } = await supabase
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