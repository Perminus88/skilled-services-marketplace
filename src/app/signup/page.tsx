"use client";

import Link from "next/link";
import { Wrench, Search } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// /signup
//
// Entry point before either onboarding flow. Asks whether the person is
// looking to hire (client) or offer services (artisan), then routes to the
// matching signup page. Each destination page passes its own role into
// supabase.auth.signUp()'s metadata, which handle_new_user() now reads to
// set the correct `role` on the resulting public.users row.
// ─────────────────────────────────────────────────────────────────────────────

export default function SignupChoicePage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-14 flex items-center justify-center">
      <div className="w-full max-w-2xl">

        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-[#F5B700] font-black text-base leading-none select-none">
            G
          </div>
          <span className="text-sm font-bold text-slate-900 tracking-tight">
            Skilled services marketplace
          </span>
        </div>

        <h1 className="text-center text-2xl font-bold text-slate-900">
          How would you like to get started?
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Choose the option that fits what you're here to do.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">

          {/* Client */}
          <Link
            href="/client/signup"
            className="group overflow-hidden rounded-2xl bg-white p-7 text-left shadow-sm ring-1 ring-slate-900/5 transition-all hover:shadow-lg hover:ring-teal-200"
            style={{ borderTop: "4px solid #0D9488" }}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-600">
              <Search size={20} />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              I'm looking for services
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
              Find and book trusted, verified artisans near you — plumbers,
              electricians, cleaners, and more.
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-teal-600 transition-colors group-hover:text-teal-700">
              Sign up as a client →
            </span>
          </Link>

          {/* Artisan */}
          <Link
            href="/onboarding"
            className="group overflow-hidden rounded-2xl bg-white p-7 text-left shadow-sm ring-1 ring-slate-900/5 transition-all hover:shadow-lg hover:ring-teal-200"
            style={{ borderTop: "4px solid #0D9488" }}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-600">
              <Wrench size={20} />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              I offer skilled trade services
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
              Create your artisan profile, get verified, and start receiving
              job requests from clients near you.
            </p>
            <span className="mt-4 inline-block text-sm font-semibold text-teal-600 transition-colors group-hover:text-teal-700">
              Sign up as an artisan →
            </span>
          </Link>

        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-teal-600 hover:text-teal-700">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}