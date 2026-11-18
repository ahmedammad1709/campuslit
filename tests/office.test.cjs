const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (...files) => {
  const ctx = vm.createContext({ URL, TextDecoder, TextEncoder, Uint8Array, DataView, ArrayBuffer, Response, Blob, DecompressionStream, atob, Error, Math, Number, String, Map, Set, Promise, Date, console });
  ctx.globalThis = ctx;
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8'), ctx, { filename: f });
  return ctx;
};
const { BahriaGrid: G, BahriaLegacy: L } = load('grid.js', 'legacy.js');
const samples = () => import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'lib', 'office-samples.mjs')).href);
const u8 = buf => new Uint8Array(buf);
const plain = x => JSON.parse(JSON.stringify(x));   // across the sandbox boundary arrays differ in identity only

test('number and date formats: plain numbers stay tidy, the common formats work, dates read as dates', () => {
  assert.equal(G.formatNumber(0.1 + 0.2, 0, ''), '0.3', 'no floating point noise');
  assert.equal(G.formatNumber(42, 0, ''), '42');
  assert.equal(G.formatNumber(91.5, 2, ''), '91.50');
  assert.equal(G.formatNumber(0.256, 9, ''), '26%');
  assert.equal(G.formatNumber(0.256, 10, ''), '25.60%');
  assert.equal(G.formatNumber(1234567.891, 166, '#,##0.0'), '1,234,567.9');
  assert.equal(G.formatNumber(-5, 3, ''), '-5');
  assert.equal(G.formatNumber(12, 170, '0.00E+00'), '12', 'scientific formats fall back to the plain number');
  assert.equal(G.isDate(14), true); assert.equal(G.isDate(46), true);
  assert.equal(G.isDate(165, 'd\\ mmm\\ yyyy'), true); assert.equal(G.isDate(0, 'General'), false); assert.equal(G.isDate(2, '0.00'), false); assert.equal(G.isDate(166, '#,##0.0'), false); assert.equal(G.isDate(167, '"Rs "0'), false);
  const serial = Math.round((Date.UTC(2026, 10, 17) - Date.UTC(1899, 11, 30)) / 86400000);
  assert.equal(G.formatDate(serial, 'dd/mm/yyyy', false), '17/11/2026');
  assert.equal(G.formatDate(serial, 'd mmm yyyy', false), '17 Nov 2026');
  assert.equal(G.formatDate(serial + 0.5, 'dd/mm/yyyy hh:mm', false), '17/11/2026 12:00');
  assert.equal(G.formatDate(0.75, 'hh:mm:ss', false), '18:00:00', 'a time alone');
  assert.equal(G.formatDate(-3, 'dd/mm/yyyy', false), '-3', 'nonsense stays as it is');
  assert.equal(G.colName(0), 'A'); assert.equal(G.colName(25), 'Z'); assert.equal(G.colName(26), 'AA'); assert.equal(G.colName(701), 'ZZ'); assert.equal(G.colName(702), 'AAA');
});

test('old Word files: the text comes from the piece table, field codes are dropped, table cells keep their order', async () => {
  const S = await samples();
  const text = L.docText(L.open(u8(S.docSample('Hello \x93Word\x94\rSecond\x0bbroken line\rField: \x13 HYPERLINK "http://x" \x14shown result\x15 end\rA\x07B\x07\x07\rLast'))));
  assert.ok(text.includes('Hello “Word”'), 'curly quotes decoded from Windows-1252');
  assert.ok(text.includes('Second broken line'), 'a line break inside a paragraph');
  assert.ok(text.includes('Field: shown result end') && !text.includes('HYPERLINK'), 'a field shows its result, not its code');
  assert.ok(text.includes('A  |  B\n'), 'a table row reads across');
  assert.ok(text.endsWith('Last'));
});

test('old Excel files: strings (also split across records), numbers, formulas, dates, booleans and errors', async () => {
  const S = await samples(), ole = L.open(u8(S.xlsSample()));
  assert.equal(L.detect(ole), 'xls');
  const sheets = L.xlsSheets(ole), t = (r, c) => { const row = sheets[0].rows.get(r); const cell = row && row.get(c); return cell && cell.text; };
  assert.deepEqual(plain(sheets.map(s => [s.name, s.hidden])), [['Marks', false], ['Hidden', true]]);
  assert.deepEqual([t(0, 0), t(0, 1), t(1, 0), t(1, 1), t(2, 0), t(2, 1), t(2, 2), t(2, 3), t(2, 4)], ['Name', 'Marks', 'Ammad', '91.50', 'ABCDEFGHIJ', '42', '123.45', '7', '8']);
  assert.equal(t(3, 0), '<script>window.__pwned = 5</script>', 'a wide string that follows a split one');
  assert.deepEqual([t(3, 1), t(4, 0), t(5, 0), t(5, 1)], ['7', 'calc', 'TRUE', '#DIV/0!']);
  assert.deepEqual([t(6, 0), t(6, 1)], ['17/11/2026', '17 Nov 2026']);
  assert.deepEqual(plain(sheets[0].merges), [{ r1: 7, r2: 7, c1: 0, c2: 2 }]);
  assert.equal(sheets[0].widths.get(0), 18 * 7 + 5);
  assert.equal(sheets[1].rows.get(0).get(0).text, 'Ammad', 'hidden sheets are read, the drawing skips them');
});

test('old PowerPoint files: the text of each slide, in order, with titles marked', async () => {
  const S = await samples(), ole = L.open(u8(S.pptSample()));
  assert.equal(L.detect(ole), 'ppt');
  const slides = L.pptSlides(ole);
  assert.equal(slides.length, 2);
  assert.deepEqual(plain(slides[0].map(x => [x.kind, x.text])), [[0, 'Networks 101'], [1, 'Layers\rTCP and UDP\u000bsecond line'], [4, 'Free text box on slide one']]);
  assert.deepEqual(plain(slides[1].map(x => x.text)), ['<script>window.__pwned = 7</script>', 'Last point', 'Another box']);
});

test('damaged, cut-off and scrambled old files fail cleanly, never hang and never throw anything but a plain error', async () => {
  const S = await samples();
  assert.throws(() => L.open(u8(Buffer.from('this is not an office file at all, just text'.repeat(40)))), /not an old Office file/);
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const [make, run] of [[S.docSample('Some text\rmore text'), o => L.docText(o)], [S.xlsSample(), o => L.xlsSheets(o)], [S.pptSample(), o => L.pptSlides(o)]]) {
    const good = u8(make);
    for (let i = 0; i < 60; i++) {   // cut anywhere
      const cut = Math.floor(rnd() * good.length);
      try { run(L.open(good.slice(0, cut))); } catch (e) { assert.ok(e instanceof Error, 'a plain Error: ' + e); }
    }
    for (let i = 0; i < 250; i++) {   // scramble a few bytes
      const bad = good.slice(); for (let k = 0; k < 6; k++) bad[Math.floor(rnd() * bad.length)] = Math.floor(rnd() * 256);
      try { run(L.open(bad)); } catch (e) { assert.ok(e instanceof Error, 'a plain Error: ' + e); }
    }
  }
});
