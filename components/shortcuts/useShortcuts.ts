"use client";

import { useEffect, useRef } from "react";

/**
 * One keyboard binding: `key` is KeyboardEvent.key, optionally prefixed
 * "shift+" (e.g. "shift+z"). `label` names the action in the ? overlay.
 */
export interface ShortcutBinding {
  key: string;
  label: string;
  /** Display form for the overlay; derived from `key` when omitted. */
  keyLabel?: string;
  /** Skip the binding (and hide it from the overlay) when false. */
  when?: () => boolean;
  run: () => void;
}

function matches(binding: string, e: KeyboardEvent): boolean {
  const wantShift = binding.startsWith("shift+");
  const key = wantShift ? binding.slice("shift+".length) : binding;
  if (key.length === 1) {
    // Character keys match what the keystroke produced, so "?" works on
    // any layout; the shift+ form asks for the modifier explicitly.
    return wantShift ? e.shiftKey && e.key.toLowerCase() === key : e.key === key;
  }
  return e.key === key && e.shiftKey === wantShift;
}

/**
 * Desktop keyboard shortcuts, additive only: never fires while typing in a
 * field, never shadows browser/OS chords (meta/ctrl/alt pass through), and
 * preventDefault()s only the keys it handles (so Space doesn't also
 * scroll). Mobile is untouched — no keyboard, no behavior.
 */
export function useShortcuts(bindings: ShortcutBinding[]): void {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      for (const b of ref.current) {
        if (!matches(b.key, e)) continue;
        if (b.when && !b.when()) continue;
        e.preventDefault();
        b.run();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
};

/** Overlay display form of a binding's key. */
export function shortcutKeyLabel(b: ShortcutBinding): string {
  if (b.keyLabel) return b.keyLabel;
  const wantShift = b.key.startsWith("shift+");
  const key = wantShift ? b.key.slice("shift+".length) : b.key;
  const label = KEY_LABELS[key] ?? (key.length === 1 ? key : key);
  return wantShift ? `⇧${label}` : label;
}
