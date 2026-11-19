// End-to-end check of the LMS features added in 1.3.0 with the real built extension (dist/chrome) in real Chrome:
//   Add deadlines to calendar (.ics), Download all lecture notes (zip), and the Marks overview.
//   npm run build && node scripts/features-check.mjs        (screenshots land in artifacts/features-*.png)
// A fake LMS serves invented pages built like the portal's (scrambled download codes, course drop-downs with long values) and invented files and marks.
// Nothing here touches a real university site.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { zipOf } from './lib/office-samples.mjs';
import { readZip } from './lib/zip.mjs';

const extDir = path.resolve(process.env.EXT_DIR || 'dist/chrome');
const artifacts = path.resolve('artifacts'); await mkdir(artifacts, { recursive: true });
const executable = process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NUL = String.fromCharCode(0);

// ---- the invented portal ---------------------------------------------------------------------------------------
const PKT = 5 * 3600000, MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pktText = ms => { const d = new Date(ms + PKT), h = d.getUTCHours(); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} - ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const icsLocal = ms => { const d = new Date(ms + PKT), p = (n, w = 2) => String(n).padStart(w, '0'); return p(d.getUTCFullYear(), 4) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + '00'; };
const minute = ms => Math.floor(ms / 60000) * 60000;
const HOUR = 3600000, DAY = 24 * HOUR, BASE = Date.now();   // deadlines are set relative to one fixed moment, so the expected calendar times are exact
const SEM = 'SEMTOKEN-Fall2026-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', SEM2 = 'SEMTOKEN-Summer26-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const COURSES = [
  { tok: 'CRSTOKEN-Networks-0001-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Computer Networks', quiz: [['CLO 1', '3.000'], ['CLO 2', '3.000'], ['CLO 3', 'Not marked yet']], work: [['CLO 1', '5.000'], ['CLO 2', '5.000'], ['CLO 4', 'Not marked yet']] },
  { tok: 'CRSTOKEN-Formal--0002-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Formal Methods & Specification', quiz: [['Quiz 1', '8.5']], work: [] },
  { tok: 'CRSTOKEN-Construct-03-cccccccccccccccccccccccccccccccccccccccc', name: 'Software Construction', quiz: [['Q1', '4.000']], work: [['A1', '10.000']], quizFailsOnce: true },
  { tok: 'CRSTOKEN-Islamic--004-dddddddddddddddddddddddddddddddddddddddd', name: 'Islamic Studies', quiz: [], work: [] }
];
const hits = [], downloadsAsked = [];
let failedOnce = false;

