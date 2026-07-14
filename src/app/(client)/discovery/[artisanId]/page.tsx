"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Briefcase, Star, MapPin, Loader2, AlertTriangle,
  CheckCircle2, ArrowLeft, Calendar,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ArtisanDetail {
  userId:          string;
  fullName:        string;
  bio:             string | null;
  yearsExperience: number | null;
  availability:    "available" | "busy" | "offline" | null;
  startingPrice:   number | null;
  pricingType:     string | null;
  ratingAvg:       number | null;
  ratingCount:     number | null;
  categoryId:      number | null;
  categoryName:    string | null;
}

type PageStatus   = "loading" | "ready" | "error" | "not_found";
type BookingStatus = "idle" | "submitting" | "success" | "error";

const FALLBACK_COORDS = { latitude: -1.0467, longitude: 37.15 };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatPricingType(type: string | null): string {
  if (type === "flat") return "Flat rate";
  if (type === "custom_quote") return "Custom quote";
  if (type === "both") return "Flat rate + quotes";
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ArtisanDetailPage() {
  const params = useParams<{ artisanId: string }>();
  const router = useRouter();

  const [artisan,     setArtisan]     = useState<ArtisanDetail | null>(null);
  const [pageStatus,  setPageStatus]  = useState<PageStatus>("loading");

  const [description, setDescription] = useState("");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("idle");
  const [bookingError,  setBookingError]  = useState("");
  const [bookingResult, setBookingResult] = useState<{ status: string; quotedPrice: number | null } | null>(null);

  useEffect(() => {
    async function loadArtisan() {
      try {
        const res = await fetch(`/api/discovery/artisan/${params.artisanId}`);
        if (res.status === 404) {
          setPageStatus("not_found");
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message ?? "Failed to load artisan.");
        setArtisan(json.artisan);
        setPageStatus("ready");
      } catch (err) {
        console.error("[artisan detail] load failed:", err);
        setPageStatus("error");
      }
    }
    if (params.artisanId) loadArtisan();
  }, [params.artisanId]);

  async function handleBookingSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!artisan) return;

    if (description.trim().length < 5) {
      setBookingError("Please describe what you need in a bit more detail.");
      setBookingStatus("error");
      return;
    }

    setBookingStatus("submitting");
    setBookingError("");

    // Step 1 — confirm the client is actually logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      router.push("/login");
      return;
    }

    // Step 2 — get location, same fallback pattern as discovery
    const coords: { latitude: number; longitude: number } = await new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        resolve(FALLBACK_COORDS);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(FALLBACK_COORDS),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    });

    // Step 3 — create the booking
    try {
      const res = await fetch("/api/bookings/create", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId:    user.id,
          artisanId:   artisan.userId,
          categoryId:  artisan.categoryId,
          description: description.trim(),
          latitude:    coords.latitude,
          longitude:   coords.longitude,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.message ?? "Failed to send booking request.");
      }

      setBookingResult({ status: json.status, quotedPrice: json.quotedPrice });
      setBookingStatus("success");
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBookingStatus("error");
    }
  }

  // ── Loading / error / not-found states ────────────────────────────────────
  if (pageStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (pageStatus === "not_found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-600 font-medium">Artisan not found</p>
          <a href="/discovery" className="mt-3 inline-block text-sm text-teal-600 hover:underline">
            Back to discovery
          </a>
        </div>
      </div>
    );
  }

  if (pageStatus === "error" || !artisan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
          <p className="text-slate-600 font-medium">Something went wrong loading this profile.</p>
        </div>
      </div>
    );
  }

  const initials = artisan.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">

        <a href="/discovery" className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14} /> Back to discovery
        </a>

        {/* Profile card */}
        <div
          className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5"
          style={{ borderTop: "4px solid #0D9488" }}
        >
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-teal-50 text-lg font-bold text-teal-700">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-xl font-bold text-slate-900">{artisan.fullName}</h1>
                  {artisan.availability === "available" && (
                    <span className="flex-shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                      Available
                    </span>
                  )}
                </div>
                {artisan.categoryName && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <Briefcase size={13} /> {artisan.categoryName}
                    {artisan.yearsExperience != null && ` · ${artisan.yearsExperience} yrs experience`}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-sm">
                  {artisan.ratingCount ? (
                    <span className="flex items-center gap-1 text-slate-600">
                      <Star size={13} className="fill-amber-400 text-amber-400" />
                      {artisan.ratingAvg?.toFixed(1)} ({artisan.ratingCount})
                    </span>
                  ) : (
                    <span className="text-slate-400">No reviews yet</span>
                  )}
                </div>
              </div>
            </div>

            {artisan.bio && <p className="mt-4 text-sm leading-relaxed text-slate-600">{artisan.bio}</p>}

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              {artisan.startingPrice != null ? (
                <p className="text-sm font-bold text-slate-900">
                  From KES {artisan.startingPrice.toLocaleString()}
                  <span className="ml-1.5 font-normal text-slate-400">{formatPricingType(artisan.pricingType)}</span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-slate-400">Quote on request</p>
              )}
            </div>
          </div>
        </div>

        {/* Booking form / result */}
        <div
          className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5"
          style={{ borderTop: "4px solid #0D9488" }}
        >
          <div className="p-6 sm:p-8">
            {bookingStatus === "success" && bookingResult ? (
              <div className="py-4 text-center">
                <CheckCircle2 size={32} className="mx-auto mb-3 text-teal-600" />
                <h2 className="text-lg font-bold text-slate-900">Request sent</h2>
                <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
                  {artisan.fullName} will review your request and respond soon.
                  {bookingResult.quotedPrice != null && (
                    <> Estimated price: <span className="font-semibold">KES {bookingResult.quotedPrice.toLocaleString()}</span>.</>
                  )}
                </p>
                <a
                  href="/client/dashboard"
                  className="mt-5 inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  View your bookings
                </a>
              </div>
            ) : (
              <>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <Calendar size={16} className="text-teal-600" />
                  Request this artisan
                </h2>

                {bookingStatus === "error" && (
                  <div className="mt-4 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-500" />
                    <p className="text-sm text-red-700">{bookingError}</p>
                  </div>
                )}

                <form onSubmit={handleBookingSubmit} className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      What do you need done?
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Kitchen tap is leaking, needs replacing"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={bookingStatus === "submitting"}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {bookingStatus === "submitting" ? (
                      <><Loader2 size={16} className="animate-spin" /> Sending request…</>
                    ) : (
                      "Request booking"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}