"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import {
  User, Phone, Mail, Lock, AlertCircle, AlertTriangle,
  CheckCircle2, Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import GoogleSignInButton from "@/components/GoogleSignInButton";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SubmitStatus = "idle" | "loading" | "success" | "error";

interface FormState {
  fullName:        string;
  phone:            string;
  email:            string;
  password:         string;
  confirmPassword:  string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  fullName:        "",
  phone:            "",
  email:            "",
  password:         "",
  confirmPassword:  "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!v.fullName.trim()) {
    errors.fullName = "Full name is required.";
  } else if (v.fullName.trim().length < 2) {
    errors.fullName = "Name must be at least 2 characters.";
  }

  const cleanPhone = v.phone.replace(/[\s\-()]/g, "");
  if (!cleanPhone) {
    errors.phone = "Phone number is required.";
  } else if (!/^(?:07|01|\+?2547|\+?2541)\d{7,8}$/.test(cleanPhone)) {
    errors.phone = "Enter a valid Kenyan number — e.g. 0712 345 678.";
  }

  if (!v.email.trim()) {
    errors.email = "Email is required.";
  } else if (!EMAIL_RE.test(v.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (!v.password) {
    errors.password = "Password is required.";
  } else if (v.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  if (!v.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (v.confirmPassword !== v.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
}: {
  label:    string;
  error?:   string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && (
        <p className="mt-1.5 text-[11px] text-red-500 flex items-center gap-1 leading-snug">
          <AlertCircle size={11} className="flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function inputCls(hasError: boolean): string {
  return [
    "w-full rounded-lg border text-sm text-slate-900 bg-white",
    "placeholder-slate-400 transition-colors",
    "focus:outline-none focus:ring-2 focus:ring-teal-500/20",
    hasError ? "border-red-400 focus:border-red-400" : "border-slate-200 focus:border-teal-500",
  ].join(" ");
}

function IconInput({
  icon,
  error,
  ...props
}: { icon: React.ReactNode; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        {icon}
      </div>
      <input {...props} className={`${inputCls(!!error)} pl-9 pr-3 py-2.5`} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientSignupPage() {
  const [values,          setValues]          = useState<FormState>(EMPTY_FORM);
  const [fieldErrors,     setFieldErrors]     = useState<FormErrors>({});
  const [status,          setStatus]          = useState<SubmitStatus>("idle");
  const [apiErrorMessage, setApiErrorMessage] = useState<string>("");

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name as keyof FormState]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const errors = validate(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstKey = Object.keys(errors)[0] as keyof FormState;
      document.querySelector<HTMLElement>(`[name="${firstKey}"]`)?.focus();
      return;
    }

    setFieldErrors({});
    setApiErrorMessage("");
    setStatus("loading");

    // Step 1 — create the Supabase Auth account. role: "client" in the
    // signUp metadata is read by handle_new_user() so the resulting
    // public.users row gets role = 'client' instead of the trigger's
    // 'artisan' default.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email:    values.email.trim(),
      password: values.password,
      options: {
        data: { role: "client" },
        emailRedirectTo: `${window.location.origin}/client/confirmed`,
      },
    });

    if (signUpError) {
      setApiErrorMessage(signUpError.message);
      setStatus("error");
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      setApiErrorMessage("Account creation didn't return a user ID. Please try again.");
      setStatus("error");
      return;
    }

    // Step 2 — fill in fullName/phone, same as artisan onboarding does.
    // signUp() returns a real user.id synchronously, even before the email
    // is confirmed, so there's no need to wait for confirmation here.
    try {
      const res = await fetch("/api/register/client", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fullName: values.fullName.trim(),
          phone:    values.phone.replace(/[\s\-()]/g, ""),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const detail =
          json.errors && json.errors.length > 0
            ? json.errors.join(" • ")
            : (json.message ?? `Unexpected error — server returned ${res.status}.`);
        throw new Error(detail);
      }

      setStatus("success");
    } catch (err) {
      setApiErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again."
      );
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md">

        <div
          className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5"
          style={{ borderTop: "4px solid #0D9488" }}
        >
          <div className="px-6 pt-7 pb-2 sm:px-8">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-[#F5B700] font-black text-base leading-none select-none">
                G
              </div>
              <span className="text-sm font-bold text-slate-900 tracking-tight">
                Skilled services marketplace
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Find and book trusted artisans near you.
            </p>
          </div>

          <div className="mx-6 mt-5 h-px bg-slate-100 sm:mx-8" />

          <div className="px-6 pb-8 sm:px-8">
            {status === "error" && (
              <div className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Something went wrong</p>
                  <p className="mt-0.5 text-xs text-red-600 leading-snug">{apiErrorMessage}</p>
                </div>
              </div>
            )}

            {status === "success" ? (
              <div className="mt-6 py-4 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 ring-8 ring-teal-50/60">
                  <CheckCircle2 size={34} className="text-teal-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Check your email</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500 leading-relaxed">
                  We&apos;ve sent a confirmation link to{" "}
                  <span className="font-semibold text-slate-700">{values.email.trim()}</span>.
                  Confirm your account, then log in to start browsing artisans.
                </p>
                <a
                  href="/login"
                  className="mt-6 inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
                >
                  Go to login
                </a>
              </div>
            ) : (
              <>
                <div className="mt-6">
                  <GoogleSignInButton label="Sign up with Google" />
                </div>

                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-100" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">or</span>
                  <div className="h-px flex-1 bg-slate-100" />
                </div>

                <form onSubmit={handleSubmit} noValidate>
                  <fieldset disabled={status === "loading"} className="space-y-4 disabled:opacity-60">

                    <Field label="Full Name" error={fieldErrors.fullName}>
                      <IconInput
                        icon={<User size={15} />}
                        type="text"
                        name="fullName"
                        placeholder="e.g. Jane Wanjiru"
                        value={values.fullName}
                        onChange={handleChange}
                        autoComplete="name"
                        error={fieldErrors.fullName}
                      />
                    </Field>

                    <Field label="Phone Number" error={fieldErrors.phone}>
                      <IconInput
                        icon={<Phone size={15} />}
                        type="tel"
                        name="phone"
                        placeholder="e.g. 0712 345 678"
                        value={values.phone}
                        onChange={handleChange}
                        autoComplete="tel"
                        inputMode="tel"
                        error={fieldErrors.phone}
                      />
                    </Field>

                    <Field label="Email" error={fieldErrors.email}>
                      <IconInput
                        icon={<Mail size={15} />}
                        type="email"
                        name="email"
                        placeholder="you@example.com"
                        value={values.email}
                        onChange={handleChange}
                        autoComplete="email"
                        error={fieldErrors.email}
                      />
                    </Field>

                    <Field label="Password" error={fieldErrors.password}>
                      <IconInput
                        icon={<Lock size={15} />}
                        type="password"
                        name="password"
                        placeholder="At least 8 characters"
                        value={values.password}
                        onChange={handleChange}
                        autoComplete="new-password"
                        error={fieldErrors.password}
                      />
                    </Field>

                    <Field label="Confirm Password" error={fieldErrors.confirmPassword}>
                      <IconInput
                        icon={<Lock size={15} />}
                        type="password"
                        name="confirmPassword"
                        placeholder="••••••••"
                        value={values.confirmPassword}
                        onChange={handleChange}
                        autoComplete="new-password"
                        error={fieldErrors.confirmPassword}
                      />
                    </Field>

                  </fieldset>

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600
                               py-3 text-sm font-semibold text-white shadow-sm transition-colors
                               hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {status === "loading" ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Creating account…
                      </>
                    ) : (
                      "Create account"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {status !== "success" && (
          <p className="mt-5 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-teal-600 hover:text-teal-700">
              Sign in
            </a>
          </p>
        )}
      </div>
    </div>
  );
}