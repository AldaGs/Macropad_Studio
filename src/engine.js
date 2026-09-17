// The macro engine: owns the capture worker, turns key presses into actions.
// Replaces the LuaMacros -> pressed_key.txt -> {F24} -> AutoHotkey chain.
//
//   node src/engine.js --self-test     checks INPUT encoding without sending anything

const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { spawn, execFileSync } = require('child_process');
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
const Beep = koffi.load('kernel32.dll').func('__stdcall', 'Beep', 'bool', ['uint32', 'uint32']);

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

function sendText(text) {
  const { buf, count } = buildInputs([{ kind: 'text', text: String(text) }]);
  if (count) SendInput(count, buf, INPUT_BYTES);
}

// Splits a run value into program + arguments.
// ponytail: splits at the first ".exe " because an unquoted path with spaces is otherwise
// ambiguous ("C:\Program Files\x.exe" vs "chrome.exe --flag"). Covers every real profile;
// swap for a real quote-aware tokeniser if someone needs an argument before the .exe.
function splitCommand(value) {
  const v = String(value).trim();
  const m = v.match(/^(.*?\.exe)\s+(.*)$/i);
  if (!m) return { file: v, args: [] };
  return { file: m[1], args: tokenizeArgs(m[2]) };
}

function tokenizeArgs(s) {
  const args = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(s))) {
    // --flag="value" has to survive as one argument with the quotes stripped
    args.push(m[1] !== undefined ? m[1] : m[2].replace(/"([^"]*)"/g, '$1'));
  }
  return args;
}

