"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  Search, LogOut, User as UserIcon, Phone, Mail,
  Loader2, AlertTriangle, ClipboardList,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PageStatus = "loading" | "ready" | "error";

interface ClientProfile {
  fullName: string;
  phone:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientDashboardPage() {
  const router = useRouter();

  const [authUser,     setAuthUser]     = useState<User | null>(null);
  const [profile,      setProfile]      = useState<ClientProfile | null>(null);
  const [pageStatus,   setPageStatus]   = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    async function loadProfileData() {
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

      // Defensive check — an artisan landing here directly (e.g. old
      // bookmark, manual URL edit) should be sent to their own dashboard
      // rather than shown client-only content.
      if (userRow.role !== "client") {
        router.replace("/status");
        return;
      }

      setProfile({
        fullName: userRow.full_name ?? user.email ?? "there",
        phone:    userRow.phone ?? "",
      });

      setPageStatus("ready");
    }

    loadProfileData();
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (pageStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">Loading your account…</p>
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

  const data      = profile!;
  const firstName = data.fullName.split(" ")[0];

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
                  Client Dashboard
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

          <div className="px-6 pt-6 pb-5 sm:px-8">
            <p className="text-sm text-slate-500">
              Welcome back,{" "}
              <span className="font-semibold text-slate-700">{firstName}</span>
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-slate-900">
              Your Account
            </h1>

            {/* Account summary rows */}
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

          {/* Find an artisan CTA */}
          <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
            <a
              href="/discovery"
              className="flex items-center justify-center gap-2 rounded-lg bg-teal-600
                         py-3 text-sm font-semibold text-white shadow-sm transition-colors
                         hover:bg-teal-700"
            >
              <Search size={16} />
              Find an artisan
            </a>
          </div>

          {/* Bookings placeholder — replaced with real data once the
              booking flow exists */}
          <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Your Bookings
            </p>
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed
                            border-slate-200 py-8 text-center">
              <ClipboardList size={22} className="text-slate-300" />
              <p className="text-sm text-slate-400">No bookings yet</p>
              <p className="text-xs text-slate-400">
                Once you book an artisan, it&apos;ll show up here.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}