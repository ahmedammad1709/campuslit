const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const ctx = vm.createContext({ Object, Array, String, Number, Math, JSON }); ctx.globalThis = ctx;
vm.runInContext(read('extension/whatsnew.js'), ctx, { filename: 'whatsnew.js' });
const W = ctx.BahriaWhatsNew, plain = x => JSON.parse(JSON.stringify(x));
const manifest = JSON.parse(read('extension/manifest.json'));

test('versions compare as numbers, and anything that is not x.y.z is refused', () => {
  assert.equal(W.compare('1.2.1', '1.2.2'), -1); assert.equal(W.compare('1.10.0', '1.9.9'), 1); assert.equal(W.compare('1.2.2', '1.2.2'), 0);
  for (const bad of ['', 'latest', '1.2', '1.2.3.4', '1.2.x', '1.2.3-beta', null, undefined, 12, {}, '9999999.1.1']) assert.equal(W.compare(bad, '1.0.0'), null, String(bad));
});

test('the note kept after an update: only a real upgrade is kept, and damaged notes are dropped', () => {
  assert.deepEqual(plain(W.recordFor('1.2.1', '1.2.2')), { from: '1.2.1', to: '1.2.2' });
  for (const [from, to] of [['1.2.2', '1.2.2'], ['1.3.0', '1.2.2'], [undefined, '1.2.2'], ['junk', '1.2.2'], ['1.2.1', 'junk']]) assert.equal(W.recordFor(from, to), null, from + ' -> ' + to);
  assert.equal(W.sanitizeNews(null), null); assert.equal(W.sanitizeNews([]), null); assert.equal(W.sanitizeNews('1.2.2'), null);
  assert.deepEqual(plain(W.sanitizeNews({ from: '1.0.0', to: '1.2.2', extra: '<img src=x onerror=alert(1)>' })), { from: '1.0.0', to: '1.2.2' }, 'only the two versions survive');
});

test('what is shown: the versions after the one you had, up to the new one, newest first; a few lines and a count of the rest', () => {
  assert.deepEqual(plain(W.since('1.2.1', '1.2.2').map(r => r.version)), ['1.2.2']);
  assert.deepEqual(plain(W.since('1.1.3', '1.2.2').map(r => r.version)), ['1.2.2', '1.2.1', '1.2.0']);
  assert.deepEqual(plain(W.since('1.2.2', '1.2.2')), [], 'nothing new');
  const s = W.summary(W.since('1.1.3', '1.2.2'), 4);
  assert.equal(s.items.length, 4); assert.ok(s.more > 0); assert.equal(s.items[0], W.RELEASES[0].items[0], 'the newest version comes first');
  assert.deepEqual(plain(W.summary([], 4)), { items: [], more: 0 });
});

test('the bundled changelog is well formed, newest first, and has an entry for the version being shipped', () => {
  const versions = W.RELEASES.map(r => r.version);
  for (let i = 1; i < versions.length; i++) assert.equal(W.compare(versions[i - 1], versions[i]), 1, 'newest first: ' + versions[i - 1] + ' before ' + versions[i]);
  for (const r of W.RELEASES) {
    assert.match(r.date, /^\d{1,2} [A-Z][a-z]+ 20\d\d$/, r.version + ' date'); assert.ok(r.items.length >= 1 && r.items.every(t => typeof t === 'string' && t.length > 10 && t.length < 260 && !/[<>]/.test(t)), r.version + ' items are plain text');
  }
  assert.ok(versions.includes(manifest.version), 'whatsnew.js has no entry for version ' + manifest.version);
  assert.equal(versions[0], manifest.version, 'the newest entry is the version being shipped');
  const page = read('site/versions.html');
  assert.ok(page.includes('id="v' + manifest.version.replace(/\./g, '-') + '"'), 'the website Versions page has the shipped version');
});

test('the pieces are wired together: the scripts load before they are used, in both browsers, and a reset forgets the note', () => {
  for (const f of ['popup.html', 'options.html']) { const h = read('extension/' + f); assert.ok(h.indexOf('whatsnew.js') > 0 && h.indexOf('whatsnew.js') < h.indexOf('storage.js'), f + ': whatsnew.js before storage.js'); }
  assert.match(read('extension/background.js'), /importScripts\([^)]*'whatsnew\.js'/, 'the Chrome worker imports it');
  assert.match(read('scripts/build.mjs'), /'notify-core\.js', 'whatsnew\.js', 'background\.js'/, 'the Firefox background scripts list it');
  const storage = read('extension/storage.js'); assert.match(storage, /remove\(\[key, remindersKey, guideKey, newsKey\]\)/, 'Reset all settings removes the note');
  assert.ok(!('permissions' in manifest) || !manifest.permissions.some(p => /tabs|management|downloads/.test(p)), 'no new permission was needed');
});
