// Parses the AHK Send syntax stored in macro profiles into a flat event list.
// Pure JS, no FFI - the SendInput side consumes this. Keeps profiles working untouched.
//
// Covers the two dialects that exist in real profiles:
//   recorded (script.js) -> DOM key names:  ^+{ArrowLeft}  {Escape}
//   manual toggle        -> AHK key names:  !{PgDn}  #{r}  {Space}-{Space}
//
//   node src/send-parser.js --self-test
//   node src/send-parser.js --coverage      report over the installed profiles

const E = true; // needs KEYEVENTF_EXTENDEDKEY

// name -> [vk, extended]. Lowercased keys; AHK and DOM spellings both point at the same entry.
const KEYS = {
  space: [0x20], enter: [0x0d], return: [0x0d], tab: [0x09],
  esc: [0x1b], escape: [0x1b], backspace: [0x08], bs: [0x08],
  delete: [0x2e, E], del: [0x2e, E], insert: [0x2d, E], ins: [0x2d, E],
  home: [0x24, E], end: [0x23, E],
  pgup: [0x21, E], pageup: [0x21, E], pgdn: [0x22, E], pagedown: [0x22, E],
  left: [0x25, E], arrowleft: [0x25, E], up: [0x26, E], arrowup: [0x26, E],
  right: [0x27, E], arrowright: [0x27, E], down: [0x28, E], arrowdown: [0x28, E],
  capslock: [0x14], printscreen: [0x2c, E], pause: [0x13], appskey: [0x5d, E],
  lwin: [0x5b], rwin: [0x5c, E],
  numpadadd: [0x6b], numpadsub: [0x6d], numpadmult: [0x6a],
  numpaddiv: [0x6f, E], numpaddot: [0x6e], numpadenter: [0x0d, E],
  volume_up: [0xaf, E], volume_down: [0xae, E], volume_mute: [0xad, E],
  media_play_pause: [0xb3, E], media_next: [0xb0, E], media_prev: [0xb1, E],
};
for (let i = 1; i <= 24; i++) KEYS['f' + i] = [0x6f + i];        // F1..F24 -> 0x70..0x87
for (let i = 0; i <= 9; i++) KEYS['numpad' + i] = [0x60 + i];

const MODS = { '^': 'ctrl', '+': 'shift', '!': 'alt', '#': 'win' };

// A bare unmodified character is typed as text (layout-independent via unicode).
// With a modifier it must be a real key press, so it needs a virtual-key code.
const charToVk = (ch) => {
  const c = ch.toUpperCase();
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0);
  if (c >= '0' && c <= '9') return c.charCodeAt(0);
  return null;
};

function parseSend(input) {
  const events = [];
  const unknown = [];
  let pending = {};       // modifiers awaiting their key
  let text = '';          // run of literal characters being accumulated

  const flushText = () => { if (text) { events.push({ kind: 'text', text }); text = ''; } };
  const emitChord = (vk, extended) => {
    flushText();
    events.push({ kind: 'chord', vk, extended: !!extended, mods: pending });
    pending = {};
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (MODS[ch]) { flushText(); pending[MODS[ch]] = true; continue; }

    if (ch === '{') {
      const end = input.indexOf('}', i + 1);
      if (end === -1) { unknown.push(input.slice(i)); break; }   // unterminated brace
      const name = input.slice(i + 1, end);
      i = end;

      const hit = KEYS[name.toLowerCase()];
      if (hit) { emitChord(hit[0], hit[1]); continue; }
      if (name.length === 1) {                                   // {r} means the literal r
        const vk = charToVk(name);
        if (Object.keys(pending).length) { if (vk) emitChord(vk); else unknown.push('{' + name + '}'); }
        else text += name;
        continue;
      }
      unknown.push('{' + name + '}');                            // unrecognised named key
      pending = {};
      continue;
    }

    if (Object.keys(pending).length) {
      const vk = charToVk(ch);
      if (vk) emitChord(vk);
      else { unknown.push(Object.keys(pending).map(m => m[0]).join('') + ch); pending = {}; }
      continue;
    }
    text += ch;
  }

  flushText();
  return { events, unknown };
}

const describe = (e) => e.kind === 'text'
  ? `text ${JSON.stringify(e.text)}`
  : [...Object.keys(e.mods), `vk0x${e.vk.toString(16).padStart(2, '0')}`].join('+') + (e.extended ? ' (ext)' : '');

function selfTest() {
  const eq = (input, expect, msg) => {
    const got = parseSend(input).events.map(describe).join(' , ');
    console.assert(got === expect, `${msg}\n  input:    ${JSON.stringify(input)}\n  expected: ${expect}\n  got:      ${got}`);
  };
  eq('^c', 'ctrl+vk0x43', 'single modifier');
  eq('^+!p', 'ctrl+shift+alt+vk0x50', 'stacked modifiers');
  eq('!{F4}', 'alt+vk0x73', 'named function key');
  eq('!{PgDn}', 'alt+vk0x22 (ext)', 'AHK dialect, extended key');
  eq('^+{ArrowLeft}', 'ctrl+shift+vk0x25 (ext)', 'DOM dialect resolves to the same key');
  eq('#{r}', 'win+vk0x52', 'braced single char with modifier');
  eq('{Space}-{Space}', 'vk0x20 , text "-" , vk0x20', 'named keys around literal text');
  eq('{Space}\u2014{Space}', 'vk0x20 , text "\u2014" , vk0x20', 'unicode literal survives');
  eq('hello', 'text "hello"', 'bare text merges into one run');

  console.assert(parseSend('{Nope}').unknown.length === 1, 'unknown key is reported, not dropped');
  console.assert(parseSend('^{').unknown.length === 1, 'unterminated brace is reported');
  console.assert(parseSend('{PgDn}').events[0].vk === parseSend('{PageDown}').events[0].vk, 'dialects agree');
  console.log('self-test ok');
}

function coverage() {
  const fs = require('fs');
  const p = process.env.APPDATA + '/macropad-studio/profiles.json';
  const rows = [];
  if (fs.existsSync(p)) {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [prof, list] of Object.entries(d.profiles || {}))
      for (const m of list) if (m.type === 'send') rows.push([prof, m.visualKey, m.desc, m.value]);
  }

  let bad = 0;
  console.log(`${rows.length} send macros\n`);
  for (const [, key, desc, value] of rows) {
    const { events, unknown } = parseSend(value);
    if (unknown.length) bad++;
    console.log(`${JSON.stringify(value).padEnd(22)} -> ${events.map(describe).join(' , ')}` +
      (unknown.length ? `   UNPARSED: ${unknown.join(', ')}` : '') + `   [${key}] ${desc}`);
  }
  console.log(`\n${rows.length - bad}/${rows.length} fully parsed, ${bad} with unparsed tokens.`);
}

module.exports = { parseSend, KEYS };
if (require.main === module) (process.argv[2] === '--coverage' ? coverage : selfTest)();
