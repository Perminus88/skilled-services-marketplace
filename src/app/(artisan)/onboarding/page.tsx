"use client";

import { useState, type ReactNode, type ChangeEvent, type FormEvent } from "react";
import {
  User, Phone, Briefcase, Award, DollarSign,
  ChevronDown, FileText, AlertCircle, AlertTriangle,
  CheckCircle2, Loader2, Tag,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TradeSkill   = "Plumber" | "Electrician" | "House Cleaner" | "Gardener" | "other";
type PricingMode  = "flat" | "custom_quote" | "both";
type SubmitStatus = "idle" | "loading" | "success" | "error";

interface FormValues {
  fullName:           string;
  phone:              string;
  tradeSkill:         TradeSkill | "";
  customCategoryName: string;       // only sent when tradeSkill === "other"
  yearsExperience:    string;
  pricingMode:        PricingMode | "";
  startingPrice:      string;
  bio:                string;
}

type FormErrors = Partial<Record<keyof FormValues, string>>;

interface ArtisanRegistrationPayload {
  userId:              string;
  fullName:            string;
  phone:               string;
  tradeSkill:          TradeSkill;
  customCategoryName?: string;      // present only when tradeSkill === "other"
  yearsExperience:     number;
  pricingMode:         PricingMode;
  startingPrice:       number;
  bio:                 string;
  latitude:            number;
  longitude:           number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_USER_ID  = "00000000-0000-0000-0000-000000000000";
const MOCK_LATITUDE  = -1.0467;
const MOCK_LONGITUDE = 37.1500;
const BIO_MAX_CHARS  = 300;

const TRADE_SKILLS: TradeSkill[] = ["Plumber", "Electrician", "House Cleaner", "Gardener"];
// "other" is not in TRADE_SKILLS — it's rendered separately as the last <option>

const PRICING_MODES: { value: PricingMode; label: string; hint: string }[] = [
  { value: "flat",         label: "Flat rate",      hint: "You charge a fixed price per job." },
  { value: "custom_quote", label: "Custom quote",   hint: "You quote each job individually." },
  { value: "both",         label: "Flat + quotes",  hint: "You offer both options depending on the job." },
];

const EMPTY_FORM: FormValues = {
  fullName:           "",
  phone:              "",
  tradeSkill:         "",
  customCategoryName: "",
  yearsExperience:    "",
  pricingMode:        "",
  startingPrice:      "",
  bio:                "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validate(v: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (!v.fullName.trim()) {
    errors.fullName = "Full name is required.";
  } else if (v.fullName.trim().length < 2) {
    errors.fullName = "Name must be at least 2 characters.";
  }

  const phone = v.phone.replace(/[\s\-()]/g, "");
  if (!phone) {
    errors.phone = "M-Pesa phone number is required.";
  } else if (!/^(?:07|01|\+?2547|\+?2541)\d{7,8}$/.test(phone)) {
    errors.phone = "Enter a valid Kenyan number — e.g. 0712 345 678.";
  }

  if (!v.tradeSkill) {
    errors.tradeSkill = "Please select your primary trade.";
  }

  if (v.tradeSkill === "other") {
    if (!v.customCategoryName.trim()) {
      errors.customCategoryName = "Please specify your trade.";
    } else if (v.customCategoryName.trim().length < 2) {
      errors.customCategoryName = "Trade name must be at least 2 characters.";
    }
  }

  if (!v.yearsExperience) {
    errors.yearsExperience = "Years of experience is required.";
  } else {
    const yrs = Number(v.yearsExperience);
    if (!Number.isInteger(yrs) || yrs < 0 || yrs > 60) {
      errors.yearsExperience = "Enter a whole number between 0 and 60.";
    }
  }

  if (!v.pricingMode) {
    errors.pricingMode = "Please select how you price your work.";
  }

  if (!v.startingPrice) {
    errors.startingPrice = "Starting price is required.";
  } else {
    const price = Number(v.startingPrice);
    if (isNaN(price) || price <= 0) {
      errors.startingPrice = "Enter a price greater than KES 0.";
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Section rule with label — the "work order" signature of this form */
function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mt-7 mb-5">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em] whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

/** Consistent label + error wrapper */
function Field({
  label,
  error,
  hint,
  children,
  optional,
}: {
  label:    string;
  error?:   string;
  hint?:    string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="block text-sm font-medium text-slate-700">
          {label}
        </label>
        {optional && (
          <span className="text-[11px] text-slate-400">Optional</span>
        )}
      </div>
      {children}
      {hint && !error && (
        <p className="mt-1.5 text-[11px] text-slate-400 leading-snug">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-[11px] text-red-500 flex items-center gap-1 leading-snug">
          <AlertCircle size={11} className="flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Shared class strings for input/select/textarea */
function inputCls(hasError: boolean) {
  return [
    "w-full rounded-lg border text-sm text-slate-900 bg-white",
    "placeholder-slate-400 transition-colors",
    "focus:outline-none focus:ring-2 focus:ring-teal-500/20",
    hasError
      ? "border-red-400 focus:border-red-400"
      : "border-slate-200 focus:border-teal-500",
  ].join(" ");
}

/** Text / tel / number input with a leading icon */
function IconInput({
  icon,
  error,
  ...props
}: {
  icon:   ReactNode;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        {icon}
      </div>
      <input
        {...props}
        className={`${inputCls(!!error)} pl-9 pr-3 py-2.5`}
      />
    </div>
  );
}

/** Select with leading icon + custom chevron */
function IconSelect({
  icon,
  error,
  placeholder,
  children,
  ...props
}: {
  icon:        ReactNode;
  error?:      string;
  placeholder: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        {icon}
      </div>
      <select
        {...props}
        className={`${inputCls(!!error)} appearance-none pl-9 pr-8 py-2.5`}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        <ChevronDown size={14} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Success card
// ─────────────────────────────────────────────────────────────────────────────

function SuccessCard({ name }: { name: string }) {
  return (
    <div className="py-4 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 ring-8 ring-teal-50/60">
        <CheckCircle2 size={34} className="text-teal-600" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">Application submitted</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500 leading-relaxed">
        Thanks, <span className="font-semibold text-slate-700">{name}</span>. We'll verify your
        details within 24 hours and SMS you on your M-Pesa number when you're approved.
      </p>

      {/* What happens next */}
      <ol className="mx-auto mt-6 max-w-xs space-y-2 text-left text-[13px] text-slate-600">
        {[
          "Identity verification via national ID",
          "Trade skill review by our team",
          "Profile goes live — clients can find you",
        ].map((step, i) => (
          <li key={i} className="flex gap-2.5 items-start">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {/* Reference */}
      <div className="mx-auto mt-6 max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Reference number
        </p>
        <p
          className="mt-1 break-all text-xs font-semibold text-slate-700"
          style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" }}
        >
          {MOCK_USER_ID}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ArtisanOnboardingPage() {
  const [values,      setValues]      = useState<FormValues>(EMPTY_FORM);
  const [errors,      setErrors]      = useState<FormErrors>({});
  const [status,      setStatus]      = useState<SubmitStatus>("idle");
  const [apiError,    setApiError]    = useState<string>("");

  // Generic change handler — keeps all fields in one state object
  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear the error for this field as the user types
    if (errors[name as keyof FormValues]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationErrors = validate(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // Scroll the first error into view
      const firstErrorKey = Object.keys(validationErrors)[0];
      document.querySelector<HTMLElement>(`[name="${firstErrorKey}"]`)?.focus();
      return;
    }

    setErrors({});
    setApiError("");
    setStatus("loading");

    const isCustomTrade = values.tradeSkill === "other";

    const payload: ArtisanRegistrationPayload = {
      userId:          MOCK_USER_ID,
      fullName:        values.fullName.trim(),
      phone:           values.phone.replace(/[\s\-()]/g, ""),
      tradeSkill:      values.tradeSkill as TradeSkill,
      // Only include customCategoryName when the artisan chose "Other"
      ...(isCustomTrade && {
        customCategoryName: values.customCategoryName.trim(),
      }),
      yearsExperience: parseInt(values.yearsExperience, 10),
      pricingMode:     values.pricingMode as PricingMode,
      startingPrice:   parseFloat(values.startingPrice),
      bio:             values.bio.trim(),
      latitude:        MOCK_LATITUDE,
      longitude:       MOCK_LONGITUDE,
    };

    try {
      const res = await fetch("/api/register/artisan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        // Try to surface a message from the server, otherwise use HTTP status
        const json = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(json.message ?? `Server returned ${res.status} — please try again.`);
      }

      setStatus("success");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.";
      setApiError(message);
      setStatus("error");
    }
  }

  const pricingHint = values.pricingMode
    ? PRICING_MODES.find((m) => m.value === values.pricingMode)?.hint
    : undefined;

  const bioLength = values.bio.length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-lg">

        {/* Card */}
        <div
          className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5"
          style={{ borderTop: "4px solid #0D9488" /* teal-600 */ }}
        >

          {/* Card header */}
          <div className="px-6 pt-7 pb-2 sm:px-8">
            {/* Brand */}
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-[#F5B700] font-black text-base leading-none select-none">
                G
              </div>
              <span className="text-sm font-bold text-slate-900 tracking-tight">
                Skilled Services Marketplace
              </span>
              <span className="ml-auto rounded-sm bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-teal-700">
                New Application
              </span>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 leading-tight">
              Create your artisan profile
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Fill in your details below. Approval typically takes under 24 hours.
            </p>
          </div>

          {/* Divider */}
          <div className="mx-6 mt-5 h-px bg-slate-100 sm:mx-8" />

          {/* Form body */}
          <div className="px-6 pb-8 sm:px-8">

            {/* ── API error alert ────────────────────────────────────────── */}
            {status === "error" && (
              <div className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Submission failed</p>
                  <p className="mt-0.5 text-xs text-red-600 leading-snug">{apiError}</p>
                </div>
              </div>
            )}

            {/* ── Success state ──────────────────────────────────────────── */}
            {status === "success" ? (
              <div className="mt-6">
                <SuccessCard name={values.fullName.split(" ")[0]} />
              </div>
            ) : (

              /* ── Onboarding form ──────────────────────────────────────── */
              <form onSubmit={handleSubmit} noValidate>
                <fieldset disabled={status === "loading"} className="space-y-4 disabled:opacity-60">

                  {/* ── Section 1: Personal ─────────────────────────────── */}
                  <SectionRule label="Personal Information" />

                  <Field label="Full Name" error={errors.fullName}>
                    <IconInput
                      icon={<User size={15} />}
                      type="text"
                      name="fullName"
                      placeholder="e.g. James Mwangi"
                      value={values.fullName}
                      onChange={handleChange}
                      autoComplete="name"
                      error={errors.fullName}
                    />
                  </Field>

                  <Field
                    label="M-Pesa Phone Number"
                    error={errors.phone}
                    hint="Used for job notifications and receiving payouts."
                  >
                    <IconInput
                      icon={<Phone size={15} />}
                      type="tel"
                      name="phone"
                      placeholder="e.g. 0712 345 678"
                      value={values.phone}
                      onChange={handleChange}
                      autoComplete="tel"
                      inputMode="tel"
                      error={errors.phone}
                    />
                  </Field>

                  {/* ── Section 2: Trade ────────────────────────────────── */}
                  <SectionRule label="Trade Details" />

                  <Field label="Primary Trade Skill" error={errors.tradeSkill}>
                    <IconSelect
                      icon={<Briefcase size={15} />}
                      name="tradeSkill"
                      placeholder="Select your trade…"
                      value={values.tradeSkill}
                      onChange={(e) => {
                        handleChange(e);
                        // Clear the custom name whenever the dropdown changes
                        // so stale text doesn't sneak into the payload
                        if (e.target.value !== "other") {
                          setValues((prev) => ({ ...prev, customCategoryName: "" }));
                          setErrors((prev) => ({ ...prev, customCategoryName: undefined }));
                        }
                      }}
                      error={errors.tradeSkill}
                    >
                      {TRADE_SKILLS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option disabled className="text-slate-300">──────────</option>
                      <option value="other">Other (Specify...)</option>
                    </IconSelect>
                  </Field>

                  {/* Conditional: only shown when "Other" is selected */}
                  {values.tradeSkill === "other" && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                      <Field
                        label="Specify Your Trade"
                        error={errors.customCategoryName}
                        hint="This will be reviewed and added to our categories."
                      >
                        <IconInput
                          icon={<Briefcase size={15} />}
                          type="text"
                          name="customCategoryName"
                          placeholder="e.g., Carpenter, Painter, Welder"
                          value={values.customCategoryName}
                          onChange={handleChange}
                          autoComplete="off"
                          autoFocus
                          error={errors.customCategoryName}
                        />
                      </Field>
                    </div>
                  )}

                  <Field
                    label="Years of Experience"
                    error={errors.yearsExperience}
                    hint="Enter 0 if you're just starting out — everyone begins somewhere."
                  >
                    <IconInput
                      icon={<Award size={15} />}
                      type="number"
                      name="yearsExperience"
                      placeholder="e.g. 5"
                      min={0}
                      max={60}
                      value={values.yearsExperience}
                      onChange={handleChange}
                      inputMode="numeric"
                      error={errors.yearsExperience}
                    />
                  </Field>

                  {/* ── Section 3: Business setup ────────────────────────── */}
                  <SectionRule label="Business Setup" />

                  <Field
                    label="Pricing Mode"
                    error={errors.pricingMode}
                    hint={pricingHint}
                  >
                    <IconSelect
                      icon={<Tag size={15} />}
                      name="pricingMode"
                      placeholder="How do you price your work?"
                      value={values.pricingMode}
                      onChange={handleChange}
                      error={errors.pricingMode}
                    >
                      {PRICING_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </IconSelect>
                  </Field>

                  <Field
                    label="Starting Price (KES)"
                    error={errors.startingPrice}
                    hint={
                      values.pricingMode === "custom_quote"
                        ? "Your typical minimum, even for quote-based jobs."
                        : "The lowest price you charge for a standard job."
                    }
                  >
                    <IconInput
                      icon={<DollarSign size={15} />}
                      type="number"
                      name="startingPrice"
                      placeholder="e.g. 800"
                      min={1}
                      value={values.startingPrice}
                      onChange={handleChange}
                      inputMode="decimal"
                      error={errors.startingPrice}
                    />
                  </Field>

                  <Field
                    label="Professional Bio"
                    error={errors.bio}
                    optional
                  >
                    <div className="relative">
                      <div className="pointer-events-none absolute left-3 top-3 text-slate-400">
                        <FileText size={15} />
                      </div>
                      <textarea
                        name="bio"
                        rows={4}
                        maxLength={BIO_MAX_CHARS}
                        placeholder="Briefly describe your skills, experience, and what makes you great at your trade…"
                        value={values.bio}
                        onChange={handleChange}
                        className={`${inputCls(!!errors.bio)} resize-none pl-9 pr-3 py-2.5`}
                      />
                    </div>
                    <div className="mt-1 flex justify-end">
                      <span
                        className={`text-[11px] tabular-nums ${
                          bioLength > BIO_MAX_CHARS * 0.9
                            ? "text-amber-500"
                            : "text-slate-400"
                        }`}
                      >
                        {bioLength}/{BIO_MAX_CHARS}
                      </span>
                    </div>
                  </Field>

                </fieldset>

                {/* ── Submit ──────────────────────────────────────────────── */}
                <div className="mt-7">
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600
                               py-3 text-sm font-semibold text-white shadow-sm
                               transition-colors hover:bg-teal-700 focus-visible:outline-none
                               focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2
                               disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {status === "loading" ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Submitting application…
                      </>
                    ) : (
                      "Submit Application"
                    )}
                  </button>

                  <p className="mt-4 text-center text-[11px] text-slate-400 leading-relaxed">
                    By submitting you agree to Skilled services marketplace&apos;s{" "}
                    <a href="#" className="underline hover:text-slate-600 transition-colors">
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a href="#" className="underline hover:text-slate-600 transition-colors">
                      Privacy Policy
                    </a>.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Already have an account */}
        {status !== "success" && (
          <p className="mt-5 text-center text-sm text-slate-500">
            Already registered?{" "}
            <a
              href="/login"
              className="font-semibold text-teal-600 hover:text-teal-700 transition-colors"
            >
              Sign in instead
            </a>
          </p>
        )}
      </div>
    </div>
  );
}