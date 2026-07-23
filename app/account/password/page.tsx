"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Lets a passwordless (magic-link/code) user set a password so future
 * sign-ins don't depend on an email round trip. `has_password` is stamped
 * into user_metadata on success so the library's PasswordNudge banner
 * knows to stop asking.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "done" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setChecking(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setChecking(false);
    });
  }, [router]);

  if (!isSupabaseConfigured) {
    return (
      <p className="mx-auto mt-12 max-w-sm text-sm text-slate-600">
        Supabase is not configured, so accounts are unavailable.
      </p>
    );
  }

  if (checking) {
    return <p className="mx-auto mt-12 max-w-sm text-sm text-slate-500">Loading…</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setStatus({ kind: "error", message: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setStatus({ kind: "error", message: "Passwords don't match." });
      return;
    }
    setStatus({ kind: "saving" });
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password,
      data: { has_password: true },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
    } else {
      setStatus({ kind: "done" });
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-xl font-bold">Set a password</h1>
      <p className="mb-4 text-sm text-slate-500">
        Add a password so you can sign in without waiting on an email every
        time.
      </p>
      {status.kind === "done" ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Password set.{" "}
          <Link href="/songs" className="font-semibold underline">
            Back to your library
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={status.kind === "saving"}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {status.kind === "saving" ? "Saving…" : "Set password"}
          </button>
          {status.kind === "error" && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {status.message}
            </p>
          )}
          <Link
            href="/songs"
            className="block text-center text-xs text-blue-600 hover:underline"
          >
            Not now
          </Link>
        </form>
      )}
    </div>
  );
}
