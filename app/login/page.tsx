"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const urlError = searchParams.get("error");

  if (!isSupabaseConfigured) {
    return (
      <p className="text-sm text-slate-600">
        Supabase is not configured, so sign-in is unavailable. Copy{" "}
        <code className="rounded bg-slate-200 px-1">.env.example</code> to{" "}
        <code className="rounded bg-slate-200 px-1">.env.local</code> and fill
        in your project keys. Meanwhile you can browse the demo song from the
        library.
      </p>
    );
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
    } else {
      setStatus({ kind: "sent" });
    }
  }

  return (
    <form onSubmit={sendMagicLink} className="space-y-4">
      {urlError && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {urlError}
        </p>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          placeholder="you@example.com"
        />
      </div>
      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {status.kind === "sending" ? "Sending…" : "Send magic link"}
      </button>
      {status.kind === "sent" && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Check your email for the sign-in link.
        </p>
      )}
      {status.kind === "error" && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {status.message}
        </p>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto mt-12 max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-xl font-bold">Sign in</h1>
      <p className="mb-4 text-sm text-slate-500">
        SongMap uses passwordless magic links.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
