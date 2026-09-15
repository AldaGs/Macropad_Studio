// Spike: per-device keyboard capture via the Interception driver, straight from Node.
// Proves we can replace LuaMacros + AHK with one in-process FFI layer.
//
//   node spike-interception.js            observe: print every keyboard's hwid + keys, block nothing
//   node spike-interception.js <device>   capture: swallow that device's keys, pass all others through
//   node spike-interception.js --self-test
//
// Needs the Interception driver installed (admin + reboot) and interception.dll (x64) at
// bin/Interception/interception.dll or beside this file.

const koffi = require('koffi');
const path = require('path');
const fs = require('fs');

const DLL = [
  path.join(__dirname, 'bin/Interception/interception.dll'),
  path.join(__dirname, 'interception.dll'),
].find(fs.existsSync);

// --- Interception C API (cdecl). Structs are read straight out of a Buffer, so no layout decls. ---
function loadLib() {
  const lib = koffi.load(DLL);
  return {
    createContext:  lib.func('interception_create_context', 'void *', []),
    destroyContext: lib.func('interception_destroy_context', 'void', ['void *']),
    setFilter:      lib.func('interception_set_filter', 'void', ['void *', 'void *', 'uint16_t']),
    wait:           lib.func('interception_wait', 'int', ['void *']),
    receive:        lib.func('interception_receive', 'int', ['void *', 'int', 'void *', 'uint']),
    send:           lib.func('interception_send', 'int', ['void *', 'int', 'void *', 'uint']),
    getHardwareId:  lib.func('interception_get_hardware_id', 'size_t', ['void *', 'int', 'void *', 'uint']),
  };
}

// Interception reports scan codes; profiles in macros.json store virtual-key codes (49='1', 67='C').
// MapVirtualKeyW bridges them, so existing profiles keep working untouched.
const MapVirtualKeyW = koffi.load('user32.dll').func('__stdcall', 'MapVirtualKeyW', 'uint32', ['uint32', 'uint32']);
const MAPVK_VSC_TO_VK_EX = 3;

// MapVirtualKey has no NumLock context and reports numpad digits as the navigation key
// sharing their scancode (numpad 7 -> VK_HOME). Only the E0 prefix separates them.
// Keep this in step with NUMPAD_VK in src/capture-worker.js.
const NUMPAD_VK = {
  0x47: 0x67, 0x48: 0x68, 0x49: 0x69,
  0x4b: 0x64, 0x4c: 0x65, 0x4d: 0x66,
  0x4f: 0x61, 0x50: 0x62, 0x51: 0x63,
  0x52: 0x60, 0x53: 0x6e,
};

const toVk = (code, extended) =>
  (!extended && NUMPAD_VK[code]) || MapVirtualKeyW(extended ? code | 0xE000 : code, MAPVK_VSC_TO_VK_EX);

const FILTER_KEY_ALL = 0xFFFF; // filter everything, decide in JS.
                               // INTERCEPTION_FILTER_KEY_DOWN is 0x01 and KEY_UP is 0x01 too - a well-known
                               // footgun in this API. Taking ALL sidesteps it.
const STROKE_BYTES = 24;       // InterceptionStroke is a union sized to the mouse stroke; keyboard uses 8.
const HWID_BYTES = 1000;       // wchar_t[500]

// A Windows hardware id is a NUL-separated multi-string, most specific entry first.
const decodeHwids = (buf, byteLen) =>
  buf.toString('ucs2', 0, Math.max(0, Math.min(byteLen, buf.length)))
     .split('\0')
     .filter(Boolean);

const parseKey = (buf) => ({
  code: buf.readUInt16LE(0),
  state: buf.readUInt16LE(2),
  get down() { return (this.state & 1) === 0; },
  get extended() { return (this.state & 2) !== 0; },
});

