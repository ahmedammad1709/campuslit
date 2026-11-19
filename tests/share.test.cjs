const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');
const ctx = vm.createContext({ Object, Array, String, Number, Math, JSON, Date, Map, Set, Error, Uint8Array, TextEncoder, TextDecoder, btoa, atob, console });
ctx.globalThis = ctx;
for (const f of ['themes.js', 'share.js']) vm.runInContext(read(f), ctx, { filename: f });
const S = ctx.BahriaShare, B = ctx.BahriaStudio, plain = x => JSON.parse(JSON.stringify(x));
const decode = text => S.decode(text, B.normalizeCustom);
const theme = { name: 'Rose Night', bg: '#1a1216', surface: '#241a1f', nav: '#2b1620', ink: '#f6eef1', accent: '#e0527f', soft: '', line: '', muted: '', navInk: '', gold: '' };

test('a theme becomes one short code and comes back exactly', () => {
  const code = S.encode(theme);
  assert.match(code, /^CL1-[A-Za-z0-9_-]+$/); assert.ok(code.length < 80, 'short enough for a chat: ' + code.length);
  const back = decode(code);
  assert.equal(back.ok, true); assert.deepEqual(plain(back.custom), plain(B.normalizeCustom(theme)));
  const full = { ...theme, name: 'Café اردو ☃', soft: '#2a2025', line: '#3a2d34', muted: '#c9b8bf', navInk: '#ffffff', gold: '#f2b84b' };
  const again = decode(S.encode(full));
  assert.equal(again.ok, true); assert.deepEqual(plain(again.custom), plain(B.normalizeCustom(full)), 'optional colours and a non-English name survive');
});

test('a code can be pasted inside a message, with spaces, line breaks and the wrong case on the prefix', () => {
  const code = S.encode(theme);
  for (const text of ['  ' + code + '  ', 'Try my theme!\n' + code + '\nEnjoy', code.replace('CL1-', 'cl1-'), '“' + code + '”', 'a ' + code + ' b ' + S.encode({ ...theme, name: 'Other' })]) {
    const r = decode(text); assert.equal(r.ok, true, text.slice(0, 30)); assert.equal(r.custom.name, 'Rose Night');
  }
});

test('a code that lost or changed a character is caught, never turned into a wrong theme', () => {
  const code = S.encode(theme);
  assert.equal(decode(code.slice(0, -3)).reason, 'damaged', 'cut short');
  for (let i = 4; i < code.length; i += 3) {
    const flipped = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
    assert.equal(decode(flipped).ok, false, 'a changed character at ' + i + ' is not accepted');
  }
});

test('anything that is not a code is refused with a reason, and nothing hostile gets through', () => {
  assert.equal(decode('').reason, 'empty'); assert.equal(decode('   ').reason, 'empty'); assert.equal(decode(null).reason, 'empty');
  for (const text of ['hello', 'CL1-', 'CL1-short', '#2f5bea', '{"bg":"#fff"}', '<img src=x onerror=alert(1)>']) assert.equal(decode(text).reason, 'notcode', text);
  assert.equal(decode('CL1-' + 'A'.repeat(600)).ok, false, 'a huge string is not parsed');
  assert.equal(decode('CL1-' + '!'.repeat(40)).ok, false);
  // a name is plain text however it was written: angle brackets and control characters never survive
  const evil = decode(S.encode({ ...theme, name: '<b>x</b>\u0007Hi' }));
  assert.equal(evil.ok, true); assert.ok(!/[<>\u0007]/.test(evil.custom.name), evil.custom.name);
  // a theme that is incomplete cannot be shared at all
  assert.equal(S.encode(null), ''); assert.equal(S.encode({ ...theme, bg: 'red' }), ''); assert.equal(S.encode({ name: 'x' }), '');
});

