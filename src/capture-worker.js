// Runs the Interception capture loop on its own thread.
// interception_wait blocks, so this can never live on Electron's main thread.
//
// in  (workerData): { dllPath, targetHwid }
// in  (message):    { type: 'target', hwid }         retarget without restarting
// out (message):    { type: 'device', device, hwid } first time a device is seen
//                   { type: 'key', device, vk, extended, blocked }
//                   { type: 'error', message }

const { parentPort, workerData, receiveMessageOnPort } = require('worker_threads');
const koffi = require('koffi');

const FILTER_KEY_ALL = 0xffff;   // filter everything, decide here.
                                 // INTERCEPTION_FILTER_KEY_DOWN is 0x01, same value as KEY_UP - a
                                 // well-known footgun in this API. Taking ALL sidesteps it.
const STROKE_BYTES = 24;         // InterceptionStroke is a union sized to the mouse stroke
const HWID_BYTES = 1000;         // wchar_t[500]
const MAPVK_VSC_TO_VK_EX = 3;

const fail = (message) => { parentPort.postMessage({ type: 'error', message }); process.exit(1); };

let lib, MapVirtualKeyW;
try {
  const dll = koffi.load(workerData.dllPath);
  lib = {
    createContext:  dll.func('interception_create_context', 'void *', []),
    destroyContext: dll.func('interception_destroy_context', 'void', ['void *']),
    setFilter:      dll.func('interception_set_filter', 'void', ['void *', 'void *', 'uint16_t']),
    wait:           dll.func('interception_wait', 'int', ['void *']),
    receive:        dll.func('interception_receive', 'int', ['void *', 'int', 'void *', 'uint']),
    send:           dll.func('interception_send', 'int', ['void *', 'int', 'void *', 'uint']),
    getHardwareId:  dll.func('interception_get_hardware_id', 'size_t', ['void *', 'int', 'void *', 'uint']),
  };
  MapVirtualKeyW = koffi.load('user32.dll').func('__stdcall', 'MapVirtualKeyW', 'uint32', ['uint32', 'uint32']);
} catch (e) {
  fail(`Could not load interception.dll: ${e.message}`);
}

const ctx = lib.createContext();
if (!ctx) fail('Interception driver not responding. Is it installed, and has the machine rebooted since?');

const isKeyboard = koffi.register(
  (device) => (device >= 1 && device <= 10 ? 1 : 0),
  koffi.pointer(koffi.proto('int InterceptionPredicate(int device)'))
);
lib.setFilter(ctx, isKeyboard, FILTER_KEY_ALL);

let targetHwid = workerData.targetHwid || null;
const stroke = Buffer.alloc(STROKE_BYTES);
const hwidBuf = Buffer.alloc(HWID_BYTES);
const hwids = new Map();

// A Windows hardware id is a NUL-separated multi-string, most specific entry first.
const readHwid = (device) => {
  const len = lib.getHardwareId(ctx, device, hwidBuf, HWID_BYTES);
  const parts = hwidBuf.toString('ucs2', 0, Math.max(0, Math.min(len, HWID_BYTES)))
    .split('\0').filter(Boolean);
  return parts[0] || '';
};

process.on('exit', () => lib.destroyContext(ctx));

for (;;) {
  const device = lib.wait(ctx);
  if (lib.receive(ctx, device, stroke, 1) <= 0) continue;

  // Drain retarget messages without yielding - the loop above never returns to the event loop.
  let queued;
  while ((queued = receiveMessageOnPort(parentPort))) {
    if (queued.message && queued.message.type === 'target') targetHwid = queued.message.hwid || null;
  }

  if (!hwids.has(device)) {
    hwids.set(device, readHwid(device));
    parentPort.postMessage({ type: 'device', device, hwid: hwids.get(device) });
  }

  const code = stroke.readUInt16LE(0);
  const state = stroke.readUInt16LE(2);
  const extended = (state & 2) !== 0;
  const blocked = !!targetHwid && hwids.get(device) === targetHwid;

  if ((state & 1) === 0) {   // key down only; the macro fires once per press
    parentPort.postMessage({
      type: 'key',
      device,
      vk: MapVirtualKeyW(extended ? code | 0xe000 : code, MAPVK_VSC_TO_VK_EX),
      extended,
      blocked,
    });
  }

  if (!blocked) lib.send(ctx, device, stroke, 1);
}
