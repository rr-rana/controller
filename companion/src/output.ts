/**
 * Turns phone input frames into vJoy axes/buttons, keyboard keys and mouse movement.
 *
 * Buttons are state-based: an action is "down" while the phone holds it (or while an
 * internal pulse is running). ETS2 itself applies toggle semantics (e.g. a blinker press),
 * exactly like a physical wheel button. A minimum press time guarantees short taps
 * are never shorter than a game frame.
 */
import { ACTIONS, type ActionId, type Binding, type BindingMap, type InputFrame } from '../../shared/protocol.js';
import type { CompanionConfig } from './config.js';
import { keyNameToVk, type SendInputApi } from './win32/sendinput.js';
import type { VJoyDevice } from './win32/vjoy.js';

type Target = { id: string; set: (down: boolean) => void };

export class OutputController {
  private phoneMask = 0;
  private pulseCount = new Map<ActionId, number>();
  /** Effective state that has been applied to the target. */
  private applied = new Map<ActionId, boolean>();
  private downAt = new Map<ActionId, number>();
  private releaseTimers = new Map<ActionId, NodeJS.Timeout>();
  private targetRefs = new Map<string, number>();
  private camRemainder = { x: 0, y: 0 };
  lastFrame: InputFrame | null = null;

  constructor(
    private cfg: CompanionConfig,
    private vjoy: VJoyDevice | null,
    private input: SendInputApi | null,
    private log: (msg: string) => void = () => {},
  ) {
    this.centerAxes();
  }

  get bindings(): BindingMap {
    return this.cfg.bindings;
  }

  setVJoy(vjoy: VJoyDevice | null) {
    this.vjoy = vjoy;
    this.centerAxes();
  }

  /** Whether the action has a usable output (used by the gear sequencer). */
  isBound(action: ActionId): boolean {
    const b = this.cfg.bindings[action];
    if (b.type === 'vjoy') return !!this.vjoy;
    if (b.type === 'key') return !!this.input && keyNameToVk(b.key) !== null;
    return false;
  }

  isActionDown(action: ActionId): boolean {
    return this.applied.get(action) === true;
  }

  applyFrame(f: InputFrame): void {
    this.lastFrame = f;
    const { axes, cameraMode } = this.cfg;
    const vj = this.vjoy;
    if (vj) {
      vj.setAxis(axes.steer, (f.steer + 1) / 2);
      vj.setAxis(axes.throttle, f.throttle);
      vj.setAxis(axes.brake, f.brake);
      if (cameraMode === 'axis') {
        vj.setAxis(axes.camX, (f.camAX + 1) / 2);
        vj.setAxis(axes.camY, (f.camAY + 1) / 2);
      }
    }
    if (cameraMode === 'mouse' && this.input && (f.camDX !== 0 || f.camDY !== 0)) {
      // keep fractional remainder so low scales stay smooth
      const x = f.camDX * this.cfg.mouseScale + this.camRemainder.x;
      const y = f.camDY * this.cfg.mouseScale + this.camRemainder.y;
      const ix = Math.trunc(x);
      const iy = Math.trunc(y);
      this.camRemainder = { x: x - ix, y: y - iy };
      if (ix !== 0 || iy !== 0) this.input.moveMouse(ix, iy);
    }
    if (f.buttons !== this.phoneMask) {
      const changed = (f.buttons ^ this.phoneMask) >>> 0;
      this.phoneMask = f.buttons >>> 0;
      ACTIONS.forEach((a, i) => {
        if (changed & (1 << i)) this.update(a);
      });
    }
  }

  /** Safe state: wheel centred, pedals released, every button/key released. */
  neutralize(): void {
    this.lastFrame = null;
    this.phoneMask = 0;
    this.pulseCount.clear();
    this.camRemainder = { x: 0, y: 0 };
    this.centerAxes();
    for (const a of ACTIONS) {
      const t = this.releaseTimers.get(a);
      if (t) clearTimeout(t);
      this.releaseTimers.delete(a);
      if (this.applied.get(a)) this.applyTarget(a, false);
    }
  }

