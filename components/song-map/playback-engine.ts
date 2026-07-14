"use client";

/**
 * The Web Audio playback engine: a look-ahead scheduler over a
 * `Timeline` that renders a metronome click per beat and a soft synth
 * strike per chord. One engine instance per play session (created inside
 * the user's Play tap so the AudioContext is gesture-unlocked); pause is
 * `AudioContext.suspend()`, so resume continues exactly where it left off.
 *
 * Everything the user can change mid-flight — tempo, loop mode, click /
 * chord mutes, the display key for transposed audio — is read through
 * live getters at schedule time, so a whole bar (~2s) is the worst-case
 * latency for a change to be heard (the look-ahead itself is 0.2s).
 */
import {
  sectionLoopRange,
  type Timeline,
} from "@/lib/song/playback";
import { midiToFreq, voiceChord } from "@/lib/song/voicing";

export type LoopMode = "off" | "section" | "song";

export interface EngineCallbacks {
  /** Live values, read at schedule time. */
  getTempo: () => number;
  getLoop: () => LoopMode;
  getClickOn: () => boolean;
  getChordsOn: () => boolean;
  /** Transpose a stored chord symbol into the currently displayed key. */
  transpose: (sym: string) => string;
  /** Playhead moved: a timeline index, or null during the count-in. */
  onBar: (idx: number | null) => void;
  /** Ran off the end of the song (loop "off" only). */
  onEnd: () => void;
}

const LOOKAHEAD_S = 0.2;
const TICK_MS = 25;

export class PlaybackEngine {
  private ctx: AudioContext;
  private clickGain: GainNode;
  private chordGain: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Next timeline index to schedule, and when its bar starts. */
  private pos: number;
  private nextTime = 0;
  private done = false;
  /** Beats to skip at the start of the first bar (tap on a mid-bar chord). */
  private skipOnce = 0;
  /** Scheduled playhead updates, drained as audio time reaches them. */
  private displayQueue: { time: number; idx: number | null }[] = [];

  constructor(
    private timeline: Timeline,
    private cb: EngineCallbacks
  ) {
    this.ctx = new AudioContext();
    this.clickGain = this.ctx.createGain();
    this.chordGain = this.ctx.createGain();
    this.clickGain.connect(this.ctx.destination);
    this.chordGain.connect(this.ctx.destination);
    this.pos = 0;
  }

  /**
   * Begin playing at timeline index `from`, after `countInBeats` clicks.
   * `skipBeats` drops the first beats of that bar, so playback can enter
   * a split bar at a tapped chord instead of the bar top.
   */
  start(from: number, countInBeats: number, skipBeats = 0) {
    this.pos = Math.max(0, Math.min(from, this.timeline.bars.length - 1));
    const firstBar = this.timeline.bars[this.pos];
    this.skipOnce = firstBar
      ? Math.max(0, Math.min(skipBeats, firstBar.beats - 1))
      : 0;
    void this.ctx.resume();
    const spb = 60 / this.clampTempo(this.cb.getTempo());
    let t = this.ctx.currentTime + 0.08;
    if (countInBeats > 0) {
      this.displayQueue.push({ time: t, idx: null });
      for (let i = 0; i < countInBeats; i++) {
        this.scheduleClick(t + i * spb, i === 0);
      }
      t += countInBeats * spb;
    }
    this.nextTime = t;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  pause() {
    void this.ctx.suspend();
  }

  resume() {
    void this.ctx.resume();
  }

  /** Tear down: stop scheduling and release the audio context. */
  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    void this.ctx.close();
  }

  private clampTempo(bpm: number): number {
    return Math.min(300, Math.max(20, bpm || 100));
  }

  private tick() {
    const now = this.ctx.currentTime;

    // Playhead updates whose audio time has arrived.
    while (
      this.displayQueue.length > 0 &&
      this.displayQueue[0].time <= now + TICK_MS / 1000
    ) {
      this.cb.onBar(this.displayQueue.shift()!.idx);
    }
    if (this.done && this.displayQueue.length === 0) {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      this.cb.onEnd();
      return;
    }

    // Schedule whole bars while inside the look-ahead window.
    while (!this.done && this.nextTime < now + LOOKAHEAD_S) {
      const bar = this.timeline.bars[this.pos];
      if (!bar) {
        this.done = true;
        break;
      }
      const spb = 60 / this.clampTempo(this.cb.getTempo());
      const skip = this.skipOnce;
      this.skipOnce = 0;
      this.displayQueue.push({ time: this.nextTime, idx: this.pos });

      for (let b = skip; b < bar.beats; b++) {
        this.scheduleClick(this.nextTime + (b - skip) * spb, b === 0);
      }
      for (const chord of bar.chords) {
        const offset = chord.startBeat - bar.startBeat;
        const end = offset + chord.beats;
        if (end <= skip) continue;
        this.scheduleChord(
          chord.sym,
          this.nextTime + Math.max(0, offset - skip) * spb,
          (end - Math.max(offset, skip)) * spb
        );
      }
      this.nextTime += (bar.beats - skip) * spb;

      // Advance, honoring the live loop mode.
      const loop = this.cb.getLoop();
      let next = this.pos + 1;
      if (loop === "section") {
        const [start, end] = sectionLoopRange(this.timeline, this.pos);
        if (next >= end) next = start;
      } else if (next >= this.timeline.bars.length) {
        if (loop === "song") next = 0;
        else {
          this.done = true;
          this.displayQueue.push({ time: this.nextTime, idx: null });
          break;
        }
      }
      this.pos = next;
    }
  }

  /**
   * A short metronome blip; beat 1 of a bar is higher and louder. Kept
   * well below the chord gains: it sits at 1-1.6 kHz where hearing is
   * most sensitive and a square wave adds harmonics on top, so numeric
   * parity with the chords would still drown them out.
   */
  private scheduleClick(time: number, accent: boolean) {
    if (!this.cb.getClickOn()) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1568 : 1046;
    env.gain.setValueAtTime(accent ? 0.09 : 0.05, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(env);
    env.connect(this.clickGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  /** A piano-ish strike: bass sine + close-voiced triangle tones, decaying. */
  private scheduleChord(sym: string, time: number, duration: number) {
    if (!this.cb.getChordsOn()) return;
    const voicing = voiceChord(this.cb.transpose(sym));
    if (!voicing) return;
    const ring = Math.min(duration + 0.15, 4);

    const strike = (freq: number, type: OscillatorType, peak: number) => {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(peak, time + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, time + ring);
      osc.connect(env);
      env.connect(this.chordGain);
      osc.start(time);
      osc.stop(time + ring + 0.05);
    };

    // Balanced so the upper voicing carries as much weight as the bass:
    // one sine at 0.20 vs three-four triangle tones at 0.16 each (a lone
    // low sine reads much louder per unit gain than thin mid tones).
    if (voicing.bassMidi !== null) {
      strike(midiToFreq(voicing.bassMidi), "sine", 0.2);
    }
    for (const midi of voicing.toneMidis) {
      strike(midiToFreq(midi), "triangle", 0.16);
    }
  }
}
