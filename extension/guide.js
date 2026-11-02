(function (root) {
  'use strict';
  // The first-run guide: what has been shown and what has been dismissed. Pure logic, no browser access; storage and screens live elsewhere.
  // Only a few yes/no facts are kept (the welcome screen was closed, which hints were dismissed). They stay on this device and "Reset all settings" removes them.
  const KEY = 'bahriaStudioGuide';
  // The one-time hints on the portals. Order is priority on a page that qualifies for more than one: the feature on the page first, the general search hint last.
  const HINTS = Object.freeze({
    attendance: Object.freeze({ title: 'How many hours can you still miss?', text: 'Each line works out how many hours you can still miss and finish above 75%. You can set the semester length in Campuslit settings.' }),
    assignments: Object.freeze({ title: 'Due soon, at a glance', text: 'This card counts down to your next deadline, and each row says whether it is open, submitted or closed. On other LMS pages a small reminder names the next assignment you have not submitted; you can turn that off in settings.' }),
    timetable: Object.freeze({ title: 'Take your classes with you', text: 'Add to calendar downloads your time table as a file you can open in Google, Apple or Outlook Calendar.' }),
    search: Object.freeze({ title: 'Jump to any page', text: 'Press {key} and type a few letters, then Enter. It searches the pages in the menu.', touch: 'Tap the magnifier and type a few letters, then tap the page you want. It searches the pages in the menu.' })
  });
  const ORDER = Object.freeze(Object.keys(HINTS));

  const empty = () => ({ v: 1, welcome: false, tour: false, seen: [] });
  // Anything read from storage is untrusted: keep only known keys, as an ordered list without repeats (a list, not an object, so odd key names cannot matter).
  function sanitize(raw) {
    const state = empty();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
    state.welcome = raw.welcome === true;
    state.tour = raw.tour === true;   // set from settings: "take the tour again" at the next popup open
    if (Array.isArray(raw.seen)) for (const key of raw.seen) if (typeof key === 'string' && ORDER.includes(key) && !state.seen.includes(key)) state.seen.push(key);
    return state;
  }
  const isSeen = (state, key) => sanitize(state).seen.includes(key);
  function mark(state, key) { const next = sanitize(state); if (ORDER.includes(key) && !next.seen.includes(key)) next.seen.push(key); return next; }
  const welcomed = state => sanitize(state).welcome;
  function markWelcome(state) { const next = sanitize(state); next.welcome = true; next.tour = false; return next; }
  function requestTour(state) { const next = sanitize(state); next.tour = true; return next; }
  function clearHints(state) { const next = sanitize(state); next.seen = []; return next; }
  // Should the popup open with the welcome and tour? The first time (unless tips are off), or whenever a replay was asked for.
  function wantsTour(state, tipsOn) { const s = sanitize(state); return s.tour || (!!tipsOn && !s.welcome); }
  // How many hints have been dismissed, for the settings page.
  function progress(state) { return { seen: sanitize(state).seen.length, total: ORDER.length }; }
  // Of the hints that apply to this page (given in priority order by the caller), the first one not dismissed yet; null when none.
  function pick(state, candidates) {
    const next = sanitize(state);
    for (const key of Array.isArray(candidates) ? candidates : []) if (ORDER.includes(key) && !next.seen.includes(key)) return key;
    return null;
  }
  // ctx: { mac: boolean, touch: boolean }
  function hint(key, ctx) {
    const base = HINTS[key]; if (!base) return null;
    const mac = !!(ctx && ctx.mac), touch = !!(ctx && ctx.touch);
    const raw = touch && base.touch ? base.touch : base.text;
    return { key, title: base.title, text: raw.replace('{key}', mac ? 'Cmd+K or /' : 'Ctrl+K or /') };
  }

  root.BahriaGuide = { KEY, HINTS, ORDER, empty, sanitize, isSeen, mark, welcomed, markWelcome, requestTour, clearHints, wantsTour, progress, pick, hint };
})(globalThis);
