/**
 * Live controller state, written directly by gesture callbacks (no React state, no re-renders)
 * and read by the connection when it builds a frame.
 */
import { actionBit, emptyFrame, type ActionId, type InputFrame } from '../../shared/protocol';

const state = emptyFrame();
let camAccX = 0;
let camAccY = 0;
let onChange: (() => void) | null = null;

/** Components register a reset so their visuals return to rest when inputs are force-released. */
const resetHandlers = new Set<() => void>();
export function onInputReset(fn: () => void) {
  resetHandlers.add(fn);
  return () => {
    resetHandlers.delete(fn);
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const notify = () => onChange?.();

export const input = {
  /** Called by the connection to be notified whenever something changed. */
  setListener(fn: (() => void) | null) {
    onChange = fn;
  },

  setSteer(v: number) {
    const n = clamp(v, -1, 1);
    if (n === state.steer) return;
    state.steer = n;
    notify();
  },
  setThrottle(v: number) {
    const n = clamp(v, 0, 1);
    if (n === state.throttle) return;
    state.throttle = n;
    notify();
  },
  setBrake(v: number) {
    const n = clamp(v, 0, 1);
    if (n === state.brake) return;
    state.brake = n;
    notify();
  },
  /** Relative camera motion in mouse counts (fractions are carried over). */
  addCamera(dx: number, dy: number) {
    camAccX += dx;
    camAccY += dy;
    if (Math.abs(camAccX) >= 1 || Math.abs(camAccY) >= 1) notify();
  },
  /** Absolute camera stick position -1..1 (axis mode). */
  setCameraAxis(x: number, y: number) {
    state.camAX = clamp(x, -1, 1);
    state.camAY = clamp(y, -1, 1);
    notify();
  },
  setButton(action: ActionId, down: boolean) {
    const bit = actionBit(action);
    const next = down ? (state.buttons | bit) >>> 0 : (state.buttons & ~bit) >>> 0;
    if (next === state.buttons) return;
    state.buttons = next;
    notify();
  },
  isDown(action: ActionId) {
    return (state.buttons & actionBit(action)) !== 0;
  },

  /** Builds the next frame and consumes the integer part of accumulated camera motion. */
  takeFrame(seq: number): InputFrame {
    const dx = Math.trunc(clamp(camAccX, -32768, 32767));
    const dy = Math.trunc(clamp(camAccY, -32768, 32767));
    camAccX -= dx;
    camAccY -= dy;
    return { ...state, seq, camDX: dx, camDY: dy };
  },

  /** Release everything (used when the app goes to background or the link drops). */
  releaseAll() {
    state.steer = 0;
    state.throttle = 0;
    state.brake = 0;
    state.camAX = 0;
    state.camAY = 0;
    state.buttons = 0;
    camAccX = 0;
    camAccY = 0;
    resetHandlers.forEach((h) => h());
    notify();
  },
};

