"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import {
  Search, LogOut, User as UserIcon, Phone, Mail,
  Loader2, AlertTriangle, ClipboardList, Briefcase,
  CheckCircle2, Clock, Smartphone,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import LanguageSwitcher from "@/app/_components/LanguageSwitcher";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ClientProfile {
  fullName: string;
  phone:    string;
}

interface BookingRow {
  id:                         string;
  status:                     string;
  payment_status:             string;
  quoted_price:               number | null;
  description:                string;
  scheduled_at:               string | null;
  created_at:                 string;
  artisan_id:                 string;
  artisanName:                string;
  client_marked_complete_at:  string | null;
  artisan_marked_complete_at: string | null;
  auto_release_at:            string | null;
}

type PageStatus = "loading" | "ready" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a raw booking status to a translated label + color.
 * Takes `t` as a parameter (rather than calling useTranslations internally)
 * since this is a plain function, not a component — it's called from
 * within BookingCard, which already has its own `t` in scope.
 */
function statusLabel(
  status: string,
  t: ReturnType<typeof useTranslations<"clientDashboard">>
): { label: string; color: string } {
  switch (status) {
    case "requested":   return { label: t("status.requested"),   color: "text-amber-700 bg-amber-50" };
    case "quoted":      return { label: t("status.quoted"),      color: "text-teal-700 bg-teal-50" };
    case "confirmed":   return { label: t("status.confirmed"),   color: "text-teal-700 bg-teal-50" };
    case "in_progress": return { label: t("status.in_progress"), color: "text-blue-700 bg-blue-50" };
    case "completed":   return { label: t("status.completed"),   color: "text-slate-600 bg-slate-100" };
    case "declined":    return { label: t("status.declined"),    color: "text-red-700 bg-red-50" };
    case "cancelled":   return { label: t("status.cancelled"),   color: "text-slate-500 bg-slate-100" };
    case "disputed":    return { label: t("status.disputed"),    color: "text-red-700 bg-red-50" };
    default:            return { label: status,                  color: "text-slate-600 bg-slate-100" };
  }
}

