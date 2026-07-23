"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [codeStatus, setCodeStatus] = useState<
    { kind: "idle" } | { kind: "verifying" } | { kind: "error"; message: string }
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    const supabase = createClient();
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setStatus({ kind: "error", message: error.message });
      } else {
        router.push("/songs");
        router.refresh();
      }
      return;
    }
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

  /**
   * Verifies the 6-digit code the same email carries alongside the magic
   * link ({{ .Token }} in the Supabase email template). Works in any
   * browser — the fix for the Gmail-in-app-browser trap, where the PKCE
   * `?code=` link opens in a different browser than the one that sent it.
   */
  async function submitCode() {
    setCodeStatus({ kind: "verifying" });
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) {
      setCodeStatus({ kind: "error", message: error.message });
    } else {
      router.push("/songs");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
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
      {mode === "password" && (
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}
      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {status.kind === "sending"
          ? mode === "password"
            ? "Signing in…"
            : "Sending…"
          : mode === "password"
            ? "Sign in"
            : "Send magic link"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "magic" ? "password" : "magic"));
          setStatus({ kind: "idle" });
        }}
        className="w-full text-center text-xs text-blue-600 hover:underline"
      >
        {mode === "magic"
          ? "Use a password instead"
          : "Use a magic link instead"}
      </button>
      {status.kind === "sent" && (
        <div className="space-y-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <p>
            Open the link on this device, or enter the 6-digit code from the
            email — use the code if the email opens in a different browser
            (e.g. Gmail&apos;s in-app browser on iPhone).
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm tracking-widest text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={submitCode}
              disabled={codeStatus.kind === "verifying" || code.length !== 6}
              className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {codeStatus.kind === "verifying" ? "Verifying…" : "Sign in with code"}
            </button>
          </div>
          {codeStatus.kind === "error" && (
            <p className="text-rose-700">{codeStatus.message}</p>
          )}
        </div>
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
        Use an emailed magic link or code, or a password if you&apos;ve set
        one.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
