/**
 * Small inline SVG icons, hand-inlined Feather/Lucide-style (24x24 viewBox,
 * 2px stroke, currentColor) so glyph-only buttons stay legible on phones
 * without pulling in an icon library. Every icon defaults to `h-5 w-5` and
 * accepts `className` to resize/reposition it inline with text.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ className, children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function Pencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </Svg>
  );
}

export function Trash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  );
}

export function Undo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Svg>
  );
}

export function Redo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Svg>
  );
}

export function Plus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function MusicNote(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </Svg>
  );
}

export function MusicNotes(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 19V6l9-2" />
      <path d="M9 8l9-2" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="15" cy="17" r="2.5" />
    </Svg>
  );
}

export function Play(props: IconProps) {
  return (
    <Svg fill="currentColor" stroke="none" {...props}>
      <path d="M7 4.5v15l13-7.5Z" />
    </Svg>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 18l6-6-6-6" />
    </Svg>
  );
}