function BookingCard({
  booking,
  onAcceptQuote,
  isBusy,
  defaultPhone,
  onPayNow,
  isPaying,
  isPendingPayment,
  onMarkComplete,
  isMarking,
}: {
  booking:          BookingRow;
  onAcceptQuote:    (bookingId: string) => void;
  isBusy:           boolean;
  defaultPhone:     string;
  onPayNow:         (bookingId: string, phone: string) => void;
  isPaying:         boolean;
  isPendingPayment: boolean;
  onMarkComplete:   (bookingId: string) => void;
  isMarking:        boolean;
}) {
  const t = useTranslations("clientDashboard");
  const { label, color } = statusLabel(booking.status, t);
  const [phone, setPhone] = useState(defaultPhone);

  const needsPayment =
    booking.status === "confirmed" &&
    (booking.payment_status === "pending" || booking.payment_status === "failed");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{booking.artisanName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            {new Date(booking.created_at).toLocaleString()}
          </p>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}>
          {label}
        </span>
      </div>

      <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{booking.description}</p>

      {booking.quoted_price != null && (
        <p className="mt-2 text-sm font-bold text-slate-900">
          KES {booking.quoted_price.toLocaleString()}
        </p>
      )}

      {booking.status === "quoted" && (
        <button
          disabled={isBusy}
          onClick={() => onAcceptQuote(booking.id)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          <CheckCircle2 size={13} />
          {t("acceptQuote", { price: booking.quoted_price?.toLocaleString() ?? "" })}
        </button>
      )}

      {needsPayment && !isPendingPayment && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {booking.payment_status === "failed" && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
              <Smartphone size={12} />
              {t("lastAttemptFailed")}
            </p>
          )}
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Smartphone size={12} />
            {t("mpesaNumberLabel")}
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("mpesaPlaceholder")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm
                       text-slate-900 placeholder:text-slate-400
                       focus:border-teal-500 focus:outline-none"
          />
          <button
            disabled={isPaying || !phone.trim()}
            onClick={() => onPayNow(booking.id, phone.trim())}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2
                       text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {isPaying ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
            {isPaying ? t("sendingRequest") : t("payNow", { price: booking.quoted_price?.toLocaleString() ?? "" })}
          </button>
        </div>
      )}

      {isPendingPayment && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2.5">
          <Loader2 size={14} className="flex-shrink-0 animate-spin text-teal-600" />
          <p className="text-xs text-teal-700">
            {t("checkPhonePin")}
          </p>
        </div>
      )}

      {["confirmed", "in_progress"].includes(booking.status) &&
        booking.payment_status === "held" &&
        !booking.client_marked_complete_at && (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            {booking.artisan_marked_complete_at ? (
              <>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t("artisanSaysDone", { artisanName: booking.artisanName })}
                  {booking.auto_release_at && (
                    <> {t("autoReleaseNotice", { date: new Date(booking.auto_release_at).toLocaleString() })}</>
                  )}
                </p>
                <button
                  disabled={isMarking}
                  onClick={() => onMarkComplete(booking.id)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2
                             text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  {isMarking ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {isMarking ? t("confirming") : t("confirmComplete")}
                </button>
              </>
            ) : (
              <button
                disabled={isMarking}
                onClick={() => onMarkComplete(booking.id)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-teal-600 py-2
                           text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60"
              >
                {isMarking ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {isMarking ? t("marking") : t("markAsComplete")}
              </button>
            )}
          </div>
        )}
    </div>
  );
}

type RawBooking = {
  id: string; status: string; payment_status: string; quoted_price: number | null;
  description: string; scheduled_at: string | null; created_at: string; artisan_id: string;
  client_marked_complete_at: string | null; artisan_marked_complete_at: string | null;
  auto_release_at: string | null;
  users: { full_name: string } | null;
};

function mapBookings(raw: RawBooking[]): BookingRow[] {
  return raw.map((b) => ({
    id:                         b.id,
    status:                     b.status,
    payment_status:             b.payment_status,
    quoted_price:               b.quoted_price,
    description:                b.description,
    scheduled_at:               b.scheduled_at,
    created_at:                 b.created_at,
    artisan_id:                 b.artisan_id,
    artisanName:                b.users?.full_name ?? "An artisan",
    client_marked_complete_at:  b.client_marked_complete_at,
    artisan_marked_complete_at: b.artisan_marked_complete_at,
    auto_release_at:            b.auto_release_at,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientDashboardPage() {
  const router = useRouter();
  const t = useTranslations("clientDashboard");
  const tc = useTranslations("common");

  const [authUser,     setAuthUser]     = useState<User | null>(null);
  const [profile,      setProfile]      = useState<ClientProfile | null>(null);
  const [bookings,     setBookings]     = useState<BookingRow[]>([]);
  const [pageStatus,   setPageStatus]   = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [actionError,   setActionError]   = useState<string>("");

  const [payingBookingId,    setPayingBookingId]    = useState<string | null>(null);
  const [payError,           setPayError]           = useState<string>("");
  const [pendingPaymentIds,  setPendingPaymentIds]  = useState<Set<string>>(new Set());
  const pollAttemptsRef = useRef(0);

  const [markingBookingId, setMarkingBookingId] = useState<string | null>(null);
  const [markError,        setMarkError]        = useState<string>("");

  async function loadDashboard() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      router.replace("/login");
      return;
    }
    setAuthUser(user);

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("full_name, phone, role")
      .eq("id", user.id)
      .single();

    if (userError) {
      console.error("[client/dashboard] users query failed:", userError);
      setErrorMessage("We couldn't load your account. Please try signing in again.");
      setPageStatus("error");
      return;
    }
    if (userRow.role !== "client") {
      router.replace("/status");
      return;
    }

    setProfile({
      fullName: userRow.full_name ?? user.email ?? "there",
      phone:    userRow.phone ?? "",
    });

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    const res = await fetch("/api/bookings/client-bookings", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[client/dashboard] bookings fetch failed:", json);
      setErrorMessage("We couldn't load your bookings.");
      setPageStatus("error");
      return;
    }

    const mapped: BookingRow[] = mapBookings(json.bookings ?? []);

    setBookings(mapped);
    setPageStatus("ready");
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleAcceptQuote(bookingId: string) {
    setBusyBookingId(bookingId);
    setActionError("");

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch(`/api/bookings/${bookingId}/accept-quote`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Something went wrong.");

      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: "confirmed" } : b))
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyBookingId(null);
    }
  }

  // Re-fetches bookings without flipping pageStatus back to "loading" —
  // used by the payment-status poller so the whole page doesn't flash.
  async function refreshBookingsSilently() {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return;

    const res = await fetch("/api/bookings/client-bookings", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;

    const mapped: BookingRow[] = mapBookings(json.bookings ?? []);

    setBookings(mapped);

    // Drop any booking from the pending set once its payment_status has
    // moved on from 'pending' (the callback route resolved it either way).
    setPendingPaymentIds((prev) => {
      const next = new Set(prev);
      for (const b of mapped) {
        if (next.has(b.id) && b.payment_status !== "pending") {
          next.delete(b.id);
        }
      }
      return next;
    });
  }

  // Poll every 4s while any booking is awaiting an M-Pesa callback, for up
  // to ~2 minutes. STK push callbacks are usually fast (seconds), but this
  // gives real headroom without polling forever if the customer stalls on
  // entering their PIN.
  useEffect(() => {
    if (pendingPaymentIds.size === 0) {
      pollAttemptsRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      pollAttemptsRef.current += 1;
      if (pollAttemptsRef.current > 30) {
        clearInterval(interval);
        return;
      }
      refreshBookingsSilently();
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPaymentIds.size]);

  async function handlePayNow(bookingId: string, phone: string) {
    setPayingBookingId(bookingId);
    setPayError("");

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch("/api/mpesa/stk-push", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bookingId, phone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Something went wrong.");

      setPendingPaymentIds((prev) => new Set(prev).add(bookingId));
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPayingBookingId(null);
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

      // Client-side confirm always finalizes immediately.
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? { ...b, status: "completed", payment_status: "released", client_marked_complete_at: new Date().toISOString() }
            : b
        )
      );
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setMarkingBookingId(null);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (pageStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">{t("loadingAccount")}</p>
        </div>
      </div>
    );
  }

  if (pageStatus === "error") {
    return (
      <div className="flex min-h-screen items-center bg-slate-50 px-4 py-10">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-900/5">
            <AlertTriangle size={36} className="mx-auto mb-4 text-red-400" />
            <h2 className="text-lg font-bold text-slate-900">{t("errorTitle")}</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">{errorMessage}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-6 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold
                         text-white transition-colors hover:bg-teal-700"
            >
              {t("backToSignIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const data      = profile!;
  const firstName = data.fullName.split(" ")[0];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-lg space-y-4">

        <div
          className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5"
          style={{ borderTop: "4px solid #0D9488" }}
        >
          <div className="flex items-center justify-between px-6 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 select-none items-center justify-center rounded-md
                              bg-slate-900 text-base font-black leading-none text-[#F5B700]">
                G
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {t("brandLabel")}
                </p>
                <p className="text-sm font-bold leading-tight text-slate-900">
                  {t("title")}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400
                         transition-colors hover:text-slate-700"
            >
              <LogOut size={13} />
              {tc("signOut")}
            </button>
          </div>

          <div className="border-t border-slate-100 px-6 py-3 sm:px-8">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5">

          <div className="px-6 pt-6 pb-5 sm:px-8">
            <p className="text-sm text-slate-500">
              {t("welcomeBack")}{" "}
              <span className="font-semibold text-slate-700">{firstName}</span>
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-slate-900">
              {t("yourAccount")}
            </h1>

            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center
                                rounded-full bg-slate-100">
                  <UserIcon size={14} className="text-slate-500" />
                </div>
                <p className="text-sm font-semibold text-slate-900">{data.fullName}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center
                                rounded-full bg-slate-100">
                  <Mail size={14} className="text-slate-500" />
                </div>
                <p className="text-sm text-slate-600">{authUser?.email}</p>
              </div>

              {data.phone && (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center
                                  rounded-full bg-slate-100">
                    <Phone size={14} className="text-slate-500" />
                  </div>
                  <p className="text-sm text-slate-600">{data.phone}</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
            <a
              href="/discovery"
              className="flex items-center justify-center gap-2 rounded-lg bg-teal-600
                         py-3 text-sm font-semibold text-white shadow-sm transition-colors
                         hover:bg-teal-700"
            >
              <Search size={16} />
              {t("findAnArtisan")}
            </a>
          </div>

          <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {t("yourBookings")}
            </p>

            {actionError && (
              <div className="mb-3 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{actionError}</p>
              </div>
            )}

            {payError && (
              <div className="mb-3 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{payError}</p>
              </div>
            )}

            {markError && (
              <div className="mb-3 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{markError}</p>
              </div>
            )}

            {bookings.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed
                              border-slate-200 py-8 text-center">
                <ClipboardList size={22} className="text-slate-300" />
                <p className="text-sm text-slate-400">{t("noBookingsYet")}</p>
                <p className="text-xs text-slate-400">
                  {t("noBookingsHint")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onAcceptQuote={handleAcceptQuote}
                    isBusy={busyBookingId === b.id}
                    defaultPhone={data.phone}
                    onPayNow={handlePayNow}
                    isPaying={payingBookingId === b.id}
                    isPendingPayment={pendingPaymentIds.has(b.id)}
                    onMarkComplete={handleMarkComplete}
                    isMarking={markingBookingId === b.id}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}