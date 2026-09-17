// Run with: node src/keyboard.test.js
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// Enough of a DOM for the file to load; these tests only exercise the pure helpers.
const ctx = { module: {}, document: { addEventListener() {} }, window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/keyboard.js', 'utf8'), ctx);
const { keyboardMarkup, macrosByKey } = ctx;

// The markup is the contract between the picture and the engine's virtual-key codes.
const ids = [...keyboardMarkup().matchAll(/data-id="(\d+)"/g)].map(m => Number(m[1]));
assert.ok(ids.includes(96) && ids.includes(110), 'numpad 0 and . must be drawable');
assert.ok(ids.includes(13), 'Enter must be drawable');
assert.strictEqual(ids.filter(id => id === 13).length, 2, 'main Enter and numpad ENT both carry id 13');
assert.strictEqual(ids.filter(id => id === 16).length, 2, 'both Shifts are drawn');

// A macro bound to this board beats one left on "any device" - same precedence the
// engine uses, in either input order.
const padA = { hwid: 'A' };
const bound = { keyId: 97, device: 'A', desc: 'bound' };
const any = { keyId: 97, device: '', desc: 'any' };
assert.strictEqual(macrosByKey([any, bound], padA).get('97').desc, 'bound');
assert.strictEqual(macrosByKey([bound, any], padA).get('97').desc, 'bound');

// A macro bound to another board is not drawn here at all.
assert.strictEqual(macrosByKey([{ keyId: 97, device: 'B' }], padA).size, 0);

// With nothing paired, only "any device" macros show.
assert.strictEqual(macrosByKey([bound, any], undefined).get('97').desc, 'any');

console.log('keyboard.js ok');
