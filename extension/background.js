// Campuslit notifications: the background worker.
//
// Only active when the student has switched notifications on in settings. Every so often it looks at the same pages the student would open
// (the LMS assignments, quizzes and lecture notes of each course, and the CMS dashboard's attendance), using the browser's own signed-in
// session, compares them with the last look and shows a desktop notification for what is new. It never sees or stores a password,
// never signs in, talks to no one but lms.bahria.edu.pk and cms.bahria.edu.pk, and keeps its notes in this browser only.
(function () {
  'use strict';
  if (typeof importScripts === 'function') importScripts('themes.js', 'deadlines.js', 'attendance.js', 'notify-core.js');   // Firefox lists these in the manifest instead
  const api = globalThis.browser || globalThis.chrome;
  const B = globalThis.BahriaStudio, N = globalThis.BahriaNotify;
  const SETTINGS_KEY = 'bahriaStudioPreferences', notifyStateKey = 'bahriaNotifyState';
  const LMS = 'https://lms.bahria.edu.pk/Student/', CMS_DASHBOARD = 'https://cms.bahria.edu.pk/Sys/Student/Dashboard.aspx', CMS_ATTENDANCE = 'https://cms.bahria.edu.pk/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx';
  const OURS = /^https:\/\/(?:lms|cms)\.bahria\.edu\.pk\//;
  const MINUTE = 60000, HOUR = 3600000, DAY = 86400000;
  const MAX_COURSES = 12, MAX_SENT = 400, MAX_SHOWN = 6, MAX_REQUESTS = 60;

  // ---------- the notes kept in this browser ----------
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const blank = () => ({ v: 1, lastRun: 0, session: { lms: 'unknown', cms: 'unknown' }, warned: { lms: 0, cms: 0 }, courses: [], snap: { assignments: {}, quizzes: {}, lectures: {} }, attendance: null, sent: {}, links: {}, last: { at: 0, events: 0, error: '' } });
  async function loadState() {
    const raw = obj((await api.storage.local.get(notifyStateKey))[notifyStateKey]), s = blank();
    s.lastRun = Number.isFinite(raw.lastRun) ? raw.lastRun : 0;
    for (const p of ['lms', 'cms']) { if (['ok', 'expired', 'unknown'].includes(obj(raw.session)[p])) s.session[p] = raw.session[p]; if (Number.isFinite(obj(raw.warned)[p])) s.warned[p] = raw.warned[p]; }
    s.courses = (Array.isArray(raw.courses) ? raw.courses : []).filter(c => c && typeof c.oc === 'string' && typeof c.name === 'string').slice(0, MAX_COURSES);
    for (const k of Object.keys(s.snap)) s.snap[k] = obj(obj(raw.snap)[k]);
    s.attendance = raw.attendance && typeof raw.attendance === 'object' && !Array.isArray(raw.attendance) ? raw.attendance : null;
    s.sent = obj(raw.sent); s.links = obj(raw.links);
    s.last = { at: Number(obj(raw.last).at) || 0, events: Number(obj(raw.last).events) || 0, error: String(obj(raw.last).error || '').slice(0, 120) };
    return s;
  }
  async function saveState(s) {
    const cut = Date.now() - 30 * DAY, ids = Object.keys(s.sent).filter(id => s.sent[id] > cut).sort((a, b) => s.sent[b] - s.sent[a]).slice(0, MAX_SENT);
    s.sent = Object.fromEntries(ids.map(id => [id, s.sent[id]]));
    const ln = Object.keys(s.links).slice(-40); s.links = Object.fromEntries(ln.map(k => [k, s.links[k]]));
    await api.storage.local.set({ [notifyStateKey]: s });
  }
  async function readPrefs() { return B.normalize((await api.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]); }

  // ---------- one request at a time, politely ----------
  let requests = 0;
  const pause = () => new Promise(r => setTimeout(r, 450 + Math.random() * 650));
  const touch = () => { try { return Promise.resolve(api.runtime.getPlatformInfo()).catch(() => {}); } catch (e) { return Promise.resolve(); } };   // an extension call keeps the worker awake during a long run
  async function get(url) {
    if (!OURS.test(url) || ++requests > MAX_REQUESTS) return { ok: false, status: 0, url, text: '', skipped: true };
    await touch();
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'follow', signal: ctl.signal });
      const text = await res.text();
      return { ok: res.ok, status: res.status, url: res.url || url, text: text.slice(0, 2000000) };
    } catch (e) { return { ok: false, status: 0, url, text: '', error: String((e && e.message) || e).slice(0, 100) }; }
    finally { clearTimeout(timer); }
  }

  // ---------- showing a notification ----------
  async function show(e, state) {
    const id = 'bs|' + String(e.id).slice(0, 150);
    try {
      await api.notifications.create(id, { type: 'basic', iconUrl: api.runtime.getURL('icons/icon-128.png'), title: String(e.title).slice(0, 100), message: String(e.body).slice(0, 240) });
      if (state) state.links[id] = OURS.test(e.url || '') ? e.url : LMS + 'Dashboard.php';
      return true;
    } catch (err) { return false; }
  }
  async function announce(events, state) {
    const fresh = events.filter(e => !state.sent[e.id]);
    let shown = 0;
    for (const e of fresh.slice(0, MAX_SHOWN)) { if (await show(e, state)) shown++; }
    const now = Date.now();
    fresh.forEach(e => { state.sent[e.id] = now; });
    if (fresh.length > MAX_SHOWN) await show({ id: 'more|' + now, title: (fresh.length - MAX_SHOWN) + ' more updates', body: 'Open the portal to see everything.', url: LMS + 'Dashboard.php' }, state);
    return shown;
  }
  function sessionEnded(portal, state, n, events) {
    state.session[portal] = 'expired';
    if (n.sessionAlert && Date.now() - state.warned[portal] > 20 * HOUR) {
      state.warned[portal] = Date.now();
      events.push({ id: 'sess|' + portal + '|' + Date.now(), kind: 'session', title: (portal === 'lms' ? 'LMS' : 'CMS') + ' session ended', body: 'Open the portal and sign in again to keep your alerts going.', url: portal === 'lms' ? LMS + 'Dashboard.php' : CMS_DASHBOARD });
    }
  }

  // ---------- the looks ----------
  async function lmsPass(n, state, events) {
    const home = await get(LMS + 'Dashboard.php');
    if (home.error || home.skipped) return 'The LMS could not be reached.';
    if (!home.ok || !N.signedIn('lms', home.text, home.url)) { sessionEnded('lms', state, n, events); return ''; }
    state.session.lms = 'ok'; state.warned.lms = 0;
    const nav = N.navLinks(home.text), page = (word, dflt) => new URL((nav.find(l => l.text.toLowerCase().includes(word)) || { href: dflt }).href, LMS).href;
    const pages = { assignments: page('assignment', 'Assignments.php'), quizzes: page('quiz', 'Quizzes.php'), lectures: page('lecture', 'LectureNotes.php') };
    await pause();
    let first = await get(pages.assignments), cs = N.parseCourses(first.text);
    const semester = (cs.semesters.find(s => s.selected) || cs.semesters[0] || {}).value;
    if (!cs.courses.length && semester) { await pause(); first = await get(pages.assignments + '?s=' + encodeURIComponent(semester)); cs = N.parseCourses(first.text); }
    if (!cs.courses.length) return first.ok ? 'No courses were found on the LMS.' : 'The LMS could not be read.';
    const courses = cs.courses.slice(0, MAX_COURSES).map(c => ({ oc: c.value, name: N.plain(c.label).slice(0, 40) }));
    state.courses = courses;
    const query = c => '?' + (semester ? 's=' + encodeURIComponent(semester) + '&' : '') + 'oc=' + encodeURIComponent(c.oc);
    const wantAssignments = n.assignments || n.due2d || n.due24h || n.due7h;
    const kinds = [['assignments', wantAssignments, N.parseAssignments, N.diffAssignments], ['quizzes', n.quizzes, N.parseQuizzes, N.diffQuizzes], ['lectures', n.lectures, N.parseLectures, N.diffLectures]];
    let failures = 0;
    for (const c of courses) {
      for (const [kind, on, parse, diff] of kinds) {
        if (!on || failures >= 3) continue;
        await pause();
        const url = pages[kind] + query(c), res = await get(url);
        if (!res.ok) { failures++; continue; }
        if (!N.signedIn('lms', res.text, res.url)) { sessionEnded('lms', state, n, events); return ''; }
        const rows = parse(res.text) || [];                                    // a course with nothing posted has no table
        const found = diff(c, state.snap[kind][c.oc], rows);
        found.forEach(e => { e.url = url; });
        events.push(...found);
        state.snap[kind][c.oc] = rows;
      }
    }
    const ids = new Set(courses.map(c => c.oc));
    for (const k of Object.keys(state.snap)) for (const oc of Object.keys(state.snap[k])) if (!ids.has(oc)) delete state.snap[k][oc];
    return failures >= 3 ? 'Some LMS pages could not be read.' : '';
  }
  async function cmsPass(n, state, events) {
    const res = await get(CMS_DASHBOARD);
    if (res.error || res.skipped) return 'The CMS could not be reached.';
    if (!res.ok || !N.signedIn('cms', res.text, res.url)) { sessionEnded('cms', state, n, events); return ''; }
    state.session.cms = 'ok'; state.warned.cms = 0;
    const next = N.parseAttendance(res.text);
    if (!next) return 'Attendance was not found on the CMS dashboard.';
    const found = N.diffAttendance(state.attendance, next, 75);
    found.forEach(e => { e.url = CMS_ATTENDANCE; });
    events.push(...found);
    state.attendance = next;
    return '';
  }
  // reminders before a deadline need no request: they work from the deadlines seen at the last look
  // returns { events, mark }: the reminders to show now, and every level they cover (so a late first sight is not followed by the bigger ones)
  function deadlineEvents(n, state) {
    if (!(n.due2d || n.due24h || n.due7h)) return { events: [], mark: [] };
    const open = [];
    for (const c of state.courses) for (const a of state.snap.assignments[c.oc] || []) if (!a.submitted && Number.isFinite(a.deadline)) open.push({ oc: c.oc, course: c.name, key: (a.no || '') + '|' + a.title, title: a.title, deadline: a.deadline, submitted: false });
    const r = N.dueReminders(open, Date.now(), n, state.sent);
    r.events.forEach(e => { e.url = LMS + 'Assignments.php'; });
    return r;
  }
  async function announceDue(n, state) {
    const due = deadlineEvents(n, state), shown = await announce(due.events, state), now = Date.now();
    due.mark.forEach(id => { state.sent[id] = now; });
    return shown;
  }

  // ---------- running ----------
  let lastVisitCheck = 0;
  let chain = Promise.resolve();
  const exclusive = fn => (chain = chain.catch(() => {}).then(fn));
  async function runCheck(why, only) {          // only: 'lms' or 'cms' to look at one portal (a visit), otherwise both
    const n = (await readPrefs()).notify;
    if (!n.enabled) return { ok: false, off: true };
    const state = await loadState(), events = []; requests = 0;
    // a kind that is switched off forgets what it knew, so switching it on later starts fresh instead of announcing old news
    if (!(n.assignments || n.due2d || n.due24h || n.due7h)) state.snap.assignments = {};
    if (!n.quizzes) state.snap.quizzes = {};
    if (!n.lectures) state.snap.lectures = {};
    if (!n.attendance) state.attendance = null;
    let error = '';
    try {
      if (only !== 'cms' && (n.assignments || n.quizzes || n.lectures || n.due2d || n.due24h || n.due7h)) error = (await lmsPass(n, state, events)) || error;
      if (only !== 'lms' && n.attendance) error = (await cmsPass(n, state, events)) || error;
    } catch (e) { error = 'Something went wrong while checking.'; }
    let shown = await announce(events, state);
    shown += await announceDue(n, state);
    // a look that could not reach the portals (offline, or the network is not up yet after the browser opens) is retried at the next 15 minute tick, not after the whole interval
    if (!/could not be reached/.test(error)) state.lastRun = Date.now();
    state.last = { at: Date.now(), events: shown, error };
    await saveState(state);
    return { ok: !error, shown, error, why };
  }
  async function tick() {
    const n = (await readPrefs()).notify;
    if (!n.enabled) return;
    const state = await loadState();
    if (Date.now() - state.lastRun >= n.interval * MINUTE - 2 * MINUTE || !state.lastRun) { await runCheck('timer'); return; }
    if (await announceDue(n, state)) await saveState(state);
  }

  // ---------- wiring ----------
  function ensureAlarm() { try { api.alarms.get('bs-tick').then(a => { if (!a) api.alarms.create('bs-tick', { periodInMinutes: 15, delayInMinutes: 1 }); }); } catch (e) { /* alarms unavailable */ } }
  ensureAlarm();
  api.runtime.onInstalled.addListener(ensureAlarm);
  api.runtime.onStartup.addListener(() => { ensureAlarm(); exclusive(tick); });
  api.alarms.onAlarm.addListener(a => { if (a.name === 'bs-tick') exclusive(tick); });
  api.notifications.onClicked.addListener(async id => {
    try { const s = await loadState(); const url = s.links[id]; api.notifications.clear(id); api.tabs.create({ url: OURS.test(url || '') ? url : LMS + 'Dashboard.php' }); } catch (e) { /* nothing to open */ }
  });
  // turning notifications on makes a first, silent look; turning them off forgets what was remembered
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    const was = B.normalize(changes[SETTINGS_KEY].oldValue).notify, now = B.normalize(changes[SETTINGS_KEY].newValue).notify;
    if (!was.enabled && now.enabled) exclusive(() => runCheck('enabled'));
    else if (was.enabled && !now.enabled) api.storage.local.remove(notifyStateKey);
    else if (now.enabled && JSON.stringify(was) !== JSON.stringify(now)) exclusive(async () => { const s = await loadState(); await announceDue(now, s); await saveState(s); });
  });
  api.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || typeof msg.bsNotify !== 'string' || sender.id !== api.runtime.id) return false;
    (async () => {
      if (msg.bsNotify === 'test') { const ok = await show({ id: 'test|' + Date.now(), title: 'Campuslit notifications work', body: 'You will see updates like this: new assignments, marks, lecture notes, attendance and deadlines.', url: LMS + 'Dashboard.php' }, null); return { ok }; }
      if (msg.bsNotify === 'visit') {   // a signed-in portal page was opened: look at that portal now if it has been a while or its session had ended (a sign-in is the moment to catch up)
        const portal = msg.portal === 'cms' ? 'cms' : 'lms';
        exclusive(async () => {
          const n = (await readPrefs()).notify; if (!n.enabled || Date.now() - lastVisitCheck < 5 * MINUTE) return;
          const s = await loadState();
          if (s.session[portal] !== 'ok' || Date.now() - s.lastRun > 30 * MINUTE) { lastVisitCheck = Date.now(); await runCheck('visit', portal); }
        });
        return { ok: true };
      }
      if (msg.bsNotify === 'check') return exclusive(() => runCheck('manual'));
      if (msg.bsNotify === 'status') { const s = await loadState(); return { ok: true, lastRun: s.lastRun, last: s.last, session: s.session, courses: s.courses.length, attendance: s.attendance ? Object.keys(s.attendance).length : 0 }; }
      if (msg.bsNotify === 'forget') { await api.storage.local.remove(notifyStateKey); return { ok: true }; }
      return { ok: false };
    })().then(respond, () => respond({ ok: false }));
    return true;
  });
})();
