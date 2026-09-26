"use client";

import { useState, useEffect, type ReactNode, type ChangeEvent, type FormEvent } from "react";
import {
  User, Phone, Briefcase, Award, DollarSign,
  ChevronDown, FileText, AlertCircle, AlertTriangle,
  CheckCircle2, Loader2, Tag, Mail, Lock, MapPin, RefreshCw, Wrench,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * pricingMode must be one of these three exact strings.
 * Backend check: !["flat","custom_quote","both"].includes(value)
 */
type PricingMode    = "flat" | "custom_quote" | "both";
type SubmitStatus   = "idle" | "loading" | "success" | "error";
type LocationStatus = "idle" | "loading" | "success" | "error" | "denied";

/**
 * Internal form state.
 * All fields are strings because every HTML <input> / <select> / <textarea>
 * yields a string via onChange.  Numeric conversions happen only in
 * buildPayload() — never in the state itself.
 *
 * Field names match the backend ArtisanRegistrationBody keys exactly:
 *   fullName · phone · tradeSkill · customCategoryName
 *   yearsExperience · pricingMode · startingPrice · bio
 *
 * email / password / confirmPassword are NOT sent to /api/register/artisan —
 * they're used only for the Supabase Auth signUp() call, which happens
 * before the artisan-profile POST.
 *
 * latitude / longitude are NOT part of this state — they come from the
 * browser Geolocation API and live in their own `coords` state below,
 * since they're captured automatically rather than typed in.
 */
interface FormState {
  email:              string;   // → supabase.auth.signUp({ email })
  password:           string;   // → supabase.auth.signUp({ password })
  confirmPassword:    string;   // client-side check only, never sent anywhere
  fullName:           string;   // → string in payload
  phone:              string;   // → string in payload (stripped of spaces/dashes)
  tradeSkill:         string;   // → string: "Plumber"|"Electrician"|"House Cleaner"|"Gardener"|"other"
  customCategoryName: string;   // → string? in payload (only when tradeSkill === "other")
  yearsExperience:    string;   // → parseInt(value, 10)  → number in payload
  pricingMode:        string;   // → PricingMode ("flat"|"custom_quote"|"both")
  startingPrice:      string;   // → parseFloat(value)    → number in payload
  bio:                string;   // → string? in payload (omitted when empty)

  // Manual location fallback — only validated/used when the browser
  // Geolocation API fails, times out, or is denied. See useManualLocation
  // state in the page component.
  manualLatitude:  string;   // → parseFloat(value), range -90..90
  manualLongitude: string;   // → parseFloat(value), range -180..180
}

type FormErrors = Partial<Record<keyof FormState, string>>;

/**
 * The exact shape POSTed to /api/register/artisan.
 * Mirrors ArtisanRegistrationBody in route.ts field-for-field.
 *
 * The backend's validateBody() uses `typeof value !== "number"` for numeric
 * fields, so yearsExperience and startingPrice MUST be JSON numbers — not
 * numeric strings.  JSON.stringify(NaN) → "null", which also fails the check,
 * so we validate before calling parseInt / parseFloat.
 */
interface ArtisanRegistrationPayload {
  userId:              string;   // real UUID from supabase.auth.signUp()
  fullName:            string;
  phone:               string;
  tradeSkill:          string;
  customCategoryName?: string;   // key absent entirely when tradeSkill !== "other"
  yearsExperience:     number;   // integer   — parseInt(string, 10)
  pricingMode:         PricingMode;
  startingPrice:       number;   // float     — parseFloat(string)
  bio?:                string;   // key absent entirely when empty
  latitude:            number;   // real GPS coordinate, sent as JSON number
  longitude:           number;   // real GPS coordinate, sent as JSON number
  avatarUrl?:          string;   // public URL from /api/upload/artisan-avatar, if uploaded
}

/** 201 success response shape from route.ts */
interface ApiSuccessBody {
  message:      string;
  userId:       string;
  categoryId:   number;
  categoryName: string;   // resolved display name — custom or known
}

/** Error response shape from route.ts (400 / 404 / 422 / 500) */
interface ApiErrorBody {
  message?: string;
  errors?:  string[];   // populated on 422 Validation Failed
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BIO_MAX_CHARS = 300;

/**
 * Known trade skills.
 * Each string must match a `name` column value in the `categories` table
 * exactly, because the backend does .eq("name", data.tradeSkill).
 * "other" is NOT in this array — it has its own dedicated <option>.
 */
const KNOWN_TRADE_SKILLS = [
  "Plumber",
  "Electrician",
  "House Cleaner",
  "Gardener",
] as const;

const PRICING_MODES: { value: PricingMode; label: string; hint: string }[] = [
  { value: "flat",         label: "Flat rate",     hint: "You charge a fixed price per job." },
  { value: "custom_quote", label: "Custom quote",  hint: "You quote each job individually." },
  { value: "both",         label: "Flat + quotes", hint: "You offer both depending on the job." },
];

const EMPTY_FORM: FormState = {
  email:              "",
  password:           "",
  confirmPassword:    "",
  fullName:           "",
  phone:              "",
  tradeSkill:         "",
  customCategoryName: "",
  yearsExperience:    "",
  pricingMode:        "",
  startingPrice:      "",
  bio:                "",
  manualLatitude:     "",
  manualLongitude:    "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// Mirrors the backend validateBody() checks so the user sees clear messages
// before a request is ever sent, rather than getting a 422 back.
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: FormState, useManualLocation: boolean): FormErrors {
  const errors: FormErrors = {};

  // email — required, basic shape check (Supabase does the real validation)
  if (!v.email.trim()) {
    errors.email = "Email is required.";
  } else if (!EMAIL_RE.test(v.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  // password — Supabase's default minimum is 6 chars; we ask for 8 to be safe
  if (!v.password) {
    errors.password = "Password is required.";
  } else if (v.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  // confirmPassword — client-side only, never sent to the backend
  if (!v.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (v.confirmPassword !== v.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  // fullName — backend: trim().length < 2
  if (!v.fullName.trim()) {
    errors.fullName = "Full name is required.";
  } else if (v.fullName.trim().length < 2) {
    errors.fullName = "Name must be at least 2 characters.";
  }

  // phone — backend: typeof !== "string" || falsy
  // Extra: Kenyan format check (stricter, but any valid Kenyan number passes)
  const cleanPhone = v.phone.replace(/[\s\-()]/g, "");
  if (!cleanPhone) {
    errors.phone = "M-Pesa phone number is required.";
  } else if (!/^(?:07|01|\+?2547|\+?2541)\d{7,8}$/.test(cleanPhone)) {
    errors.phone = "Enter a valid Kenyan number — e.g. 0712 345 678.";
  }

  // tradeSkill — backend: typeof !== "string" || falsy
  if (!v.tradeSkill) {
    errors.tradeSkill = "Please select your primary trade.";
  }

  // customCategoryName — backend: required + trim().length >= 2 when tradeSkill === "other"
  if (v.tradeSkill === "other") {
    if (!v.customCategoryName.trim()) {
      errors.customCategoryName = "Please specify your trade.";
    } else if (v.customCategoryName.trim().length < 2) {
      errors.customCategoryName = "Trade name must be at least 2 characters.";
    }
  }

  // yearsExperience — backend: typeof !== "number" || < 0 || > 60
  // We validate the string value here so parseInt never receives garbage
  if (!v.yearsExperience.trim()) {
    errors.yearsExperience = "Years of experience is required.";
  } else {
    const yrs = parseInt(v.yearsExperience, 10);
    if (isNaN(yrs)) {
      errors.yearsExperience = "Enter a whole number.";
    } else if (yrs < 0 || yrs > 60) {
      errors.yearsExperience = "Enter a whole number between 0 and 60.";
    }
  }

  // pricingMode — backend: !["flat","custom_quote","both"].includes(value)
  if (!v.pricingMode) {
    errors.pricingMode = "Please select how you price your work.";
  }

  // startingPrice — backend: typeof !== "number" || <= 0
  // We validate the string value here so parseFloat never receives garbage
  if (!v.startingPrice.trim()) {
    errors.startingPrice = "Starting price is required.";
  } else {
    const price = parseFloat(v.startingPrice);
    if (isNaN(price) || !isFinite(price) || price <= 0) {
      errors.startingPrice = "Enter a valid price greater than KES 0.";
    }
  }

  // manualLatitude / manualLongitude — only required when the browser
  // Geolocation API has failed and the artisan is entering location by hand.
  if (useManualLocation) {
    if (!v.manualLatitude.trim()) {
      errors.manualLatitude = "Latitude is required.";
    } else {
      const lat = parseFloat(v.manualLatitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        errors.manualLatitude = "Enter a valid latitude between -90 and 90.";
      }
    }

    if (!v.manualLongitude.trim()) {
      errors.manualLongitude = "Longitude is required.";
    } else {
      const lng = parseFloat(v.manualLongitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        errors.manualLongitude = "Enter a valid longitude between -180 and 180.";
      }
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builder
//
// Converts FormState (all strings) into ArtisanRegistrationPayload with
// the exact types the backend validator expects.  Only called after validate()
// has confirmed every field is safe to convert, after signUp() has returned a
// real userId, and after the browser has returned a real GPS fix.
// ─────────────────────────────────────────────────────────────────────────────

function buildPayload(
  v:         FormState,
  userId:    string,
  latitude:  number,
  longitude: number
): ArtisanRegistrationPayload {
  const isCustomTrade = v.tradeSkill === "other";

  const payload: ArtisanRegistrationPayload = {
    // ── Identity ──────────────────────────────────────────────────────────────
    userId,                                            // real UUID from signUp()
    fullName: v.fullName.trim(),                      // string
    phone:    v.phone.replace(/[\s\-()]/g, ""),       // string, digits only

    // ── Trade ─────────────────────────────────────────────────────────────────
    tradeSkill: v.tradeSkill,                         // string (known name or "other")

    // customCategoryName is spread in only when needed so the key is
    // entirely absent (not undefined / null) for standard trades.
    ...(isCustomTrade && {
      customCategoryName: v.customCategoryName.trim(),  // string
    }),

    // ── Business ──────────────────────────────────────────────────────────────
    // parseInt / parseFloat produce real JSON numbers, satisfying the backend's
    // `typeof !== "number"` guards.  validate() guarantees these won't be NaN.
    yearsExperience: parseInt(v.yearsExperience, 10),   // number (integer)
    pricingMode:     v.pricingMode as PricingMode,       // "flat"|"custom_quote"|"both"
    startingPrice:   parseFloat(v.startingPrice),        // number (float)

    // bio is optional on the backend (bio?: string).
    // Omit the key entirely when empty rather than sending "".
    ...(v.bio.trim() && { bio: v.bio.trim() }),          // string | omitted

    // ── Location ──────────────────────────────────────────────────────────────
    // Real coordinates from navigator.geolocation, captured before submit.
    latitude,
    longitude,
  };

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Section rule with label — the "work order" visual signature of this form */
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

/** Label + hint + inline error wrapper used by every field */
function Field({
  label,
  error,
  hint,
  children,
  optional,
}: {
  label:     string;
  error?:    string;
  hint?:     string;
  children:  ReactNode;
  optional?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        {optional && (
          <span className="text-[11px] text-slate-400">Optional</span>
        )}
      </div>
      {children}
      {/* Show hint only when there's no error so they don't compete */}
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

/** Shared Tailwind border/focus classes for all interactive inputs */
function inputCls(hasError: boolean): string {
  return [
    "w-full rounded-lg border text-sm text-slate-900 bg-white",
    "placeholder-slate-400 transition-colors",
    "focus:outline-none focus:ring-2 focus:ring-teal-500/20",
    hasError
      ? "border-red-400 focus:border-red-400"
      : "border-slate-200 focus:border-teal-500",
  ].join(" ");
}

/** Text / tel / number <input> with a leading icon */
function IconInput({
  icon,
  error,
  ...props
}: { icon: ReactNode; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        {icon}
      </div>
      <input {...props} className={`${inputCls(!!error)} pl-9 pr-3 py-2.5`} />
    </div>
  );
}

/** <select> with a leading icon and a custom chevron */
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
      <select {...props} className={`${inputCls(!!error)} appearance-none pl-9 pr-8 py-2.5`}>
        <option value="">{placeholder}</option>
        {children}
      </select>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        <ChevronDown size={14} />
      </div>
    </div>
  );
}

/**
 * Location status card — shows GPS capture state (loading / success / error)
 * with a retry button. Placed near the top of the form since latitude and
 * longitude are required before submission can succeed.
 */
function LocationStatusCard({
  status,
  errorMessage,
  onRetry,
  onUseManual,
}: {
  status:       LocationStatus;
  errorMessage: string;
  onRetry:      () => void;
  onUseManual:  () => void;
}) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <Loader2 size={16} className="animate-spin text-slate-400 flex-shrink-0" />
        <p className="text-sm text-slate-600">Getting your location…</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
        <MapPin size={16} className="text-teal-600 flex-shrink-0" />
        <p className="text-sm text-teal-700">Location captured.</p>
      </div>
    );
  }

  if (status === "denied" || status === "error") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 text-amber-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-amber-700">{errorMessage}</p>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800"
            >
              <RefreshCw size={12} />
              Try again
            </button>
            <button
              type="button"
              onClick={onUseManual}
              className="text-xs font-semibold text-amber-700 underline hover:text-amber-800"
            >
              Enter location manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  // status === "idle" — nothing rendered yet; the effect kicks off immediately
  // on mount, so this state is only visible for a split second.
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Success card
// ─────────────────────────────────────────────────────────────────────────────

function SuccessCard({
  firstName,
  resolvedCategoryName,
  userId,
  email,
}: {
  firstName:            string;
  resolvedCategoryName: string;
  userId:               string;
  email:                string;
}) {
  return (
    <div className="py-4 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 ring-8 ring-teal-50/60">
        <CheckCircle2 size={34} className="text-teal-600" />
      </div>

      <h2 className="text-xl font-bold text-slate-900">Application submitted</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500 leading-relaxed">
        Thanks,{" "}
        <span className="font-semibold text-slate-700">{firstName}</span>.
        {" "}We&apos;ll verify your details within 24 hours and SMS you when you&apos;re approved.
      </p>

      {/* Email confirmation notice — required before they can log in */}
      <div className="mx-auto mt-4 max-w-xs rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-left">
        <p className="flex items-start gap-2 text-xs text-teal-700 leading-relaxed">
          <Mail size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Check <span className="font-semibold">{email}</span> for a confirmation
            link — you&apos;ll need to confirm your account before you can log in.
          </span>
        </p>
      </div>

      {/* Display the resolved category name returned by the backend */}
      {resolvedCategoryName && (
        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5">
          <Briefcase size={13} className="text-teal-600" />
          <span className="text-xs font-semibold text-teal-700">{resolvedCategoryName}</span>
        </div>
      )}

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

      {/* Reference number — the real Supabase Auth user id */}
      <div className="mx-auto mt-6 max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Reference number
        </p>
        <p
          className="mt-1 break-all text-xs font-semibold text-slate-700"
          style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" }}
        >
          {userId}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ArtisanOnboardingPage() {
  const [values,               setValues]              = useState<FormState>(EMPTY_FORM);
  const [fieldErrors,          setFieldErrors]         = useState<FormErrors>({});
  const [status,               setStatus]              = useState<SubmitStatus>("idle");
  const [apiErrorMessage,      setApiErrorMessage]     = useState<string>("");
  const [resolvedCategoryName, setResolvedCategoryName] = useState<string>("");
  const [registeredUserId,     setRegisteredUserId]    = useState<string>("");
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [avatarError,   setAvatarError]   = useState<string>("");

  // ── Geolocation state ────────────────────────────────────────────────────
  const [coords,            setCoords]            = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus,    setLocationStatus]    = useState<LocationStatus>("idle");
  const [locationError,     setLocationError]     = useState<string>("");
  // True once the artisan clicks "Enter location manually" after the browser
  // Geolocation API fails/times out/is denied — swaps the status card for
  // two plain number inputs instead of retrying the browser API.
  const [useManualLocation, setUseManualLocation] = useState<boolean>(false);

  // Request the browser's location as soon as the form loads, so it's ready
  // by the time the artisan finishes filling in the rest of the fields.
  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatus("error");
      setLocationError("Your browser doesn't support location services. Please try a different browser.");
      return;
    }

    setLocationStatus("loading");
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude:  position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("success");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus("denied");
          setLocationError("Location access was denied. We need this to match you with nearby jobs — please allow it and try again.");
        } else if (err.code === err.TIMEOUT) {
          setLocationStatus("error");
          setLocationError("Getting your location took too long. Please try again.");
        } else {
          setLocationStatus("error");
          setLocationError("We couldn't get your location. Please try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  useEffect(() => {
    requestLocation();
    // Only run once on mount — requestLocation is stable enough for this use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Generic change handler ─────────────────────────────────────────────────
  // Handles all text / tel / number / textarea / select fields except the
  // tradeSkill dropdown, which needs extra cleanup logic (see below).
  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Eagerly clear this field's error as the user edits it
    if (fieldErrors[name as keyof FormState]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  // ── Avatar change handler ────────────────────────────────────────────────
  // Validates the chosen file client-side (mirrors the checks in
  // /api/upload/artisan-avatar) and generates a local preview URL. The file
  // itself is only uploaded later, in handleSubmit, once we have a real
  // userId from signUp().
  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setAvatarError("");
    if (!file) {
      setAvatarFile(null);
      setAvatarPreview("");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Image must be smaller than 5MB.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  // ── tradeSkill dropdown handler ─────────────────────────────────────────────
  // Separate from handleChange because switching away from "other" must also
  // clear customCategoryName state and its error — otherwise stale text can
  // still exist in state and sneak into buildPayload() via the spread.
  function handleTradeSkillChange(e: ChangeEvent<HTMLSelectElement>) {
    const selected = e.target.value;
    const leavingOther = selected !== "other";

    setValues((prev) => ({
      ...prev,
      tradeSkill: selected,
      // Wipe the custom name whenever "other" is no longer selected
      ...(leavingOther && { customCategoryName: "" }),
    }));

    setFieldErrors((prev) => ({
      ...prev,
      tradeSkill: undefined,
      ...(leavingOther && { customCategoryName: undefined }),
    }));
  }

  // ── Form submission ────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Step 1 — client-side validation (mirrors backend validateBody, plus
    // email/password/confirmPassword checks for the signup step)
    const errors = validate(values, useManualLocation);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Move keyboard focus to the first invalid field for accessibility
      const firstKey = Object.keys(errors)[0] as keyof FormState;
      document.querySelector<HTMLElement>(`[name="${firstKey}"]`)?.focus();
      return;
    }

    // Step 1b — location must be resolved before we can submit at all, since
    // the backend requires real latitude/longitude numbers. Either the
    // browser Geolocation API succeeded (coords set), or the artisan is
    // using the manual fallback (already validated above by validate()).
    let finalLatitude:  number;
    let finalLongitude: number;

    if (useManualLocation) {
      finalLatitude  = parseFloat(values.manualLatitude);
      finalLongitude = parseFloat(values.manualLongitude);
    } else if (coords) {
      finalLatitude  = coords.latitude;
      finalLongitude = coords.longitude;
    } else {
      setApiErrorMessage(
        locationStatus === "denied" || locationStatus === "error"
          ? "We still need your location to continue. Please allow location access, or enter it manually below."
          : "Still getting your location — please wait a moment and try again."
      );
      setStatus("error");
      return;
    }

    setFieldErrors({});
    setApiErrorMessage("");
    setStatus("loading");

    // Step 1c — check phone availability BEFORE creating any auth account.
    // Doing this after signUp() (the old order) meant a rejected phone left
    // behind a real, orphaned auth.users row tied to the artisan's email —
    // and since signUp() rejects an already-registered email, they'd have
    // no way to retry with the same email afterward. Checking first avoids
    // creating that account at all when we already know it'll fail.
    const cleanPhone = values.phone.replace(/[\s\-()]/g, "");

    try {
      const phoneCheckRes = await fetch("/api/register/check-phone", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone: cleanPhone }),
      });

      const phoneCheckJson = await phoneCheckRes.json().catch(() => ({}));

      if (!phoneCheckRes.ok) {
        setApiErrorMessage(phoneCheckJson.message ?? "Failed to verify phone number. Please try again.");
        setStatus("error");
        return;
      }

      if (!phoneCheckJson.available) {
        setApiErrorMessage("This phone number is already registered to another account.");
        setStatus("error");
        return;
      }
    } catch {
      setApiErrorMessage("Failed to verify phone number. Please check your connection and try again.");
      setStatus("error");
      return;
    }

    // Step 2 — create the actual Supabase Auth account.
    // auth.users gets a real row here, which fires the on_auth_user_created
    // trigger and creates the matching public.users row before we ever touch
    // artisan_profiles. The phone availability check above already ran, so
    // this account won't immediately become orphaned by that specific failure.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email:    values.email.trim(),
      password: values.password,
      options: {
        // Without this, Supabase falls back to the project's "Site URL"
        // setting, which may not point at a real page in this app.
        emailRedirectTo: `${window.location.origin}/onboarding/confirmed`,
      },
    });

    if (signUpError) {
      // Common case: "User already registered" — surface it plainly rather
      // than a generic failure message.
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

    // Step 2b — upload avatar (optional). Runs after signUp() since the
    // upload route needs a real userId to build the storage path.
    let avatarUrl: string | undefined;

    if (avatarFile) {
      try {
        const avatarFormData = new FormData();
        avatarFormData.append("file", avatarFile);
        avatarFormData.append("userId", userId);

        const avatarRes = await fetch("/api/upload/artisan-avatar", {
          method: "POST",
          body: avatarFormData,
        });
        const avatarJson = await avatarRes.json().catch(() => ({}));

        if (avatarRes.ok) {
          avatarUrl = avatarJson.avatarUrl;
        } else {
          // Non-fatal — the artisan can be reminded to add a photo later
          // rather than blocking the entire registration on an image upload.
          console.warn("[onboarding] Avatar upload failed:", avatarJson);
        }
      } catch (err) {
        console.warn("[onboarding] Avatar upload failed:", err);
      }
    }

    // Step 3 — build payload with proper JSON types, using the real
    // Supabase-issued userId and the real GPS coordinates.
    const payload = { ...buildPayload(values, userId, finalLatitude, finalLongitude), ...(avatarUrl && { avatarUrl }) };

    // Step 4 — POST to /api/register/artisan
    try {
      const res = await fetch("/api/register/artisan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        // 422 responses include an `errors` string array with individual messages
        const json = await res.json().catch(() => ({})) as ApiErrorBody;
        const detail =
          json.errors && json.errors.length > 0
            ? json.errors.join(" • ")
            : (json.message ?? `Unexpected error — server returned ${res.status}.`);
        throw new Error(detail);
      }

      // Step 5 — read the 201 body to get the backend-resolved category name
      // (important for custom categories — the backend trims and saves it)
      const result = await res.json() as ApiSuccessBody;
      setResolvedCategoryName(result.categoryName ?? values.tradeSkill);
      setRegisteredUserId(userId);
      setStatus("success");

    } catch (err) {
      setApiErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again."
      );
      setStatus("error");
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const isCustomTrade = values.tradeSkill === "other";
  const pricingHint   = PRICING_MODES.find((m) => m.value === values.pricingMode)?.hint;
  const bioLength     = values.bio.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-lg">

        {/* ── Card ─────────────────────────────────────────────────────────── */}
        <div
          className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5"
          style={{ borderTop: "4px solid #0D9488" /* teal-600 */ }}
        >

          {/* Card header */}
          <div className="px-6 pt-7 pb-2 sm:px-8">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-[#F5B700] font-black text-base leading-none select-none">
                <Wrench size={16} />
              </div>
              <span className="text-sm font-bold text-slate-900 tracking-tight">Huduma Connect</span>
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

          <div className="mx-6 mt-5 h-px bg-slate-100 sm:mx-8" />

          {/* Card body */}
          <div className="px-6 pb-8 sm:px-8">

            {/* ── Location status ─────────────────────────────────────────── */}
            {status !== "success" && !useManualLocation && (
              <div className="mt-6">
                <LocationStatusCard
                  status={locationStatus}
                  errorMessage={locationError}
                  onRetry={requestLocation}
                  onUseManual={() => setUseManualLocation(true)}
                />
              </div>
            )}

            {/*
              Manual location fallback — shown once the artisan opts in after
              the browser Geolocation API failed. Swaps out entirely for the
              status card above rather than showing both at once.
            */}
            {status !== "success" && useManualLocation && (
              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <MapPin size={14} className="text-slate-400" />
                    Enter your location manually
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setUseManualLocation(false);
                      requestLocation();
                    }}
                    className="text-xs font-semibold text-teal-600 hover:text-teal-700"
                  >
                    Use my location instead
                  </button>
                </div>
                <p className="mb-3 text-[11px] text-slate-400 leading-snug">
                  Find your coordinates by searching your address on Google Maps,
                  right-clicking your location, and copying the two numbers shown.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude" error={fieldErrors.manualLatitude}>
                    <IconInput
                      icon={<MapPin size={15} />}
                      type="number"
                      name="manualLatitude"
                      placeholder="e.g. -1.0467"
                      step="any"
                      value={values.manualLatitude}
                      onChange={handleChange}
                      inputMode="decimal"
                      error={fieldErrors.manualLatitude}
                    />
                  </Field>
                  <Field label="Longitude" error={fieldErrors.manualLongitude}>
                    <IconInput
                      icon={<MapPin size={15} />}
                      type="number"
                      name="manualLongitude"
                      placeholder="e.g. 37.15"
                      step="any"
                      value={values.manualLongitude}
                      onChange={handleChange}
                      inputMode="decimal"
                      error={fieldErrors.manualLongitude}
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* ── API error alert ─────────────────────────────────────────── */}
            {status === "error" && (
              <div className="mt-4 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Submission failed</p>
                  <p className="mt-0.5 text-xs text-red-600 leading-snug">{apiErrorMessage}</p>
                </div>
              </div>
            )}

            {/* ── Success state ────────────────────────────────────────────── */}
            {status === "success" ? (
              <div className="mt-6">
                <SuccessCard
                  firstName={values.fullName.trim().split(" ")[0]}
                  resolvedCategoryName={resolvedCategoryName}
                  userId={registeredUserId}
                  email={values.email.trim()}
                />
              </div>
            ) : (

              /* ── Form ─────────────────────────────────────────────────── */
              <form onSubmit={handleSubmit} noValidate>
                {/*
                  fieldset[disabled] locks every child input/select/button
                  while the request is in-flight — one prop replaces N per-field
                  disabled attributes.
                */}
                <fieldset disabled={status === "loading"} className="space-y-4 disabled:opacity-60">

                  {/* ── SECTION 0: Account ─────────────────────────────────── */}
                  <SectionRule label="Account" />

                  {/* email → supabase.auth.signUp({ email }) — never sent to /api/register/artisan */}
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

                  {/* password → supabase.auth.signUp({ password }) */}
                  <Field label="Password" error={fieldErrors.password} hint="At least 8 characters.">
                    <IconInput
                      icon={<Lock size={15} />}
                      type="password"
                      name="password"
                      placeholder="••••••••"
                      value={values.password}
                      onChange={handleChange}
                      autoComplete="new-password"
                      error={fieldErrors.password}
                    />
                  </Field>

                  {/* confirmPassword → client-side check only */}
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

                  {/* ── SECTION 1: Personal Information ───────────────────── */}
                  <SectionRule label="Personal Information" />

                  {/* avatarFile → uploaded separately after signUp(), see handleSubmit Step 2b */}
                  <Field label="Profile Picture" optional error={avatarError}>
                    <div className="flex items-center gap-4">
                      {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarPreview}
                          alt="Preview"
                          className="h-16 w-16 rounded-full object-cover ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-300">
                          <User size={24} />
                        </div>
                      )}
                      <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        Choose photo
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </Field>

                  {/* fullName → string */}
                  <Field label="Full Name" error={fieldErrors.fullName}>
                    <IconInput
                      icon={<User size={15} />}
                      type="text"
                      name="fullName"
                      placeholder="e.g. James Mwangi"
                      value={values.fullName}
                      onChange={handleChange}
                      autoComplete="name"
                      error={fieldErrors.fullName}
                    />
                  </Field>

                  {/* phone → string (stripped of spaces/dashes in buildPayload) */}
                  <Field
                    label="M-Pesa Phone Number"
                    error={fieldErrors.phone}
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
                      error={fieldErrors.phone}
                    />
                  </Field>

                  {/* ── SECTION 2: Trade Details ───────────────────────────── */}
                  <SectionRule label="Trade Details" />

                  {/*
                    tradeSkill → string
                    Known values match the `name` column in `categories` exactly.
                    "other" triggers the customCategoryName insertion path on the backend.
                  */}
                  <Field label="Primary Trade Skill" error={fieldErrors.tradeSkill}>
                    <IconSelect
                      icon={<Briefcase size={15} />}
                      name="tradeSkill"
                      placeholder="Select your trade…"
                      value={values.tradeSkill}
                      onChange={handleTradeSkillChange}
                      error={fieldErrors.tradeSkill}
                    >
                      {KNOWN_TRADE_SKILLS.map((skill) => (
                        <option key={skill} value={skill}>{skill}</option>
                      ))}
                      <option disabled>──────────</option>
                      <option value="other">Other (Specify...)</option>
                    </IconSelect>
                  </Field>

                  {/*
                    customCategoryName → string (only in payload when tradeSkill === "other")
                    Conditionally rendered; autoFocus moves keyboard here immediately.
                  */}
                  {isCustomTrade && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                      <Field
                        label="Specify Your Trade"
                        error={fieldErrors.customCategoryName}
                        hint="This will be reviewed and added to our category list."
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
                          error={fieldErrors.customCategoryName}
                        />
                      </Field>
                    </div>
                  )}

                  {/*
                    yearsExperience → number (integer)
                    Stored as string in state; buildPayload() calls parseInt(value, 10).
                    Backend check: typeof !== "number" || < 0 || > 60
                  */}
                  <Field
                    label="Years of Experience"
                    error={fieldErrors.yearsExperience}
                    hint="Enter 0 if you're just starting out — everyone begins somewhere."
                  >
                    <IconInput
                      icon={<Award size={15} />}
                      type="number"
                      name="yearsExperience"
                      placeholder="e.g. 5"
                      min={0}
                      max={60}
                      step={1}
                      value={values.yearsExperience}
                      onChange={handleChange}
                      inputMode="numeric"
                      error={fieldErrors.yearsExperience}
                    />
                  </Field>

                  {/* ── SECTION 3: Business Setup ──────────────────────────── */}
                  <SectionRule label="Business Setup" />

                  {/*
                    pricingMode → "flat" | "custom_quote" | "both"
                    The <option> values below match the backend's allowed strings exactly.
                    Backend check: !["flat","custom_quote","both"].includes(value)
                  */}
                  <Field
                    label="Pricing Mode"
                    error={fieldErrors.pricingMode}
                    hint={pricingHint}
                  >
                    <IconSelect
                      icon={<Tag size={15} />}
                      name="pricingMode"
                      placeholder="How do you price your work?"
                      value={values.pricingMode}
                      onChange={handleChange}
                      error={fieldErrors.pricingMode}
                    >
                      {PRICING_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </IconSelect>
                  </Field>

                  {/*
                    startingPrice → number (float)
                    Stored as string in state; buildPayload() calls parseFloat(value).
                    Backend check: typeof !== "number" || <= 0
                  */}
                  <Field
                    label="Starting Price (KES)"
                    error={fieldErrors.startingPrice}
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
                      step="any"
                      value={values.startingPrice}
                      onChange={handleChange}
                      inputMode="decimal"
                      error={fieldErrors.startingPrice}
                    />
                  </Field>

                  {/*
                    bio → string (optional)
                    Omitted from payload entirely when empty (key not sent, not "").
                    Backend field: bio?: string
                  */}
                  <Field label="Professional Bio" error={fieldErrors.bio} optional>
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
                        className={`${inputCls(!!fieldErrors.bio)} resize-none pl-9 pr-3 py-2.5`}
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
                               py-3 text-sm font-semibold text-white shadow-sm transition-colors
                               hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-teal-500 focus-visible:ring-offset-2
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
                    By submitting you agree to Huduma Connect&apos;s{" "}
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

        {/* Already registered */}
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