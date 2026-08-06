"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Globe, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LanguageSwitcher() {
  const t = useTranslations("common");
  const currentLocale = useLocale();
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  async function handleChange(locale: "en" | "sw") {
    if (locale === currentLocale || updating) return;
    setUpdating(true);

    // Best-effort — if there's no session, this route still sets the
    // cookie and just skips the DB sync.
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    try {
      await fetch("/api/user/language", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        body: JSON.stringify({ locale }),
      });
      // Re-fetch server components so next-intl picks up the new cookie.
      router.refresh();
    } catch (err) {
      console.error("[LanguageSwitcher] Failed to change language:", err);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Globe size={13} />
        {t("language")}
      </span>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {([
          { key: "en" as const, label: t("english") },
          { key: "sw" as const, label: t("swahili") },
        ]).map((opt) => (
          <button
            key={opt.key}
            disabled={updating}
            onClick={() => handleChange(opt.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
              currentLocale === opt.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {updating && currentLocale !== opt.key ? (
              <Loader2 size={11} className="animate-spin" />
            ) : null}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}