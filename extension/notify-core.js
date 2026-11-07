(function (root) {
  'use strict';
  // Notification engine, the pure part: read the portal pages the background worker has fetched, notice what changed since the last look,
  // and decide which alerts are due. No page access, no storage, no network here (background.js does the fetching); everything is a function of its inputs.
  //
  // The pages are read as text (a service worker has no DOM). The tables are simple, so a small tolerant reader is enough, and it is tested.
  const MINUTE = 60000, HOUR = 60 * MINUTE;
  const MAX_ROWS = 300;
  const PKT_OFFSET_MS = 5 * HOUR;

  const decode = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&amp;/g, '&');
  const plain = html => decode(String(html || '').replace(/<br\s*\/?>|<\/br>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/[\s ]+/g, ' ').trim();
  const number = text => { const m = /^-?\d+(?:\.\d+)?$/.exec(String(text || '').trim()); return m ? parseFloat(m[0]) : null; };
  const short = (text, n) => { const t = String(text || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  // ---------- reading tables ----------
  function cellsOf(rowHtml) {
    const out = [], re = /<t([dh])\b[^>]*>([\s\S]*?)(?=<t[dh]\b|<\/tr|<tr\b|$)/gi;
    let m; while ((m = re.exec(rowHtml))) out.push({ head: m[1].toLowerCase() === 'h', html: m[2] });
    return out;
  }
  // The first table whose header row has every one of the words. Returns { header: [lowercase texts], rows: [[cell html, ...], ...] } or null.
  function findTable(html, needles) {
    const tables = String(html || '').match(/<table\b[\s\S]*?<\/table>/gi) || [];
    for (const table of tables) {
      const rows = table.split(/<tr\b[^>]*>/i).slice(1).map(cellsOf).filter(r => r.length);
      const headRow = rows.find(r => r.some(c => c.head));
      if (!headRow) continue;
      const header = headRow.map(c => plain(c.html).toLowerCase());
      if (!needles.every(n => header.some(h => h.includes(n)))) continue;
      return { header, rows: rows.filter(r => r !== headRow && r.every(c => !c.head)).slice(0, MAX_ROWS).map(r => r.map(c => c.html)) };
    }
    return null;
  }
  const col = (table, word) => table.header.findIndex(h => h.includes(word));

  // ---------- the drop-downs: which semester and which courses ----------
  function options(html, id) {
    const select = new RegExp('<select\\b[^>]*\\bid=["\']' + id + '["\'][^>]*>([\\s\\S]*?)</select>', 'i').exec(String(html || ''));
    if (!select) return [];
    const out = [], re = /<option\b([^>]*)>([\s\S]*?)(?=<option\b|$)/gi; let m;
    while ((m = re.exec(select[1]))) {
      const value = (/\bvalue\s*=\s*["']([^"']*)["']/i.exec(m[1]) || [])[1];
      if (value) out.push({ value, label: plain(m[2]), selected: /\bselected\b/i.test(m[1]) });
    }
    return out.slice(0, 40);
  }
  const parseCourses = html => ({ semesters: options(html, 'semesterId'), courses: options(html, 'courseId') });

  // links in the side menu: { href, text }
  function navLinks(html) {
    const out = [], re = /<a\b[^>]*\bhref=["']([^"'#]+\.php[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
    while ((m = re.exec(String(html || ''))) && out.length < 80) out.push({ href: m[1], text: plain(m[2]) });
    return out;
  }

  // ---------- the pages ----------
  function parseAssignments(html) {
    const t = findTable(html, ['title', 'deadline']); if (!t) return null;
    const ci = { no: 0, title: col(t, 'title'), added: col(t, 'added'), marks: col(t, 'marks obtained'), action: col(t, 'action'), deadline: col(t, 'deadline') };
    const D = root.BahriaDeadlines;
    return t.rows.filter(r => r.length > ci.deadline && ci.deadline >= 0).map(r => {
      const labels = []; const re = /<small\b[^>]*\btitle=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/small>/gi; let m;
      while ((m = re.exec(r[ci.deadline]))) labels.push({ text: plain(m[2]), extended: /extended/i.test(m[1]) });
      if (!labels.length) labels.push({ text: plain(r[ci.deadline]), extended: false });
      const eff = D && D.effectiveDeadline ? D.effectiveDeadline(labels) : null;
      const action = plain(r[ci.action] || '');
      return { no: plain(r[ci.no]), title: short(plain(r[ci.title]), 80), marks: number(plain(r[ci.marks] || '')), submitted: /<a\b/i.test(r[ci.added] || ''), closed: /exceeded/i.test(action), deadline: eff ? eff.ms : null };
    }).filter(a => a.title);
  }
  function parseQuizzes(html) {
    const t = findTable(html, ['quiz marks']); if (!t) return null;
    const ci = { no: 0, title: col(t, 'title'), marks: col(t, 'quiz marks') };
    return t.rows.filter(r => r.length > ci.marks).map(r => ({ no: plain(r[ci.no]), title: short(plain(r[ci.title]), 80), marks: number(plain(r[ci.marks])) })).filter(q => q.title || q.no);
  }
  function parseLectures(html) {
    const t = findTable(html, ['lecture title']); if (!t) return null;
    const ci = { no: 0, title: col(t, 'lecture title') };
    return t.rows.filter(r => r.length > ci.title).map(r => ({ no: plain(r[ci.no]), title: short(plain(r[ci.title]), 80), files: r.slice(ci.title + 1).reduce((n, c) => n + (c.match(/<a\b[^>]*\bhref=/gi) || []).length, 0) })).filter(l => l.title || l.no);
  }
  // the CMS dashboard carries every course's present and absent hours in its script
  function parseAttendance(html) {
    const A = root.BahriaAttendance; const list = A && A.extractCourses ? A.extractCourses(String(html || '')) : null;
    if (!list) return null;
    const out = {};
    for (const c of list.slice(0, 40)) {
      const present = Number(c && c.present), absent = Number(c && c.absent), total = Number(c && c.total);
      if (!c || typeof c.code !== 'string' || !Number.isFinite(present) || !Number.isFinite(absent) || !Number.isFinite(total)) continue;
      out[c.code.slice(0, 20)] = { code: c.code.slice(0, 20), title: short(String(c.title || c.code), 60), present, absent, total, pct: Number.isFinite(parseFloat(c.percentage)) ? parseFloat(c.percentage) : (total ? Math.round(present / total * 1000) / 10 : 0) };
    }
    return out;
  }

  // ---------- what is signed in, and what is a sign-in page ----------
  function signedIn(portal, html, url) {
    const text = String(html || '');
    if (!text || /type=["']password["']/i.test(text) || /\/(?:login|signin)/i.test(String(url || '').split('?')[0])) return false;
    return portal === 'lms' ? /id=["']semesterId["']|Dashboard\.php|signout/i.test(text) : /renderAttendanceSummaryChart|StudentWiseAttendance|Sys\/Student/i.test(text);
  }

  // ---------- noticing changes. Every function returns a list of { id, kind, title, body } ----------
  const fmtPkt = ms => {
    const d = new Date(ms + PKT_OFFSET_MS), h = d.getUTCHours(), m = d.getUTCMinutes();
    return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ', ' + (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'am' : 'pm');
  };
  const keyOf = r => (r.no || '') + '|' + (r.title || '');
  const byKey = list => { const o = {}; for (const r of list || []) o[keyOf(r)] = r; return o; };

  function diffAssignments(course, prev, next) {
    if (!Array.isArray(prev) || !Array.isArray(next)) return [];          // first look: just remember it
    const before = byKey(prev), ev = [];
    for (const a of next) {
      const old = before[keyOf(a)], name = a.no ? 'Assignment ' + a.no : 'Assignment';
      if (!old) ev.push({ id: 'as|' + course.oc + '|' + keyOf(a), kind: 'assignments', title: 'New assignment · ' + course.name, body: short(a.title, 80) + (a.deadline ? ' — due ' + fmtPkt(a.deadline) : '') });
      else if (a.marks !== null && a.marks !== old.marks) ev.push({ id: 'am|' + course.oc + '|' + keyOf(a) + '|' + a.marks, kind: 'assignments', title: 'Assignment marks uploaded · ' + course.name, body: name + (a.title ? ' (' + short(a.title, 50) + ')' : '') + ': ' + a.marks });
      else if (old && a.deadline && old.deadline && a.deadline > old.deadline) ev.push({ id: 'ad|' + course.oc + '|' + keyOf(a) + '|' + a.deadline, kind: 'assignments', title: 'Deadline extended · ' + course.name, body: short(a.title, 60) + ' — now due ' + fmtPkt(a.deadline) });
    }
    return ev;
  }
  function diffQuizzes(course, prev, next) {
    if (!Array.isArray(prev) || !Array.isArray(next)) return [];
    const before = byKey(prev), ev = [];
    for (const q of next) {
      const old = before[keyOf(q)], name = q.no ? 'Quiz ' + q.no : 'Quiz';
      if (q.marks !== null && (!old || old.marks !== q.marks)) ev.push({ id: 'qm|' + course.oc + '|' + keyOf(q) + '|' + q.marks, kind: 'quizzes', title: 'Quiz marks uploaded · ' + course.name, body: name + (q.title ? ' (' + short(q.title, 50) + ')' : '') + ': ' + q.marks });
      else if (!old) ev.push({ id: 'qn|' + course.oc + '|' + keyOf(q), kind: 'quizzes', title: 'New quiz posted · ' + course.name, body: short(q.title || name, 80) });
    }
    return ev;
  }
  function diffLectures(course, prev, next) {
    if (!Array.isArray(prev) || !Array.isArray(next)) return [];
    const before = byKey(prev), ev = [];
    for (const l of next) {
      const old = before[keyOf(l)];
      if (!old) ev.push({ id: 'ln|' + course.oc + '|' + keyOf(l), kind: 'lectures', title: 'New lecture note · ' + course.name, body: (l.no ? 'Week ' + l.no + ': ' : '') + short(l.title, 80) });
      else if (l.files > old.files) ev.push({ id: 'lf|' + course.oc + '|' + keyOf(l) + '|' + l.files, kind: 'lectures', title: 'New lecture file · ' + course.name, body: (l.no ? 'Week ' + l.no + ': ' : '') + short(l.title, 80) });
    }
    return ev;
  }
  // present or absent: the hours marked absent or present went up since the last look
  function diffAttendance(prev, next, minPercent) {
    if (!prev || typeof prev !== 'object' || !next) return [];
    const min = Number.isFinite(minPercent) ? minPercent : 75, ev = [];
    for (const code of Object.keys(next)) {
      const a = prev[code], b = next[code]; if (!a) continue;
      const dp = b.present - a.present, da = b.absent - a.absent;
      if (dp <= 0 && da <= 0) continue;
      const hrs = n => (Math.round(n * 10) / 10) + (Math.round(n * 10) / 10 === 1 ? ' hr' : ' hrs');
      const said = da > 0 && dp > 0 ? 'Marked present ' + hrs(dp) + ', absent ' + hrs(da) : da > 0 ? 'Marked absent for ' + hrs(da) : 'Marked present for ' + hrs(dp);
      const low = b.pct <= min ? ' ⚠ At or below ' + min + '%.' : '';
      ev.push({ id: 'at|' + code + '|' + b.present + '|' + b.absent, kind: 'attendance', title: (da > 0 ? 'Absent' : 'Present') + ' marked · ' + b.title, body: said + '. Now ' + b.pct + '% (' + b.present + ' of ' + b.total + ' hrs).' + low });
    }
    return ev;
  }

  // ---------- deadline reminders: 2 days, 24 hours, 7 hours before ----------
  const LEVELS = [{ key: 'due2d', hours: 48, say: '2 days' }, { key: 'due24h', hours: 24, say: '24 hours' }, { key: 'due7h', hours: 7, say: '7 hours' }];
  // open: [{ oc, course, key, title, deadline, submitted }]. sent: { id: time } of reminders already shown. Returns { events, mark: [ids to remember] }.
  function dueReminders(open, now, prefs, sent) {
    const events = [], mark = [];
    for (const a of Array.isArray(open) ? open : []) {
      if (a.submitted || !Number.isFinite(a.deadline) || a.deadline <= now) continue;
      const left = a.deadline - now;
      const crossed = LEVELS.filter(l => left <= l.hours * HOUR);           // levels already reached, nearest last
      if (!crossed.length) continue;
      const enabled = crossed.filter(l => prefs && prefs[l.key]);
      const idOf = l => 'dd|' + a.oc + '|' + a.key + '|' + a.deadline + '|' + l.hours;
      if (!enabled.length || enabled.every(l => sent && sent[idOf(l)])) continue;
      const nearest = enabled[enabled.length - 1];
      crossed.forEach(l => mark.push(idOf(l)));                              // do not announce the bigger levels after a smaller one
      const hoursLeft = Math.max(1, Math.round(left / HOUR));
      events.push({ id: idOf(nearest), kind: 'deadlines', title: 'Due in ' + (left < 2 * HOUR ? 'under 2 hours' : nearest.hours === 48 && hoursLeft > 36 ? '2 days' : 'about ' + hoursLeft + ' hours') + ' · ' + a.course, body: short(a.title, 70) + ' — ' + fmtPkt(a.deadline) });
    }
    return { events, mark };
  }

  root.BahriaNotify = { parseCourses, navLinks, parseAssignments, parseQuizzes, parseLectures, parseAttendance, signedIn, diffAssignments, diffQuizzes, diffLectures, diffAttendance, dueReminders, fmtPkt, plain, LEVELS };
})(globalThis);
