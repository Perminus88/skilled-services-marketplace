import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowRight, ShieldCheck, Wallet, MapPinned, Wrench,
  Zap, PaintBucket, Hammer, Droplet, Scissors, Truck,
  Sparkles, Flower2, ChevronRight,
} from "lucide-react";
import { HeroSearch } from "./_components/HeroSearch";
import { Reveal } from "./_components/Reveal";
import { RadarGraphic } from "./_components/RadarGraphic";

function LandingArtisanPreview({ categories }: { categories: Array<{ id: string; name: string; slug: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const Icon = CATEGORY_ICONS[category.slug] ?? Wrench;

        return (
          <div
            key={category.id}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Icon size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{category.name}</p>
              <p className="text-xs text-slate-500">Top-rated nearby</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const metadata: Metadata = {
  title: "Huduma Connect — Verified artisans, near you",
  description:
    "Find verified electricians, plumbers, painters and more near you. Pay safely through M-Pesa, held until the job's confirmed done.",
};

// Category icon mapping — falls back to Wrench for any trade not listed
// here. Slugs match the app's toSlug() convention (lowercase, hyphenated).
// "electrician", "plumber", "house-cleaner", "gardener" are the known
// built-in trades; anything else comes from an artisan's free-text entry
// at signup, so this can't cover every possible slug — the fallback
// handles those gracefully.
const CATEGORY_ICONS: Record<string, typeof Wrench> = {
  electrician:     Zap,
  plumber:         Droplet,
  "house-cleaner": Sparkles,
  gardener:        Flower2,
  painter:         PaintBucket,
  carpenter:       Hammer,
  mason:           Hammer,
  mover:           Truck,
  tailor:          Scissors,
};
async function getCategories() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("[landing] Missing Supabase env vars", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return [];
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("name", { ascending: true });

  if (error) {
    console.error("[landing] categories fetch failed:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }
  return data ?? [];
}

export default async function LandingPage() {
  const categories = await getCategories();

  return (
    <div className="bg-white">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-[#F5B700] font-black text-base leading-none select-none">
              <Wrench size={16} />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              Huduma Connect
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/login" className="text-sm font-semibold text-teal-50 hover:text-white">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-50"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="bg-blueprint-grid relative overflow-hidden bg-[#0B4F4A] pb-20 pt-32 sm:pb-28 sm:pt-40">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 15% 20%, rgba(13,148,136,0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(245,183,0,0.12), transparent 40%)",
          }}
        />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-teal-200/80">
              Verified artisans · Near you · Paid safely
            </p>
            <h1 className="font-display mt-4 text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-6xl">
              Find a trusted artisan before your tea gets cold.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-teal-50/85 sm:text-lg">
              Electricians, plumbers, painters and more — reviewed by us, rated by your
              neighbours, paid safely through M-Pesa.
            </p>

            <div className="mt-8">
              <HeroSearch />
            </div>

            <p className="mt-5 max-w-md text-xs leading-relaxed text-teal-100/60">
              Every artisan is reviewed before they can take a job. Your payment stays
              held until you confirm the work&apos;s done.
            </p>
          </div>

          <div className="hidden lg:block">
            <RadarGraphic />
          </div>
        </div>
      </section>

      {/* ── Popular artisans near you (live) ─────────────────────────────── */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              Popular right now
            </p>
            <h2 className="font-display mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              Whatever the job, there&apos;s someone for it
            </h2>
          </Reveal>

          <Reveal className="mt-8">
            <LandingArtisanPreview categories={categories} />
          </Reveal>
        </section>
      )}

      {/* ── How it works (real sequence — numbering earned) ────────────── */}
      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              How it works
            </p>
            <h2 className="font-display mt-2 max-w-xl text-2xl font-bold text-slate-900 sm:text-3xl">
              Four steps, and everyone&apos;s covered
            </h2>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01",
                title: "Tell us what's wrong",
                body: "Describe the job, or search by trade — leaking tap, faulty socket, fresh coat of paint.",
              },
              {
                n: "02",
                title: "Get matched nearby",
                body: "See verified artisans close to you, with real prices and real reviews.",
              },
              {
                n: "03",
                title: "Pay once you agree",
                body: "Your payment moves through M-Pesa and stays held with us — not with them, yet.",
              },
              {
                n: "04",
                title: "Confirm, and you're covered",
                body: "Mark the job done, or give it 48 hours. Either way, both sides are protected.",
              },
            ].map((step) => (
              <Reveal key={step.n}>
                <p className="font-display text-3xl font-bold text-teal-600/30">{step.n}</p>
                <h3 className="mt-3 text-base font-bold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why trust us (real differentiators) ─────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {[
            {
              Icon: ShieldCheck,
              title: "Verified, not just signed up",
              body: "Every artisan is personally reviewed before they can take a single job.",
            },
            {
              Icon: Wallet,
              title: "Your money, held safely",
              body: "Payment sits with us until the work is confirmed complete — not before.",
            },
            {
              Icon: MapPinned,
              title: "Genuinely near you",
              body: "We match on real distance to where you are, not just the same city.",
            },
          ].map(({ Icon, title, body }) => (
            <Reveal key={title}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Dual-audience: artisan recruitment ──────────────────────────── */}
      <section className="bg-[#0F172A] py-16 sm:py-20">
        <Reveal className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              Good with your hands? Turn it into steady work.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
              Set your own prices, choose your own hours, and get paid safely for every
              job — no chasing clients, no cash disputes.
            </p>
          </div>
          <Link
            href="/signup"
            className="group flex flex-shrink-0 items-center gap-2 rounded-lg bg-[#F5B700] px-6 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-[#ffc61a]"
          >
            Join as an artisan
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[#F5B700] font-black text-sm leading-none select-none">
              <Wrench size={14} />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Huduma Connect
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs font-medium text-slate-500">
            <Link href="/discovery" className="flex items-center gap-0.5 hover:text-slate-700">
              Find an artisan <ChevronRight size={12} />
            </Link>
            <Link href="/signup" className="hover:text-slate-700">Join as an artisan</Link>
            <Link href="/login" className="hover:text-slate-700">Sign in</Link>
            <a href="/terms.html" target="_blank" className="hover:text-slate-700">
             Terms & Conditions
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}