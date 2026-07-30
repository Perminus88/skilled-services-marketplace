"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import {
  LogOut, Briefcase, Loader2, AlertTriangle, MapPin,
  Clock, CheckCircle2, XCircle, DollarSign,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LatLng {
  lat: number;
  lng: number;
}

interface BookingRow {
  id:            string;
  status:        string;
  quoted_price:  number | null;
  description:   string;
  scheduled_at:  string | null;
  created_at:    string;
  client_id:     string;
  clientName:    string;
}

interface ActiveJobRow {
  id:                         string;
  status:                     string;
  payment_status:             string;
  quoted_price:               number | null;
  description:                string;
  scheduled_at:               string | null;
  created_at:                 string;
  client_id:                  string;
  clientName:                 string;
  client_marked_complete_at:  string | null;
  artisan_marked_complete_at: string | null;
  auto_release_at:            string | null;
  clientLocation:             LatLng | null;
  artisanLocation:            LatLng | null;
}

type PageStatus = "loading" | "ready" | "error";
type ActionState = { bookingId: string; action: "accept" | "decline" | "quote" } | null;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function RequestCard({
  booking,
  pricingType,
  onRespond,
  isBusy,
}: {
  booking:      BookingRow;
  pricingType:  string | null;
  onRespond:    (bookingId: string, action: "accept" | "decline" | "quote", price?: number) => void;
  isBusy:       boolean;
}) {
  const [quotePrice, setQuotePrice] = useState("");
  const [showQuoteInput, setShowQuoteInput] = useState(false);

  const needsQuote = pricingType !== "flat";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{booking.clientName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            {new Date(booking.created_at).toLocaleString()}
          </p>
        </div>
        {!needsQuote && booking.quoted_price != null && (
          <span className="flex-shrink-0 text-sm font-bold text-slate-900">
            KES {booking.quoted_price.toLocaleString()}
          </span>
        )}
      </div>

      <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{booking.description}</p>

      {booking.scheduled_at && (
        <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
          <MapPin size={11} />
          Requested for {new Date(booking.scheduled_at).toLocaleString()}
        </p>
      )}

      {showQuoteInput ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <DollarSign size={14} />
            </div>
            <input
              type="number"
              min={1}
              placeholder="Your price (KES)"
              value={quotePrice}
              onChange={(e) => setQuotePrice(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <button
            disabled={isBusy || !quotePrice || parseFloat(quotePrice) <= 0}
            onClick={() => onRespond(booking.id, "quote", parseFloat(quotePrice))}
            className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            disabled={isBusy}
            onClick={() => needsQuote ? setShowQuoteInput(true) : onRespond(booking.id, "accept")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            <CheckCircle2 size={13} />
            {needsQuote ? "Send quote" : "Accept"}
          </button>
          <button
            disabled={isBusy}
            onClick={() => onRespond(booking.id, "decline")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <XCircle size={13} />
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function ActiveJobCard({
  job,
  onMarkComplete,
  isMarking,
}: {
  job:            ActiveJobRow;
  onMarkComplete: (bookingId: string) => void;
  isMarking:      boolean;
}) {
  const showRoute =
    (job.status === "confirmed" || job.status === "in_progress") &&
    job.clientLocation != null &&
    job.artisanLocation != null;
    

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{job.clientName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            {new Date(job.created_at).toLocaleString()}
          </p>
        </div>
        {job.quoted_price != null && (
          <span className="flex-shrink-0 text-sm font-bold text-slate-900">
            KES {job.quoted_price.toLocaleString()}
          </span>
        )}
      </div>

      <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{job.description}</p>

      {showRoute && (
        <div className="mt-3">
          <RouteMap
            from={job.artisanLocation!}
            to={job.clientLocation!}
            clientName={job.clientName}
          />
        </div>
      )}

      {job.payment_status !== "held" ? (
        <p className="mt-3 text-xs text-slate-400 border-t border-slate-100 pt-3">
          Waiting on the client to complete payment before this job can be marked done.
        </p>
      ) : job.artisan_marked_complete_at ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1.5 text-xs text-teal-700">
            <CheckCircle2 size={12} />
            You marked this complete.
            {job.auto_release_at && (
              <> Payment auto-releases {new Date(job.auto_release_at).toLocaleString()} if the client doesn&apos;t respond first.</>
            )}
          </p>
        </div>
      ) : (
        <button
          disabled={isMarking}
          onClick={() => onMarkComplete(job.id)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {isMarking ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {isMarking ? "Marking…" : "Mark job complete"}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ArtisanDashboardPage() {
  const router = useRouter();

  const [authUser,    setAuthUser]    = useState<User | null>(null);
  const [pricingType, setPricingType] = useState<string | null>(null);
  const [bookings,    setBookings]    = useState<BookingRow[]>([]);
  const [activeJobs,  setActiveJobs]  = useState<ActiveJobRow[]>([]);
  const [pageStatus,  setPageStatus]  = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [actionState, setActionState] = useState<ActionState>(null);
  const [actionError, setActionError] = useState("");

  const [markingBookingId, setMarkingBookingId] = useState<string | null>(null);
  const [markError,        setMarkError]        = useState("");

  const [availability,         setAvailability]         = useState<string | null>(null);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);

  async function loadDashboard() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      router.replace("/login");
      return;
    }
    setAuthUser(user);

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("role, verification_status")
      .eq("id", user.id)
      .single();

    if (userError || !userRow || userRow.role !== "artisan" || userRow.verification_status !== "verified") {
      router.replace("/status");
      return;
    }

    const { data: profile } = await supabase
      .from("artisan_profiles")
      .select("pricing_type, availability")
      .eq("user_id", user.id)
      .maybeSingle();
    setPricingType(profile?.pricing_type ?? null);
    setAvailability(profile?.availability ?? null);

    // Fetched via an API route (service role), not the browser client —
    // RLS on `users` only allows SELECT of your own row, which silently
    // blocks the embedded client name lookup if done directly here.
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      router.replace("/login");
      return;
    }

    const bookingsRes = await fetch("/api/bookings/artisan-incoming", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const bookingsJson = await bookingsRes.json().catch(() => ({}));

    if (!bookingsRes.ok) {
      console.error("[artisan/dashboard] bookings fetch failed:", bookingsJson);
      setErrorMessage("We couldn't load your booking requests.");
      setPageStatus("error");
      return;
    }

    const bookingRows = (bookingsJson.bookings ?? []) as Array<{
      id: string;
      status: string;
      quoted_price: number | null;
      description: string;
      scheduled_at: string | null;
      created_at: string;
      client_id: string;
      users: { full_name: string } | null;
    }>;

    const mapped: BookingRow[] = bookingRows.map((b) => ({
      id:           b.id,
      status:       b.status,
      quoted_price: b.quoted_price,
      description:  b.description,
      scheduled_at: b.scheduled_at,
      created_at:   b.created_at,
      client_id:    b.client_id,
      clientName:   b.users?.full_name ?? "A client",
    }));

    setBookings(mapped);
    setPageStatus("ready");

    // Active jobs (confirmed/in_progress) — separate list, separate route.
    const activeRes = await fetch("/api/bookings/artisan-active", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const activeJson = await activeRes.json().catch(() => ({}));

    if (activeRes.ok) {
      const activeRows = (activeJson.bookings ?? []) as Array<{
        id: string; status: string; payment_status: string; quoted_price: number | null;
        description: string; scheduled_at: string | null; created_at: string; client_id: string;
        client_marked_complete_at: string | null; artisan_marked_complete_at: string | null;
        auto_release_at: string | null;
        users: { full_name: string } | null;
        clientLocation: LatLng | null;
        artisanLocation: LatLng | null;
      }>;

      setActiveJobs(
        activeRows.map((j) => ({
          id:                         j.id,
          status:                     j.status,
          payment_status:             j.payment_status,
          quoted_price:               j.quoted_price,
          description:                j.description,
          scheduled_at:               j.scheduled_at,
          created_at:                 j.created_at,
          client_id:                  j.client_id,
          clientName:                 j.users?.full_name ?? "A client",
          client_marked_complete_at:  j.client_marked_complete_at,
          artisan_marked_complete_at: j.artisan_marked_complete_at,
          auto_release_at:            j.auto_release_at,
          clientLocation:             j.clientLocation,
          artisanLocation:            j.artisanLocation,
        }))
      );
    } else {
      console.error("[artisan/dashboard] active jobs fetch failed:", activeJson);
      // Non-fatal — incoming requests still work even if this list fails.
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleRespond(bookingId: string, action: "accept" | "decline" | "quote", price?: number) {
    setActionState({ bookingId, action });
    setActionError("");

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch(`/api/bookings/${bookingId}/respond`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action, price }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Something went wrong.");

      // Remove the booking from the list — it's no longer 'requested'
      // regardless of which action was taken.
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActionState(null);
    }
  }

  async function handleMarkComplete(bookingId: string) {
    setMarkingBookingId(bookingId);
    setMarkError("");

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch(`/api/bookings/${bookingId}/mark-complete`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Something went wrong.");

      setActiveJobs((prev) =>
        prev.map((j) =>
          j.id === bookingId
            ? {
                ...j,
                artisan_marked_complete_at: new Date().toISOString(),
                auto_release_at: json.autoReleaseAt ?? j.auto_release_at,
              }
            : j
        )
      );
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setMarkingBookingId(null);
    }
  }

  async function handleSetAvailability(status: "available" | "busy" | "offline") {
    setUpdatingAvailability(true);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch("/api/artisan/availability", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ availability: status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Something went wrong.");

      setAvailability(status);
    } catch (err) {
      console.error("[artisan/dashboard] availability update failed:", err);
    } finally {
      setUpdatingAvailability(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (pageStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (pageStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
          <p className="text-slate-600">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-2xl space-y-4">

        <div
          className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5"
          style={{ borderTop: "4px solid #0D9488" }}
        >
          <div className="flex items-center justify-between px-6 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 select-none items-center justify-center rounded-md bg-slate-900 text-base font-black leading-none text-[#F5B700]">
                G
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Skilled services marketplace</p>
                <p className="text-sm font-bold leading-tight text-slate-900">Artisan Dashboard</p>
              </div>
            </div>
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700">
              <LogOut size={13} /> Sign out
            </button>
          </div>

          {availability && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 sm:px-8">
              <span className="text-xs font-semibold text-slate-500">Your status</span>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {([
                  { key: "available", label: "Available", dot: "bg-teal-500" },
                  { key: "busy",      label: "Busy",       dot: "bg-amber-500" },
                  { key: "offline",   label: "Offline",    dot: "bg-slate-400" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    disabled={updatingAvailability}
                    onClick={() => handleSetAvailability(opt.key)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                      availability === opt.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${opt.dot}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5">
          <div className="px-6 pt-6 pb-4 sm:px-8">
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Briefcase size={18} className="text-teal-600" />
              Incoming Requests
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {bookings.length === 0
                ? "You're all caught up — no pending requests right now."
                : `${bookings.length} request${bookings.length === 1 ? "" : "s"} awaiting your response.`}
            </p>
          </div>

          {actionError && (
            <div className="mx-6 mb-4 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:mx-8">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{actionError}</p>
            </div>
          )}

          <div className="space-y-3 px-6 pb-6 sm:px-8">
            {bookings.map((b) => (
              <RequestCard
                key={b.id}
                booking={b}
                pricingType={pricingType}
                onRespond={handleRespond}
                isBusy={actionState?.bookingId === b.id}
              />
            ))}
          </div>
        </div>

        {activeJobs.length > 0 && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5">
            <div className="px-6 pt-6 pb-4 sm:px-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <CheckCircle2 size={18} className="text-teal-600" />
                Active Jobs
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {activeJobs.length} job{activeJobs.length === 1 ? "" : "s"} in progress.
              </p>
            </div>

            {markError && (
              <div className="mx-6 mb-4 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:mx-8">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{markError}</p>
              </div>
            )}

            <div className="space-y-3 px-6 pb-6 sm:px-8">
              {activeJobs.map((j) => (
                <ActiveJobCard
                  key={j.id}
                  job={j}
                  onMarkComplete={handleMarkComplete}
                  isMarking={markingBookingId === j.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}