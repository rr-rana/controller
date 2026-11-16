/**
 * R / N / D selector for ETS2 automatic transmission.
 *
 * ETS2 has no "select drive" control: in automatic mode, Shift up/down step through
 * R <-> N <-> D. We step toward the target and, when telemetry is available, verify the
 * actual gear after every step (closed loop). Without telemetry we track the assumed
 * position (open loop).
 */
import type { GearTarget, TelemetryData } from '../../shared/protocol.js';
import type { OutputController } from './output.js';

const TARGET: Record<GearTarget, -1 | 0 | 1> = { R: -1, N: 0, D: 1 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GearSelector {
  private pending: GearTarget | null = null;
  private running = false;
  /** Open-loop position estimate when telemetry is unavailable. */
  private assumed: -1 | 0 | 1 = 0;

  constructor(
    private out: OutputController,
    private telemetry: () => TelemetryData | null,
    private log: (m: string) => void = () => {},
  ) {}

  request(target: GearTarget): void {
    this.pending = target;
    if (!this.running) void this.run();
  }

  /** Called on disconnect so a stale request does not keep shifting. */
  cancel(): void {
    this.pending = null;
  }

  private async run() {
    this.running = true;
    try {
      while (this.pending) {
        const t = this.pending;
        this.pending = null;
        await this.shiftTo(t);
      }
    } finally {
      this.running = false;
    }
  }

  private current(): -1 | 0 | 1 {
    const tel = this.telemetry();
    return tel ? (Math.sign(tel.gear) as -1 | 0 | 1) : this.assumed;
  }

  private async shiftTo(target: GearTarget) {
    const want = TARGET[target];
    for (let step = 0; step < 4; step++) {
      if (this.pending) return; // superseded by a newer request
      const cur = this.current();
      if (cur === want) {
        this.assumed = want;
        return;
      }
      const closedLoop = this.telemetry() !== null;
      if (want === 0 && step === 0 && this.out.isBound('neutral') && closedLoop) {
        this.log('gear: neutral');
        await this.out.pulse('neutral');
      } else {
        const action = want > cur ? 'shiftUp' : 'shiftDown';
        this.log(`gear: ${action} (current ${cur}, target ${target})`);
        await this.out.pulse(action);
        if (!closedLoop) this.assumed = (cur + (want > cur ? 1 : -1)) as -1 | 0 | 1;
      }
      await sleep(closedLoop ? 220 : 80); // let the game react and telemetry refresh
    }
    if (this.telemetry() && this.current() !== want) {
      this.log(`gear: could not reach ${target} (is the truck stopped / transmission automatic?)`);
    }
  }
}
