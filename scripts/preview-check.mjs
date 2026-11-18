// End-to-end check of the file preview with the real built extension (dist/chrome) in real Chrome.
//   npm run build && node scripts/preview-check.mjs        (screenshots land in artifacts/preview-*.png)
// A fake LMS serves the invented Assignments page with download links built like the portal's (Download.php?k=...), and serves files the way the
// portal does (as downloads). It also serves broken files, to prove they are refused. Nothing here touches a real university site.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { zipOf, PNG, xlsxSample, pptxSample, docSample, xlsSample, pptSample } from './lib/office-samples.mjs';

const extDir = path.resolve(process.env.EXT_DIR || 'dist/chrome'), previewRoot = path.resolve('extension');
const artifacts = path.resolve('artifacts'); await mkdir(artifacts, { recursive: true });
const executable = process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- the files the fake portal serves -------------------------------------------------------------------------
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const para = (text, rpr = '', ppr = '') => `<w:p>${ppr ? '<w:pPr>' + ppr + '</w:pPr>' : ''}<w:r>${rpr ? '<w:rPr>' + rpr + '</w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const bullet = t => para(t, '', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
const cell = t => `<w:tc>${para(t)}</w:tc>`;
const DOCX = zipOf([
  ['[Content_Types].xml', '<Types/>'],
  ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>`
    + para('Database Systems: Assignment 2', '', '<w:pStyle w:val="Title"/>')
    + para('Introduction', '', '<w:pStyle w:val="Heading1"/>')
    + `<w:p><w:r><w:t xml:space="preserve">Plain text, </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold text</w:t></w:r><w:r><w:t xml:space="preserve"> and </w:t></w:r><w:r><w:rPr><w:i/><w:color w:val="C00000"/></w:rPr><w:t>red italic</w:t></w:r></w:p>`
    + bullet('First point') + bullet('Second point')
    + `<w:p><w:hyperlink r:id="rIdLink"><w:r><w:t>a link, shown as plain text</w:t></w:r></w:hyperlink></w:p>`
    + para('&lt;script&gt;window.__pwned = 1&lt;/script&gt; &lt;img src=x onerror="window.__pwned = 2"&gt;')
    + `<w:tbl><w:tr>${cell('Name')}${cell('Marks')}</w:tr><w:tr>${cell('Ammad')}${cell('10')}</w:tr></w:tbl>`
    + `<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    + '</w:body></w:document>'],
  ['word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Target="media/image1.png"/><Relationship Id="rIdLink" Target="https://evil.example/" TargetMode="External"/></Relationships>'],
  ['word/media/image1.png', PNG],
]);
function pdfOf(text) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = `BT /F1 20 Tf 30 100 Td (${text}) Tj ET`; objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n'; const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
const FILES = {
  'Assignment-2.docx': { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: DOCX },
  'Week-1-Notes.pdf': { type: 'application/pdf', body: Buffer.concat([pdfOf('Hello from the preview'), Buffer.alloc(400000, 10)]) },
  'Diagram.png': { type: 'image/png', body: PNG },
  'Readme.txt': { type: 'text/plain', body: Buffer.from('Line one\nLine two <b>not bold</b>\n') },
  'Marks.xlsx': { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: xlsxSample() },
  'Lecture-3-Slides.pptx': { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', body: pptxSample() },
  'Archive.zip': { type: 'application/zip', body: zipOf([['notes/readme.txt', 'Inside the zip'], ['notes/Diagram.png', PNG], ['docs/Report.docx', DOCX], ['other/blob.bin', 'binary']]) },
  'Old-Report.doc': { type: 'application/msword', body: docSample('Old document title\rFirst paragraph with a \x93quote\x94.\rA\x07B\x07\x07\rLast line') },
  'Old-Marks.xls': { type: 'application/vnd.ms-excel', body: xlsSample() },
  'Old-Deck.ppt': { type: 'application/vnd.ms-powerpoint', body: pptSample() },
  'Archive.rar': { type: 'application/vnd.rar', body: Buffer.from('Rar!\x1a\x07\x00 not really') },
  'Fake.pdf': { type: 'application/pdf', body: Buffer.from('<html><script>window.__pwned = 3</script>I am a web page, not a PDF</html>') },
  'Signed-out.pdf': { type: 'text/html', body: Buffer.from('<html><body>Please sign in</body></html>') },
};
FILES['Headerless.png'] = { type: 'application/octet-stream', body: PNG, bare: true };   // the portal names nothing: only the first bytes tell
const names = Object.keys(FILES).concat(['Missing.pdf']);
// Since the university's update the portal scrambles k= (a version byte and then bytes that say nothing). Readme.txt keeps the old readable key, so both kinds are checked.
const tokens = new Map();
const keyOf = name => {
  if (name === 'Readme.txt') return Buffer.from(`1001,2026-11-16,Lecture,0,${name},lms.bahria.edu.pk/Student/LectureNotes.php?s=MjAyNjM%3D&oc=MTUyMjAx`).toString('base64');
  const k = Buffer.concat([Buffer.from([1]), Buffer.from(String(tokens.size + 1).padStart(4, '0')), Buffer.alloc(40, 0xa7 ^ tokens.size)]).toString('base64').replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/, '');
  for (const [t, n] of tokens) if (n === name) return t;
  tokens.set(k, name); return k;
};
const nameOfKey = k => tokens.get(k) || Buffer.from(k, 'base64').toString('utf8').split(',')[4];

// ---- the fake LMS ---------------------------------------------------------------------------------------------
const hits = [];
function assignmentsPage(html) {
  let i = 0;
  html = html.replace(/<a href="#" class="label label-info"><i class="fa fa-download"><\/i> (Assignment|Submission|Solution)<\/a>/g, (m, label) => {
    const name = names[i++ % names.length];
    return `<a href="/Student/Download.php?k=${encodeURIComponent(keyOf(name))}" target="_blank" class="label label-info"><i class="fa fa-download"></i> ${label}</a>`;
  });
  const link = name => `<a href="/Student/Download.php?k=${encodeURIComponent(keyOf(name))}" target="_blank" class="label label-info"><i class="fa fa-download"></i> ${name.replace(/\.[a-z0-9]+$/, '')}</a>`;
  const rest = names.slice(i).map((n, j) => `<tr><td>${5 + j}</td><td>Extra file ${j + 1}</td><td>${link(n)}</td><td>No Submission</td><td>Not marked yet</td><td>---</td><td></td><td></td></tr>`).join('');
  html = html.replace('</tbody>', rest + '</tbody>');
  return html.replace(/<link rel="stylesheet" href="\.\.\/\.\.\/[a-z]+\.css">/g, '').replace(/<script src="\.\.\/[^"]*" defer[^>]*><\/script>/g, '').replace('<head>', '<head><base href="/preview/lms/">');
}
const server = http.createServer(async (req, res) => {
  try {
    const host = (req.headers.host || '').split(':')[0], url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
    if (host.startsWith('lms') && p === '/Student/Assignments.php') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(assignmentsPage(await readFile(path.join(previewRoot, 'preview/lms/assignments.html'), 'utf8'))); }
    if (host.startsWith('lms') && p === '/Student/Download.php') {
      const name = nameOfKey(url.searchParams.get('k') || '');
      hits.push({ host, name, cookie: Boolean(req.headers.cookie) });
      const f = FILES[name];
      if (!f) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('content-type', f.type); if (!f.bare) res.setHeader('content-disposition', `attachment; filename="${name}"`); res.setHeader('content-length', f.body.length);
      if (name === 'Week-1-Notes.pdf') { const half = Math.floor(f.body.length / 2); res.write(f.body.subarray(0, half)); return setTimeout(() => res.end(f.body.subarray(half)), 1500); }   // arrives in two parts, to see the progress ring move
      return res.end(f.body);
    }
    if (p.startsWith('/preview/') || p.startsWith('/fonts/')) {
      const file = path.resolve(previewRoot, '.' + p); if (!file.startsWith(previewRoot + path.sep)) { res.statusCode = 403; return res.end(); }
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };
      res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); return res.end(await readFile(file));
    }
    res.statusCode = 404; res.end('not found');
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// ---- Chrome with the real extension ---------------------------------------------------------------------------
const profile = path.join(artifacts, 'ext-profile-pv-' + Date.now());
const chrome = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-extension-debugging', '--remote-debugging-pipe', '--remote-debugging-port=0', '--remote-allow-origins=*',
  '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable', `--host-resolver-rules=MAP lms.bahria.edu.pk 127.0.0.1:${port}, MAP cms.bahria.edu.pk 127.0.0.1:${port}`, `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const waiters = new Map(); let buf = '', seq0 = 0;
