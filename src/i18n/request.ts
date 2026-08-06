import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

// ─────────────────────────────────────────────────────────────────────────────
// No URL-based locale routing (no /en/... or /sw/... segments) — the
// language switcher lives in each dashboard's settings area instead, so
// locale is tracked via a cookie. Logged-in users' choice is also saved to
// users.preferred_language so it persists across devices/browsers (synced
// on login — see /api/user/language).
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPORTED_LOCALES = ["en", "sw"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  const locale: SupportedLocale =
    cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)
      ? (cookieLocale as SupportedLocale)
      : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});