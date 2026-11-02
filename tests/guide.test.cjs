'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'guide.js'), 'utf8');
const sandbox = { globalThis: null }; sandbox.globalThis = sandbox; vm.createContext(sandbox); vm.runInContext(source, sandbox);
const G = sandbox.BahriaGuide;
const plain = value => JSON.parse(JSON.stringify(value));   // the module runs in its own realm; compare plain data

test('a fresh state has nothing dismissed and no welcome seen', () => {
  assert.deepEqual(plain(G.empty()), { v: 1, welcome: false, tour: false, seen: [] });
  assert.equal(G.welcomed(undefined), false);
  assert.deepEqual(plain(G.progress(undefined)), { seen: 0, total: 4 });
});

test('anything that is not a clean record is read as a fresh state', () => {
  for (const raw of [null, undefined, 0, 1, 'x', true, [], [1, 2], () => 1]) assert.deepEqual(plain(G.sanitize(raw)), { v: 1, welcome: false, tour: false, seen: [] }, String(raw));
});

test('only known hints are kept, once each, and only a real true counts as welcomed', () => {
  const s = plain(G.sanitize({ welcome: 'yes', seen: ['search', 'search', 'nonsense', 42, null, {}, ['search'], '__proto__', 'constructor', 'timetable'], extra: 'dropped' }));
  assert.deepEqual(s, { v: 1, welcome: false, tour: false, seen: ['search', 'timetable'] });
  assert.equal(G.welcomed({ welcome: true }), true);
  assert.equal(G.welcomed({ welcome: 1 }), false);
  assert.deepEqual(Object.keys(G.sanitize({ welcome: true, seen: [], __proto__: { polluted: 1 } })).sort(), ['seen', 'tour', 'v', 'welcome']);
  assert.equal(({}).polluted, undefined);
});

test('marking a hint or the welcome returns a new state and never changes the old one', () => {
  const a = G.empty(), b = G.mark(a, 'search'), c = G.markWelcome(b);
  assert.deepEqual(plain(a), { v: 1, welcome: false, tour: false, seen: [] });
  assert.deepEqual(plain(b), { v: 1, welcome: false, tour: false, seen: ['search'] });
  assert.deepEqual(plain(c), { v: 1, welcome: true, tour: false, seen: ['search'] });
  assert.deepEqual(plain(G.mark(c, 'search')), plain(c), 'marking twice changes nothing');
  assert.deepEqual(plain(G.mark(c, 'not-a-hint')), plain(c), 'an unknown hint is ignored');
  assert.equal(G.isSeen(c, 'search'), true); assert.equal(G.isSeen(c, 'timetable'), false);
  assert.deepEqual(plain(G.progress(G.mark(c, 'timetable'))), { seen: 2, total: 4 });
});

test('a page shows the first hint that applies and has not been dismissed, never more than one', () => {
  const order = ['attendance', 'search'];
  assert.equal(G.pick(G.empty(), order), 'attendance', 'the feature on the page comes before the general hint');
  assert.equal(G.pick(G.mark(G.empty(), 'attendance'), order), 'search');
  assert.equal(G.pick(G.mark(G.mark(G.empty(), 'attendance'), 'search'), order), null);
  assert.equal(G.pick(G.empty(), []), null);
  assert.equal(G.pick(G.empty(), ['bogus']), null);
  assert.equal(G.pick(G.empty(), 'search'), null, 'a string is not a list');
  assert.equal(G.pick(G.empty(), undefined), null);
});

test('every hint has a title and text, and the search hint names the right keys for the device', () => {
  for (const key of G.ORDER) { const h = G.hint(key, {}); assert.ok(h.title.length > 3 && h.text.length > 20, key); assert.ok(!/[{}]/.test(h.text), key + ' has no leftover placeholder'); }
  assert.match(G.hint('search', { mac: false }).text, /^Press Ctrl\+K or \//);
  assert.match(G.hint('search', { mac: true }).text, /^Press Cmd\+K or \//);
  assert.match(G.hint('search', { touch: true }).text, /^Tap the magnifier/);
  assert.equal(G.hint('timetable', { touch: true }).text, G.HINTS.timetable.text, 'hints without a touch wording use the same text');
  assert.equal(G.hint('nope', {}), null);
});

test('a tour can be asked for again, and the first-open tour is only for people with tips on', () => {
  const fresh = G.empty();
  assert.equal(G.wantsTour(fresh, true), true, 'first open, tips on');
  assert.equal(G.wantsTour(fresh, false), false, 'tips off: no automatic tour');
  assert.equal(G.wantsTour(G.markWelcome(fresh), true), false, 'once shown it does not come back by itself');
  const again = G.requestTour(G.markWelcome(fresh));
  assert.equal(G.wantsTour(again, false), true, 'but a replay asked for in settings works even with tips off');
  assert.deepEqual(plain(G.markWelcome(again)), { v: 1, welcome: true, tour: false, seen: [] }, 'showing it clears the request');
  assert.equal(G.sanitize({ tour: 'yes' }).tour, false, 'only a real true counts');
  const hints = G.mark(G.mark(G.markWelcome(fresh), 'search'), 'timetable');
  assert.deepEqual(plain(G.clearHints(hints)), { v: 1, welcome: true, tour: false, seen: [] }, 'forgetting the hints keeps the welcome as seen');
});

test('the hint list cannot be edited from outside', () => {
  assert.throws(() => { 'use strict'; G.HINTS.search.title = 'x'; });
  assert.throws(() => { 'use strict'; G.ORDER.push('x'); });
});

test('the module touches nothing outside itself (no storage, network, DOM or timers)', () => {
  assert.ok(!/\b(?:chrome|browser|document|window|fetch|XMLHttpRequest|localStorage|setTimeout|setInterval|eval)\b/.test(source.replace(/\/\/.*$/gm, '')));
});
