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

  root.BahriaDeadlines = { parseDeadline, effectiveDeadline, duration, classify, describe, summarize, PKT_OFFSET_MIN };
})(globalThis);
