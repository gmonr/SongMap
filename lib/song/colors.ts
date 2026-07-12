/**
 * Named section accent colors mapped to concrete Tailwind classes.
 * (Class names must be literal strings so Tailwind's scanner picks them up.)
 */
export interface SectionColor {
  /** Left accent bar of the section card. */
  accent: string;
  /** Section label text. */
  label: string;
  /** Card background tint. */
  card: string;
  /** Bar cell border. */
  barBorder: string;
  /** Small swatch used in the editor's color picker. */
  swatch: string;
}

export const SECTION_COLORS: Record<string, SectionColor> = {
  blue: {
    accent: "bg-blue-500",
    label: "text-blue-700",
    card: "bg-blue-50/50",
    barBorder: "border-blue-200",
    swatch: "bg-blue-500",
  },
  amber: {
    accent: "bg-amber-500",
    label: "text-amber-700",
    card: "bg-amber-50/50",
    barBorder: "border-amber-200",
    swatch: "bg-amber-500",
  },
  green: {
    accent: "bg-emerald-500",
    label: "text-emerald-700",
    card: "bg-emerald-50/50",
    barBorder: "border-emerald-200",
    swatch: "bg-emerald-500",
  },
  purple: {
    accent: "bg-violet-500",
    label: "text-violet-700",
    card: "bg-violet-50/50",
    barBorder: "border-violet-200",
    swatch: "bg-violet-500",
  },
  rose: {
    accent: "bg-rose-500",
    label: "text-rose-700",
    card: "bg-rose-50/50",
    barBorder: "border-rose-200",
    swatch: "bg-rose-500",
  },
  teal: {
    accent: "bg-teal-500",
    label: "text-teal-700",
    card: "bg-teal-50/50",
    barBorder: "border-teal-200",
    swatch: "bg-teal-500",
  },
  slate: {
    accent: "bg-slate-500",
    label: "text-slate-700",
    card: "bg-slate-50/50",
    barBorder: "border-slate-200",
    swatch: "bg-slate-500",
  },
};

export const SECTION_COLOR_NAMES = Object.keys(SECTION_COLORS);

export function sectionColor(name: string | undefined): SectionColor {
  return SECTION_COLORS[name ?? "slate"] ?? SECTION_COLORS.slate;
}
