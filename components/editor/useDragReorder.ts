"use client";

import { useRef, useState } from "react";

/**
 * Pointer-driven drag-to-reorder for a vertical list of rows, shared by the
 * arrangement list and each section's lines — the editor is meant to work
 * on a phone, so this is pointer events (not HTML5 drag-and-drop, which
 * touch browsers don't drive the same way) with `setPointerCapture` so the
 * drag keeps tracking even once the finger leaves the row.
 *
 * The caller attaches `onHandlePointerDown(i)` to a small dedicated handle
 * element (with `touch-action: none`, e.g. Tailwind's `touch-none`) rather
 * than the row itself — rows hold real inputs/selects, and starting the
 * drag from anywhere in the row would break tapping into them and break
 * touch-scrolling the page. As the pointer crosses another row's vertical
 * midpoint, `onReorder(from, to)` fires immediately (not just on drop) so
 * the caller can move the item in state and the list re-sorts live under
 * the dragging finger.
 */
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const dragIndexRef = useRef<number | null>(null);

  const setRowRef = (i: number) => (el: HTMLElement | null) => {
    rowRefs.current[i] = el;
  };

  const onHandlePointerDown =
    (i: number) => (e: React.PointerEvent<HTMLElement>) => {
      // Left button only for mouse; touch/pen have no meaningful "button".
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragIndexRef.current = i;
      setDraggingIndex(i);

      const onMove = (ev: PointerEvent) => {
        const from = dragIndexRef.current;
        if (from === null) return;
        const y = ev.clientY;
        for (let j = 0; j < rowRefs.current.length; j++) {
          if (j === from) continue;
          const el = rowRefs.current[j];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          // Crossed upward past a row above, or downward past one below.
          if ((j < from && y < mid) || (j > from && y > mid)) {
            onReorder(from, j);
            dragIndexRef.current = j;
            setDraggingIndex(j);
            break;
          }
        }
      };

      const endDrag = () => {
        dragIndexRef.current = null;
        setDraggingIndex(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", endDrag);
        window.removeEventListener("pointercancel", endDrag);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    };

  return { draggingIndex, setRowRef, onHandlePointerDown };
}
