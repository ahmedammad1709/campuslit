const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const path = require('node:path');

const load = (...files) => {
  const ctx = vm.createContext({ URL, TextDecoder, TextEncoder, Uint8Array, DataView, Response, Blob, DecompressionStream, atob, Error, Math, Number, String, Map, Set, Promise, console });
  ctx.globalThis = ctx;
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8'), ctx, { filename: f });
  return ctx;
};
const { BahriaPreview: P, BahriaZip: Z } = load('preview.js', 'zip.js');
const b64 = s => Buffer.from(s, 'utf8').toString('base64').replace(/=+$/, '');
const href = (name, kind = 'Lecture', host = 'https://lms.bahria.edu.pk') => host + '/Student/Download.php?k=' + encodeURIComponent(b64('1001,2026-11-16,' + kind + ',0,' + name + ',lms.bahria.edu.pk/Student/LectureNotes.php?s=a&oc=b'));

test('only the LMS download address, on the page\'s own site, may be fetched', () => {
  const page = 'https://lms.bahria.edu.pk/Student/Assignments.php?s=x&oc=y', good = href('Slides.pdf');
  assert.equal(P.fileUrl(good, page), good);
  assert.equal(P.fileUrl('/Student/Download.php?k=abc', page), 'https://lms.bahria.edu.pk/Student/Download.php?k=abc', 'a relative link resolves on the page\'s own site');
  for (const bad of ['https://evil.example/Student/Download.php?k=abc', 'https://lms.bahria.edu.pk.evil.example/Student/Download.php?k=abc', 'https://lms.bahria.edu.pk/Student/Download.php', 'https://lms.bahria.edu.pk/Student/Other.php?k=abc',
    'https://lms.bahria.edu.pk/Student/Download.php.evil?k=abc', 'javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@lms.bahria.edu.pk/Student/Download.php?k=abc', '//evil.example/Student/Download.php?k=abc', 'https://cms.bahria.edu.pk/Student/Download.php?k=abc', ''])
    assert.equal(P.fileUrl(bad, page), null, bad);
  assert.equal(P.fileUrl(good, 'https://cms.bahria.edu.pk/Sys/Student/Home.aspx'), null, 'not from a CMS page');
  assert.equal(P.fileUrl(good, 'https://evil.example/'), null, 'not from another site');
  assert.equal(P.fileUrl(good, 'not a url'), null);
});

test('the file name and type come from the link\'s code; damaged or odd codes are ignored', () => {
  const a = P.parseKey(href('OBE-Introduction-31082026-060647am.pptx')); assert.equal(a.name, 'OBE-Introduction-31082026-060647am.pptx'); assert.equal(a.ext, 'pptx'); assert.equal(a.source, 'Lecture');
  assert.equal(P.parseKey(href('My report, final.docx', 'AssignmentSubmissions')).name, 'My report, final.docx', 'commas in a name are kept');
  assert.equal(P.parseKey(href('..\\..\\evil/path.pdf')).name, '....evilpath.pdf', 'no path pieces in a name');
  assert.equal(P.parseKey('https://lms.bahria.edu.pk/Student/Download.php?k=!!!notbase64'), null);
  assert.equal(P.parseKey('https://lms.bahria.edu.pk/Student/Download.php'), null);
  assert.equal(P.parseKey(href('noextension')), null);
  assert.equal(P.parseKey('https://lms.bahria.edu.pk/Student/Download.php?k=' + b64('1,2')), null);
});

test('kinds, what can be shown, and the types that come next', () => {
  for (const e of ['pdf', 'PDF', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'csv', 'docx']) assert.ok(P.supported(e), e);
  for (const e of ['xlsx', 'pptx', 'zip', 'doc', 'xls', 'ppt', 'exe', 'html', 'svg', 'js', '']) assert.ok(!P.supported(e), e + ' is not shown yet');
  assert.equal(P.kindOf('pptx'), 'pptx'); assert.equal(P.kindOf('doc'), 'legacy'); assert.equal(P.kindOf('svg'), 'other'); assert.equal(P.kindOf('html'), 'other');
  assert.equal(P.mimeFor('pdf'), 'application/pdf'); assert.equal(P.mimeFor('exe'), 'application/octet-stream');
});