function selfTest() {
  const b = Buffer.alloc(HWID_BYTES);
  b.write('HID\VID_046D&PID_C534&MI_00\0HID\VID_046D\0', 0, 'ucs2');
  const parts = decodeHwids(b, 80);
  console.assert(parts[0] === 'HID\VID_046D&PID_C534&MI_00', 'first hwid is the specific one');
  console.assert(parts.length === 2, 'multi-string split');
  console.assert(decodeHwids(b, 0).length === 0, 'hwid empty');
  console.assert(decodeHwids(b, 99999)[0] === parts[0], 'overlong length is clamped');

  const s = Buffer.alloc(STROKE_BYTES);
  s.writeUInt16LE(30, 0); s.writeUInt16LE(0, 2);
  console.assert(parseKey(s).code === 30 && parseKey(s).down, 'keydown');
  s.writeUInt16LE(1, 2);
  console.assert(!parseKey(s).down, 'keyup');
  s.writeUInt16LE(3, 2);
  console.assert(!parseKey(s).down && parseKey(s).extended, 'extended keyup');

  // the migration guarantee: scan codes must land on the VK codes macros.json already stores
  for (const [sc, vk] of [[0x02, 49], [0x2e, 67], [0x20, 68], [0x0b, 48], [0x0a, 57], [0x09, 56]]) {
    console.assert(toVk(sc, false) === vk, `scancode 0x${sc.toString(16)} -> VK ${vk}`);
  }
  console.log('self-test ok');
}

function main() {
  const arg = process.argv[2];
  if (arg === '--self-test') return selfTest();

  if (!DLL) {
    console.error('interception.dll not found. Put the x64 dll at bin/Interception/interception.dll');
    process.exit(1);
  }

  const target = arg ? Number(arg) : null;
  if (arg && !Number.isInteger(target)) {
    console.error(`Bad device id "${arg}". Run with no args to list devices.`);
    process.exit(1);
  }

  const lib = loadLib();
  const ctx = lib.createContext();
  if (!ctx) {
    console.error('interception_create_context returned NULL - driver not installed, or no reboot since install.');
    process.exit(1);
  }

  // Predicate runs once per device during set_filter; keyboards are device ids 1-10.
  const isKeyboard = koffi.register(
    (device) => (device >= 1 && device <= 10 ? 1 : 0),
    koffi.pointer(koffi.proto('int InterceptionPredicate(int device)'))
  );
  lib.setFilter(ctx, isKeyboard, FILTER_KEY_ALL);

  const stroke = Buffer.alloc(STROKE_BYTES);
  const hwidBuf = Buffer.alloc(HWID_BYTES);
  const hwids = new Map();

  const cleanup = () => { lib.destroyContext(ctx); process.exit(0); };
  process.on('SIGINT', cleanup);

  console.log(target === null
    ? 'Observing all keyboards, blocking nothing. Press keys on each one to find your macropad.'
    : `Capturing device ${target} - its keys are swallowed. Every other keyboard passes through.`);
  console.log('Ctrl+C to stop, then press any key (the wait call is blocking).\n');

  // ponytail: interception_wait blocks the thread, so this script is single-purpose and Ctrl+C
  // only lands after the next keystroke. Move to a worker_thread when wiring into Electron.
  for (;;) {
    const device = lib.wait(ctx);
    if (lib.receive(ctx, device, stroke, 1) <= 0) continue;

    if (!hwids.has(device)) {
      const len = lib.getHardwareId(ctx, device, hwidBuf, HWID_BYTES);
      const parts = decodeHwids(hwidBuf, len);
      hwids.set(device, parts[0] || '(no hardware id)');
      console.log(`device ${device}: ${hwids.get(device)}`);
      if (parts.length > 1) console.log(`  also reports: ${parts.slice(1).join(' | ')}`);
    }

    const key = parseKey(stroke);
    const blocked = device === target;
    if (key.down) {
      const vk = toVk(key.code, key.extended);
      console.log(`  device ${device}  scancode 0x${key.code.toString(16).padStart(2, '0')}${key.extended ? ' (E0)' : ''}  -> keyId ${vk}  ${blocked ? 'BLOCKED' : 'passed through'}`);
    }
    if (!blocked) lib.send(ctx, device, stroke, 1);
  }
}

main();
