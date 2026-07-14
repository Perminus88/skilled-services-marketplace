"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  BadgeCheck, Clock, XCircle, LogOut, Briefcase,
  User as UserIcon, Loader2, AlertTriangle, ChevronRight,
} from "lucide-react";
// Assumes src/lib/supabase.ts exports: export const supabase = createClient(url, anonKey)
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type VerificationStatus = "pending" | "verified" | "rejected";
type PageStatus         = "loading" | "ready" | "error";

/**
 * All artisan data needed by the status view, flattened from three tables:
 *   public.users              → fullName, phone, verificationStatus
 *   public.artisan_profiles   → startingPrice, pricingType
 *   public.artisan_categories + public.categories → categoryName
 */
interface ArtisanProfile {
  fullName:           string;
  phone:              string;
  verificationStatus: VerificationStatus;
  categoryName:       string | null;
  startingPrice:      number | null;
  pricingType:        string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge configuration
// ─────────────────────────────────────────────────────────────────────────────

interface StatusConfig {
  label:       string;
  icon:        React.ReactNode;
  badgeBg:     string;
  badgeText:   string;
  badgeBorder: string;
  badgeRing:   string;
  blurb:       string;
}

const STATUS_CONFIG: Record<VerificationStatus, StatusConfig> = {
  pending: {
    label:       "Under Review",
    icon:        <Clock size={22} strokeWidth={2} />,
    badgeBg:     "bg-amber-50",
    badgeText:   "text-amber-700",
    badgeBorder: "border-amber-200",
    badgeRing:   "ring-amber-100",
    blurb:       "Your profile is being reviewed by our team. This usually takes less than 24 hours.",
  },
  verified: {
    label:       "Approved & Live",
    icon:        <BadgeCheck size={22} strokeWidth={2} />,
    badgeBg:     "bg-teal-50",
    badgeText:   "text-teal-700",
    badgeBorder: "border-teal-200",
    badgeRing:   "ring-teal-100",
    blurb:       "Clients in your area can now discover and book you.",
  },
  rejected: {
    label:       "Not Approved",
    icon:        <XCircle size={22} strokeWidth={2} />,
    badgeBg:     "bg-red-50",
    badgeText:   "text-red-700",
    badgeBorder: "border-red-200",
    badgeRing:   "ring-red-100",
    blurb:       "Your application needs attention. Contact support for next steps.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatPricingType(type: string | null): string {
  if (type === "flat")         return "Flat rate";
  if (type === "custom_quote") return "Custom quotes";
  if (type === "both")         return "Flat rate + custom quotes";
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const router = useRouter();

  const [authUser,     setAuthUser]     = useState<User | null>(null);
  const [profile,      setProfile]      = useState<ArtisanProfile | null>(null);
  const [pageStatus,   setPageStatus]   = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadProfileData() {
      // Step 1 — Verify the session.
      // getUser() makes a network call to Supabase Auth to validate the JWT,
      // which is more secure than getSession() (which only reads local storage).
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        // No valid session — send to login.
        // router.replace() (not push) prevents the user pressing Back to
        // return to the status page while still unauthenticated.
        router.replace("/login");
        return;
      }

      setAuthUser(user);

      // Step 2 — Fetch from public.users
      // RLS policy "users: select own row" (auth.uid() = id) must be active.
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("full_name, phone, verification_status")
        .eq("id", user.id)
        .single();

      if (userError) {
        console.error("[status] users query failed:", userError);
        setErrorMessage(
          "We couldn't load your profile. Please try signing in again."
        );
        setPageStatus("error");
        return;
      }

      // Step 3 — Fetch trade category via embedded PostgREST join.
      // artisan_categories → categories (one-to-one via category_id FK).
      // RLS policies required on both tables (see SQL migration above).
      // maybeSingle() is used because a profile with no category is valid
      // (shouldn't happen after onboarding, but we handle it gracefully).
      const { data: categoryLink, error: categoryError } = await supabase
        .from("artisan_categories")
        .select("categories(name)")
        .eq("artisan_id", user.id)
        .maybeSingle();

      if (categoryError) {
        console.error("[status] artisan_categories query failed:", categoryError);
        // Non-fatal — show the page without a category name rather than blocking
      }

      // Step 4 — Fetch artisan_profiles for price / pricing type
      const { data: artisanProfile, error: profileError } = await supabase
        .from("artisan_profiles")
        .select("starting_price, pricing_type")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[status] artisan_profiles query failed:", profileError);
        // Non-fatal — show the page without pricing details
      }

      // PostgREST returns embedded relations as a nested object.
      // For joins, embedded data often comes back as an array of objects.
      const categoryName =
        ((categoryLink?.categories as { name: string }[] | undefined)?.[0]?.name) ?? null;

      const resolvedStatus = (userRow.verification_status as VerificationStatus) ?? "pending";

      // Verified artisans have no reason to see this page — it exists
      // purely to communicate pre-verification status. Once verified,
      // send them straight to their real working dashboard.
      if (resolvedStatus === "verified") {
        router.replace("/artisan/dashboard");
        return;
      }

      setProfile({
        fullName:           userRow.full_name       ?? user.email ?? "Artisan",
        phone:              userRow.phone            ?? "",
        verificationStatus: resolvedStatus,
        categoryName,
        startingPrice:      artisanProfile?.starting_price ?? null,
        pricingType:        artisanProfile?.pricing_type   ?? null,
      });

      setPageStatus("ready");
    }

