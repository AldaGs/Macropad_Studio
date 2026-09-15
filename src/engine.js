// The macro engine: owns the capture worker, turns key presses into actions.
// Replaces the LuaMacros -> pressed_key.txt -> {F24} -> AutoHotkey chain.
//
//   node src/engine.js --self-test     checks INPUT encoding without sending anything

const path = require('path');
const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const koffi = require('koffi');
const { parseSend } = require('./send-parser');

// --- SendInput (user32) -------------------------------------------------------
// INPUT is 40 bytes on x64: type at 0, then the KEYBDINPUT union at offset 8.
const INPUT_BYTES = 40;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

const VK_MOD = { ctrl: 0x11, shift: 0x10, alt: 0x12, win: 0x5b };

const user32 = koffi.load('user32.dll');
const SendInput = user32.func('__stdcall', 'SendInput', 'uint32', ['uint32', 'void *', 'int']);

function writeInput(buf, i, { vk = 0, scan = 0, flags = 0 }) {
  const o = i * INPUT_BYTES;
  buf.writeUInt32LE(INPUT_KEYBOARD, o);
  buf.writeUInt16LE(vk, o + 8);
  buf.writeUInt16LE(scan, o + 10);
  buf.writeUInt32LE(flags, o + 12);
  // time (o+16) and dwExtraInfo (o+24) stay zero
}

const utf16Units = (s) => {
  const units = [];
  for (let i = 0; i < s.length; i++) units.push(s.charCodeAt(i));
  return units;
};

// Turns parser events into a flat down/up list, then one SendInput call.
function buildInputs(events) {
  const seq = [];
  for (const e of events) {
    if (e.kind === 'text') {
      for (const unit of utf16Units(e.text)) {
        seq.push({ scan: unit, flags: KEYEVENTF_UNICODE });
        seq.push({ scan: unit, flags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP });
      }
      continue;
    }
    const mods = Object.keys(e.mods).filter((m) => VK_MOD[m]);
    const ext = e.extended ? KEYEVENTF_EXTENDEDKEY : 0;
    for (const m of mods) seq.push({ vk: VK_MOD[m] });
    seq.push({ vk: e.vk, flags: ext });
    seq.push({ vk: e.vk, flags: ext | KEYEVENTF_KEYUP });
    for (const m of mods.reverse()) seq.push({ vk: VK_MOD[m], flags: KEYEVENTF_KEYUP });
  }
  const buf = Buffer.alloc(seq.length * INPUT_BYTES);
  seq.forEach((s, i) => writeInput(buf, i, s));
  return { buf, count: seq.length };
}

function sendKeys(value) {
  const { events, unknown } = parseSend(value);
  const { buf, count } = buildInputs(events);
  if (count) SendInput(count, buf, INPUT_BYTES);
  return unknown;
}

// --- Toast text ---------------------------------------------------------------
// Mirrors the AHK FormatTime placeholders the profiles already use.
const expandPlaceholders = (text, now = new Date()) => {
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return String(text)
    .replace(/\{datetime\}/g, date + '  ' + time)
    .replace(/\{time\}/g, time)
    .replace(/\{date\}/g, date);
};

// --- Engine -------------------------------------------------------------------
class Engine extends EventEmitter {
  constructor({ dllPath, ahkExe, userDataPath, getState, showToast, openPath }) {
    super();
    Object.assign(this, { dllPath, ahkExe, userDataPath, getState, showToast, openPath });
    this.worker = null;
    this.devices = new Map();
  }

  start() {
    if (this.worker) return;
    const { Worker } = require('worker_threads');
    this.worker = new Worker(path.join(__dirname, 'capture-worker.js'), {
      workerData: { dllPath: this.dllPath, targetHwid: this.targetHwid() },
    });
    this.worker.on('message', (m) => this.onMessage(m));
    this.worker.on('error', (e) => this.emit('error', e));
    this.worker.on('exit', () => { this.worker = null; });
  }

  stop() { if (this.worker) { this.worker.terminate(); this.worker = null; } }

  targetHwid() {
    const s = this.getState();
    return (s.settings && s.settings.hardwareId) || null;
  }

  setTarget(hwid) {
    if (this.worker) this.worker.postMessage({ type: 'target', hwid });
  }

  onMessage(m) {
    if (m.type === 'error') return this.emit('error', new Error(m.message));
    if (m.type === 'device') {
      this.devices.set(m.device, m.hwid);
      return this.emit('device', m);
    }
    if (m.type === 'key') {
      this.emit('key', m);
      if (m.blocked) this.dispatch(m.vk);
    }
  }

