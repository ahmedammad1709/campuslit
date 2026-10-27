(function (root) {
  'use strict';
  // Time table -> calendar file (.ics, RFC 5545). Pure functions: no page access, no storage, no network.
  //
  // Every class becomes a weekly repeating event in Pakistan time (TZID Asia/Karachi, UTC+5, no daylight saving), so it lands
  // at the right hour even if the phone or laptop is set to another time zone. The repeat stops at the end of the semester.
  const OFFSET_MIN = 5 * 60, MINUTE = 60000, DAY = 86400000;
  const MAX_EVENTS = 200, MAX_TEXT = 120, MIN_WEEKS = 1, MAX_WEEKS = 30, ALARMS = [0, 5, 10, 15, 30, 60, 120];
  const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  const pad = (n, width = 2) => String(n).padStart(width, '0');
  // Strip control characters (so a title can never start a new line in the file), collapse spaces, cap the length.
  const clean = value => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value))
    .replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  // RFC 5545 text escaping: backslash, semicolon, comma. (Newlines are only ever added by this module, as the two characters \n.)
  const esc = value => clean(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');

  // Lines are folded at 75 octets (not characters) with CRLF + one space, never in the middle of a multi-byte character.
  function fold(line) {
    const out = []; let current = '', bytes = 0, limit = 75;
    for (const ch of line) {
      const size = ch.codePointAt(0) < 0x80 ? 1 : ch.codePointAt(0) < 0x800 ? 2 : ch.codePointAt(0) < 0x10000 ? 3 : 4;
      if (bytes + size > limit) { out.push(current); current = ' '; bytes = 1; limit = 75; }
      current += ch; bytes += size;
    }
    out.push(current);
    return out.join('\r\n');
  }

  // "2026-10-12" -> epoch ms of midnight that day in Pakistan, or NaN.
  function dateStart(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof text === 'string' ? text.trim() : '');
    if (!m) return NaN;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 2000 || y > 2100) return NaN;
    const utc = Date.UTC(y, mo - 1, d), back = new Date(utc);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;   // 31 February and friends
    return utc - OFFSET_MIN * MINUTE;
  }
  // epoch ms -> "20261012T083000" as the clock reads in Pakistan; and in UTC with a Z.
  function local(ms) { const d = new Date(ms + OFFSET_MIN * MINUTE); return pad(d.getUTCFullYear(), 4) + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()); }
  function utc(ms) { const d = new Date(ms); return pad(d.getUTCFullYear(), 4) + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'; }
  const weekdayOf = ms => new Date(ms + OFFSET_MIN * MINUTE).getUTCDay();          // 0 = Sunday, as the time table page counts

  // The Monday of the week a date falls in, as "YYYY-MM-DD" (a sensible default for "first day of classes").
  function mondayOf(date) {
    const d = Object.prototype.toString.call(date) === '[object Date]' && !Number.isNaN(date.getTime()) ? date : new Date();
    const back = (d.getDay() + 6) % 7, m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    return pad(m.getFullYear(), 4) + '-' + pad(m.getMonth() + 1) + '-' + pad(m.getDate());
  }

  // Small stable hash (FNV-1a) so the same class always gets the same UID: importing the file again updates the events instead of duplicating them.
  function hash(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

  function fileName(semester) {
    const part = clean(semester).replace(/[^A-Za-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    return 'campuslit-timetable' + (part ? '-' + part : '') + '.ics';
  }

  // events: [{ day 0-6, start, end (minutes since midnight), title, room, building, teacher, klass, lab }]
  // opts:   { start: 'YYYY-MM-DD' (first day of classes), weeks, alarm (minutes before, 0 = none), semester, now (ms) }
  // returns { ok: true, text, count, until } or { ok: false, error }
  function build(events, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const first = dateStart(o.start);
    if (Number.isNaN(first)) return { ok: false, error: 'Choose the first day of classes.' };
    const weeks = Math.round(Number(o.weeks));
    if (!Number.isFinite(weeks) || weeks < MIN_WEEKS || weeks > MAX_WEEKS) return { ok: false, error: 'Weeks must be between ' + MIN_WEEKS + ' and ' + MAX_WEEKS + '.' };
    const alarm = ALARMS.includes(Number(o.alarm)) ? Number(o.alarm) : 0;
    const now = Number.isFinite(o.now) ? o.now : Date.now();
    const until = first + weeks * 7 * DAY - 1000;                // the last second of the last day
    const seen = new Set(), body = []; let count = 0;
    (Array.isArray(events) ? events : []).slice(0, MAX_EVENTS * 2).forEach(e => {
      if (!e || typeof e !== 'object' || count >= MAX_EVENTS) return;
      const day = e.day, start = e.start, end = e.end;
      if (!Number.isInteger(day) || day < 0 || day > 6 || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 1440) return;
      const title = clean(e.title) || clean(e.short);
      if (!title) return;
      // the first date on or after the first day of classes that falls on this weekday
      const shift = (day - weekdayOf(first) + 7) % 7, date = first + shift * DAY;
      const begin = date + Math.round(start) * MINUTE, finish = date + Math.round(end) * MINUTE;
      if (begin > until) return;
      const uid = hash([title, day, start, end, clean(e.room), clean(o.semester)].join('|')) + '-' + hash(title + day) + '@campuslit';
      if (seen.has(uid)) return; seen.add(uid);
      const where = [clean(e.room), clean(e.building)].filter(Boolean).join(', ');
      const notes = [e.teacher && 'Teacher: ' + clean(e.teacher), e.klass && 'Class: ' + clean(e.klass), o.semester && clean(o.semester)].filter(Boolean).map(esc).join('\\n');
      const lines = ['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + utc(now),
        'DTSTART;TZID=Asia/Karachi:' + local(begin), 'DTEND;TZID=Asia/Karachi:' + local(finish),
        'RRULE:FREQ=WEEKLY;UNTIL=' + utc(until) + ';BYDAY=' + WEEKDAYS[day],
        'SUMMARY:' + esc(title) + (e.lab ? ' (Lab)' : '')];
      if (where) lines.push('LOCATION:' + esc(where));
      if (notes) lines.push('DESCRIPTION:' + notes);
      if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:-PT' + alarm + 'M', 'END:VALARM');
      lines.push('END:VEVENT');
      body.push(...lines); count++;
    });
    if (!body.length) return { ok: false, error: 'There are no classes to export.' };
    const name = clean(o.semester);
    const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campuslit//Time table//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc('Classes' + (name ? ' ' + name : '')), 'X-WR-TIMEZONE:Asia/Karachi',
      'BEGIN:VTIMEZONE', 'TZID:Asia/Karachi', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0500', 'TZOFFSETTO:+0500', 'TZNAME:PKT', 'END:STANDARD', 'END:VTIMEZONE'];
    const lines = [...head, ...body, 'END:VCALENDAR'];
    return { ok: true, text: lines.map(fold).join('\r\n') + '\r\n', count, until: local(until).slice(0, 8) };
  }

  root.BahriaCalendar = { build, mondayOf, fileName, fold, esc, dateStart, MIN_WEEKS, MAX_WEEKS, ALARMS };
})(globalThis);
