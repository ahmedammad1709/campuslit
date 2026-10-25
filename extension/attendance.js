(function (root) {
  'use strict';
  // Attendance planner maths. Pure functions: no page access, no storage, no network.
  //
  // Rules (from the university):
  //  - Attendance must be MORE than 75% at the end of the semester. Exactly 75.0% is not enough.
  //  - A course's credit hours are its class hours per week. A lab is one continuous 3-hour session per credit hour.
  //  - Classes are whole hours (1 or 2 hours); a lab session is 3 hours.
  // So the semester holds  weeks x weekly hours  in total, and what is left is that minus what has been held so far.
  // Everything is computed in whole minutes so the edge right at 75% is exact, not a rounding accident.
  const MIN_PERCENT = 75;       // must be strictly above this
  const COMFORT_MISSES = 2;     // a green line means you could miss at least this many weeks' worth of class
  const DEFAULT_WEEKS = 16;

  function minutes(value) {
    const n = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 60) : NaN;
  }
  function clampWeeks(weeks) { const n = Math.round(Number(weeks)); return Number.isFinite(n) ? Math.min(30, Math.max(4, n)) : DEFAULT_WEEKS; }
  function isLab(raw) { return raw.lab === true || /\blab\b/i.test(String(raw.title || '')) || /^[A-Za-z]{2}L\b/.test(String(raw.code || '').trim()); }

  // raw: { present, total, creditHours?, title?, code?, percentage? }  (hours; numbers or numeric strings)
  // opts: { weeks }
  // state: 'safe' above 75% by the end even if you miss some classes   | 'tight' no class can be missed
  //        'recover' at or below 75% now but still recoverable        | 'lost' cannot finish above 75% any more
  //        'ended' every hour of the semester has been held           | 'none' no classes held yet
  //        'invalid' the numbers are missing or contradict each other
  // mode: 'semester' when credit hours are known (the full answer), 'now' otherwise (only counted from today)
  function plan(raw, opts) {
    if (!raw || typeof raw !== 'object') return { state: 'invalid', reason: 'no data' };
    const P = minutes(raw.present), T = minutes(raw.total);
    if (Number.isNaN(P) || Number.isNaN(T)) return { state: 'invalid', reason: 'missing numbers' };
    if (T === 0) return P === 0 ? { state: 'none' } : { state: 'invalid', reason: 'attended hours with none held' };
    if (P > T) return { state: 'invalid', reason: 'attended more than was held' };
    const percent = P / T * 100;
    const shown = raw.percentage === undefined || raw.percentage === null || raw.percentage === '' ? NaN : parseFloat(String(raw.percentage).replace('%', ''));
    // If the portal's own percentage disagrees with its own hours, advice built on them could mislead: say so instead.
    if (Number.isFinite(shown) && Math.abs(shown - percent) > 1) return { state: 'invalid', reason: 'percentage does not match hours', percent };
    const out = { percent: Math.round(percent * 100) / 100, lab: isLab(raw) };
    const unit = out.lab ? 180 : 60;                       // the smallest amount you can attend or miss: one class hour, or one lab session
    const credit = raw.creditHours === undefined ? raw.credit : raw.creditHours;
    const creditMin = minutes(credit);

    if (!(creditMin > 0 && creditMin <= 12 * 60)) {
      // Credit hours unknown: the semester length cannot be worked out, so answer only from today.
      out.mode = 'now';
      if (100 * P > MIN_PERCENT * T) {
        const maxMissed = Math.ceil((100 * P - MIN_PERCENT * T) / MIN_PERCENT) - 1;      // largest x with 100P > 75(T + x)
        out.canMissMin = Math.floor(Math.max(0, maxMissed) / unit) * unit;
        out.state = out.canMissMin >= unit ? 'safe' : 'tight'; out.level = 'warn';
      } else {
        const minNeeded = Math.floor((MIN_PERCENT * T - 100 * P) / (100 - MIN_PERCENT)) + 1;   // smallest y with 100(P + y) > 75(T + y)
        out.state = 'recover'; out.level = 'bad'; out.needMin = Math.ceil(minNeeded / unit) * unit;
      }
      return out;
    }

    out.mode = 'semester';
    const weeks = clampWeeks(opts && opts.weeks);
    const weekly = creditMin * (out.lab ? 3 : 1);
    const S = Math.max(weeks * weekly, T);                 // the semester's total hours (never less than what has already been held)
    const R = S - T;                                        // hours still to come
    Object.assign(out, { weeks, weeklyMin: weekly, totalMin: S, heldMin: T, remainMin: R });
    if (R === 0) { out.state = 'ended'; out.level = 100 * P > MIN_PERCENT * T ? 'ok' : 'bad'; out.finalPercent = out.percent; return out; }
    // Fewest hours you must still attend:  100(P + a) > 75 S   (a rounded up to whole classes)
    const rawNeed = Math.max(0, Math.floor((MIN_PERCENT * S - 100 * P) / 100) + 1);
    out.bestPercent = Math.round((P + R) / S * 10000) / 100;
    if (rawNeed > R) { out.state = 'lost'; out.level = 'bad'; return out; }
    const need = Math.min(R, Math.ceil(rawNeed / unit) * unit);
    out.needMin = need;
    out.canMissMin = Math.floor((R - need) / unit) * unit;
    const above = 100 * P > MIN_PERCENT * T;
    if (!above) { out.state = 'recover'; out.level = 'bad'; }
    else if (out.canMissMin < unit) { out.state = 'tight'; out.level = 'warn'; }
    else { out.state = 'safe'; out.level = out.canMissMin >= COMFORT_MISSES * weekly ? 'ok' : 'warn'; }
    return out;
  }

  function hours(min) { const h = Math.round(min / 6) / 10; const t = Number.isInteger(h) ? String(h) : h.toFixed(1); return t + (h === 1 ? ' hr' : ' hrs'); }
  function sessions(min) { const n = Math.round(min / 180); return n + (n === 1 ? ' lab session' : ' lab sessions'); }
  function amount(p, min) { return p.lab ? sessions(min) + ' (' + hours(min) + ')' : hours(min); }
  // One short sentence for a course, plus a tooltip that shows the working.
  function describe(p) {
    const left = p && p.mode === 'semester' ? p.remainMin : 0;
    const working = p && p.mode === 'semester'
      ? p.weeks + ' weeks × ' + hours(p.weeklyMin) + ' a week = ' + hours(p.totalMin) + ' in the semester. ' + hours(p.heldMin) + ' held so far, ' + hours(left) + ' to go.'
      : 'Credit hours are not available here, so this is counted only from now.';
    switch (p && p.state) {
      case 'safe':
        return p.mode === 'semester'
          ? { text: 'Can miss up to ' + amount(p, p.canMissMin) + ' of the remaining ' + hours(left) + ' and still finish above ' + MIN_PERCENT + '%', title: working + ' Attend at least ' + hours(p.needMin) + ' of what is left.' }
          : { text: 'Can miss up to ' + amount(p, p.canMissMin) + ' and stay above ' + MIN_PERCENT + '%', title: working };
      case 'tight':
        return p.mode === 'semester'
          ? { text: 'No room to miss. Attend all ' + hours(left) + ' that are left to finish above ' + MIN_PERCENT + '%', title: working }
          : { text: 'No room to miss anything more right now', title: working };
      case 'recover':
        return p.mode === 'semester'
          ? { text: 'Attend at least ' + amount(p, p.needMin) + ' of the remaining ' + (p.lab ? sessions(left) : hours(left)) + ' to finish above ' + MIN_PERCENT + '%', title: working + ' Below ' + MIN_PERCENT + '% right now, but still recoverable.' }
          : { text: 'Attend the next ' + amount(p, p.needMin) + ' without missing any to get above ' + MIN_PERCENT + '%', title: working };
      case 'lost': return { text: 'Cannot finish above ' + MIN_PERCENT + '% any more, even attending every remaining hour (best possible ' + p.bestPercent + '%)', title: working };
      case 'ended': return { text: 'All semester hours are done. Final attendance ' + p.finalPercent + '%', title: working };
      case 'none': return { text: 'No classes held yet', title: '' };
      default: return { text: 'Cannot work this out from the numbers on the page', title: p && p.reason ? 'Reason: ' + p.reason : '' };
    }
  }
  function summarize(plans) {
    const list = Array.isArray(plans) ? plans : [];
    const counted = list.filter(p => p && p.state !== 'invalid' && p.state !== 'none');
    return {
      total: counted.length,
      risk: counted.filter(p => p.state === 'recover' || p.state === 'lost' || (p.state === 'ended' && p.level === 'bad')).length,
      tight: counted.filter(p => p.state === 'tight').length,
      unknown: list.filter(p => p && p.state === 'invalid').length
    };
  }
  function summaryText(s) {
    if (!s.total) return '';
    if (s.risk) return s.risk + (s.risk === 1 ? ' course is' : ' courses are') + ' at or below ' + MIN_PERCENT + '%';
    if (s.tight) return 'Above ' + MIN_PERCENT + '% in all, but ' + s.tight + (s.tight === 1 ? ' course has' : ' courses have') + ' no room to miss';
    return 'All ' + s.total + (s.total === 1 ? ' course is' : ' courses are') + ' above ' + MIN_PERCENT + '%';
  }

  // Pulls the course array out of the dashboard script: renderAttendanceSummaryChart([ {...}, ... ]).
  // Walks the brackets while respecting JSON strings, so a title containing "]" or ")" cannot cut it short.
  function extractCourses(scriptText) {
    if (typeof scriptText !== 'string') return null;
    const call = scriptText.indexOf('renderAttendanceSummaryChart(');
    if (call < 0) return null;
    const start = scriptText.indexOf('[', call);
    if (start < 0 || start - call > 40) return null;
    let depth = 0, inString = false;
    for (let i = start; i < scriptText.length; i++) {
      const c = scriptText[i];
      if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; continue; }
      if (c === '"') inString = true;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) {
        try { const data = JSON.parse(scriptText.slice(start, i + 1)); return Array.isArray(data) ? data : null; } catch (e) { return null; }
      }
    }
    return null;
  }

  root.BahriaAttendance = { MIN_PERCENT, DEFAULT_WEEKS, plan, describe, summarize, summaryText, extractCourses, hours, clampWeeks };
})(globalThis);