    loadProfileData();
  }, [router]);

  // ── Sign-out handler ───────────────────────────────────────────────────────
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (pageStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">Loading your profile…</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (pageStatus === "error") {
    return (
      <div className="flex min-h-screen items-center bg-slate-50 px-4 py-10">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-900/5">
            <AlertTriangle size={36} className="mx-auto mb-4 text-red-400" />
            <h2 className="text-lg font-bold text-slate-900">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">{errorMessage}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-6 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold
                         text-white transition-colors hover:bg-teal-700"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Ready state ────────────────────────────────────────────────────────────
  const data      = profile!;
  const statusCfg = STATUS_CONFIG[data.verificationStatus] ?? STATUS_CONFIG.pending;
  const firstName = data.fullName.split(" ")[0];
  const pricing   = formatPricingType(data.pricingType);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-lg space-y-4">

        {/* ── Top bar ────────────────────────────────────────────────────── */}
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
                  Skilled services marketplace
                </p>
                <p className="text-sm font-bold leading-tight text-slate-900">
                  Artisan Portal
                </p>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400
                         transition-colors hover:text-slate-700"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>

        {/* ── Main card ──────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5">

          {/* Greeting + status badge */}
          <div className="px-6 pt-6 pb-5 sm:px-8">
            <p className="text-sm text-slate-500">
              Welcome back,{" "}
              <span className="font-semibold text-slate-700">{firstName}</span>
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-slate-900">
              Application Status
            </h1>

            {/* Status badge — the hero element of this page */}
            <div
              className={`
                mt-5 flex items-start gap-3.5 rounded-xl border p-4 ring-4
                ${statusCfg.badgeBg} ${statusCfg.badgeBorder} ${statusCfg.badgeRing}
              `}
            >
              <div className={`mt-0.5 flex-shrink-0 ${statusCfg.badgeText}`}>
                {statusCfg.icon}
              </div>
              <div>
                <p className={`text-base font-bold leading-tight ${statusCfg.badgeText}`}>
                  {statusCfg.label}
                </p>
                <p className="mt-1 text-xs leading-snug text-slate-500">
                  {statusCfg.blurb}
                </p>
              </div>
            </div>

            {/* Profile summary rows */}
            <div className="mt-5 space-y-3">

              {/* Name + email */}
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center
                                rounded-full bg-slate-100">
                  <UserIcon size={14} className="text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {data.fullName}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {authUser?.email}
                  </p>
                </div>
              </div>

              {/* Trade category */}
              {data.categoryName ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center
                                  rounded-full bg-slate-100">
                    <Briefcase size={14} className="text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {data.categoryName}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {[
                        pricing,
                        data.startingPrice
                          ? `from KES ${data.startingPrice.toLocaleString()}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center
                                  rounded-full bg-slate-100">
                    <Briefcase size={14} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-400 italic">
                    No trade category linked
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Pending — What happens next ──────────────────────────────── */}
          {data.verificationStatus === "pending" && (
            <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                What happens next
              </p>
              <ol className="space-y-3">
                {[
                  {
                    title: "Identity verification",
                    desc:  "We confirm your national ID details on file.",
                  },
                  {
                    title: "Trade skill review",
                    desc:  "A team member reviews your trade and stated experience.",
                  },
                  {
                    title: "SMS notification",
                    desc:  "You'll receive an SMS on your M-Pesa number once a decision is made.",
                  },
                ].map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span
                      className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center
                                 rounded-full bg-teal-100 text-[10px] font-bold text-teal-700"
                    >
                      {i + 1}
                    </span>
                    <p className="leading-snug text-slate-600">
                      <span className="font-semibold text-slate-800">{step.title}</span>
                      {" — "}
                      {step.desc}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ── Verified — You're live ────────────────────────────────────── */}
          {data.verificationStatus === "verified" && (
            <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                You&apos;re live
              </p>
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
                <p className="text-sm leading-relaxed text-teal-700">
                  Your profile is visible to clients nearby. Open the Skilled services marketplace app and
                  toggle your availability to start receiving job requests.
                </p>
              </div>
            </div>
          )}

          {/* ── Rejected — Contact support ────────────────────────────────── */}
          {data.verificationStatus === "rejected" && (
            <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Next steps
              </p>
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm leading-relaxed text-red-700">
                  Your application was not approved at this time. Contact our support
                  team for details — we&apos;ll explain exactly what to address before
                  re-applying.
                </p>
                <a
                  href="mailto:support@Skilled services marketplace.co.ke"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold
                             text-red-700 underline transition-colors hover:text-red-900"
                >
                  support@Skilled services marketplace.co.ke <ChevronRight size={11} />
                </a>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}