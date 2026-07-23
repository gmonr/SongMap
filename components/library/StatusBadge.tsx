import type { SongStatus } from "@/lib/song/types";

const STATUS_META: Record<
  SongStatus,
  { label: string; className: string }
> = {
  imported: {
    label: "Imported",
    className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  },
  in_progress: {
    label: "In progress",
    className: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  },
  verified: {
    label: "Verified",
    className: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200",
  },
};

/** null/undefined reads as "in_progress" — the column's own default. */
export function normalizeStatus(
  status: SongStatus | null | undefined
): SongStatus {
  return status ?? "in_progress";
}

/** Small colored pill: amber = imported, sky = in progress, green = verified. */
export function StatusBadge({
  status,
  className = "",
}: {
  status: SongStatus | null | undefined;
  className?: string;
}) {
  const meta = STATUS_META[normalizeStatus(status)];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className} ${className}`}
    >
      {meta.label}
    </span>
  );
}
