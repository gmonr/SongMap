"use client";

import type { Playback } from "./usePlayback";
import { toggleCls } from "./transport-types";

const LOOP_LABEL = { off: "off", section: "section", song: "song" } as const;

/**
 * The synth transport's knob fragment: live tempo with reset, loop
 * off/section/song, and count-in / click / chord toggles. Renders inside
 * the TransportBar's knob row.
 */
export function SynthKnobs({ pb }: { pb: Playback }) {
  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => pb.setTempo(pb.tempo - 4)}
          aria-label="Slower"
          className="flex h-8 w-9 items-center justify-center rounded-md border border-slate-300 text-sm hover:bg-slate-50"
        >
          −
        </button>
        <span className="w-14 text-center text-sm font-bold tabular-nums">
          ♩={pb.tempo}
        </span>
        <button
          type="button"
          onClick={() => pb.setTempo(pb.tempo + 4)}
          aria-label="Faster"
          className="flex h-8 w-9 items-center justify-center rounded-md border border-slate-300 text-sm hover:bg-slate-50"
        >
          +
        </button>
        {pb.tempo !== pb.songTempo && (
          <button
            type="button"
            onClick={() => pb.setTempo(pb.songTempo)}
            className="ml-0.5 text-xs text-blue-600 hover:underline"
          >
            reset
          </button>
        )}
      </div>
      <span className="flex-1" />
      <button
        type="button"
        onClick={pb.cycleLoop}
        aria-label={`Loop: ${LOOP_LABEL[pb.loop]}`}
        className={toggleCls(pb.loop !== "off", "synth")}
      >
        ⟳ {LOOP_LABEL[pb.loop]}
      </button>
      <button
        type="button"
        onClick={() => pb.setCountInOn(!pb.countInOn)}
        aria-pressed={pb.countInOn}
        className={toggleCls(pb.countInOn, "synth")}
      >
        count-in
      </button>
      <button
        type="button"
        onClick={() => pb.setClickOn(!pb.clickOn)}
        aria-pressed={pb.clickOn}
        className={toggleCls(pb.clickOn, "synth")}
      >
        click
      </button>
      <button
        type="button"
        onClick={() => pb.setChordsOn(!pb.chordsOn)}
        aria-pressed={pb.chordsOn}
        className={toggleCls(pb.chordsOn, "synth")}
      >
        chords
      </button>
    </>
  );
}
