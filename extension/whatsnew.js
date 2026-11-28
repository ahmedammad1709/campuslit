(function (root) {
  'use strict';
  // What changed in each version, written for students. It ships inside the extension, so showing it needs no network request.
  // One small record is kept in this browser when an update arrives ({ from, to }); the popup shows the news once, and closing it removes the record.
  const KEY = 'bahriaStudioNews';
  const RELEASES = Object.freeze([
    Object.freeze({ version: '1.3.3', date: '28 November 2026', items: Object.freeze([
      'Download part of a course: two dropdowns above the Lecture Notes table let you choose the first and last lecture, and the button counts the files.',
      'The CMS sidebar now folds to a slim icon rail, like the LMS, instead of disappearing. Pointing at an icon (on the CMS and the LMS) shows its name.'
    ]) }),
    Object.freeze({ version: '1.3.2', date: '23 November 2026', items: Object.freeze([
      'The Due soon card on the Assignments page can be folded away with the arrow in its corner, and opened again. It stays open by default.',
      'The Open Assignments button in the reminder now opens the course the reminder is about, not an empty page.',
      'Next class on the dashboards now follows the clock on your computer, like the one above the Time Table, so it no longer shows tomorrow’s class as on now when the computer’s time zone setting is wrong.'
    ]) }),
    Object.freeze({ version: '1.3.1', date: '20 November 2026', items: Object.freeze([
      'The Submit Assignment window and other pop-ups are readable in dark themes: the title, labels and file chooser no longer turn white on white.'
    ]) }),
    Object.freeze({ version: '1.3.0', date: '19 November 2026', items: Object.freeze([
      'Marks overview on the Quizzes page: one window with your quiz and assignment marks for every course.',
      'Download all lecture notes as one zip, with a progress ring.',
      'Add the open deadlines of a course to your calendar, with reminders.',
      'Your next class on the CMS and LMS dashboards, from the time table you have opened.',
      'Share your custom theme as a short code, or add one from a friend.',
      'The faculty sign-in page title is readable, and the Caps Lock warning is clearer.'
    ]) }),
    Object.freeze({ version: '1.2.2', date: '18 November 2026', items: Object.freeze([
      'Preview works again on the LMS. The university scrambled its download links, so Preview now finds out what a file is when it opens.',
      'Preview for Excel (.xlsx), PowerPoint (.pptx) and zip files, and for old .doc, .xls and .ppt files.',
      'New Updates page in Settings, with what changed in each version and a button to check for updates (Chrome).'
    ]) }),
    Object.freeze({ version: '1.2.1', date: '17 November 2026', items: Object.freeze([
      'A progress ring while a file loads, with the percentage.',
      'Teachers’ comments shown right in the Assignments and Quizzes pages.',
      'CMS menu fixes: no white pill on hover or on the page you are on, and no box behind icons.'
    ]) }),
    Object.freeze({ version: '1.2.0', date: '17 November 2026', items: Object.freeze([
      'File preview on the LMS for PDF, Word, image and text files.',
      'Support for the university’s updated CMS menus and icons.'
    ]) }),
    Object.freeze({ version: '1.1.3', date: '10 November 2026', items: Object.freeze([
      'Dragging the sidebar scrollbar no longer resizes the menu.'
    ]) })
  ]);

  const parse = v => { const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,5})$/.exec(typeof v === 'string' ? v : ''); return m ? [+m[1], +m[2], +m[3]] : null; };
  // -1, 0 or 1; null when either is not a plain x.y.z version
  function compare(a, b) {
    const p = parse(a), q = parse(b); if (!p || !q) return null;
    for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] < q[i] ? -1 : 1;
    return 0;
  }
  // Anything read from storage is untrusted: only two plain version strings, going upwards, are kept.
  function sanitizeNews(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return compare(raw.from, raw.to) === -1 ? { from: raw.from, to: raw.to } : null;
  }
  // The record to keep when the extension has just been updated; null when there is nothing to tell (a reload, a downgrade, an unreadable version).
  const recordFor = (previous, current) => sanitizeNews({ from: previous, to: current });
  // The releases after `from`, up to and including `to`, newest first.
  const since = (from, to) => RELEASES.filter(r => compare(r.version, from) === 1 && compare(r.version, to) <= 0);
  // The few lines for the popup card: newest version's items first, at most `max` of them, and how many were left out.
  function summary(releases, max) {
    const all = []; for (const r of releases) for (const item of r.items) all.push(item);
    return { items: all.slice(0, max), more: Math.max(0, all.length - max) };
  }

  root.BahriaWhatsNew = { KEY, RELEASES, compare, sanitizeNews, recordFor, since, summary };
})(globalThis);
