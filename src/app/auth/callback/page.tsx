"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    async function completeSignIn() {
      // Exchanges the ?code=... param Google/Supabase attached to this URL
      // for a real session. Required for the PKCE flow used by
      // signInWithOAuth() — the browser client doesn't do this
      // automatically the way it does for the older implicit/hash flow.
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      );

      if (exchangeError) {
        console.error("[auth/callback] Code exchange failed:", exchangeError);
        setError("We couldn't complete your sign-in. Please try again.");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError("We couldn't complete your sign-in. Please try again.");
        return;
      }

      // Ensures role is correctly set to 'client' for new Google sign-ins
      // (handle_new_user() defaults to 'artisan' since OAuth can't carry
      // the same signup metadata as supabase.auth.signUp() does).
      let role = "artisan";
      try {
        const res = await fetch("/api/auth/google-client-setup", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.role) {
          role = json.role;
        }
      } catch (err) {
        console.error("[auth/callback] google-client-setup failed:", err);
        // Non-fatal — fall through and route based on best-effort default.
      }

      if (role === "client") {
        router.push("/client/dashboard");
      } else if (role === "admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/status");
      }
      router.refresh();
    }

    completeSignIn();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        {error ? (
          <>
            <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
            <p className="text-slate-600">{error}</p>
            <a
              href="/login"
              className="mt-4 inline-block text-sm font-semibold text-teal-600 hover:text-teal-700"
            >
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <Loader2 size={28} className="mx-auto mb-3 animate-spin text-slate-400" />
            <p className="text-sm text-slate-500">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}