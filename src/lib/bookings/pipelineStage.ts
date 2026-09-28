// ─────────────────────────────────────────────────────────────────────────────
// Maps a booking's raw status/payment_status/mark-complete fields onto the
// 5-stage client-facing pipeline: Requested -> Accepted -> In Progress ->
// Review & Release -> Completed.
//
// IMPORTANT: "In Progress" activates the status enum's 'in_progress' value,
// which previously existed but was never actually set anywhere in the app.
// The M-Pesa callback (src/app/api/mpesa/callback/route.ts) now sets it
// alongside payment_status: 'held' on successful payment.
//
// There is deliberately NO separate "On the Way" stage — artisan location
// (artisan_profiles.base_location) is a static registered address, not
// live GPS, so there is no real signal to automate that step. Building a
// fake "On the Way" indicator would be decorative, not informative.
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineStageKey = "requested" | "accepted" | "in_progress" | "review" | "completed";

export interface PipelineStageInfo {
  key:       PipelineStageKey;
  stepIndex: number; // 0-4, for a 5-step progress bar
}

const TERMINAL_STATUSES = new Set(["declined", "cancelled", "disputed"]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Returns null for terminal/exception statuses (declined, cancelled,
 * disputed) — callers should fall back to the existing status badge for
 * those rather than showing a progress tracker.
 */
export function getPipelineStage(booking: {
  status:                     string;
  payment_status:             string;
  client_marked_complete_at:  string | null;
  artisan_marked_complete_at: string | null;
}): PipelineStageInfo | null {
  if (isTerminalStatus(booking.status)) return null;

  // 'quoted' bookings are still awaiting the client's own acceptance of
  // the price, so they're grouped with 'requested' rather than a
  // separate stage — the existing "Accept quote" button already handles
  // that transition in the UI.
  if (booking.status === "requested" || booking.status === "quoted") {
    return { key: "requested", stepIndex: 0 };
  }

  // payment_status is 'pending' or 'failed' here — payment hasn't
  // succeeded yet, so the job hasn't actually started.
  if (booking.status === "confirmed") {
    return { key: "accepted", stepIndex: 1 };
  }

  if (booking.status === "in_progress") {
    const eitherMarkedComplete =
      booking.client_marked_complete_at != null || booking.artisan_marked_complete_at != null;

    return eitherMarkedComplete
      ? { key: "review", stepIndex: 3 }
      : { key: "in_progress", stepIndex: 2 };
  }

  if (booking.status === "completed") {
    return { key: "completed", stepIndex: 4 };
  }

  return null;
}

export const PIPELINE_STEP_COUNT = 5;

/**
 * Normalizes a Kenyan phone number stored in any of the accepted signup
 * formats (07XX..., 01XX..., 2547XX..., +2547XX...) into a consistent
 * international format for tel:/wa.me links.
 */
export function toInternationalPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254")) return `+${digits}`;
  if (digits.startsWith("0")) return `+254${digits.slice(1)}`;
  return `+254${digits}`;
}