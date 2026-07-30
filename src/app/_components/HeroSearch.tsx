"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);

  function goToDiscovery(withLocationHint: boolean) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());

    if (withLocationHint && "geolocation" in navigator) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        () => router.push(`/discovery?${params.toString()}`),
        () => router.push(`/discovery?${params.toString()}`),
        { timeout: 5000 }
      );
      return;
    }
    router.push(`/discovery?${params.toString()}`);
  }

  return (
    <div className="w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          goToDiscovery(true);
        }}
        className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-xl shadow-black/20 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What needs fixing? e.g. leaking tap"
            className="w-full rounded-xl py-3 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={locating}
          className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-70"
        >
          {locating ? <Loader2 size={15} className="animate-spin" /> : null}
          {locating ? "Finding your area…" : "Find help"}
        </button>
      </form>

      <button
        onClick={() => goToDiscovery(false)}
        className="mt-3 text-sm font-medium text-teal-100/90 underline decoration-teal-300/40 underline-offset-4 hover:text-white"
      >
        or browse everyone near you →
      </button>
    </div>
  );
}