test('the bytes must be the kind of file the name claims', () => {
  const u = a => Uint8Array.from(a);
  assert.ok(P.sniff(u([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), 'pdf'));
  assert.ok(!P.sniff(u([0x3c, 0x68, 0x74, 0x6d, 0x6c]), 'pdf'), 'an HTML page called .pdf is refused');
  assert.ok(P.sniff(u([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'png'));
  assert.ok(!P.sniff(u([0xff, 0xd8, 0xff]), 'png'));
  assert.ok(P.sniff(u([0xff, 0xd8, 0xff, 0xe0]), 'jpg') && P.sniff(u([0xff, 0xd8, 0xff, 0xe0]), 'jpeg'));
  assert.ok(P.sniff(u([0x50, 0x4b, 0x03, 0x04, 0]), 'docx'));
  assert.ok(!P.sniff(u([0x25, 0x50, 0x44, 0x46, 0x2d]), 'docx'));
  assert.ok(P.sniff(Buffer.from('plain words\nand more'), 'txt') && !P.sniff(Uint8Array.from([65, 0, 66]), 'txt'), 'text with binary bytes is refused');
  assert.ok(!P.sniff(new Uint8Array(0), 'pdf') && !P.sniff(null, 'pdf'));
  assert.equal(P.readableSize(500), '500 B'); assert.equal(P.readableSize(185811), '181 KB'); assert.equal(P.readableSize(5 * 1048576), '5 MB');
});

// ---- a tiny zip writer for the tests (stored and deflated entries)
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(files, { lieSize } = {}) {
  const locals = [], central = []; let offset = 0;
  for (const [name, content, method = 8] of files) {
    const raw = Buffer.from(content), data = method === 8 ? zlib.deflateRawSync(raw) : raw, nm = Buffer.from(name), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(lieSize === undefined ? raw.length : lieSize, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nm, data); central.push(ch, nm); offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Uint8Array.from(Buffer.concat([...locals, cd, end]));
}

test('the zip reader opens stored and compressed parts', async () => {
  const zip = Z.open(makeZip([['word/document.xml', '<w:document>hello</w:document>'], ['readme.txt', 'stored words', 0], ['dir/', '', 0]]));
  assert.ok(zip.has('word/document.xml') && zip.has('readme.txt') && !zip.has('nope'));
  assert.equal(await zip.readText('word/document.xml'), '<w:document>hello</w:document>');
  assert.equal(await zip.readText('readme.txt'), 'stored words');
  await assert.rejects(() => zip.read('nope'), /Not in the file/);
  await assert.rejects(() => zip.read('dir/'), /Not in the file/);
});

test('the zip reader refuses damaged files and tricks', async () => {
  assert.throws(() => Z.open(new Uint8Array(10)), /not a zip/);
  assert.throws(() => Z.open(Uint8Array.from(Buffer.from('this is plainly not a zip file at all, just words'))), /not a zip/);
  const good = makeZip([['a.txt', 'abc']]);
  assert.throws(() => Z.open(good.subarray(0, good.length - 5)), /not a zip|damaged/, 'a cut-off file');
  // a part that claims to be small but unpacks huge (a zip bomb): stopped at the limit, whatever the file says about itself
  const bomb = Z.open(makeZip([['big.txt', Buffer.alloc(3 * 1024 * 1024, 65)]], { lieSize: 10 }));
  await assert.rejects(() => bomb.read('big.txt', 1024 * 1024), /too large/);
  const honest = Z.open(makeZip([['big.txt', Buffer.alloc(3 * 1024 * 1024, 65)]]));
  await assert.rejects(() => honest.read('big.txt', 1024), /too large/, 'the size it announces is checked first');
  const damaged = makeZip([['a.txt', 'abc', 0]]); damaged.set([0, 0, 0, 0], 0);
  await assert.rejects(() => Z.open(damaged).read('a.txt'), /damaged/);
});
