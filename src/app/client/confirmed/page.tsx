"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// /client/confirmed
//
// Landing page after a client clicks the confirmation link in their email
// (see emailRedirectTo in the signUp() call in client/signup/page.tsx).
// Like onboarding/confirmed/page.tsx, this needs no Supabase logic — the
// account was already confirmed server-side by the time this page loads,
// and full_name/phone were already saved via /api/register/client right
// after signUp(), before email confirmation even happened.
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientEmailConfirmedPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-14 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5 px-6 py-10 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 ring-8 ring-teal-50/60">
          <CheckCircle2 size={34} className="text-teal-600" />
        </div>

        <h1 className="text-xl font-bold text-slate-900">Email confirmed</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          Your account is verified. You can now log in and start browsing
          trusted artisans near you.
        </p>

        <Link
          href="/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-teal-600
                     py-3 text-sm font-semibold text-white shadow-sm transition-colors
                     hover:bg-teal-700"
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}