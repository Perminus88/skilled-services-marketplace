"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, AlertTriangle, Loader2 } from "lucide-react";
// Assumes src/lib/supabase.ts exports: export const supabase = createClient(url, anonKey)
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PageStatus = "idle" | "loading" | "error";

interface FormState {
  email:    string;
  password: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Maps Supabase auth error messages to user-friendly strings. */
function friendlyAuthError(message: string): string {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Incorrect email or password. Please check your details and try again.";
  }
  if (message.toLowerCase().includes("email not confirmed")) {
    return "Your email address hasn't been confirmed yet. Check your inbox for a confirmation link.";
  }
  if (message.toLowerCase().includes("too many requests")) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }
  return message;
}

/** Shared Tailwind classes for text inputs */
function inputCls(hasError = false): string {
  return [
    "w-full rounded-lg border bg-white text-sm text-slate-900",
    "placeholder-slate-400 transition-colors",
    "focus:outline-none focus:ring-2 focus:ring-teal-500/20",
    hasError
      ? "border-red-400 focus:border-red-400"
      : "border-slate-200 focus:border-teal-500",
  ].join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  const [form,   setForm]   = useState<FormState>({ email: "", password: "" });
  const [status, setStatus] = useState<PageStatus>("idle");
  const [error,  setError]  = useState<string>("");

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear error as the user starts correcting their input
    if (status === "error") setStatus("idle");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const email    = form.email.trim().toLowerCase();
    const password = form.password;

    // Basic client-side guard — Supabase would catch these anyway,
    // but this avoids a round-trip for obviously empty fields.
    if (!email || !password) {
      setError("Please enter your email address and password.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(friendlyAuthError(authError.message));
      setStatus("error");
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      setError("Something went wrong signing you in. Please try again.");
      setStatus("error");
      return;
    }

    // Look up role to decide where this person actually belongs.
    // Artisans go to /status (verification progress), clients go to
    // /client/dashboard (account + future bookings). Falling back to
    // /status on lookup failure preserves prior behavior rather than
    // stranding the person on a blank page.
    const { data: userRow, error: roleError } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (roleError) {
      console.error("[login] role lookup failed:", roleError);
      router.push("/status");
      router.refresh();
      return;
    }

    if (userRow?.role === "client") {
      router.push("/client/dashboard");
    } else {
      // Covers 'artisan' and any unexpected/missing role rather than
      // silently failing — existing behavior for artisans is unchanged.
      router.push("/status");
    }

    router.refresh();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center bg-slate-50 px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">

        {/* ── Card ───────────────────────────────────────────────────────── */}
        <div
          className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5"
          style={{ borderTop: "4px solid #0D9488" /* teal-600 */ }}
        >
          {/* Header */}
          <div className="px-6 pt-7 pb-2 sm:px-8">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 select-none items-center justify-center rounded-md
                              bg-slate-900 text-base font-black leading-none text-[#F5B700]">
                G
              </div>
              <span className="text-sm font-bold tracking-tight text-slate-900">Skilled services marketplace</span>
            </div>

            <h1 className="text-2xl font-bold leading-tight text-slate-900">
              Sign in to your account
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Check your application status and manage your profile.
            </p>
          </div>

          <div className="mx-6 mt-5 h-px bg-slate-100 sm:mx-8" />

          {/* Body */}
          <div className="px-6 pb-8 sm:px-8">

            {/* ── Error alert ─────────────────────────────────────────────── */}
            {status === "error" && (
              <div className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5">
                <AlertTriangle
                  size={16}
                  className="mt-0.5 flex-shrink-0 text-red-500"
                />
                <p className="text-sm text-red-700 leading-snug">{error}</p>
              </div>
            )}

            {/* ── Form ────────────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} noValidate>
              <fieldset
                disabled={status === "loading"}
                className="mt-6 space-y-4 disabled:opacity-60"
              >
                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail size={15} />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={handleChange}
                      className={`${inputCls()} pl-9 pr-3 py-2.5`}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock size={15} />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={form.password}
                      onChange={handleChange}
                      className={`${inputCls()} pl-9 pr-3 py-2.5`}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Submit */}
              <div className="mt-6">
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg
                             bg-teal-600 py-3 text-sm font-semibold text-white shadow-sm
                             transition-colors hover:bg-teal-700
                             focus-visible:outline-none focus-visible:ring-2
                             focus-visible:ring-teal-500 focus-visible:ring-offset-2
                             disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Footer link ─────────────────────────────────────────────────── */}
        <p className="mt-5 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <a
            href="/signup"
            className="font-semibold text-teal-600 transition-colors hover:text-teal-700"
          >
            Get started
          </a>
        </p>

      </div>
    </div>
  );
}