// CreateProcess searches PATH only, so a bare "chrome.exe" fails even though the Run box
// opens it - Explorer also reads the App Paths registry key. Mirror that lookup so macros
// can be written the way users expect. Full paths and non-.exe targets are passed through.
const exeCache = new Map();
function resolveExe(file) {
  if (/[\\/]/.test(file) || !/\.exe$/i.test(file)) return file;
  if (exeCache.has(file)) return exeCache.get(file);
  const key = 'Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\' + file;
  let found = file;
  for (const root of ['HKCU', 'HKLM']) {
    try {
      const out = execFileSync('reg', ['query', root + '\\' + key, '/ve'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/REG_SZ\s+(.+)/);
      if (m) { found = m[1].trim().replace(/^"|"$/g, ''); break; }
    } catch { /* no such key under this root */ }
  }
  exeCache.set(file, found);
  return found;
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
  constructor({ dllPath, getState, showToast, openPath }) {
    super();
    Object.assign(this, { dllPath, getState, showToast, openPath });
    this.worker = null;
    this.devices = new Map();
  }

  start() {
    if (this.worker) return;
    const { Worker } = require('worker_threads');
    this.worker = new Worker(path.join(__dirname, 'capture-worker.js'), {
      workerData: { dllPath: this.dllPath, targetHwids: this.targetHwids() },
    });
    this.worker.on('message', (m) => this.onMessage(m));
    this.worker.on('error', (e) => this.emit('error', e));
    this.worker.on('exit', () => { this.worker = null; });
  }

  stop() { if (this.worker) { this.worker.terminate(); this.worker = null; } }

  targetHwids() {
    const s = this.getState();
    return ((s.settings && s.settings.devices) || []).map((d) => d.hwid).filter(Boolean);
  }

  // Push the current device list to the worker. It only takes effect on the next
  // keystroke, since the capture loop is parked in a blocking wait until then.
  syncTargets() {
    if (this.worker) this.worker.postMessage({ type: 'target', hwids: this.targetHwids() });
  }

  // While capturing, the next key from a bound device is reported instead of run,
  // so the editor can bind whichever physical key the user presses.
  captureNextKey(cb) { this.pendingCapture = cb; }
  cancelCapture() { this.pendingCapture = null; }

  onMessage(m) {
    if (m.type === 'error') {
      const err = new Error(m.message);
      err.setup = !!m.setup;   // driver missing, not a runtime fault
      return this.emit('error', err);
    }
    if (m.type === 'device') {
      this.devices.set(m.device, m.hwid);
      return this.emit('device', m);
    }
    if (m.type === 'key') {
      this.emit('key', m);
      if (!m.blocked) return;

      if (this.pendingCapture) {
        const cb = this.pendingCapture;
        this.pendingCapture = null;
        return cb(m);
      }
      this.dispatch(m.vk, m.hwid);
    }
  }

  dispatch(vk, hwid) {
    const state = this.getState();
    const macros = (state.profiles && state.profiles[state.activeProfile]) || [];

    // A macro bound to this specific macropad wins over one left on "any device",
    // so a shared key can still be overridden per board.
    const sameKey = macros.filter((m) => String(m.keyId) === String(vk));
    const macro = sameKey.find((m) => m.device && m.device === hwid)
      || sameKey.find((m) => !m.device);
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
        this.launch(macro.value);
      } else if (macro.type === 'js') {
        this.runJs(macro);
      } else if (macro.type === 'custom') {
        // Legacy AHK macro, most likely from an .mps exported before the engine swap.
        // AutoHotkey is no longer bundled, so say so rather than doing nothing.
        this.emit('warning', { macro, unknown: ['AutoHotkey macro'] });
        this.showToast('This macro needs AutoHotkey. Convert it to JavaScript.', '#cc3300');
      }
    } catch (e) {
      this.emit('error', e);
    }
  }

  // No shell: cmd.exe splits an unquoted path at its first space, which breaks every
  // "C:\Program Files\..." macro. CreateProcess keeps the path intact and still searches
  // PATH for bare names like calc.exe.
  launch(value) {
    const { file, args } = splitCommand(value);
    const child = spawn(resolveExe(file), args, { detached: true, stdio: 'ignore' });
    // Folders, documents, URLs and .bat files are not executables - let the shell open those.
    // Only the target goes to the shell: it opens one thing and takes no arguments, so
    // handing it the whole command line produces a bogus "Windows cannot find" dialog.
    child.on('error', (e) => {
      if (this.openPath) this.openPath(file);
      else this.emit('error', e);
    });
    child.unref();
  }

  // The helpers a js macro gets. Everything here is used by a real macro - Date, fetch and
  // the rest of the Node globals are already in scope and need no wrapper.
  jsContext() {
    const { clipboard } = require('electron');
    return {
      send: (s) => sendKeys(s),
      type: (t) => sendText(t),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      run: (cmd) => this.launch(cmd),
      notify: (text) => this.showToast(String(text), '#28a745'),
      beep: (freq = 600, ms = 150) => Beep(freq, ms),
      clipboard: {
        read: () => clipboard.readText(),
        write: (t) => clipboard.writeText(String(t)),
        clear: () => clipboard.writeText(''),
      },
      // Resolves to the clipboard text once it turns non-empty, or '' if it never does.
      clipWait: async (ms = 1000) => {
        const until = Date.now() + ms;
        while (Date.now() < until) {
          const t = clipboard.readText();
          if (t) return t;
          await new Promise((r) => setTimeout(r, 25));
        }
        return '';
      },
    };
  }

  async runJs(macro) {
    try {
      const ctx = this.jsContext();
      const keys = Object.keys(ctx).join(', ');
      // Async wrapper so macros can await sleep() and fetch() at the top level.
      const fn = new Function(`{ ${keys} }`, `return (async () => {\n${macro.value}\n})()`);
      await fn(ctx);
    } catch (e) {
      this.emit('warning', { macro, unknown: [e.message] });
      this.showToast(`Macro error: ${e.message}`, '#cc3300');
    }
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

  // Device-aware macro resolution: specific binding beats "any device".
  const resolve = (macros, vk, hwid) => {
    const sameKey = macros.filter((m) => String(m.keyId) === String(vk));
    const hit = sameKey.find((m) => m.device && m.device === hwid) || sameKey.find((m) => !m.device);
    return hit ? hit.desc : null;
  };
  const padA = 'HID\\VID_046D&PID_C534&MI_00';
  const padB = 'HID\\VID_04D9&PID_1203&MI_00';
  const set = [
    { keyId: '97', desc: 'any' },
    { keyId: '97', device: padB, desc: 'B only' },
    { keyId: '98', device: padA, desc: 'A only' },
  ];
  console.assert(resolve(set, 97, padA) === 'any', 'falls back to the unbound macro');
  console.assert(resolve(set, 97, padB) === 'B only', 'device-specific beats unbound');
  console.assert(resolve(set, 98, padA) === 'A only', 'device-specific matches');
  console.assert(resolve(set, 98, padB) === null, 'other device gets nothing');
  console.assert(resolve(set, 99, padA) === null, 'unmapped key gets nothing');
  console.assert(resolve([{ keyId: '97', desc: 'legacy' }], 97, padA) === 'legacy',
    'macros with no device field keep working on any macropad');

  const cmd = (v) => { const r = splitCommand(v); return r.file + ' | ' + r.args.join(' | '); };
  console.assert(cmd('calc.exe') === 'calc.exe | ', 'bare exe, no args');
  console.assert(cmd('C:\\Program Files\\Adobe\\AfterFX.exe') === 'C:\\Program Files\\Adobe\\AfterFX.exe | ',
    'spaced path with no args stays whole');
  console.assert(cmd('chrome.exe --profile-directory="Default"') === 'chrome.exe | --profile-directory=Default',
    'quoted value inside a flag');
  console.assert(cmd('chrome.exe --profile-directory="Default" "https://web.whatsapp.com/"')
    === 'chrome.exe | --profile-directory=Default | https://web.whatsapp.com/', 'flag plus quoted url');
  console.assert(cmd('C:\\Program Files\\App\\a.exe  -x  -y') === 'C:\\Program Files\\App\\a.exe | -x | -y',
    'spaced path with args');

  // App Paths lookup: bare exe names resolve to a real path, everything else passes through.
  console.assert(resolveExe('C:\\Windows\\System32\\calc.exe') === 'C:\\Windows\\System32\\calc.exe',
    'a full path is never rewritten');
  console.assert(resolveExe('notepad') === 'notepad', 'non-.exe targets are left alone');
  console.assert(resolveExe('__mps_nonexistent__.exe') === '__mps_nonexistent__.exe',
    'an unregistered exe falls through unchanged');
  const resolved = resolveExe('chrome.exe');
  console.assert(resolved === 'chrome.exe' || (/chrome\.exe$/i.test(resolved) && /[\\/]/.test(resolved)),
    'chrome.exe resolves to a full path when Chrome is installed, got ' + resolved);

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
