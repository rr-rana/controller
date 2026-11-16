/**
 * Keyboard and mouse injection via user32!SendInput (koffi FFI).
 *
 * Keys are sent as hardware scan codes (KEYEVENTF_SCANCODE), which is what
 * DirectInput/raw-input games like ETS2 read. Mouse movement is relative
 * (MOUSEEVENTF_MOVE), which ETS2 uses for free-look.
 *
 * Note: Windows blocks injection into elevated processes (UIPI). If ETS2 runs
 * "as administrator", the companion must too.
 */
import koffi from 'koffi';

const INPUT_SIZE = 40; // sizeof(INPUT) on x64
const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;
const MOUSEEVENTF_MOVE = 0x0001;
const MAPVK_VK_TO_VSC_EX = 4;

/** Virtual-key codes for supported key names (case-insensitive lookup). */
const VK: Record<string, number> = {
  BACKSPACE: 0x08, TAB: 0x09, ENTER: 0x0d, SHIFT: 0x10, CTRL: 0x11, ALT: 0x12, PAUSE: 0x13,
  CAPSLOCK: 0x14, ESC: 0x1b, SPACE: 0x20, PAGEUP: 0x21, PAGEDOWN: 0x22, END: 0x23, HOME: 0x24,
  LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28, INSERT: 0x2d, DELETE: 0x2e,
  NUM0: 0x60, NUM1: 0x61, NUM2: 0x62, NUM3: 0x63, NUM4: 0x64, NUM5: 0x65, NUM6: 0x66, NUM7: 0x67,
  NUM8: 0x68, NUM9: 0x69, NUMMULTIPLY: 0x6a, NUMPLUS: 0x6b, NUMMINUS: 0x6d, NUMDECIMAL: 0x6e, NUMDIVIDE: 0x6f,
  LSHIFT: 0xa0, RSHIFT: 0xa1, LCTRL: 0xa2, RCTRL: 0xa3, LALT: 0xa4, RALT: 0xa5,
  ';': 0xba, '=': 0xbb, ',': 0xbc, '-': 0xbd, '.': 0xbe, '/': 0xbf, '`': 0xc0,
  '[': 0xdb, '\\': 0xdc, ']': 0xdd, "'": 0xde,
};
for (let i = 0; i < 26; i++) VK[String.fromCharCode(65 + i)] = 65 + i;
for (let i = 0; i < 10; i++) VK[String(i)] = 0x30 + i;
for (let i = 1; i <= 24; i++) VK['F' + i] = 0x6f + i;

/** Keys whose scan code needs the E0 (extended) prefix. */
const EXTENDED_VK = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x6f, 0xa3, 0xa5]);

export const SUPPORTED_KEYS = Object.keys(VK);

export function keyNameToVk(name: string): number | null {
  const n = name.trim().toUpperCase();
  return VK[n] ?? VK[name.trim()] ?? null;
}

export class SendInputApi {
  private SendInput: (count: number, inputs: Buffer, size: number) => number;
  private MapVirtualKeyW: (code: number, type: number) => number;
  private GetLastError: () => number;
  private keyBuf = Buffer.alloc(INPUT_SIZE);
  private mouseBuf = Buffer.alloc(INPUT_SIZE);
  private scanCache = new Map<number, { scan: number; ext: boolean }>();

  constructor() {
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    this.SendInput = user32.func('SendInput', 'uint32', ['uint32', 'void *', 'int32']);
    this.MapVirtualKeyW = user32.func('MapVirtualKeyW', 'uint32', ['uint32', 'uint32']);
    this.GetLastError = kernel32.func('GetLastError', 'uint32', []);
  }

  /** Sends a zero-length mouse move. Returns null if OK, else an error string. Harmless self-test. */
  selfTest(): string | null {
    return this.moveMouse(0, 0) ? null : `SendInput failed (GetLastError=${this.GetLastError()})`;
  }

  private scanFor(vk: number): { scan: number; ext: boolean } {
    let s = this.scanCache.get(vk);
    if (!s) {
      const r = this.MapVirtualKeyW(vk, MAPVK_VK_TO_VSC_EX);
      s = { scan: r & 0xff, ext: (r & 0xff00) === 0xe000 || (r & 0xff00) === 0xe100 || EXTENDED_VK.has(vk) };
      this.scanCache.set(vk, s);
    }
    return s;
  }

  key(vk: number, down: boolean): boolean {
    const { scan, ext } = this.scanFor(vk);
    const b = this.keyBuf;
    b.fill(0);
    b.writeUInt32LE(INPUT_KEYBOARD, 0);
    b.writeUInt16LE(0, 8); // wVk (ignored with SCANCODE)
    b.writeUInt16LE(scan, 10); // wScan
    b.writeUInt32LE(KEYEVENTF_SCANCODE | (ext ? KEYEVENTF_EXTENDEDKEY : 0) | (down ? 0 : KEYEVENTF_KEYUP), 12);
    return this.SendInput(1, b, INPUT_SIZE) === 1;
  }

  moveMouse(dx: number, dy: number): boolean {
    const b = this.mouseBuf;
    b.fill(0);
    b.writeUInt32LE(INPUT_MOUSE, 0);
    b.writeInt32LE(Math.trunc(dx), 8);
    b.writeInt32LE(Math.trunc(dy), 12);
    b.writeUInt32LE(MOUSEEVENTF_MOVE, 20);
    return this.SendInput(1, b, INPUT_SIZE) === 1;
  }
}
