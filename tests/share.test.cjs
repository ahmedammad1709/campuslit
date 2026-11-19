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
