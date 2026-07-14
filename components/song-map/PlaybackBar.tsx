"use client";

import type { Playback } from "./usePlayback";

const LOOP_LABEL = { off: "off", section: "section", song: "song" } as const;

/**
 * The playback transport, docked at the bottom of the viewport like
 * reshape's SelectionBar. Row one is the transport (play/pause, stop,
 * section skips, where-am-I readout); row two is the knobs: live tempo
 * with reset, loop off/section/song, and count-in / click / chord toggles.
 */
export function PlaybackBar({
  pb,
  sectionLabel,
  onClose,
}: {
  pb: Playback;
  /** Instance label of the section under the playhead, e.g. "Chorus". */
  sectionLabel: string | null;
  onClose: () => void;
}) {
  const totalBars = pb.timeline.bars.length;
  const squareBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg disabled:cursor-default disabled:text-slate-300";
  const toggleCls = (on: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
      on
        ? "bg-blue-50 text-blue-700 ring-blue-200"
        : "bg-white text-slate-400 ring-slate-200"
    }`;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1.5 px-4 py-2">
        <button
          type="button"
          onClick={pb.toggle}
          aria-label={pb.status === "playing" ? "Pause" : "Play"}
          className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white hover:bg-blue-700 active:bg-blue-800"
        >
          {pb.status === "playing" ? "❙❙" : "▶"}
        </button>
        <button
          type="button"
          onClick={pb.stop}
          disabled={pb.status === "stopped"}
          aria-label="Stop"
          className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
        >
          ■
        </button>
        <button
          type="button"
          onClick={() => pb.skipSection(-1)}
          disabled={pb.status === "stopped"}
          aria-label="Previous section"
          className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
        >
          ⏮︎
        </button>
        <button
          type="button"
          onClick={() => pb.skipSection(1)}
          disabled={pb.status === "stopped"}
          aria-label="Next section"
          className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
        >
          ⏭︎
        </button>
        <div className="min-w-0 flex-1 text-right">
          {pb.countingIn ? (
            <p className="animate-pulse text-sm font-bold text-blue-600">
              count-in…
            </p>
          ) : pb.current ? (
            <>
              <p className="truncate text-sm font-bold">{sectionLabel}</p>
              <p className="text-[11px] text-slate-400">
                bar {pb.barNumber}/{totalBars}
              </p>
            </>
          ) : (
            <p className="truncate text-[11px] text-slate-400">
              {totalBars} bars · ▶ to play
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close playback"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>

      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1.5 px-4 pb-2">
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
          className={toggleCls(pb.loop !== "off")}
        >
          ⟳ {LOOP_LABEL[pb.loop]}
        </button>
        <button
          type="button"
          onClick={() => pb.setCountInOn(!pb.countInOn)}
          aria-pressed={pb.countInOn}
          className={toggleCls(pb.countInOn)}
        >
          count-in
        </button>
        <button
          type="button"
          onClick={() => pb.setClickOn(!pb.clickOn)}
          aria-pressed={pb.clickOn}
          className={toggleCls(pb.clickOn)}
        >
          click
        </button>
        <button
          type="button"
          onClick={() => pb.setChordsOn(!pb.chordsOn)}
          aria-pressed={pb.chordsOn}
          className={toggleCls(pb.chordsOn)}
        >
          chords
        </button>
      </div>
    </div>
  );
}