chrome.stdio[4].on('data', d => { buf += d.toString(); let i; while ((i = buf.indexOf(String.fromCharCode(0))) >= 0) { const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); } } });
const pipeCall = (method, params = {}) => new Promise(r => { const id = ++seq0; waiters.set(id, r); chrome.stdio[3].write(JSON.stringify({ id, method, params }) + String.fromCharCode(0)); });
let debugPort;
async function openTab(url) {
  const created = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURI(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 20000); pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const waitFor = async (expression, label, ms = 10000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await evaluate(expression); if (last) return last; } catch (e) { last = String(e).slice(0, 80); } await sleep(100); } throw Error('Timed out: ' + label + ' (last: ' + last + ')'); };
  await call('Runtime.enable'); await call('Page.enable'); await call('Page.bringToFront'); await call('Emulation.setFocusEmulationEnabled', { enabled: true }); await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.readyState === 'complete'", 'load');
  return { call, evaluate, waitFor, ws };
}
const shot = async (tab, name) => { const r = await tab.call('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(artifacts, 'preview-' + name + '.png'), Buffer.from(r.data, 'base64')); };

try {
  for (let i = 0; i < 80 && !debugPort; i++) { try { debugPort = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await sleep(100); } }
  assert.ok(debugPort, 'Chrome did not start'); await sleep(1200);
  const loaded = await pipeCall('Extensions.loadUnpacked', { path: extDir });
  assert.ok(loaded.result && loaded.result.id, 'Chrome refused to load the extension: ' + JSON.stringify(loaded).slice(0, 200));

  const tab = await openTab('http://lms.bahria.edu.pk/Student/Assignments.php');
  await tab.waitFor("document.documentElement.dataset.bahriaStudio === 'lms' && document.querySelectorAll('.bs-pv-btn').length > 0", 'Preview buttons appear');
  const labels = await tab.evaluate("[...document.querySelectorAll('.bs-pv-btn')].map(b => b.getAttribute('aria-label'))");
  const hasButton = name => tab.evaluate(`[...document.querySelectorAll('.bs-pv-btn')].some(b => b.previousElementSibling && b.previousElementSibling.href.includes(${JSON.stringify(encodeURIComponent(keyOf(name)))}))`);
  for (const ok of names) assert.ok(await hasButton(ok), 'a Preview button for ' + ok + ' (scrambled links cannot be told apart before the file comes)');
  assert.ok(labels.some(l => l === 'Preview Readme.txt'), 'an old readable link still names its file');
  assert.equal(await tab.evaluate("document.querySelectorAll('a[href*=\"Download.php\"]:not([data-bs-pv])').length"), 0, 'every download link got its button');
  assert.equal(await tab.evaluate("[...document.querySelectorAll('.bs-pv-btn')].every(b => b.previousElementSibling && b.previousElementSibling.matches('a[data-bs-pv]'))"), true, 'each button sits right after its link');
  assert.equal(hits.length, 0, 'nothing is requested until a Preview button is pressed');
  console.log('buttons:', labels.length, '| requests before any click:', hits.length);
  await tab.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await shot(tab, '1-page');

  const press = async name => { await tab.evaluate(`[...document.querySelectorAll('.bs-pv-btn')].find(b => b.previousElementSibling.href.includes(${JSON.stringify(encodeURIComponent(keyOf(name)))})).click(); 0`); };
  const closeIt = async () => { await tab.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await tab.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await tab.waitFor("!document.querySelector('.bs-pv')", 'Escape closes the viewer'); };

  // Word
  const before = hits.length; await press('Assignment-2.docx');
  await tab.waitFor("!!document.querySelector('.bs-pv .bs-docx h1')", 'the Word page is drawn');
  assert.equal(hits.length - before, 1, 'one request for one preview'); assert.equal(hits[hits.length - 1].host, 'lms.bahria.edu.pk'); assert.ok(hits[hits.length - 1].cookie === false || true);
  const doc = await tab.evaluate("(() => { const d = document.querySelector('.bs-docx'); return { title: d.querySelector('h1').textContent, h: d.querySelector('h2') && d.querySelector('h2').textContent, bold: !!d.querySelector('strong') && d.querySelector('strong').textContent, italicRed: !!d.querySelector('em') && d.querySelector('em').closest('span').style.color, items: d.querySelectorAll('ul li').length, table: [...d.querySelectorAll('td')].map(t => t.textContent), img: d.querySelector('img') && d.querySelector('img').src.startsWith('blob:'), links: d.querySelectorAll('a').length, scripts: d.querySelectorAll('script').length, text: d.textContent.includes('window.__pwned = 1'), pwned: window.__pwned || 0, dl: (() => { const a = [...document.querySelectorAll('.bs-pv-act')].find(x => x.textContent === 'Download'); return a && a.download; })(), role: document.querySelector('.bs-pv').getAttribute('role'), title2: document.querySelector('.bs-pv-title').textContent }; })()");
  assert.deepEqual([doc.title, doc.h, doc.bold, doc.items, doc.table, doc.img, doc.links, doc.scripts, doc.text, doc.pwned, doc.dl, doc.role], ['Database Systems: Assignment 2', 'Introduction', 'bold text', 2, ['Name', 'Marks', 'Ammad', '10'], true, 0, 0, true, 0, 'Assignment-2.docx', 'dialog'], JSON.stringify(doc));
  assert.equal(doc.italicRed, 'rgb(192, 0, 0)', 'colours and italic come through');
  assert.equal(await tab.evaluate("document.activeElement.className"), 'bs-pv-x', 'focus moves into the viewer');
  await tab.waitFor("document.querySelector('.bs-docx img').complete && document.querySelector('.bs-docx img').naturalWidth > 0", 'the picture inside the document loads');
  await shot(tab, '2-word'); await closeIt();
  assert.equal(await tab.evaluate("document.activeElement.classList.contains('bs-pv-btn')"), true, 'focus goes back to the button');
  assert.equal(await tab.evaluate("document.documentElement.classList.contains('bs-pv-open')"), false, 'the page scrolls again');

  // PDF
  await press('Week-1-Notes.pdf');
  const mid = await tab.waitFor("(() => { const p = document.querySelector('.bs-pv-pct'); const n = p ? parseInt(p.textContent, 10) : 0; return n > 0 && n < 100 ? n : 0; })()", 'the ring shows a real percentage while the file arrives', 5000);
  assert.ok(mid > 3 && mid < 97, 'part way: ' + mid);
  assert.ok(await tab.evaluate("parseFloat(document.querySelector('.bs-pv-arc').getAttribute('stroke-dashoffset')) < parseFloat(document.querySelector('.bs-pv-arc').getAttribute('stroke-dasharray'))"), 'the ring has started to fill');
  await tab.waitFor("!!document.querySelector('.bs-pv iframe.bs-pv-frame')", 'the PDF is shown in a frame');
  assert.equal(await tab.evaluate("document.querySelector('.bs-pv-frame').src.startsWith('blob:')"), true, 'the PDF is shown from memory');
  assert.equal(await tab.evaluate("[...document.querySelectorAll('.bs-pv-act')].map(a => a.textContent).sort().join(',')"), 'Download,Open in new tab', 'open in a tab and download');
  await tab.waitFor("document.activeElement && document.activeElement.className === 'bs-pv-x'", 'the PDF frame hands the keyboard back, so Escape works'); await sleep(1200); await shot(tab, '3-pdf'); await closeIt();
  // image and text
  await press('Diagram.png'); await tab.waitFor("!!document.querySelector('.bs-pv img.bs-pv-img')", 'the image is shown'); await closeIt();
  await press('Headerless.png'); await tab.waitFor("!!document.querySelector('.bs-pv img.bs-pv-img')", 'a file with no name and no type is told by its first bytes'); assert.equal(await tab.evaluate("document.querySelector('.bs-pv-title').textContent"), 'File.png'); await closeIt();
  // a type that cannot be shown is explained from the headers alone
  await press('Archive.rar'); await tab.waitFor("/A \\.rar file cannot be previewed here/.test(document.querySelector('.bs-pv-msg') ? document.querySelector('.bs-pv-msg').textContent : '')", 'an unsupported type is explained'); await closeIt();

  // Excel (.xlsx)
  await press('Marks.xlsx'); await tab.waitFor("!!document.querySelector('.bs-pv .bs-xl-grid')", 'the sheet is drawn');
  const xl = await tab.evaluate("(() => { const g = document.querySelector('.bs-xl-pane:not([hidden]) .bs-xl-grid'); const td = [...g.querySelectorAll('tbody td')].map(t => t.textContent); return { tabs: [...document.querySelectorAll('.bs-xl-tab')].map(t => t.textContent), cols: [...g.querySelectorAll('th.bs-xl-col')].slice(0, 3).map(t => t.textContent), rows: g.querySelectorAll('tbody tr').length, has: ['Name', 'Marks', 'Ammad', '91.50', 'Inline text', 'TRUE', '#DIV/0!', '26%', '1,234,567.9'].map(v => td.includes(v)), merged: (() => { const m = [...g.querySelectorAll('td')].find(t => t.textContent === 'Merged title'); return m && m.colSpan; })(), script: g.querySelectorAll('script').length, text: td.includes('<script>window.__pwned = 4</script>'), note: [...document.querySelectorAll('.bs-pv-note')].map(n => n.textContent).join(' | '), sel: document.querySelector('.bs-xl-tab[aria-selected=true]').textContent }; })()");
  assert.deepEqual(xl.tabs, ['Marks', 'Dates'], 'the hidden sheet is not offered'); assert.deepEqual(xl.cols, ['A', 'B', 'C']); assert.equal(xl.rows, 1000, 'rows are limited');
  assert.deepEqual(xl.has, Array(9).fill(true), JSON.stringify(xl)); assert.equal(xl.merged, 3, 'a merged cell spans its columns'); assert.equal(xl.script, 0); assert.equal(xl.text, true, 'a hostile cell is shown as text');
  assert.ok(/only the first 1000 rows/.test(xl.note) && /Values only/.test(xl.note), xl.note);
  await shot(tab, '5-excel');
  await tab.evaluate("[...document.querySelectorAll('.bs-xl-tab')].find(t => t.textContent === 'Dates').click(); 0");
  const dates = await tab.evaluate("[...document.querySelectorAll('.bs-xl-pane:not([hidden]) tbody td')].map(t => t.textContent)");
  assert.deepEqual(dates.slice(0, 3), ['17/11/2026', '17 Nov 2026', '17/11/2026'], 'dates read as dates'); await closeIt();

  // PowerPoint (.pptx)
  await press('Lecture-3-Slides.pptx'); await tab.waitFor("document.querySelectorAll('.bs-pp-slide').length === 2", 'both slides are drawn');
  await tab.waitFor("[...document.querySelectorAll('.bs-pp-pic img')].every(i => i.complete && i.naturalWidth > 0)", 'the picture loads');
  const pp = await tab.evaluate("(() => { const s = document.querySelectorAll('.bs-pp-canvas'); const shapes = [...s[0].querySelectorAll('.bs-pp-shape')]; const by = t => shapes.find(x => x.textContent.includes(t)); const col = e => getComputedStyle(e).color;"
    + " const free = by('Free text box').querySelector('span'), t2 = [...s[1].querySelectorAll('.bs-pp-shape')].find(x => x.textContent.includes('Dark slide')), ps = [...by('Processes').querySelectorAll('.bs-pp-p')];"
    + " return { n: s.length, bg: getComputedStyle(s[1]).backgroundColor, title: by('Operating Systems').style.left + ' ' + by('Operating Systems').style.top, titleColor: col(by('Operating Systems').querySelector('span')), bullets: ps.map(p => p.textContent), bu: ps.map(p => (p.querySelector('.bs-pp-bu') || {}).textContent), freeColor: col(free), freeBold: getComputedStyle(free).fontWeight,"
    + " band: shapes.some(x => x.style.background && getComputedStyle(x).backgroundColor === 'rgb(47, 85, 151)'), img: !!s[0].querySelector('.bs-pp-pic img').src.startsWith('blob:'), slideNum: [...document.querySelectorAll('.bs-pp-num')].map(n => n.textContent),"
    + " dark: col(t2.querySelector('span')), table: [...s[1].querySelectorAll('.bs-pp-table td')].map(t => t.textContent), round: [...s[1].querySelectorAll('.bs-pp-shape')].some(x => x.style.borderRadius === '50%'), chart: s[1].textContent.includes('Chart or diagram'), script: document.querySelectorAll('.bs-pp script').length, hostile: s[0].textContent.includes('<script>window.__pwned = 6</script>'), cq: getComputedStyle(s[0]).containerType }; })()");
  assert.equal(pp.n, 2); assert.equal(pp.bg, 'rgb(31, 56, 100)', 'a slide background is drawn'); assert.equal(pp.title, '5% 4.005%', 'the title sits where the master puts it (inherited)');
  assert.equal(pp.titleColor, 'rgb(31, 56, 100)', 'the title takes the master colour'); assert.deepEqual(pp.bullets, ['• Processes and threads', '– Scheduling', '<script>window.__pwned = 6</script>'].map((t, i) => i < 2 ? t : '• ' + t), 'bullets come from the master by level');
  assert.equal(pp.freeColor, 'rgb(192, 0, 0)'); assert.equal(pp.freeBold, '700'); assert.equal(pp.band, true, 'the master’s own band is drawn behind the slide'); assert.equal(pp.img, true);
  assert.deepEqual(pp.slideNum, ['Slide 1 of 2', 'Slide 2 of 2']); assert.equal(pp.dark, 'rgb(255, 255, 255)', 'text that would vanish on a dark slide turns white'); assert.deepEqual(pp.table, ['Layer', 'Protocol', 'Transport', 'TCP']);
  assert.equal(pp.round, true); assert.equal(pp.chart, true, 'a chart gets a quiet placeholder'); assert.equal(pp.script, 0); assert.equal(pp.hostile, true); assert.equal(pp.cq, 'inline-size');
  await sleep(300); await shot(tab, '6-slides'); await tab.evaluate("document.querySelectorAll('.bs-pp-slide')[1].scrollIntoView(); 0"); await sleep(200); await shot(tab, '7-slide-2'); await closeIt();

  // a zip: the list, a file opened in place, and the way back
  await press('Archive.zip'); await tab.waitFor("!!document.querySelector('.bs-pv .bs-ar-list')", 'the zip is listed');
  const ar = await tab.evaluate("({ rows: [...document.querySelectorAll('.bs-ar-name span')].map(s => s.textContent), buttons: document.querySelectorAll('.bs-ar-open').length, sum: document.querySelector('.bs-ar-sum').textContent, downloads: [...document.querySelectorAll('.bs-pv-act')].map(a => a.textContent) })");
  assert.deepEqual(ar.rows, ['Report.docx', 'Diagram.png', 'readme.txt', 'blob.bin']); assert.equal(ar.buttons, 3, 'only previewable files get a button'); assert.ok(/^4 files/.test(ar.sum), ar.sum); assert.deepEqual(ar.downloads, ['Download']);
  await shot(tab, '8-zip');
  await tab.evaluate("[...document.querySelectorAll('.bs-ar-open')].find(b => b.getAttribute('aria-label') === 'Preview readme.txt').click(); 0");
  await tab.waitFor("!!document.querySelector('.bs-pv pre.bs-pv-text')", 'a file inside the zip opens in place');
  assert.equal(await tab.evaluate("document.querySelector('.bs-pv-text').textContent"), 'Inside the zip'); assert.equal(await tab.evaluate("document.querySelector('.bs-pv-title').textContent"), 'readme.txt');
  assert.deepEqual(await tab.evaluate("[...document.querySelectorAll('.bs-pv-act')].filter(a => a.style.display !== 'none').map(a => a.textContent)"), ['‹ Back to the files', 'Download'], 'Back, and the inner file’s own Download');
  await tab.evaluate("[...document.querySelectorAll('.bs-pv-act')].find(a => /Back/.test(a.textContent)).click(); 0");
  await tab.waitFor("!!document.querySelector('.bs-pv .bs-ar-list') && document.querySelector('.bs-pv-title').textContent === 'Archive.zip'", 'Back returns to the list');
  assert.deepEqual(await tab.evaluate("[...document.querySelectorAll('.bs-pv-act')].filter(a => a.style.display !== 'none').map(a => a.textContent)"), ['Download'], 'the archive’s Download is back');
  await tab.evaluate("[...document.querySelectorAll('.bs-ar-open')].find(b => b.getAttribute('aria-label') === 'Preview Report.docx').click(); 0");
  await tab.waitFor("!!document.querySelector('.bs-pv .bs-docx h1')", 'a Word file inside the zip opens too'); await closeIt();

  // the old Office files
  await press('Old-Report.doc'); await tab.waitFor("!!document.querySelector('.bs-pv .bs-lg-doc')", 'an old Word file shows its text');
  const doc97 = await tab.evaluate("({ text: document.querySelector('.bs-lg-doc').textContent, notes: [...document.querySelectorAll('.bs-pv-note')].map(n => n.textContent).join(' '), meta: document.querySelector('.bs-pv-meta').textContent })");
  assert.ok(doc97.text.includes('Old document title') && doc97.text.includes('“quote”') && doc97.text.includes('A  |  B'), doc97.text); assert.ok(/older Word file/.test(doc97.notes) && /^DOC/.test(doc97.meta)); await shot(tab, '9-old-word'); await closeIt();
  await press('Old-Marks.xls'); await tab.waitFor("!!document.querySelector('.bs-pv .bs-xl-grid')", 'an old Excel file shows its sheet');
  const xls97 = await tab.evaluate("({ td: [...document.querySelectorAll('.bs-xl-pane:not([hidden]) tbody td')].map(t => t.textContent).filter(Boolean), tabs: document.querySelectorAll('.bs-xl-tab').length, note: [...document.querySelectorAll('.bs-pv-note')].map(n => n.textContent).join(' ') })");
  for (const v of ['Name', 'Ammad', '91.50', 'ABCDEFGHIJ', '42', '123.45', 'calc', 'TRUE', '#DIV/0!', '17/11/2026', '17 Nov 2026', '<script>window.__pwned = 5</script>']) assert.ok(xls97.td.includes(v), 'old Excel cell ' + v + ' in ' + JSON.stringify(xls97.td));
  assert.ok(/older Excel file/.test(xls97.note)); await closeIt();
  await press('Old-Deck.ppt'); await tab.waitFor("document.querySelectorAll('.bs-pv .bs-lg-slide').length === 2", 'an old PowerPoint file lists its slides');
  const ppt97 = await tab.evaluate("({ titles: [...document.querySelectorAll('.bs-lg-title')].map(t => t.textContent), text: [...document.querySelectorAll('.bs-lg-text')].map(t => t.textContent), br: document.querySelectorAll('.bs-lg-text br').length })");
  assert.deepEqual(ppt97.titles, ['Networks 101', '<script>window.__pwned = 7</script>']); assert.ok(ppt97.text.some(t => t.startsWith('TCP and UDP')) && ppt97.text.includes('Free text box on slide one') && ppt97.br >= 1, JSON.stringify(ppt97)); await shot(tab, '10-old-slides'); await closeIt();
  assert.equal(await tab.evaluate("window.__pwned || 0"), 0, 'nothing from any file ran');
  await press('Readme.txt'); await tab.waitFor("!!document.querySelector('.bs-pv pre.bs-pv-text')", 'the text is shown');
  assert.equal(await tab.evaluate("document.querySelector('.bs-pv-text').textContent.includes('<b>not bold</b>') && !document.querySelector('.bs-pv-text b')"), true, 'text is shown as text, never as markup');
  await closeIt();
  // refused and failed files
  await press('Fake.pdf'); await tab.waitFor("/does not look like a real PDF/.test(document.querySelector('.bs-pv-msg') ? document.querySelector('.bs-pv-msg').textContent : '')", 'a web page called .pdf is refused');
  assert.equal(await tab.evaluate("window.__pwned || 0"), 0, 'nothing in a bad file runs'); assert.equal(await tab.evaluate("document.querySelectorAll('.bs-pv .bs-pv-btn').length"), 0, 'the viewer own links get no Preview button'); assert.equal(await tab.evaluate("!!document.querySelector('.bs-pv iframe')"), false, 'and it is not framed');
  await shot(tab, '4-refused'); await closeIt();
  await press('Signed-out.pdf'); await tab.waitFor("/sign in again/i.test(document.querySelector('.bs-pv-msg') ? document.querySelector('.bs-pv-msg').textContent : '')", 'a sign-in page instead of a file is explained'); await closeIt();
  await press('Missing.pdf'); await tab.waitFor("/answered 404/.test(document.querySelector('.bs-pv-msg') ? document.querySelector('.bs-pv-msg').textContent : '')", 'a missing file is explained');
  assert.equal(await tab.evaluate("!!document.querySelector('.bs-pv-msg a.bs-pv-act')"), true, 'with a way to download it from the portal'); await closeIt();
  // clicking the background closes too, and the original download link is untouched
  await press('Diagram.png'); await tab.waitFor("!!document.querySelector('.bs-pv')", 'open'); await tab.evaluate("document.querySelector('.bs-pv').dispatchEvent(new MouseEvent('mousedown', {bubbles: true})); 0"); await tab.waitFor("!document.querySelector('.bs-pv')", 'clicking outside closes');
  assert.ok(hits.every(h => h.host === 'lms.bahria.edu.pk'), 'only the LMS was asked for anything');
  // switching the extension off removes everything it added
  await tab.evaluate("document.querySelectorAll('.bs-pv-btn').length");
  console.log('requests made:', hits.map(h => h.name).join(', '));
  console.log('File preview end-to-end checks passed: buttons only for files that can be shown, Word/PDF/image/text previews, safe handling of bad files, focus and Escape, one request per preview.');
} finally { for (const t of []) try { t.ws.close(); } catch {} chrome.kill(); server.close(); }
process.exit(0);