test('a code from a newer Campuslit says so instead of guessing', () => {
  const code = S.encode(theme), bytes = Buffer.from(code.slice(4).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  bytes[0] = 2;   // the version byte, with a matching check so only the version differs
  const body = bytes.subarray(0, bytes.length - 2); let crc = 0xffff;
  for (const b of body) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
  bytes[bytes.length - 2] = crc >> 8; bytes[bytes.length - 1] = crc & 255;
  assert.equal(decode('CL1-' + bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')).reason, 'newer');
});

test('every reason has a message for the person, and the settings page loads the code before the Studio uses it', () => {
  for (const reason of ['empty', 'notcode', 'damaged', 'newer', 'invalid']) assert.ok(S.MESSAGES[reason] && S.MESSAGES[reason].length > 10, reason);
  const html = read('options.html'); assert.ok(html.indexOf('share.js') > 0 && html.indexOf('share.js') < html.indexOf('studio.js'));
  assert.doesNotMatch(read('share.js'), /\bfetch\s*\(|XMLHttpRequest|innerHTML|eval\s*\(/, 'no network, no markup');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The hard checks: every kind of theme the product can make, and every way a pasted code can go wrong.

test('every built-in theme, copied into a custom theme, survives sharing unchanged', () => {
  for (const [id, preset] of Object.entries(B.themes)) {
    const custom = B.normalizeCustom(B.customFromPalette(preset, preset.name));
    assert.ok(custom, id + ' makes a valid custom theme');
    const back = decode(S.encode(custom));
    assert.equal(back.ok, true, id); assert.deepEqual(plain(back.custom), plain(custom), id);
  }
});

test('hundreds of generated and random palettes survive sharing, and every code stays short', () => {
  let longest = 0;
  for (let i = 0; i < 400; i++) {
    const made = i % 2 ? B.surpriseCustom().custom : B.generateCustom({ accent: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'), mode: i % 4 === 1 ? 'dark' : 'light', side: ['deep', 'tinted', 'soft'][i % 3], name: 'T' + i });
    const custom = B.normalizeCustom(made); if (!custom) continue;
    const code = S.encode(custom); longest = Math.max(longest, code.length);
    const back = decode(code); assert.equal(back.ok, true, JSON.stringify(custom)); assert.deepEqual(plain(back.custom), plain(custom));
  }
  assert.ok(longest <= 120, 'longest code ' + longest);
});

test('names: empty, longest, emoji, right-to-left, spaces and look-alike markup all come back as safe plain names', () => {
  const base = { bg: '#101010', surface: '#202020', nav: '#303030', ink: '#f0f0f0', accent: '#4080c0', soft: '', line: '', muted: '', navInk: '', gold: '' };
  const cases = [ ['', 'My theme'], ['A', 'A'], [ 'x'.repeat(24), 'x'.repeat(24) ], ['Night 🌙', 'Night 🌙'], ['الليل', 'الليل'], ['  spaced   out  ', 'spaced out'], ['<script>alert(1)</script>', 'scriptalert(1)/script'] ];
  for (const [name, expected] of cases) {
    const custom = B.normalizeCustom({ ...base, name }), back = decode(S.encode(custom));
    assert.equal(back.ok, true, JSON.stringify(name)); assert.equal(back.custom.name, expected.slice(0, 24), JSON.stringify(name));
    assert.deepEqual(plain(back.custom), plain(custom));
  }
  const long = B.normalizeCustom({ ...base, name: 'y'.repeat(200) }); assert.equal(decode(S.encode(long)).custom.name.length, 24);
  // an emoji split by the 24-character limit never breaks the code
  const edge = B.normalizeCustom({ ...base, name: 'a'.repeat(23) + '🌙' }), edgeBack = decode(S.encode(edge));
  assert.equal(edgeBack.ok, true); assert.ok(!/\ud83c(?![\udc00-\udfff])/.test(edgeBack.custom.name), 'no half an emoji');
});

test('changing any one character of a valid code never produces a different theme (it is refused, or it is still the same theme)', () => {
  const custom = B.normalizeCustom({ name: 'Rose Night', bg: '#1a1216', surface: '#241a1f', nav: '#2b1620', ink: '#f6eef1', accent: '#e0527f', soft: '#2a2025', line: '#3a2d34', muted: '#c9b8bf', navInk: '#ffffff', gold: '#f2b84b' });
  const code = S.encode(custom), alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let refused = 0, same = 0;
  for (let i = 4; i < code.length; i++) for (const ch of alphabet) {
    if (ch === code[i]) continue;
    const r = decode(code.slice(0, i) + ch + code.slice(i + 1));
    if (!r.ok) refused++; else { same++; assert.deepEqual(plain(r.custom), plain(custom), 'position ' + i + ' -> ' + ch + ' gave another theme'); }
  }
  assert.ok(refused > same * 20, 'nearly all changes are refused: ' + refused + ' vs ' + same);
  for (let cut = 1; cut < code.length - 4; cut++) { const r = decode(code.slice(0, cut + 4)); if (r.ok) assert.deepEqual(plain(r.custom), plain(custom), 'cut at ' + cut); }
  for (const extra of ['A', 'AA', 'AAAA', '-', '_x']) { const r = decode(code + extra); if (r.ok) assert.deepEqual(plain(r.custom), plain(custom), 'extra ' + extra); }
});

test('decoding never throws and never hangs, whatever is pasted', () => {
  let seed = 987654; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_= \n\t<>"\'\/{}[]()%&\u0000‮🌙';
  const started = Date.now();
  for (let i = 0; i < 6000; i++) {
    let s = rnd() < .7 ? 'CL1-' : ''; const n = Math.floor(rnd() * 150); for (let k = 0; k < n; k++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    const r = decode(s); assert.ok(r && typeof r.ok === 'boolean'); if (!r.ok) assert.ok(S.MESSAGES[r.reason], 'a message for ' + r.reason);
  }
  for (const s of ['CL1-' + 'A'.repeat(200000), 'x'.repeat(2000000), 'CL1-\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000', 'CL1-' + '-'.repeat(399), 'CL1-' + '_'.repeat(399), undefined, 42, {}, []]) assert.equal(decode(s).ok, false);
  assert.ok(Date.now() - started < 4000, 'fast: ' + (Date.now() - started) + ' ms');
});

test('a theme that is not complete or not valid is refused when shared, and a decoded theme is always valid', () => {
  const ok = { name: 'x', bg: '#101010', surface: '#202020', nav: '#303030', ink: '#f0f0f0', accent: '#4080c0' };
  assert.notEqual(S.encode(ok), '');
  for (const key of ['bg', 'surface', 'nav', 'ink', 'accent']) { for (const bad of ['', '#fff', 'red', '#gggggg', null, 5, '#1234567']) assert.equal(S.encode({ ...ok, [key]: bad }), '', key + '=' + bad); }
  assert.notEqual(S.encode({ ...ok, soft: 'not a colour', gold: 5 }), '', 'a bad optional colour is simply left out');
  const r = decode(S.encode({ ...ok, soft: 'not a colour' })); assert.equal(r.ok, true); assert.equal(r.custom.soft, '');
});
