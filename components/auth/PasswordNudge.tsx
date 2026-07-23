"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const DISMISS_KEY = "songmap:password-nudge-dismissed";

/**
 * Dismissible one-liner nudging passwordless (magic-link/code) users to set
 * a password, so future sign-ins don't need an email round trip. Hides
 * itself when: unconfigured, signed out, already has a password
 * (user_metadata.has_password), or previously dismissed on this device.
 * The library page is a server component, so this fetches the user
 * client-side rather than requiring a prop plumb-through.
 */
export function PasswordNudge() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY)) {
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.user_metadata?.has_password !== true) {
        setVisible(true);
      }
    });
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
      <p>
        Tip: set a password so you don&apos;t need an email link every time
        →{" "}
        <Link href="/account/password" className="font-semibold underline">
          Set password
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-blue-500 hover:text-blue-700"
      >
        ✕
      </button>
    </div>
  );
}
