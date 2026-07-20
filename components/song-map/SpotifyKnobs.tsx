"use client";

import type { SpotifyPlayback } from "./useSpotifyPlayback";
import { smallBtn, toggleCls } from "./transport-types";

/**
 * The Spotify transport's knob fragment: device picker + refresh, the
 * not-synced warning, and the calibrate toggle. Renders inside the
 * TransportBar's knob row.
 */
export function SpotifyKnobs({
  sp,
  showCalibrate,
}: {
  sp: SpotifyPlayback;
  /** Hide the calibrate toggle where anchor edits don't belong (reshape). */
  showCalibrate: boolean;
}) {
  return (
    <>
      <select
        aria-label="Spotify device"
        value={sp.deviceId ?? ""}
        onChange={(e) => sp.pickDevice(e.target.value)}
        onFocus={() => {
          if (sp.devices.length === 0) sp.refreshDevices();
        }}
        className="max-w-40 truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        <option value="" disabled>
          {sp.devices.length === 0 ? "no devices" : "pick device"}
        </option>
        {sp.devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={sp.refreshDevices}
        aria-label="Refresh devices"
        title="Refresh devices"
        className={smallBtn}
      >
        ⟳
      </button>
      <span className="flex-1" />
      {sp.sync.anchors.length === 0 && !sp.calibrating && (
        <span className="text-[11px] text-amber-600">
          {showCalibrate
            ? "not synced — calibrate bar 1"
            : "not synced — calibrate on the song map"}
        </span>
      )}
      {showCalibrate && (
        <button
          type="button"
          onClick={() => sp.setCalibrating(!sp.calibrating)}
          aria-pressed={sp.calibrating}
          className={toggleCls(sp.calibrating, "spotify")}
        >
          calibrate
        </button>
      )}
    </>
  );
}
