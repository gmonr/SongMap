/**
 * Applying phrase-fill suggestions to a song. Pure, and same-reference on
 * no-op like every reshape op, so the view's dirty/undo tracking works
 * unchanged.
 */
import { setBarLyric } from "@/lib/song/lyrics";
import type { SongData } from "@/lib/song/types";
import type { PhraseFill } from "./align";

/**
 * Stamp each fill's text onto its (empty) bar via setBarLyric. Fills whose
 * bar no longer exists or already has a lyric are skipped — suggestions can
 * go stale while the user keeps editing. Returns the same reference when
 * nothing applied.
 */
export function applyPhraseFill(
  data: SongData,
  fills: PhraseFill[]
): SongData {
  let sections = data.sections;
  for (const f of fills) {
    const def = sections[f.sectionId];
    const line = def?.lines[f.li];
    if (!line) continue;
    if (line.lyrics.some((s) => s.bar === f.bar && s.text.trim() !== "")) {
      continue;
    }
    const next = setBarLyric(line, f.bar, f.text);
    if (next === line) continue;
    sections = {
      ...sections,
      [f.sectionId]: {
        ...def,
        lines: def.lines.map((l, i) => (i === f.li ? next : l)),
      },
    };
  }
  return sections === data.sections ? data : { ...data, sections };
}
