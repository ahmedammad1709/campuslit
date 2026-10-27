(function (root) {
  'use strict';
  // Assignment deadline maths. Pure functions: no page access, no storage, no network.
  //
  // The portal prints deadlines like "29 September 2026 - 11:55 pm" in Pakistan time (UTC+5, no daylight saving),
  // and shows two of them per assignment: "Extended" and "Actual". The later one is the one that counts.
  // Times are read as Pakistan time whatever the device's own time zone is, so a student travelling abroad still gets the right answer.
  const PKT_OFFSET_MIN = 5 * 60;
  const NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const MONTHS = {}; NAMES.forEach((name, i) => { MONTHS[name] = i; MONTHS[name.slice(0, 3)] = i; });
  MONTHS.sept = 8;
  const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
  const SOON = 24 * HOUR, NEAR = 3 * DAY;

  // "29 September 2026 - 11:55 pm" -> epoch milliseconds, or NaN when it is not a date we understand.
  function parseDeadline(text) {
    if (typeof text !== 'string') return NaN;
    const t = text.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 80) return NaN;
    const m = /^(?:[A-Za-z]{3,9},? )?(\d{1,2})(?:st|nd|rd|th)?[ ,/-]+([A-Za-z]{3,9})\.?,?[ ,/-]+(\d{4})(?:\s*[-–,@]?\s*(?:at )?(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s*([ap])\.?\s?m\.?)?)?$/i.exec(t);
    if (!m) return NaN;
    const day = +m[1], month = MONTHS[m[2].toLowerCase()], year = +m[3];
    if (month === undefined) return NaN;
    let hour = m[4] === undefined ? 23 : +m[4], minute = m[5] === undefined ? 59 : +m[5];   // a date with no time runs to the end of that day
    if (m[6]) {
      if (hour < 1 || hour > 12) return NaN;
      hour = hour % 12 + (m[6].toLowerCase() === 'p' ? 12 : 0);
    }
    if (year < 2000 || year > 2100 || hour > 23 || minute > 59 || day < 1) return NaN;
    const ms = Date.UTC(year, month, day, hour, minute) - PKT_OFFSET_MIN * MINUTE;
    const back = new Date(ms + PKT_OFFSET_MIN * MINUTE);          // reject 31 February and the like: a real date reads back the same
    return back.getUTCDate() === day && back.getUTCMonth() === month ? ms : NaN;
  }

  // The deadline that counts: the latest of the dates that could be read. Returns { ms, extended } or null.
  function effectiveDeadline(texts) {
    const list = (Array.isArray(texts) ? texts : []).map(item => ({ ms: parseDeadline(item && item.text), extended: !!(item && item.extended) })).filter(x => Number.isFinite(x.ms));
    if (!list.length) return null;
    const latest = list.reduce((a, b) => (b.ms > a.ms ? b : a));
    return { ms: latest.ms, extended: list.some(x => x.extended) && latest.extended };
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  // "2 days 4 hrs", "5 hrs 20 min", "35 min": how long until (or since) a moment.
  function duration(ms) {
    const span = Math.abs(ms);
    if (span < MINUTE) return 'under a minute';
    if (span < HOUR) return Math.floor(span / MINUTE) + ' min';
    if (span < DAY) { const h = Math.floor(span / HOUR), m = Math.floor((span % HOUR) / MINUTE); return plural(h, 'hr', 'hrs') + (m ? ' ' + m + ' min' : ''); }
    const d = Math.floor(span / DAY), h = Math.floor((span % DAY) / HOUR);
    return plural(d, 'day', 'days') + (h ? ' ' + plural(h, 'hr', 'hrs') : '');
  }

  // info: { deadlineMs, portalClosed, hasControl, submitted }
  //   portalClosed: true when the portal itself says the deadline has passed, false when it shows something else, null when unknown
  //   hasControl:   the Action cell still holds an upload button or box (only its presence is looked at, never what is in it)
  // state: 'submitted' | 'closed' (passed, nothing submitted) | 'open' (before the deadline) | 'check' (the clock and the portal disagree) | 'unknown'
  // level: 'ok' | 'info' | 'warn' | 'bad' | 'none'
  function classify(info, now) {
    const i = info && typeof info === 'object' ? info : {};
    const at = Number.isFinite(i.deadlineMs) ? i.deadlineMs : NaN, clock = Number.isFinite(now) ? now : NaN;
    if (i.submitted) return { state: 'submitted', level: 'ok', ms: at };
    const clockPassed = Number.isFinite(at) && Number.isFinite(clock) ? clock >= at : null;
    if (i.portalClosed === true) return { state: 'closed', level: 'bad', ms: at, ago: clockPassed ? clock - at : NaN };
    // The portal did not say "exceeded". Trust it over the device clock, which may be wrong.
    if (i.portalClosed === false || i.hasControl) {
      if (clockPassed === false) {
        const left = at - clock;
        return { state: 'open', level: left < SOON ? 'bad' : left < NEAR ? 'warn' : 'info', ms: at, left };
      }
      return { state: 'check', level: 'warn', ms: at };
    }
    if (clockPassed === true) return { state: 'closed', level: 'bad', ms: at, ago: clock - at };
    if (clockPassed === false) { const left = at - clock; return { state: 'open', level: left < SOON ? 'bad' : left < NEAR ? 'warn' : 'info', ms: at, left }; }
    return { state: 'unknown', level: 'none', ms: at };
  }

  // The words for the chip beside a row.
  function describe(c) {
    switch (c && c.state) {
      case 'submitted': return 'Submitted';
      case 'closed': return Number.isFinite(c.ago) && c.ago > 0 && c.ago < 30 * DAY ? 'Closed ' + duration(c.ago) + ' ago, not submitted' : 'Closed, not submitted';   // old ones just say closed
      case 'open': return 'Due in ' + duration(c.left);
      case 'check': return 'Open. Check the deadline on the portal';
      default: return '';
    }
  }

  // classified: array of { state, level, ms, left }, in the portal's order.
  function summarize(list) {
    const rows = (Array.isArray(list) ? list : []).filter(Boolean);
    const open = rows.filter(r => r.state === 'open' || r.state === 'check');
    const timed = open.filter(r => r.state === 'open').sort((a, b) => a.left - b.left);
    return {
      total: rows.length,
      open: open.length,
      submitted: rows.filter(r => r.state === 'submitted').length,
      closed: rows.filter(r => r.state === 'closed').length,
      nextIndex: timed.length ? rows.indexOf(timed[0]) : -1
    };
  }


  // ---------- Reminders: what is worth remembering between pages ----------
  // The portal shows one course at a time, so to remind you on another page the extension keeps a tiny note on this device:
  // the course, the assignment title and its deadline, only for assignments that are still open and not submitted.
  // Shape: { v: 1, entries: [{ key, semester, course, savedAt, items: [{ title, due }] }], dismissed: [{ id, until }] }
  // Arrays rather than objects keyed by course name, so a strange course name can never touch an object's own properties.
  const MAX_ENTRIES = 40, MAX_ITEMS = 60, MAX_DISMISSED = 100, TEXT = 80, KEEP = 150 * DAY, HORIZON = 7 * DAY, SNOOZE = 8 * HOUR, CLOCK_SLACK = 5 * MINUTE;
  const clip = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, TEXT) : '');
  const empty = () => ({ v: 1, entries: [], dismissed: [] });
  const entryKey = (semester, course) => semester + '|' + course;

  // Anything read back from storage is checked again: wrong types, missing fields and oversized lists are dropped, never trusted.
  function sanitize(raw) {
    const out = empty();
    if (!raw || typeof raw !== 'object') return out;
    const seen = new Map();
    (Array.isArray(raw.entries) ? raw.entries : []).slice(0, MAX_ENTRIES * 2).forEach(e => {
      if (!e || typeof e !== 'object' || !Number.isFinite(e.savedAt) || e.savedAt <= 0) return;
      const semester = clip(e.semester), course = clip(e.course), have = new Set();
      const items = (Array.isArray(e.items) ? e.items : []).slice(0, MAX_ITEMS).map(i => ({ title: clip(i && i.title), due: i && i.due }))
        .filter(i => i.title && Number.isFinite(i.due) && i.due > 0 && !have.has(i.title + '|' + i.due) && have.add(i.title + '|' + i.due));
      const entry = { key: entryKey(semester, course), semester, course, savedAt: e.savedAt, items };
      const old = seen.get(entry.key);
      if (!old || old.savedAt < entry.savedAt) seen.set(entry.key, entry);
    });
    out.entries = [...seen.values()].sort((x, y) => y.savedAt - x.savedAt).slice(0, MAX_ENTRIES);   // the most recently seen courses are kept
    (Array.isArray(raw.dismissed) ? raw.dismissed : []).slice(0, MAX_DISMISSED).forEach(d => {
      if (d && typeof d.id === 'string' && d.id.length <= 400 && Number.isFinite(d.until)) out.dismissed.push({ id: d.id, until: d.until });
    });
    return out;
  }
  function prune(data, now) {
    const d = sanitize(data);
    d.entries = d.entries.map(e => ({ ...e, items: e.items.filter(i => i.due > now) })).filter(e => e.items.length && now - e.savedAt < KEEP)
      .sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_ENTRIES);
    d.dismissed = d.dismissed.filter(x => x.until > now).slice(-MAX_DISMISSED);
    return d;
  }
  // Replaces what is remembered for one course in one semester. An empty list forgets that course.
  function remember(data, meta, items, now) {
    const semester = clip(meta && meta.semester), course = clip(meta && meta.course), key = entryKey(semester, course);
    const d = sanitize(data); d.entries = d.entries.filter(e => e.key !== key);
    const have = new Set();
    const list = (Array.isArray(items) ? items : []).map(i => ({ title: clip(i && i.title), due: i && i.due }))
      .filter(i => i.title && Number.isFinite(i.due) && i.due > now && !have.has(i.title + '|' + i.due) && have.add(i.title + '|' + i.due))
      .sort((a, b) => a.due - b.due).slice(0, MAX_ITEMS);
    if (list.length) d.entries.push({ key, semester, course, savedAt: now, items: list });
    return prune(d, now);
  }
  // The open, unsubmitted assignments worth a reminder now, soonest first. Hidden ones are those you crossed away.
  function upcoming(data, now, horizon) {
    const d = sanitize(data), limit = Number.isFinite(horizon) ? horizon : HORIZON, hidden = new Set(d.dismissed.filter(x => x.until > now).map(x => x.id));
    const out = [];
    d.entries.forEach(e => {
      if (e.savedAt > now + CLOCK_SLACK) return;                 // saved "in the future": this device's clock has moved back, so do not trust it
      e.items.forEach(i => {
        const id = e.key + '|' + i.title + '|' + i.due;
        if (i.due > now && i.due - now <= limit && !hidden.has(id)) out.push({ id, title: i.title, course: e.course, semester: e.semester, due: i.due, left: i.due - now, savedAt: e.savedAt });
      });
    });
    return out.sort((a, b) => a.due - b.due || (a.title < b.title ? -1 : 1));
  }
  function dismiss(data, id, now, snooze) {
    const d = prune(data, now);
    if (typeof id !== 'string' || !id || id.length > 400) return d;
    d.dismissed = d.dismissed.filter(x => x.id !== id).concat({ id, until: now + (Number.isFinite(snooze) && snooze > 0 ? snooze : SNOOZE) }).slice(-MAX_DISMISSED);
    return d;
  }
  function count(data) { const d = sanitize(data); return { courses: d.entries.filter(e => e.items.length).length, items: d.entries.reduce((n, e) => n + e.items.length, 0) }; }

  root.BahriaDeadlines = { parseDeadline, effectiveDeadline, duration, classify, describe, summarize, sanitize, prune, remember, upcoming, dismiss, count, PKT_OFFSET_MIN, REMINDER_HORIZON: HORIZON, SNOOZE };
})(globalThis);