  dispatch(vk) {
    const state = this.getState();
    const macros = (state.profiles && state.profiles[state.activeProfile]) || [];
    const macro = macros.find((m) => String(m.keyId) === String(vk));
    if (!macro) return;

    const osdOn = !!(state.settings && state.settings.showOSD);
    const color = (state.settings && state.settings.toastColor) || '#28a745';

    if (macro.type === 'clock') {
      return this.showToast(expandPlaceholders(macro.desc || macro.value), color);
    }
    if (osdOn) this.showToast(expandPlaceholders(macro.desc || macro.visualValue), color);

    try {
      if (macro.type === 'send') {
        const unknown = sendKeys(macro.value);
        if (unknown.length) this.emit('warning', { macro, unknown });
      } else if (macro.type === 'run') {
        // No shell: cmd.exe splits an unquoted path at its first space, which breaks every
        // "C:\Program Files\..." macro. CreateProcess keeps the path intact and still
        // searches PATH for bare names like calc.exe.
        const child = spawn(macro.value, { detached: true, stdio: 'ignore' });
        // Folders, documents, URLs and .bat files are not executables - let the shell open those.
        child.on('error', () => this.openPath && this.openPath(macro.value));
        child.unref();
      } else if (macro.type === 'custom') {
        this.runAhk(macro.value);
      }
    } catch (e) {
      this.emit('error', e);
    }
  }

  // ponytail: custom macros spawn AutoHotkey per press (~100ms). Kept so the existing
  // custom macros keep working; delete this once they are ported to JS.
  runAhk(code) {
    const userCustom = path.join(this.userDataPath, 'user_custom.ahk');
    const file = path.join(os.tmpdir(), 'mps-custom-' + process.pid + '.ahk');
    const header = '#Requires AutoHotkey v2.0\n#SingleInstance Off\n' +
      (fs.existsSync(userCustom) ? '#Include "' + userCustom.replace(/\\/g, '/') + '"\n' : '');
    fs.writeFileSync(file, header + code, 'utf-8');
    spawn(this.ahkExe, [file], { detached: true, stdio: 'ignore' }).unref();
  }
}

function selfTest() {
  const { buf, count } = buildInputs(parseSend('^c').events);
  console.assert(count === 4, 'ctrl+c is 4 inputs, got ' + count);
  console.assert(buf.length === 4 * INPUT_BYTES, 'buffer is 40 bytes per input');
  console.assert(buf.readUInt32LE(0) === INPUT_KEYBOARD, 'type is INPUT_KEYBOARD');
  console.assert(buf.readUInt16LE(8) === 0x11, 'first input is ctrl down');
  console.assert(buf.readUInt16LE(40 + 8) === 0x43, 'second is C down');
  console.assert(buf.readUInt32LE(40 + 12) === 0, 'C down has no flags');
  console.assert(buf.readUInt32LE(80 + 12) === KEYEVENTF_KEYUP, 'third is C up');
  console.assert(buf.readUInt16LE(120 + 8) === 0x11 && buf.readUInt32LE(120 + 12) === KEYEVENTF_KEYUP, 'ctrl released last');

  const ext = buildInputs(parseSend('!{PgDn}').events);
  console.assert(ext.buf.readUInt32LE(40 + 12) === KEYEVENTF_EXTENDEDKEY, 'PgDn carries the extended flag');

  const uni = buildInputs(parseSend('—').events);
  console.assert(uni.count === 2, 'one character is a down/up pair');
  console.assert(uni.buf.readUInt16LE(10) === 0x2014, 'em dash goes through as a unicode unit');
  console.assert(uni.buf.readUInt32LE(12) === KEYEVENTF_UNICODE, 'text uses KEYEVENTF_UNICODE');

  const mixed = buildInputs(parseSend('{Space}-{Space}').events);
  console.assert(mixed.count === 6, 'space, hyphen, space is 6 inputs, got ' + mixed.count);

  const d = new Date(2026, 8, 15, 14, 30, 5);
  console.assert(expandPlaceholders('at {time}', d).startsWith('at 02:30:05'), 'time placeholder');
  console.assert(expandPlaceholders('{date}', d) === 'Tuesday, September 15, 2026', 'date placeholder');
  console.assert(expandPlaceholders('none', d) === 'none', 'text without placeholders is untouched');

  // Regression: run macros must not go through a shell. Under shell:true cmd.exe splits an
  // unquoted path at its first space and spawn reports no error at all, so this stays silent.
  const probe = spawn('C:\\Program Files\\__mps_nonexistent__\\x.exe', { stdio: 'ignore' });
  probe.on('error', (e) => {
    console.assert(e.code === 'ENOENT', 'spaced path should reach CreateProcess intact, got ' + e.code);
    console.log('run-path regression check ok');
  });
  probe.on('spawn', () => console.assert(false, 'spaced path unexpectedly spawned - is shell:true back?'));

  console.log('self-test ok');
}

module.exports = { Engine, sendKeys, buildInputs, expandPlaceholders };
if (require.main === module) selfTest();
