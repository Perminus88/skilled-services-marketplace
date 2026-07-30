"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut, ShieldCheck, Loader2, AlertTriangle, Star,
  Briefcase, Phone, CheckCircle2, XCircle, Clock, Banknote,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ArtisanRow {
  id:              string;
  fullName:        string;
  phone:           string;
  categoryName:    string;
  bio:             string;
  yearsExperience: number | null;
  availability:    string | null;
  startingPrice:   number | null;
  pricingType:     string | null;
  ratingAvg:       number;
  ratingCount:     number;
}

interface PayoutRow {
  id:                  string;
  description:         string;
  quotedPrice:         number | null;
  commissionRate:      number;
  serviceFee:          number;
  payoutAmount:        number;
  payoutStatus:        string;
  payoutTransactionId: string | null;
  completedAt:         string | null;
  artisanName:         string;
  artisanPhone:        string | null;
  clientName:          string;
}

type Tab = "pending" | "verified" | "rejected";
type PageStatus = "loading" | "ready" | "error";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending",  label: "Pending" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

const PRICING_TYPE_LABELS: Record<string, string> = {
  flat:         "Flat rate",
  custom_quote: "Custom quotes",
  both:         "Flat rate + custom quotes",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ArtisanCard({
  artisan,
  tab,
  onDecide,
  isBusy,
}: {
  artisan:  ArtisanRow;
  tab:      Tab;
  onDecide: (artisanId: string, action: "approve" | "reject") => void;
  isBusy:   boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{artisan.fullName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
            <Briefcase size={11} />
            {artisan.categoryName}
          </p>
        </div>
        {artisan.ratingCount > 0 && (
          <span className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-amber-600">
            <Star size={12} className="fill-amber-500 text-amber-500" />
            {artisan.ratingAvg.toFixed(1)} ({artisan.ratingCount})
          </span>
        )}
      </div>

      {artisan.bio && (
        <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{artisan.bio}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Phone size={11} />
          {artisan.phone || "No phone on file"}
        </span>
        {artisan.yearsExperience != null && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {artisan.yearsExperience} yr{artisan.yearsExperience === 1 ? "" : "s"} experience
          </span>
        )}
        {artisan.pricingType && (
          <span>{PRICING_TYPE_LABELS[artisan.pricingType] ?? artisan.pricingType}</span>
        )}
        {artisan.startingPrice != null && (
          <span className="font-semibold text-slate-700">
            From KES {artisan.startingPrice.toLocaleString()}
          </span>
        )}
      </div>

      {tab === "pending" && (
        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          <button
            disabled={isBusy}
            onClick={() => onDecide(artisan.id, "approve")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            <CheckCircle2 size={13} />
            Approve
          </button>
          <button
            disabled={isBusy}
            onClick={() => onDecide(artisan.id, "reject")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <XCircle size={13} />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function PayoutCard({
  payout,
  onTrigger,
  isTriggering,
  isPending,
}: {
  payout:       PayoutRow;
  onTrigger:    (bookingId: string) => void;
  isTriggering: boolean;
  isPending:    boolean;
}) {
  const canTrigger = payout.payoutStatus === "not_started" || payout.payoutStatus === "failed";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{payout.artisanName}</p>
          <p className="mt-0.5 text-xs text-slate-400">for {payout.clientName}</p>
        </div>
        <span className="flex-shrink-0 text-sm font-bold text-slate-900">
          KES {payout.quotedPrice?.toLocaleString()}
        </span>
      </div>

      <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{payout.description}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Commission ({(payout.commissionRate * 100).toFixed(0)}%): KES {payout.serviceFee.toLocaleString()}</span>
        <span className="font-semibold text-teal-700">
          Payout: KES {payout.payoutAmount.toLocaleString()}
        </span>
      </div>
      {payout.artisanPhone && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
          <Phone size={11} /> {payout.artisanPhone}
        </p>
      )}

      {payout.payoutStatus === "completed" && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-teal-700">
          <CheckCircle2 size={13} />
          Paid out — receipt {payout.payoutTransactionId}
        </div>
      )}

      {payout.payoutStatus === "failed" && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-medium text-red-600">
          Last payout attempt failed — try again below.
        </p>
      )}

      {isPending && (
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-teal-700">
          <Loader2 size={13} className="animate-spin" />
          Awaiting confirmation from M-Pesa…
        </div>
      )}

      {canTrigger && !isPending && (
        <button
          disabled={isTriggering}
          onClick={() => onTrigger(payout.id)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {isTriggering ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
          {isTriggering ? "Sending…" : "Trigger payout"}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const router = useRouter();

  const [pageStatus,   setPageStatus]   = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab,    setActiveTab]    = useState<Tab>("pending");
  const [artisans,     setArtisans]     = useState<ArtisanRow[]>([]);
  const [tabLoading,   setTabLoading]   = useState(false);

  const [decidingId,   setDecidingId]   = useState<string | null>(null);
  const [decideError,  setDecideError]  = useState("");

  const [payouts,        setPayouts]        = useState<PayoutRow[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [triggeringId,   setTriggeringId]   = useState<string | null>(null);
  const [triggerError,   setTriggerError]   = useState("");
  const [pendingPayoutIds, setPendingPayoutIds] = useState<Set<string>>(new Set());
  const payoutPollAttemptsRef = useRef(0);

  // ── Initial auth + role guard ─────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (userError || !userRow || userRow.role !== "admin") {
        router.replace("/status");
        return;
      }

      setPageStatus("ready");
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Fetch the active tab's list ───────────────────────────────────────────
  async function loadTab(tab: Tab) {
    setTabLoading(true);
    setDecideError("");

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    const res = await fetch(`/api/admin/artisans?status=${tab}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[admin/dashboard] artisans fetch failed:", json);
      setErrorMessage("We couldn't load this list.");
      setPageStatus("error");
      setTabLoading(false);
      return;
    }

    setArtisans(json.artisans ?? []);
    setTabLoading(false);
  }

  useEffect(() => {
    if (pageStatus === "ready") loadTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStatus, activeTab]);

  async function handleDecide(artisanId: string, action: "approve" | "reject") {
    setDecidingId(artisanId);
    setDecideError("");

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch(`/api/admin/artisans/${artisanId}/verify`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Something went wrong.");

      // Decided artisans leave the current (pending) tab immediately.
      setArtisans((prev) => prev.filter((a) => a.id !== artisanId));
    } catch (err) {
      setDecideError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDecidingId(null);
    }
  }

  async function loadPayouts() {
    setPayoutsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return;

    const res = await fetch("/api/admin/payouts", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      const rows: PayoutRow[] = json.payouts ?? [];
      setPayouts(rows);

      // Drop resolved payouts from the pending set (mirrors the STK poller pattern).
      setPendingPayoutIds((prev) => {
        const next = new Set(prev);
        for (const p of rows) {
          if (next.has(p.id) && p.payoutStatus !== "pending") next.delete(p.id);
        }
        return next;
      });
    } else {
      console.error("[admin/dashboard] payouts fetch failed:", json);
    }
    setPayoutsLoading(false);
  }

  useEffect(() => {
    if (pageStatus === "ready") loadPayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStatus]);

  // Poll every 4s while any payout is awaiting the B2C result callback, for
  // up to ~2 minutes — same pattern as the client-side STK push poller.
  useEffect(() => {
    if (pendingPayoutIds.size === 0) {
      payoutPollAttemptsRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      payoutPollAttemptsRef.current += 1;
      if (payoutPollAttemptsRef.current > 30) {
        clearInterval(interval);
        return;
      }
      loadPayouts();
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPayoutIds.size]);

  async function handleTriggerPayout(bookingId: string) {
    setTriggeringId(bookingId);
    setTriggerError("");

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch(`/api/admin/payouts/${bookingId}/trigger`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Something went wrong.");

      setPayouts((prev) =>
        prev.map((p) => (p.id === bookingId ? { ...p, payoutStatus: "pending" } : p))
      );
      setPendingPayoutIds((prev) => new Set(prev).add(bookingId));
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setTriggeringId(null);
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
                <p className="text-sm font-bold leading-tight text-slate-900">Admin Dashboard</p>
              </div>
            </div>
            <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700">
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5">
          <div className="px-6 pt-6 pb-4 sm:px-8">
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldCheck size={18} className="text-teal-600" />
              Artisan Verification
            </h1>

            <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    activeTab === t.key
                      ? "bg-white text-teal-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {decideError && (
            <div className="mx-6 mb-4 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:mx-8">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{decideError}</p>
            </div>
          )}

          <div className="space-y-3 px-6 pb-6 sm:px-8">
            {tabLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={22} className="animate-spin text-slate-300" />
              </div>
            ) : artisans.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <ShieldCheck size={22} className="text-slate-300" />
                <p className="text-sm text-slate-400">
                  No {activeTab} artisans right now.
                </p>
              </div>
            ) : (
              artisans.map((a) => (
                <ArtisanCard
                  key={a.id}
                  artisan={a}
                  tab={activeTab}
                  onDecide={handleDecide}
                  isBusy={decidingId === a.id}
                />
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5">
          <div className="px-6 pt-6 pb-4 sm:px-8">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Banknote size={18} className="text-teal-600" />
              Artisan Payouts
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Completed bookings with payment released, ready for payout.
            </p>
          </div>

          {triggerError && (
            <div className="mx-6 mb-4 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:mx-8">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{triggerError}</p>
            </div>
          )}

          <div className="space-y-3 px-6 pb-6 sm:px-8">
            {payoutsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={22} className="animate-spin text-slate-300" />
              </div>
            ) : payouts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <Banknote size={22} className="text-slate-300" />
                <p className="text-sm text-slate-400">No completed bookings ready for payout yet.</p>
              </div>
            ) : (
              payouts.map((p) => (
                <PayoutCard
                  key={p.id}
                  payout={p}
                  onTrigger={handleTriggerPayout}
                  isTriggering={triggeringId === p.id}
                  isPending={pendingPayoutIds.has(p.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}