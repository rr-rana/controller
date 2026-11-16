/** Read-only access to a named Win32 file mapping (kernel32 via koffi). */
import koffi from 'koffi';

const FILE_MAP_READ = 0x0004;
const FILE_MAP_ALL_ACCESS = 0xf001f;
const PAGE_READWRITE = 0x04;
const INVALID_HANDLE_VALUE = -1n;

type Kernel32 = {
  OpenFileMappingW: (access: number, inherit: number, name: string) => bigint | null;
  CreateFileMappingW: (file: bigint, attrs: null, protect: number, hi: number, lo: number, name: string) => bigint | null;
  MapViewOfFile: (h: bigint, access: number, hi: number, lo: number, size: number) => bigint | null;
  UnmapViewOfFile: (p: bigint) => number;
  CloseHandle: (h: bigint) => number;
};

let k32: Kernel32 | null = null;
function kernel32(): Kernel32 {
  if (!k32) {
    const lib = koffi.load('kernel32.dll');
    k32 = {
      OpenFileMappingW: lib.func('OpenFileMappingW', 'void *', ['uint32', 'int', 'str16']),
      CreateFileMappingW: lib.func('CreateFileMappingW', 'void *', ['intptr', 'void *', 'uint32', 'uint32', 'uint32', 'str16']),
      MapViewOfFile: lib.func('MapViewOfFile', 'void *', ['void *', 'uint32', 'uint32', 'uint32', 'size_t']),
      UnmapViewOfFile: lib.func('UnmapViewOfFile', 'int', ['void *']),
      CloseHandle: lib.func('CloseHandle', 'int', ['void *']),
    };
  }
  return k32;
}

const isNull = (p: bigint | null | undefined) => p == null || p === 0n;

export class SharedMemoryView {
  private constructor(
    private handle: bigint,
    private ptr: bigint,
    /** Live view over the mapping (no copy). */
    readonly view: DataView,
  ) {}

  /** Opens an existing mapping read-only. Returns null if it does not exist. */
  static open(name: string, size: number): SharedMemoryView | null {
    const k = kernel32();
    const h = k.OpenFileMappingW(FILE_MAP_READ, 0, name);
    if (isNull(h)) return null;
    const p = k.MapViewOfFile(h!, FILE_MAP_READ, 0, 0, size);
    if (isNull(p)) {
      k.CloseHandle(h!);
      return null;
    }
    return new SharedMemoryView(h!, p!, new DataView(koffi.view(p, size)));
  }

  /** Creates (or opens) a read/write mapping. Used only by tests to emulate the plugin. */
  static create(name: string, size: number): SharedMemoryView {
    const k = kernel32();
    const h = k.CreateFileMappingW(INVALID_HANDLE_VALUE, null, PAGE_READWRITE, 0, size, name);
    if (isNull(h)) throw new Error('CreateFileMappingW failed');
    const p = k.MapViewOfFile(h!, FILE_MAP_ALL_ACCESS, 0, 0, size);
    if (isNull(p)) throw new Error('MapViewOfFile failed');
    return new SharedMemoryView(h!, p!, new DataView(koffi.view(p, size)));
  }

  close(): void {
    const k = kernel32();
    k.UnmapViewOfFile(this.ptr);
    k.CloseHandle(this.handle);
  }
}