const file = (name, body, extra = {}) => ({ name, body: Buffer.isBuffer(body) ? body : Buffer.from(body), type: 'application/octet-stream', ...extra });
const textBody = (label, n) => Buffer.from((label + ' lecture text, line by line. ').repeat(n));
const FILES = {
  'LECTOK-0001-aaaaaaaaaaaaaaaaaaaaaaaaaaaa': file('Week 1 - Introduction.pdf', Buffer.concat([Buffer.from('%PDF-1.4 '), textBody('intro', 4000)]), { type: 'application/pdf' }),
  'LECTOK-0002-bbbbbbbbbbbbbbbbbbbbbbbbbbbb': file('Lecture-2-Slides.pptx', zipOf([['ppt/presentation.xml', '<p/>']]), { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
  'LECTOK-0003-cccccccccccccccccccccccccccc': file('Dup.pdf', Buffer.concat([Buffer.from('%PDF-1.4 '), textBody('first dup', 50)]), { type: 'application/pdf' }),
  'LECTOK-0004-dddddddddddddddddddddddddddd': file('dup.PDF', Buffer.concat([Buffer.from('%PDF-1.4 '), textBody('second dup', 50)]), { type: 'application/pdf' }),
  'LECTOK-0005-eeeeeeeeeeeeeeeeeeeeeeeeeeee': { status: 404, name: 'Missing.pdf' },
  'LECTOK-0006-ffffffffffffffffffffffffffff': file('Empty.pdf', Buffer.alloc(0), { type: 'application/pdf' }),
  'LECTOK-0007-gggggggggggggggggggggggggggg': { status: 500, name: 'Broken.pdf' },
  'LECTOK-0008-hhhhhhhhhhhhhhhhhhhhhhhhhhhh': file('Evil.pdf', Buffer.concat([Buffer.from('%PDF-1.4 '), textBody('evil', 20)]), { type: 'application/pdf', disposition: 'attachment; filename="..\\..\\evil name?.pdf"' }),
  'LECTOK-0009-iiiiiiiiiiiiiiiiiiiiiiiiiiii': file('No-header.docx', zipOf([['word/document.xml', '<w/>']]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', noDisposition: true }),
  'LECTOK-0010-jjjjjjjjjjjjjjjjjjjjjjjjjjjj': file('Slow-1.pdf', Buffer.concat([Buffer.from('%PDF-1.4 '), textBody('slow one', 30)]), { type: 'application/pdf', delay: 1800 }),
  'LECTOK-0011-kkkkkkkkkkkkkkkkkkkkkkkkkkkk': file('Slow-2.pdf', Buffer.concat([Buffer.from('%PDF-1.4 '), textBody('slow two', 30)]), { type: 'application/pdf', delay: 1800 }),
  'LECTOK-0012-llllllllllllllllllllllllllll': file('Slow-3.pdf', Buffer.concat([Buffer.from('%PDF-1.4 '), textBody('slow three', 30)]), { type: 'application/pdf', delay: 1800 }),
  'LECTOK-0013-mmmmmmmmmmmmmmmmmmmmmmmmmmmm': { html: true, name: 'Signed-out.pdf' }
};
const lectureSets = {
  main: ['LECTOK-0001-aaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'LECTOK-0002-bbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'LECTOK-0003-cccccccccccccccccccccccccccc', 'LECTOK-0004-dddddddddddddddddddddddddddd', 'LECTOK-0005-eeeeeeeeeeeeeeeeeeeeeeeeeeee', 'LECTOK-0006-ffffffffffffffffffffffffffff', 'LECTOK-0007-gggggggggggggggggggggggggggg', 'LECTOK-0008-hhhhhhhhhhhhhhhhhhhhhhhhhhhh', 'LECTOK-0009-iiiiiiiiiiiiiiiiiiiiiiiiiiii'],
  slow: ['LECTOK-0010-jjjjjjjjjjjjjjjjjjjjjjjjjjjj', 'LECTOK-0011-kkkkkkkkkkkkkkkkkkkkkkkkkkkk', 'LECTOK-0012-llllllllllllllllllllllllllll'],
  expired: ['LECTOK-0001-aaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'LECTOK-0013-mmmmmmmmmmmmmmmmmmmmmmmmmmmm', 'LECTOK-0002-bbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
  none: []
};

const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><div class="wrapper"><div class="content-wrapper"><section class="content"><h1>${title}</h1>${body}</section></div></div></body></html>`;
const selects = (courseTok, courses = COURSES) => `<div class="box"><div class="box-body"><label>Semester:</label> <select name="semesterName" id="semesterId" class="form-control"><option value="${SEM}" selected="">Fall-2026</option><option value="${SEM2}">Summer-2026</option></select>`
  + ` <label>Course:</label> <select name="courseName" id="courseId" class="form-control"><option value="">Select Course</option>${courses.map(c => `<option value="${c.tok}"${c.tok === courseTok ? ' selected=""' : ''}> ${c.name.replace(/&/g, '&amp;')} </option>`).join('')}</select></div></div>`;
function assignmentsHtml(courseTok, variant) {
  const now = BASE;
  const row = (no, title, added, marks, closed, dates) => `<tr><td>${no} </td><td>${title} </td><td><a href="Download.php?k=x">Assignment</a></td><td>${added ? '<a href="Download.php?k=sub">Submission</a>' : 'No Submission'}</td><td> ${marks} </td><td>---</td><td>${closed ? "<div style='background:red'>Deadline Exceeded</div>" : '<button type="button">Submit</button>'}</td><td>${dates.map(d => `<small class="label label-info" title="${d[1]}">${pktText(d[0])}</small>`).join(' ')}</td></tr>`;
  const head = '<tr><th>Assign. No.</th><th>Title</th><th>Assignment</th><th>Added Submission</th><th>Marks Obtained</th><th>Returned Submission (Comments)</th><th>Action</th><th>Deadline</th></tr>';
  let rows;
  if (variant === 'closed') rows = [row(1, 'Old one', false, 'Not marked yet', true, [[now - 3 * DAY, 'Actual']]), row(2, 'Done one', true, '4.000', false, [[now + 4 * DAY, 'Actual']])];
  else rows = [
    row(1, 'CLO 1', true, '5.000', true, [[now - 20 * DAY, 'Actual']]),
    row(2, 'CLO 2, with; separators', false, 'Not marked yet', false, [[now + 3 * DAY + 17 * 60000, 'Actual']]),
    row(3, 'CLO 4', false, 'Not marked yet', false, [[now + 10 * DAY + 2 * HOUR, 'Actual'], [now + 12 * DAY + 2 * HOUR, 'Extended']]),
    row(4, 'Unreadable date', false, 'Not marked yet', false, []),
    row(5, 'Submitted, still open', true, '2.000', false, [[now + 6 * DAY, 'Actual']])
  ];
  return shell('Assignments', selects(courseTok) + `<div class="box"><table class="table table-hover"><tbody>${head}${rows.join('')}</tbody></table></div>`);
}
function workMarksHtml(courseTok) {
  const course = COURSES.find(c => c.tok === courseTok);
  const head = '<tr><th>Assign. No.</th><th>Title</th><th>Assignment</th><th>Added Submission</th><th>Marks Obtained</th><th>Returned Submission (Comments)</th><th>Action</th><th>Deadline</th></tr>';
  const rows = course ? course.work.map((w, i) => `<tr><td>${i + 1} </td><td>${w[0]} </td><td></td><td></td><td> ${w[1]} </td><td>---</td><td></td><td><small class="label label-info" title="Actual">${pktText(BASE + 30 * DAY)}</small></td></tr>`).join('') : '';
  return shell('Assignments', selects(courseTok) + (rows ? `<div class="box"><table class="table table-hover"><tbody>${head}${rows}</tbody></table></div>` : '<p>Please select a course to display the respective assignments.</p>'));
}
const lectureHtml = (courseTok, set) => {
  const rows = (lectureSets[set] || []).map((tok, i) => `<tr><td>${i + 1} </td><td>Lecture ${i + 1}: ${FILES[tok].name.replace(/\.[a-z]+$/i, '')} </td><td><small>1.</small> <a href="Download.php?k=${tok}" target="_blank" class="label label-info">Download Lecture</a><br/></td><td> </td><td> </td><td> </td></tr>`).join('');
  return shell('Lecture Notes', selects(courseTok) + (rows ? `<div class="box"><table class="table table-hover"><tbody><tr><th>Week #</th><th>Lecture Title</th><th>Lecture File(s)</th><th>Video Link(s)</th><th>Video Link</th><th>Remarks</th></tr>${rows}</tbody></table></div>` : '<p>No lectures are listed for this course.</p>'));
};
function quizzesHtml(courseTok) {
  const course = COURSES.find(c => c.tok === courseTok);
  const table = course && course.quiz.length ? `<div class="box"><table class="table table-hover"><tbody><tr><th>Quiz No.</th><th>Quiz Title</th><th>Quiz</th><th>Quiz Marks</th><th>Quiz Solution</th></tr>${course.quiz.map((q, i) => `<tr><td>${i + 1}</td><td> ${q[0]}</td><td><a href="Download.php?k=q">Download Quiz File</a></td><td> ${q[1]} </td><td></td></tr>`).join('')}</tbody></table></div>` : course ? '' : '<p>Please select a course to display the respective quizzes.</p>';
  return shell('Quizzes', selects(courseTok) + table);
}
const loginHtml = '<!doctype html><html><head><title>Login</title></head><body><form><input type="password" name="p"><input type="submit"></form></body></html>';

const server = http.createServer(async (req, res) => {
  try {
    const host = (req.headers.host || '').split(':')[0], url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
    if (!host.startsWith('lms')) { res.statusCode = 404; return res.end('not found'); }
    const q = Object.fromEntries(url.searchParams);
    res.setHeader('set-cookie', 'sid=fixture; Path=/');
    const html = body => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(body); };
    if (p === '/Student/Assignments.php') { hits.push({ path: p, s: q.s, oc: q.oc, cookie: /sid=fixture/.test(req.headers.cookie || '') }); if (q.oc === COURSES[1].tok && globalThis.__expireSecond) return html(loginHtml); if (q.v === 'cal' || q.v === 'closed') return html(assignmentsHtml(q.oc, q.v)); return html(workMarksHtml(q.oc)); }
    if (p === '/Student/LectureNotes.php') return html(lectureHtml(q.oc, q.v || 'main'));
    if (p === '/Student/Quizzes.php') {
      if (q.oc) hits.push({ path: p, s: q.s, oc: q.oc, cookie: /sid=fixture/.test(req.headers.cookie || '') });
      const course = COURSES.find(c => c.tok === q.oc);
      if (course && course.quizFailsOnce && !failedOnce) { failedOnce = true; res.statusCode = 500; return res.end('boom'); }
      if (q.oc === COURSES[1].tok && globalThis.__expireSecond) return html(loginHtml);
      if (q.v === 'nocourses') return html(shell('Quizzes', '<p>There is nothing to show here.</p>'));
      return html(quizzesHtml(q.oc));
    }
    if (p === '/Student/Download.php') {
      const k = q.k, f = FILES[k]; downloadsAsked.push({ k, cookie: /sid=fixture/.test(req.headers.cookie || '') });
      if (!f) { res.statusCode = 404; return res.end('not found'); }
      if (f.delay) await sleep(f.delay);
      if (f.status) { res.statusCode = f.status; return res.end('error'); }
      if (f.html) return html('<html><body>Please sign in</body></html>');
      res.setHeader('content-type', f.type); if (!f.noDisposition) res.setHeader('content-disposition', f.disposition || `attachment; filename="${f.name}"`); res.setHeader('content-length', f.body.length);
      return res.end(f.body);
    }
    res.statusCode = 404; res.end('not found');
  } catch { res.statusCode = 500; res.end('error'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// ---- Chrome with the real extension ---------------------------------------------------------------------------
const profile = path.join(artifacts, 'ext-profile-ft-' + Date.now());
const chrome = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-extension-debugging', '--remote-debugging-pipe', '--remote-debugging-port=0', '--remote-allow-origins=*',
  '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable', `--host-resolver-rules=MAP lms.bahria.edu.pk 127.0.0.1:${port}, MAP cms.bahria.edu.pk 127.0.0.1:${port}`, `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const waiters = new Map(); let buf = '', seq0 = 0;
chrome.stdio[4].on('data', d => { buf += d.toString(); let i; while ((i = buf.indexOf(NUL)) >= 0) { const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); } } });
const pipeCall = (method, params = {}) => new Promise(r => { const id = ++seq0; waiters.set(id, r); chrome.stdio[3].write(JSON.stringify({ id, method, params }) + NUL); });
let debugPort;
async function openTab(url) {
  const created = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();   // the address goes in through Page.navigate: a query string with & would be cut by the /json/new endpoint
  const ws = new WebSocket(created.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0; const pending = new Map(), errors = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } else if (m.method === 'Runtime.exceptionThrown') errors.push(String((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text).slice(0, 300)); };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 30000); pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const waitFor = async (expression, label, ms = 15000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await evaluate(expression); if (last) return last; } catch (e) { last = String(e).slice(0, 80); } await sleep(100); } throw Error('Timed out: ' + label + ' (last: ' + last + ')'); };
  await call('Runtime.enable'); await call('Page.enable'); await call('Page.bringToFront'); await call('Emulation.setFocusEmulationEnabled', { enabled: true }); await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url });
  await waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, 'load ' + url);
  return { call, evaluate, waitFor, ws, errors };
}
const shot = async (tab, name) => { const r = await tab.call('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(artifacts, 'features-' + name + '.png'), Buffer.from(r.data, 'base64')); };
let dlCount = 0;
async function expectDownload(tab, action, pattern, ms = 20000) {   // Chrome saves into a fresh folder; returns { name, bytes }
  const dir = path.join(artifacts, 'downloads-ft-' + Date.now() + '-' + (++dlCount)); await mkdir(dir, { recursive: true });
  await tab.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await action();
  const end = Date.now() + ms;
  while (Date.now() < end) { const names = (await readdir(dir)).filter(n => !/\.crdownload$|\.tmp$/.test(n)); const hit = names.find(n => pattern.test(n)); if (hit) { await sleep(150); return { name: hit, bytes: await readFile(path.join(dir, hit)), dir }; } await sleep(120); }
  throw Error('No download matching ' + pattern + ' appeared in ' + dir + ' (' + (await readdir(dir)).join(', ') + ')');
}
const noDownload = async (tab, action, ms = 1500) => { const dir = path.join(artifacts, 'downloads-ft-' + Date.now() + '-' + (++dlCount)); await mkdir(dir, { recursive: true }); await tab.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }); await action(); await sleep(ms); return (await readdir(dir)).filter(n => !/\.crdownload$/.test(n)); };

const tabs = [];
try {
  for (let i = 0; i < 80 && !debugPort; i++) { try { debugPort = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await sleep(100); } }
  assert.ok(debugPort, 'Chrome did not start'); await sleep(1200);
  const loaded = await pipeCall('Extensions.loadUnpacked', { path: extDir });
  assert.ok(loaded.result && loaded.result.id, 'Chrome refused to load the extension: ' + JSON.stringify(loaded).slice(0, 200));
  const open = async url => { const t = await openTab(url); tabs.push(t); await t.waitFor("document.documentElement.dataset.bahriaStudio === 'lms'", 'Campuslit loaded on ' + url); return t; };
  const C1 = COURSES[0];

  // ============================================================ 1. deadlines to calendar
  const asg = await open(`http://lms.bahria.edu.pk/Student/Assignments.php?s=${SEM}&oc=${C1.tok}&v=cal`);
  await asg.waitFor("!!document.querySelector('.bs-due-cal') && !document.querySelector('.bs-due-cal').hidden", 'the calendar button shows when something is open');
  assert.equal(await asg.evaluate("document.querySelector('.bs-due-cal').textContent"), 'Add 2 deadlines to calendar', 'only the two open, dated, unsubmitted deadlines count (not closed, not submitted, not unreadable)');
  await shot(asg, '1-assignments');
  const ics = await expectDownload(asg, () => asg.evaluate("document.querySelector('.bs-due-cal').click(); 0"), /^campuslit-deadlines-Computer-Networks\.ics$/);
  const text = ics.bytes.toString('utf8'), lines = text.split('\r\n');
  assert.equal(lines.filter(l => l === 'BEGIN:VEVENT').length, 2); assert.ok(text.endsWith('\r\n'));
  assert.ok(lines.includes('SUMMARY:Due: CLO 2\\, with\\; separators'), 'a title with separators is escaped');
  const endOf = title => { const i = lines.findIndex(l => l.startsWith('SUMMARY:Due: ' + title)); return lines.slice(Math.max(0, i - 4), i).find(l => l.startsWith('DTEND')); };
  assert.equal(endOf('CLO 4'), 'DTEND;TZID=Asia/Karachi:' + icsLocal(BASE + 12 * DAY + 2 * HOUR), 'the later of the actual and the extended deadline is used, in Pakistan time');
  assert.equal(endOf('CLO 2'), 'DTEND;TZID=Asia/Karachi:' + icsLocal(BASE + 3 * DAY + 17 * 60000), 'and the minutes are kept');
  assert.equal(lines.filter(l => l.startsWith('TRIGGER;RELATED=END:')).length, 4, 'two reminders each');
  assert.match(await asg.evaluate("document.querySelector('.bs-due-calnote').textContent"), /Downloaded 2 deadlines.*one day and three hours before.*updates them instead of adding copies/s);
  assert.equal(await asg.evaluate("document.querySelector('.bs-due-actions').hidden"), false);
  // nothing open to add: no button
  const closed = await open(`http://lms.bahria.edu.pk/Student/Assignments.php?s=${SEM}&oc=${C1.tok}&v=closed`);
  await closed.waitFor("!!document.querySelector('.bs-due')", 'the due card draws');
  assert.equal(await closed.evaluate("(() => { const b = document.querySelector('.bs-due-cal'); return !b || b.hidden || getComputedStyle(b).display === 'none'; })()"), true, 'a course with only submitted or closed work has no calendar button');
  assert.equal(await closed.evaluate("(() => { const a = document.querySelector('.bs-due-actions'); return !a || a.hidden || getComputedStyle(a).display === 'none'; })()"), true, 'and no empty row where it would be');
  // no course chosen: no button either
  const nocourse = await open('http://lms.bahria.edu.pk/Student/Assignments.php?v=cal');
  await nocourse.waitFor("!!document.querySelector('.bs-due')", 'the card draws with no course');
  assert.equal(await nocourse.evaluate("(() => { const b = document.querySelector('.bs-due-cal'); return !b || b.hidden || getComputedStyle(b).display === 'none'; })()"), true);
  console.log('1. deadlines to calendar: button counts only open dated work, file valid (escaped title, later deadline, two reminders each), hidden when nothing to add');

  // ============================================================ 3. download all
  const lec = await open(`http://lms.bahria.edu.pk/Student/LectureNotes.php?s=${SEM}&oc=${C1.tok}`);
  await lec.waitFor("!!document.querySelector('.bs-bulk-go')", 'the Download all bar appears');
  assert.equal(await lec.evaluate("document.querySelector('.bs-bulk-go').textContent"), 'Download all (9)');
  assert.match(await lec.evaluate("document.querySelector('.bs-bulk-text').textContent"), /9 files in this course, saved as one zip/);
  assert.equal(await lec.evaluate("document.querySelectorAll('.bs-bulk').length"), 1, 'one bar only, however often the page redraws');
  assert.equal(downloadsAsked.length, 0, 'nothing is requested until the button is pressed');
  await shot(lec, '2-lecture-bar');
  const zipDl = await expectDownload(lec, async () => { await lec.evaluate("document.querySelector('.bs-bulk-go').click(); 0"); await lec.waitFor("!!document.querySelector('.bs-pv .bs-pv-ring')", 'the progress popup opens'); await lec.evaluate("document.querySelector('.bs-pv').getBoundingClientRect().width"); }, /\.zip$/, 40000);
  assert.equal(zipDl.name, 'Computer Networks - lecture notes.zip');
  const zip = readZip(zipDl.bytes);
  assert.deepEqual([...zip.keys()].sort(), ['09 Lecture 9- No-header.docx', 'Dup.pdf', 'Lecture-2-Slides.pptx', 'Week 1 - Introduction.pdf', 'dup (2).PDF', 'evil name-.pdf'].sort(), 'names: duplicates numbered (case-insensitively), a hostile header name made safe, a missing name built from the lecture title: ' + [...zip.keys()].join(' | '));
  assert.ok(Buffer.compare(zip.get('Dup.pdf'), FILES['LECTOK-0003-cccccccccccccccccccccccccccc'].body) === 0 && Buffer.compare(zip.get('dup (2).PDF'), FILES['LECTOK-0004-dddddddddddddddddddddddddddd'].body) === 0, 'each duplicate keeps its own content');
  assert.ok(Buffer.compare(zip.get('Week 1 - Introduction.pdf'), FILES['LECTOK-0001-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'].body) === 0 && zipDl.bytes.length < FILES['LECTOK-0001-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'].body.length * 0.5, 'a big text file is compressed');
  assert.ok(Buffer.compare(zip.get('Lecture-2-Slides.pptx'), FILES['LECTOK-0002-bbbbbbbbbbbbbbbbbbbbbbbbbbbb'].body) === 0);
  await lec.waitFor("/Saved 6 of 9 files/.test(document.querySelector('.bs-bulk-title') ? document.querySelector('.bs-bulk-title').textContent : '')", 'the result says how many were saved');
  const res = await lec.evaluate("({ title: document.querySelector('.bs-bulk-title').textContent, failed: [...document.querySelectorAll('.bs-bulk-failed li')].map(l => l.textContent), buttons: [...document.querySelectorAll('.bs-pv-actions button')].map(b => b.textContent), note: [...document.querySelectorAll('.bs-bulk-note')].map(n => n.textContent).join(' | ') })");
  assert.ok(/as Computer Networks - lecture notes\.zip/.test(res.title), res.title);
  assert.equal(res.failed.length, 3, JSON.stringify(res.failed)); assert.ok(res.failed.some(f => /Missing.*404/.test(f)) && res.failed.some(f => /Empty.*empty file/.test(f)) && res.failed.some(f => /Broken.*500/.test(f)), 'each problem is named: ' + res.failed.join(' ; '));
  assert.deepEqual(res.buttons, ['Save again', 'Close']);
  assert.equal(downloadsAsked.filter(d => d.k.startsWith('LECTOK-0007')).length, 2, 'a server error is tried once more, a 404 is not');
  assert.equal(downloadsAsked.filter(d => d.k.startsWith('LECTOK-0005')).length, 1);
  assert.ok(downloadsAsked.every(d => d.cookie), 'every request carried the student\u2019s own sign-in');
  await shot(lec, '3-lecture-result');
  const again = await expectDownload(lec, () => lec.evaluate("[...document.querySelectorAll('.bs-pv-actions button')].find(b => b.textContent === 'Save again').click(); 0"), /\.zip$/);
  assert.ok(Buffer.compare(again.bytes, zipDl.bytes) === 0, 'Save again gives the same zip');
  await lec.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0");
  await lec.waitFor("!document.querySelector('.bs-pv')", 'Escape closes the result');
  assert.equal(await lec.evaluate("document.documentElement.classList.contains('bs-pv-open')"), false, 'the page scrolls again');

  // cancelling part way: what was fetched can be saved
  const slow = await open(`http://lms.bahria.edu.pk/Student/LectureNotes.php?s=${SEM}&oc=${C1.tok}&v=slow`);
  await slow.waitFor("!!document.querySelector('.bs-bulk-go')", 'bar on the slow page');
  await slow.evaluate("document.querySelector('.bs-bulk-go').click(); 0");
  await slow.waitFor("/Downloading 2 of 3/.test(document.querySelector('.bs-pv-label') ? document.querySelector('.bs-pv-label').textContent : '')", 'the second file is being fetched');
  assert.equal(await slow.evaluate("document.querySelector('.bs-bulk-file').textContent"), 'Lecture 2: Slow-2', 'the popup says which file');
  assert.ok(Number(await slow.evaluate("parseInt(document.querySelector('.bs-pv-pct').textContent, 10)")) >= 30, 'the ring has moved');
  await shot(slow, '4-progress');
  await slow.evaluate("[...document.querySelectorAll('.bs-pv-actions button')].find(b => b.textContent === 'Cancel').click(); 0");
  await slow.waitFor("/Stopped\\. 1 file was downloaded/.test(document.querySelector('.bs-bulk-title') ? document.querySelector('.bs-bulk-title').textContent : '')", 'Cancel keeps what was fetched');
  const partial = await expectDownload(slow, () => slow.evaluate("[...document.querySelectorAll('.bs-pv-actions button')].find(b => /^Save 1 file/.test(b.textContent)).click(); 0"), /\.zip$/);
  assert.deepEqual([...readZip(partial.bytes).keys()], ['Slow-1.pdf'], 'the partial zip holds the finished file only');
  await slow.evaluate("document.querySelector('.bs-pv-actions button:last-child').click(); 0"); await slow.waitFor("!document.querySelector('.bs-pv')", 'closed');
  // Escape before anything is fetched: just closes, saves nothing
  const before = downloadsAsked.length;
  const left = await noDownload(slow, async () => { await slow.evaluate("document.querySelector('.bs-bulk-go').click(); 0"); await slow.waitFor("!!document.querySelector('.bs-pv')", 'popup'); await slow.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0"); }, 1200);
  assert.equal(await slow.evaluate("!document.querySelector('.bs-pv')"), true); assert.deepEqual(left, [], 'nothing is saved after an early Escape');
  await sleep(1500); assert.ok(downloadsAsked.length - before <= 1, 'and the fetching stopped (at most the one already in flight)');

  // the sign-in ends part way
  const gone = await open(`http://lms.bahria.edu.pk/Student/LectureNotes.php?s=${SEM}&oc=${C1.tok}&v=expired`);
  await gone.waitFor("!!document.querySelector('.bs-bulk-go')", 'bar');
  const goneDl = await expectDownload(gone, () => gone.evaluate("document.querySelector('.bs-bulk-go').click(); 0"), /\.zip$/);
  assert.deepEqual([...readZip(goneDl.bytes).keys()], ['Week 1 - Introduction.pdf'], 'what was fetched before the sign-in ended is kept');
  await gone.waitFor("!!document.querySelector('.bs-bulk-note')", 'a message');
  assert.match(await gone.evaluate("document.querySelector('.bs-bulk-note').textContent"), /sign-in on the portal seems to have ended/);
  assert.equal(downloadsAsked.filter(d => d.k.startsWith('LECTOK-0002')).length, 1, 'after the sign-in ended the rest was not fetched (only the earlier visit asked for the slides)');
  // no files at all: no bar
  const none = await open(`http://lms.bahria.edu.pk/Student/LectureNotes.php?s=${SEM}&oc=${C1.tok}&v=none`); await sleep(800);
  assert.equal(await none.evaluate("document.querySelectorAll('.bs-bulk').length"), 0, 'a course with no files has no Download all');
  console.log('3. download all: bar, ring, names (duplicates, hostile, missing), compression, errors named, retry only for server errors, cancel keeps work, session end, no files');

  // ============================================================ 4. marks overview
  const quiz = await open(`http://lms.bahria.edu.pk/Student/Quizzes.php?s=${SEM}`);
  await quiz.waitFor("!!document.querySelector('.bs-mk-bar .bs-bulk-go')", 'the Marks overview button appears on the Quizzes page');
  assert.match(await quiz.evaluate("document.querySelector('.bs-mk-bar').textContent"), /all 4 courses in Fall-2026/);
  assert.equal(await quiz.evaluate("(() => { const bar = document.querySelector('.bs-mk-bar'), box = document.querySelector('#courseId').closest('.box'); return bar.nextElementSibling === box; })()"), true, 'the bar sits right above the Semester and Course box');
  assert.equal(hits.filter(h => h.path === '/Student/Quizzes.php').length, 0, 'nothing is read until the button is pressed');
  await shot(quiz, '5-quizzes-bar');
  const hitsBefore = hits.length;
  await quiz.evaluate("document.querySelector('.bs-mk-bar .bs-bulk-go').click(); 0");
  await quiz.waitFor("!!document.querySelector('.bs-pv .bs-pv-ring')", 'the popup opens with the ring');
  await quiz.waitFor("/Reading 2 of 4/.test(document.querySelector('.bs-pv-label') ? document.querySelector('.bs-pv-label').textContent : '')", 'it counts through the courses');
  await shot(quiz, '6-marks-loading');
  await quiz.waitFor("document.querySelectorAll('.bs-mk-course').length === 4", 'all four courses are shown', 30000);
  const table = () => quiz.evaluate(`(() => ({ kind: document.querySelector('.bs-mk-tab[aria-selected=true]').dataset.kind, head: [...document.querySelectorAll('.bs-mk-table thead th')].map(t => t.textContent), blocks: [...document.querySelectorAll('.bs-mk-block')].map(b => ({ state: b.dataset.state, course: b.querySelector('th.bs-mk-course').textContent, span: b.querySelector('th.bs-mk-course').rowSpan, rows: [...b.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent)) })) }))()`);
  const tabsText = () => quiz.evaluate("[...document.querySelectorAll('.bs-mk-tab')].map(t => t.textContent)");
  const clickTab = kind => quiz.evaluate(`document.querySelector('.bs-mk-tab[data-kind=${kind}]').click(); 0`);
  const mk = await quiz.evaluate(`({ intro: document.querySelector('.bs-mk-intro > span').textContent, buttons: [...document.querySelectorAll('.bs-pv-actions button')].map(b => b.textContent), note: document.querySelector('.bs-pv-note').textContent, stats: document.querySelectorAll('.bs-mk-stat').length, avg: /Average|Total /.test(document.querySelector('.bs-mk-body').textContent) })`);
  assert.equal(mk.intro, '4 courses in Fall-2026'); assert.equal(mk.stats, 0, 'no summary tiles any more'); assert.equal(mk.avg, false, 'no totals or averages anywhere');
  assert.deepEqual(await tabsText(), ['Quizzes3 of 4 marked', 'Assignments2 of 3 marked'], 'the switch says how many are marked');
  let got = await table();
  assert.equal(got.kind, 'quiz', 'quizzes first'); assert.deepEqual(got.head, ['Course', 'Quiz', 'Marks']);
  assert.deepEqual(got.blocks, [
    { state: 'ok', course: 'Computer Networks', span: 3, rows: [['CLO 1', '3'], ['CLO 2', '3'], ['CLO 3', 'Not marked']] },
    { state: 'ok', course: 'Formal Methods & Specification', span: 1, rows: [['Quiz 1', '8.5']] },
    { state: 'error', course: 'Software Construction', span: 1, rows: [['Could not be read: The portal answered 500.']] },
    { state: 'ok', course: 'Islamic Studies', span: 1, rows: [['No quizzes posted yet']] }], 'one table: the course once, then a row per quiz');
  assert.deepEqual(mk.buttons, ['Try the failed ones again', 'Close']); assert.match(mk.note, /the marks you obtained, not what they are out of/);
  await shot(quiz, '7-marks-overview');
  await clickTab('assignment');
  got = await table();
  assert.equal(got.kind, 'assignment'); assert.deepEqual(got.head, ['Course', 'Assignment', 'Marks'], 'the switch changes the table');
  assert.deepEqual(got.blocks, [
    { state: 'ok', course: 'Computer Networks', span: 3, rows: [['CLO 1', '5'], ['CLO 2', '5'], ['CLO 4', 'Not marked']] },
    { state: 'ok', course: 'Formal Methods & Specification', span: 1, rows: [['No assignments posted yet']] },
    { state: 'error', course: 'Software Construction', span: 1, rows: [['Could not be read: The portal answered 500.']] },
    { state: 'ok', course: 'Islamic Studies', span: 1, rows: [['No assignments posted yet']] }]);
  assert.equal(await quiz.evaluate("[...document.querySelectorAll('.bs-mk-tab')].map(t => t.getAttribute('aria-selected')).join()"), 'false,true');
  await shot(quiz, '7a-marks-assignments');
  await quiz.evaluate("document.querySelector('.bs-mk-switch').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); 0");
  assert.equal((await table()).kind, 'quiz', 'the arrow keys move between the two'); assert.equal(await quiz.evaluate("document.activeElement.dataset.kind"), 'quiz', 'and the focus follows');
  assert.equal(await quiz.evaluate("[...document.querySelectorAll('.bs-mk-tab')].map(t => t.tabIndex).join()"), '0,-1', 'only the chosen tab is in the tab order');
  // exactly the pages it should read, with the portal's own values and the student's own sign-in
  const read = hits.slice(hitsBefore);
  assert.equal(read.length, 8, 'two pages per course: ' + read.length);
  assert.ok(read.every(h => h.cookie && h.s === SEM && COURSES.some(c => c.tok === h.oc) && /^\/Student\/(Quizzes|Assignments)\.php$/.test(h.path)), 'only the two pages, with the portal\u2019s own values and cookie');
  // try again: only the failed course is read again
  const retryFrom = hits.length;
  await quiz.evaluate("[...document.querySelectorAll('.bs-pv-actions button')].find(b => /failed ones again/.test(b.textContent)).click(); 0");
  await quiz.waitFor("document.querySelector('.bs-mk-course[data-state=error]') === null && document.querySelectorAll('.bs-mk-course').length === 4", 'the failed course is read again');
  assert.equal(hits.length - retryFrom, 2, 'only the failed course\u2019s two pages were read again');
  assert.deepEqual(await quiz.evaluate("[...document.querySelectorAll('.bs-pv-actions button')].map(b => b.textContent)"), ['Close']);
  assert.deepEqual(await tabsText(), ['Quizzes4 of 5 marked', 'Assignments3 of 4 marked'], 'the counts follow the retry');
  got = await table();
  assert.deepEqual(got.blocks[2], { state: 'ok', course: 'Software Construction', span: 1, rows: [['Q1', '4']] }, 'the retried course now has its marks');
  await clickTab('assignment'); assert.deepEqual((await table()).blocks[2].rows, [['A1', '10']]);
  await shot(quiz, '7b-marks-after-retry');
  await quiz.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 0");
  await quiz.waitFor("!document.querySelector('.bs-pv')", 'Escape closes the overview');
  // Cancel while it reads: nothing more is requested
  const c0 = hits.length;
  await quiz.evaluate("document.querySelector('.bs-mk-bar .bs-bulk-go').click(); 0");
  await quiz.waitFor("/Reading 1 of 4/.test(document.querySelector('.bs-pv-label') ? document.querySelector('.bs-pv-label').textContent : '')", 'reading again');
  await quiz.evaluate("[...document.querySelectorAll('.bs-pv-actions button')].find(b => b.textContent === 'Cancel').click(); 0");
  await quiz.waitFor("!document.querySelector('.bs-pv')", 'Cancel closes it'); const afterCancel = hits.length; await sleep(1200);
  assert.equal(hits.length, afterCancel, 'after Cancel nothing more is requested'); assert.ok(afterCancel - c0 <= 4, 'and only the first course was in progress');
  // the sign-in has ended
  globalThis.__expireSecond = true;
  await quiz.evaluate("document.querySelector('.bs-mk-bar .bs-bulk-go').click(); 0");
  await quiz.waitFor("/sign-in on the portal seems to have ended/.test(document.querySelector('.bs-pv-msg') ? document.querySelector('.bs-pv-msg').textContent : '')", 'a plain message when the sign-in has ended', 30000);
  assert.deepEqual(await quiz.evaluate("[...document.querySelectorAll('.bs-pv-actions button')].map(b => b.textContent)"), ['Close']); await shot(quiz, '8-marks-signin');
  await quiz.evaluate("document.querySelector('.bs-pv-actions button').click(); 0"); globalThis.__expireSecond = false;
  // a page with no courses: no button
  const bare = await open(`http://lms.bahria.edu.pk/Student/Quizzes.php?v=nocourses`); await sleep(800);
  assert.equal(await bare.evaluate("!!document.querySelector('.bs-mk-bar')"), false, 'a page with no course list has no marks button');
  console.log('4. marks overview: button above the filters, ring while reading, four course cards with totals, a failed course named and retried alone, cancel stops requests, sign-in end explained');

  for (const t of tabs) assert.deepEqual(t.errors, [], 'runtime exceptions on a page: ' + t.errors.join(' | '));
  console.log('Feature end-to-end checks passed: deadlines to calendar, download all lecture notes, marks overview.');
} finally { for (const t of tabs) { try { t.ws.close(); } catch {} } chrome.kill(); server.close(); }
process.exit(0);
