'use strict';
// The background worker end to end, against a fake browser and fake portals (invented pages in the portals' markup):
// the first look is silent, later changes are announced, an ended session gets one nudge, and nothing is ever requested outside the two portals.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const HOUR = 3600000;
const pkt = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h - 5, min);

// ---- invented portal pages ----
const select = (id, opts) => `<select id="${id}">${opts.map(([v, l, s]) => `<option value="${v}"${s ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
const row = cells => `<tr>${cells.map(c => `<td>${c}`).join('')}\n</tr>`;
const assignments = rows => `<table class="table"><tbody><tr><th>Assign. No.</th><th>Title</th><th>Files</th><th>Added Submission</th><th>Marks Obtained</th><th>Returned</th><th>Action</th><th>Deadline</th></tr>${rows.join('')}</tbody></table>`;
const arow = (no, title, { submitted = false, marks = '', dl = "10 November 2026-11:55 pm" } = {}) => row([no, title, '', submitted ? '<a href="d">Submission</a>' : '', marks, '', '<a href="#">Submit</a>', `<small class='label label-info' title='Actual'>${dl}</small>`]);
const quizzes = rows => `<table><tbody><tr><th>Quiz No.</th><th>Quiz Title</th><th>Quiz</th><th>Quiz Marks</th><th>Solution</th></tr>${rows.join('')}</tbody></table>`;
const lectures = rows => `<table><tbody><tr><th>Week #</th><th>Lecture Title</th><th>Lecture File(s)</th><th>Video</th><th>Other</th><th>Remarks</th></tr>${rows.join('')}</tbody></table>`;
const attendance = list => `<script>renderAttendanceSummaryChart(${JSON.stringify(list)});</script>`;

function world() {
  const w = {
    now: pkt(2026, 11, 8, 9, 0), lmsUp: true, cmsUp: true, fetched: [], notes: [], opened: [], store: {}, listeners: {}, alarms: {},
    lmsSignedIn: true, cmsSignedIn: true,
    pages: {
      assignments: { A: assignments([arow('1', 'Loops', { submitted: true })]), B: assignments([]) },
      quizzes: { A: quizzes([row(['1', 'Quiz on loops', '', '', ''])]), B: quizzes([]) },
      lectures: { A: lectures([row(['1', 'Intro', '<a href="x">file</a>', '', '', ''])]), B: lectures([]) },
      attendance: [{ code: 'CS 101', title: 'Data Structures', present: 18, absent: 3, total: 21, percentage: '85.7' }]
    }
  };
  const lmsHome = '<a href="Assignments.php">Assignments</a><a href="Quizzes.php">Quizzes</a><a href="LectureNotes.php">Lecture Notes</a><a href="../Student/includes/studentprocess.php?s=signout">Sign out</a>';
  function respond(url) {
    const u = new URL(url);
    if (u.hostname === 'lms.bahria.edu.pk') {
      if (!w.lmsSignedIn) return { ok: true, status: 200, url: 'https://lms.bahria.edu.pk/index.php', text: '<form><input type="password"></form>' };
      const name = u.pathname.split('/').pop();
      if (name === 'Dashboard.php') return { ok: true, status: 200, url, text: lmsHome + select('semesterId', [['s1', 'Fall', true]]) };
      const oc = u.searchParams.get('oc'), kind = { 'Assignments.php': 'assignments', 'Quizzes.php': 'quizzes', 'LectureNotes.php': 'lectures' }[name];
      if (!kind) return { ok: false, status: 404, url, text: '' };
      const head = select('semesterId', [['s1', 'Fall', true]]) + select('courseId', [['A', 'Data Structures'], ['B', 'Networks']]);
      return { ok: true, status: 200, url, text: head + (oc ? w.pages[kind][oc] : '') };
    }
    if (u.hostname === 'cms.bahria.edu.pk') {
      if (!w.cmsSignedIn) return { ok: true, status: 200, url: 'https://cms.bahria.edu.pk/Logins/Student/Login.aspx', text: '<input type="password">' };
      return { ok: true, status: 200, url, text: attendance(w.pages.attendance) + ' Sys/Student' };
    }
    return { ok: false, status: 0, url, text: '' };
  }
  const listen = name => ({ addListener: fn => { (w.listeners[name] = w.listeners[name] || []).push(fn); } });
  const chrome = {
    runtime: { id: 'x', getURL: p => 'chrome-extension://x/' + p, getPlatformInfo: async () => ({}), onInstalled: listen('installed'), onStartup: listen('startup'), onMessage: listen('message') },
    storage: { local: { get: async key => (typeof key === 'string' ? { [key]: w.store[key] } : {}), set: async o => { for (const k of Object.keys(o)) { const old = w.store[k]; w.store[k] = JSON.parse(JSON.stringify(o[k])); (w.listeners.changed || []).forEach(f => f({ [k]: { oldValue: old, newValue: w.store[k] } }, 'local')); } }, remove: async k => { delete w.store[k]; } }, onChanged: listen('changed') },
    alarms: { get: async n => w.alarms[n], create: (n, o) => { w.alarms[n] = o; }, onAlarm: listen('alarm') },
    notifications: { create: async (id, o) => { w.notes.push({ id, ...o }); return id; }, clear: () => {}, onClicked: listen('clicked') },
    tabs: { create: o => { w.opened.push(o.url); } }
  };
  const ctx = vm.createContext({ chrome, console, URL, AbortController, setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, Math: Object.assign(Object.create(Math), { random: () => 0 }),
    fetch: async (url, opts) => { if (w.offline) throw new Error('offline'); w.fetched.push(url); assert.equal(opts.credentials, 'include'); const r = respond(url); return { ok: r.ok, status: r.status, url: r.url, text: async () => r.text }; },
    importScripts: (...files) => { for (const f of files) vm.runInContext(fs.readFileSync('extension/' + f, 'utf8'), ctx); } });
  const RealDate = Date;
  ctx.Date = class extends RealDate { static now() { return w.now; } constructor(...a) { super(...(a.length ? a : [w.now])); } };
  vm.runInContext(fs.readFileSync('extension/background.js', 'utf8'), ctx);
  const emit = async (name, ...args) => { for (const f of w.listeners[name] || []) await f(...args); };
  const settle = () => new Promise(r => setTimeout(r, 20));
  const setPrefs = async notify => { await chrome.storage.local.set({ bahriaStudioPreferences: { notify } }); await settle(); };
  const send = msg => new Promise(res => { const l = (w.listeners.message || [])[0]; l(msg, { id: 'x' }, res); });
  const titles = () => w.notes.map(n => n.title);
  return { w, emit, setPrefs, settle, send, titles };
}
const ALL = { enabled: true, attendance: true, quizzes: true, assignments: true, lectures: true, due2d: true, due24h: true, due7h: true, sessionAlert: true, interval: 60 };

test('nothing is requested while notifications are off', async () => {
  const t = world(); await t.settle();
  await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  assert.equal(t.w.fetched.length, 0); assert.equal(t.w.notes.length, 0);
  assert.ok(t.w.alarms['bs-tick'], 'the 15 minute timer is set up');
});

test('turning them on makes a silent first look at every course; later changes are announced once', async () => {
  const t = world();
  await t.setPrefs(ALL); await t.settle();
  assert.deepEqual(t.titles(), [], 'the first look only remembers');
  // the deadline of the open assignment is 10 Nov 11:55 pm and it is 8 Nov 9 am: more than 2 days out
  assert.ok(t.w.fetched.every(u => /^https:\/\/(lms|cms)\.bahria\.edu\.pk\//.test(u)), 'only the two portals are ever requested: ' + t.w.fetched.join(' '));
  assert.ok(t.w.fetched.some(u => u.includes('oc=A')) && t.w.fetched.some(u => u.includes('oc=B')), 'every course is looked at');
  assert.ok(t.w.fetched.some(u => u.includes('Quizzes.php?s=s1')) && t.w.fetched.some(u => u.includes('LectureNotes.php?s=s1')));
  // now things change
  t.w.pages.assignments.A = assignments([arow('1', 'Loops', { submitted: true, marks: '4.000' }), arow('2', 'Trees')]);
  t.w.pages.quizzes.A = quizzes([row(['1', 'Quiz on loops', '', '3.000', ''])]);
  t.w.pages.lectures.B = lectures([row(['1', 'Routing', '<a href="y">f</a>', '', '', ''])]);
  t.w.pages.attendance = [{ code: 'CS 101', title: 'Data Structures', present: 18, absent: 5, total: 23, percentage: '78.3' }];
  t.w.now += 2 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  const titles = t.titles().join(' | ');
  assert.match(titles, /Assignment marks uploaded/); assert.match(titles, /New assignment/); assert.match(titles, /Quiz marks uploaded/);
  assert.match(titles, /New lecture note · Networks/); assert.match(titles, /Absent marked/);
  const before = t.w.notes.length;
  t.w.now += 2 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  assert.equal(t.w.notes.length - 0, before, 'the same changes are never announced twice');
});

test('deadline reminders arrive at 2 days, 24 hours and 7 hours, once each', async () => {
  const t = world();
  t.w.pages.assignments.A = assignments([arow('2', 'Trees', { dl: '10 November 2026 - 11:55 pm' })]);
  await t.setPrefs(ALL); await t.settle();
  assert.equal(t.titles().length, 0);
  const deadline = pkt(2026, 11, 10, 23, 55);
  const at = hoursLeft => { t.w.now = deadline - hoursLeft * HOUR; return t.emit('alarm', { name: 'bs-tick' }).then(t.settle); };
  await at(47); await at(30); await at(23); await at(10); await at(6);
  const due = t.titles().filter(x => /^Due in/.test(x));
  assert.equal(due.length, 3, JSON.stringify(due));
  assert.match(due[0], /2 days/); assert.match(due[2], /about [67] hours/);
});

test('only the chosen reminders are sent', async () => {
  const t = world();
  t.w.pages.assignments.A = assignments([arow('2', 'Trees')]);
  await t.setPrefs({ ...ALL, due2d: false, due24h: false }); await t.settle();
  const deadline = pkt(2026, 11, 10, 23, 55);
  for (const h of [47, 23, 6]) { t.w.now = deadline - h * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle(); }
  assert.equal(t.titles().filter(x => /^Due in/.test(x)).length, 1);
});

test('an ended session gets one nudge, not a stream of them', async () => {
  const t = world();
  await t.setPrefs(ALL); await t.settle();
  t.w.lmsSignedIn = false; t.w.cmsSignedIn = false;
  t.w.now += 2 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  assert.deepEqual(t.titles().sort(), ['CMS session ended', 'LMS session ended']);
  t.w.now += 2 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  assert.equal(t.titles().length, 2, 'no second nudge within a day');
  // signing back in resumes quietly: the old snapshot is still the baseline
  t.w.lmsSignedIn = true; t.w.cmsSignedIn = true; t.w.now += 2 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  assert.equal(t.titles().length, 2);
  const st = await t.send({ bsNotify: 'status' });
  assert.equal(st.session.lms, 'ok'); assert.equal(st.courses, 2);
  assert.ok(st.info.lms.since > 0 && st.info.lms.lastOk >= st.info.lms.since && st.info.lms.endedAt === 0, 'a new sign-in starts a new stretch');
});

test('after a day closed: everything that changed is announced; a failed look because the network is not up yet is retried within 15 minutes', async () => {
  const t = world();
  await t.setPrefs(ALL); await t.settle();                                   // the last look, before the browser was closed
  t.w.pages.quizzes.A = quizzes([row(['1', 'Quiz on loops', '', '3.000', ''])]);
  t.w.pages.attendance = [{ code: 'CS 101', title: 'Data Structures', present: 18, absent: 5, total: 23, percentage: '78.3' }];
  t.w.pages.lectures.B = lectures([row(['1', 'Routing', '<a href="y">f</a>', '', '', ''])]);
  t.w.now += 26 * HOUR; t.w.offline = true;                                    // the browser opens a day later, the network is not up yet
  await t.emit('startup'); await t.settle();
  assert.equal(t.titles().length, 0, 'nothing can be read yet');
  t.w.offline = false; t.w.now += 16 * 60000;                                  // 16 minutes later: the next tick retries, it does not wait out the whole interval
  await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  const found = t.titles().join(' | ');
  assert.match(found, /Quiz marks uploaded/); assert.match(found, /Absent marked/); assert.match(found, /New lecture note/);
});

test('signing back in catches up at once, and only for the portal that was opened', async () => {
  const t = world();
  await t.setPrefs(ALL); await t.settle();
  t.w.lmsSignedIn = false; t.w.cmsSignedIn = false;                           // the next morning: both sessions have ended
  t.w.now += 26 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  assert.deepEqual(t.titles().sort(), ['CMS session ended', 'LMS session ended']);
  t.w.pages.quizzes.A = quizzes([row(['1', 'Quiz on loops', '', '3.000', ''])]);
  t.w.pages.attendance = [{ code: 'CS 101', title: 'Data Structures', present: 18, absent: 5, total: 23, percentage: '78.3' }];
  t.w.lmsSignedIn = true;                                                     // the student signs in to the LMS only
  const cmsBefore = t.w.fetched.filter(u => u.includes('cms.bahria')).length;
  t.w.now += 60000;
  await t.send({ bsNotify: 'visit', portal: 'lms' }); await t.settle();
  assert.ok(t.titles().some(x => /Quiz marks uploaded/.test(x)), 'the LMS news arrives straight after the sign-in, not at the next interval');
  assert.ok(!t.titles().some(x => /Absent marked/.test(x)), 'the CMS was not looked at');
  assert.equal(t.w.fetched.filter(u => u.includes('cms.bahria')).length, cmsBefore, 'no CMS request for an LMS visit');
  t.w.cmsSignedIn = true; t.w.now += 6 * 60000;
  await t.send({ bsNotify: 'visit', portal: 'cms' }); await t.settle();
  assert.ok(t.titles().some(x => /Absent marked/.test(x)), 'and the CMS news arrives when the CMS is opened');
});

test('the status shows how long a sign-in really lasted', async () => {
  const t = world();
  await t.setPrefs(ALL); await t.settle();
  const start = t.w.now;
  for (const hours of [3, 6, 9]) { t.w.now = start + hours * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle(); }
  let st = await t.send({ bsNotify: 'status' });
  assert.equal(st.info.lms.since, start); assert.equal(st.info.lms.lastOk, start + 9 * HOUR); assert.equal(st.info.lms.endedAt, 0);
  t.w.lmsSignedIn = false; t.w.now = start + 12 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  st = await t.send({ bsNotify: 'status' });
  assert.equal(st.info.lms.since, start, 'the stretch started when it was first seen working');
  assert.equal(st.info.lms.lastOk, start + 9 * HOUR, 'the last good look is kept');
  assert.equal(st.info.lms.endedAt, start + 12 * HOUR, 'and the end is when it was first seen ended');
  assert.equal(st.session.lms, 'expired'); assert.equal(st.info.cms.endedAt, 0, 'the other portal is unaffected');
  assert.match(st.info.lms.why, /\/index\.php \(200, has a password box\)/, 'it records what the portal answered, so a wrong guess can be told from a real sign-out');
  t.w.lmsSignedIn = true; t.w.now = start + 13 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  st = await t.send({ bsNotify: 'status' });
  assert.equal(st.info.lms.since, start + 13 * HOUR); assert.equal(st.info.lms.endedAt, 0, 'signing in again starts a new stretch');
});

test('a kind that is switched off is not looked at, and starts fresh when switched on again', async () => {
  const t = world();
  await t.setPrefs({ ...ALL, quizzes: false, lectures: false, attendance: false }); await t.settle();
  assert.ok(!t.w.fetched.some(u => u.includes('Quizzes.php?') || u.includes('LectureNotes.php?') || u.includes('cms.bahria')), 'only assignments are requested');
  t.w.pages.quizzes.A = quizzes([row(['1', 'Old quiz', '', '2.000', ''])]);
  await t.setPrefs(ALL); await t.settle();
  t.w.now += 2 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  assert.ok(!t.titles().some(x => /Quiz marks/.test(x)), 'old news is not announced as new');
});

test('turning notifications off forgets what was remembered; a test notification and the status work', async () => {
  const t = world();
  await t.setPrefs(ALL); await t.settle();
  assert.ok(t.w.store.bahriaNotifyState);
  assert.equal((await t.send({ bsNotify: 'test' })).ok, true); assert.equal(t.w.notes[0].title, 'Campuslit notifications work');
  await t.setPrefs({ ...ALL, enabled: false }); await t.settle();
  assert.equal(t.w.store.bahriaNotifyState, undefined);
  assert.equal(await t.send({ bsNotify: 'nonsense' }).then(r => r.ok), false);
  // messages from other senders are ignored
  const l = t.w.listeners.message[0]; assert.equal(l({ bsNotify: 'status' }, { id: 'someone-else' }, () => {}), false);
});

test('clicking a notification opens only a Bahria portal page', async () => {
  const t = world();
  await t.setPrefs(ALL); await t.settle();
  t.w.pages.quizzes.A = quizzes([row(['1', 'Quiz on loops', '', '3.000', ''])]);
  t.w.now += 2 * HOUR; await t.emit('alarm', { name: 'bs-tick' }); await t.settle();
  const n = t.w.notes.find(x => /Quiz marks/.test(x.title)); assert.ok(n);
  await t.emit('clicked', n.id); await t.settle();
  assert.match(t.w.opened[0], /^https:\/\/lms\.bahria\.edu\.pk\/Student\/Quizzes\.php\?s=s1&oc=A$/);
});