  /** Presses an action for `ms` (used by gear sequencing and binding tests). */
  pulse(action: ActionId, ms = 120): Promise<void> {
    this.pulseCount.set(action, (this.pulseCount.get(action) ?? 0) + 1);
    this.update(action);
    return new Promise((resolve) =>
      setTimeout(() => {
        const n = (this.pulseCount.get(action) ?? 1) - 1;
        if (n > 0) this.pulseCount.set(action, n);
        else this.pulseCount.delete(action);
        this.update(action);
        resolve();
      }, ms),
    );
  }

  setBindings(map: BindingMap): void {
    // release everything under the old map, then re-apply under the new one
    const wasDown = ACTIONS.filter((a) => this.applied.get(a));
    for (const a of wasDown) this.applyTarget(a, false);
    this.cfg.bindings = map;
    for (const a of wasDown) this.applyTarget(a, true);
  }

  setCameraMode(): void {
    this.camRemainder = { x: 0, y: 0 };
    this.vjoy?.setAxis(this.cfg.axes.camX, 0.5);
    this.vjoy?.setAxis(this.cfg.axes.camY, 0.5);
  }

  private centerAxes() {
    const vj = this.vjoy;
    if (!vj) return;
    const { axes } = this.cfg;
    vj.setAxis(axes.steer, 0.5);
    vj.setAxis(axes.throttle, 0);
    vj.setAxis(axes.brake, 0);
    vj.setAxis(axes.camX, 0.5);
    vj.setAxis(axes.camY, 0.5);
  }

  private wanted(a: ActionId): boolean {
    return (this.phoneMask & (1 << ACTIONS.indexOf(a))) !== 0 || (this.pulseCount.get(a) ?? 0) > 0;
  }

  private update(a: ActionId) {
    const want = this.wanted(a);
    const pending = this.releaseTimers.get(a);
    if (want) {
      if (pending) {
        clearTimeout(pending);
        this.releaseTimers.delete(a);
      }
      if (!this.applied.get(a)) {
        this.downAt.set(a, Date.now());
        this.applyTarget(a, true);
      }
      return;
    }
    if (!this.applied.get(a) || pending) return;
    const heldFor = Date.now() - (this.downAt.get(a) ?? 0);
    const remaining = this.cfg.minPressMs - heldFor;
    if (remaining <= 0) {
      this.applyTarget(a, false);
    } else {
      this.releaseTimers.set(
        a,
        setTimeout(() => {
          this.releaseTimers.delete(a);
          if (!this.wanted(a) && this.applied.get(a)) this.applyTarget(a, false);
        }, remaining),
      );
    }
  }

  private target(b: Binding): Target | null {
    if (b.type === 'vjoy') {
      const vj = this.vjoy;
      return vj ? { id: `vjoy:${b.button}`, set: (d) => vj.setButton(b.button, d) } : null;
    }
    if (b.type === 'key') {
      const vk = keyNameToVk(b.key);
      const inp = this.input;
      if (vk === null || !inp) return null;
      return { id: `key:${vk}`, set: (d) => void inp.key(vk, d) };
    }
    return null;
  }

  /** Reference-counted so two actions sharing one key/button don't release each other. */
  private applyTarget(a: ActionId, down: boolean) {
    this.applied.set(a, down);
    const t = this.target(this.cfg.bindings[a]);
    if (!t) return;
    const n = this.targetRefs.get(t.id) ?? 0;
    if (down) {
      this.targetRefs.set(t.id, n + 1);
      if (n === 0) t.set(true);
    } else if (n > 0) {
      this.targetRefs.set(t.id, n - 1);
      if (n === 1) t.set(false);
    }
    this.log(`${a} ${down ? 'down' : 'up'} -> ${t.id}`);
  }
}
