"use client";

import { useState, useTransition } from "react";
import { setSongStatus, setVersionLabel } from "@/app/songs/status-actions";
import type { SongStatus } from "@/lib/song/types";
import { normalizeStatus, StatusBadge } from "./StatusBadge";

/**
 * The Library's completion tracker, shown on the song page. Deliberately
 * calm — this is a reading surface, not a form — so it's one badge plus a
 * couple of small text buttons, not a control panel.
 */
export function StatusControl({
  songId,
  status,
  versionLabel,
}: {
  songId: string;
  status: SongStatus | null | undefined;
  versionLabel: string | null | undefined;
}) {
  const [current, setCurrent] = useState<SongStatus>(normalizeStatus(status));
  const [label, setLabel] = useState(versionLabel ?? "");
  const [editingLabel, setEditingLabel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const applyStatus = (next: SongStatus) => {
    const prev = current;
    setCurrent(next); // optimistic — this is a deliberate, low-risk toggle
    setError(null);
    startTransition(async () => {
      const result = await setSongStatus(songId, next);
      if (!result.ok) {
        setCurrent(prev);
        setError(result.error ?? "Couldn't save status");
      }
    });
  };

  const saveLabel = () => {
    setEditingLabel(false);
    const trimmed = label.trim();
    if (trimmed === (versionLabel ?? "")) return;
    startTransition(async () => {
      const result = await setVersionLabel(songId, trimmed);
      if (!result.ok) setError(result.error ?? "Couldn't save version label");
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
      <StatusBadge status={current} />

      {editingLabel ? (
        <input
          autoFocus
          value={label}
          maxLength={40}
          placeholder="e.g. acoustic, capo 3, live"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={saveLabel}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setLabel(versionLabel ?? "");
              setEditingLabel(false);
            }
          }}
          className="w-44 rounded-md border border-slate-300 px-2 py-0.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingLabel(true)}
          className="rounded-md px-2 py-0.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          title="Set a version label to tell this apart from other copies"
        >
          {label ? (
            <span className="font-medium text-slate-600">{label}</span>
          ) : (
            "+ version label"
          )}
        </button>
      )}

      <span className="flex-1" />

      {error && <span className="text-xs text-rose-600">{error}</span>}

      {current !== "verified" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => applyStatus("verified")}
          className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
        >
          ✓ Mark verified
        </button>
      )}
      {current !== "in_progress" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => applyStatus("in_progress")}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Mark in progress
        </button>
      )}
    </div>
  );
}
