(function (root) {
  'use strict';
  // "Next class": a small card on the dashboards that says which class is on now or comes next, from the time table you have already opened.
  //
  // The portal only shows the time table on its own page, so to tell you on the dashboards Campuslit keeps a short note on this device:
  // for each class the day, the start and end time, the course title and the room. Nothing else, and it is never sent anywhere.
  // The settings page can turn the card off (which forgets the note) or forget it on demand.
  //
  // This file has the logic (what is next, how to say it), the check that anything read back from storage is sane, and the card itself,
  // drawn with createElement and textContent only. Times are Pakistan time, as the time table is, whatever the device clock's zone.
  const KEY = 'bahriaStudioTimetable';
  const MINUTE = 60000, HOUR = 3600000, DAY = 86400000, PKT = 5 * HOUR;
  const MAX_EVENTS = 80, TEXT = 80, KEEP = 150 * DAY, STALE_NOTE = 7 * DAY;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const clip = (v, n = TEXT) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n).replace(/[\ud800-\udbff]$/, '') : '');
  const empty = () => ({ v: 1, semester: '', savedAt: 0, events: [], hint: false });

  // Anything read from storage is checked again: wrong types, impossible times and oversized lists are dropped, never trusted.
  function sanitize(raw) {
    const out = empty();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    out.hint = raw.hint === true;                                  // the "open your time table once" suggestion was dismissed
    out.semester = clip(raw.semester, 40);
    out.savedAt = Number.isFinite(raw.savedAt) && raw.savedAt > 0 && raw.savedAt < Date.UTC(2100, 0, 1) ? Math.floor(raw.savedAt) : 0;
    const seen = new Set();
    for (const e of (Array.isArray(raw.events) ? raw.events : []).slice(0, MAX_EVENTS * 2)) {
      if (!e || typeof e !== 'object' || out.events.length >= MAX_EVENTS) continue;
      const day = e.day, start = e.start, end = e.end;
      if (!Number.isInteger(day) || day < 0 || day > 6 || !Number.isFinite(start) || !Number.isFinite(end)) continue;
      const s = Math.round(start), f = Math.round(end);
      if (s < 0 || f <= s || f > 1440) continue;
      const title = clip(e.title) || clip(e.short);
      if (!title) continue;
      const item = { day, start: s, end: f, title, room: clip(e.room, 30), building: clip(e.building, 40), lab: e.lab === true };
      const id = [item.day, item.start, item.end, item.title].join('|');
      if (seen.has(id)) continue; seen.add(id);
      out.events.push(item);
    }
    return out;
  }
  // The note to keep after the time table page has been read: { semester, events: [{ day, start, end, title, room, building, lab }] }.
  function fromSchedule(schedule, now, previous) {
    const prev = sanitize(previous);
    const made = sanitize({ semester: schedule && schedule.semester, savedAt: Number.isFinite(now) ? now : Date.now(), events: schedule && schedule.events, hint: prev.hint });
    return made.events.length ? made : null;
  }
  // a note that can no longer be trusted to describe this semester is not used
  const usable = (record, now) => { const r = sanitize(record); return r.events.length && r.savedAt && now - r.savedAt < KEEP && r.savedAt <= now + DAY ? r : null; };

  // ---- what is next ----------------------------------------------------------------------------------------------------------------------
  const midnight = ms => Math.floor((ms + PKT) / DAY) * DAY - PKT;                 // the start of that day in Pakistan, as an epoch
  const weekday = ms => new Date(ms + PKT).getUTCDay();
  // record: a sanitized note. Returns null when there is nothing to show, else
  // { event, live, startMs, endMs, offset (days from today), following: the class after it or null, leftToday: classes still to come or on today }
  function next(record, now) {
    const r = usable(record, now); if (!r || !Number.isFinite(now)) return null;
    const today = midnight(now), at = weekday(now), list = [];
    for (const e of r.events) {
      let offset = (e.day - at + 7) % 7;
      let startMs = today + offset * DAY + e.start * MINUTE, endMs = today + offset * DAY + e.end * MINUTE;
      if (endMs <= now) { offset += 7; startMs += 7 * DAY; endMs += 7 * DAY; }     // already over today: next week's
      list.push({ event: e, offset, startMs, endMs, live: startMs <= now && now < endMs });
    }
    if (!list.length) return null;
    const live = list.filter(x => x.live).sort((a, b) => a.endMs - b.endMs || a.startMs - b.startMs);
    const upcoming = list.filter(x => !x.live && x.startMs > now).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    const pick = live[0] || upcoming[0]; if (!pick) return null;
    const following = upcoming.find(x => x !== pick && x.startMs >= pick.endMs && x.offset === pick.offset) || null;
    const leftToday = list.filter(x => x.offset === 0 && x.endMs > now).length;
    return { event: pick.event, live: pick.live, startMs: pick.startMs, endMs: pick.endMs, offset: pick.offset, following: following && { event: following.event, startMs: following.startMs }, leftToday };
  }

  // ---- the words ----------------------------------------------------------------------------------------------------------------------------
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  function wait(ms) {   // "40 min", "2 hr 10 min", "3 days"
    const span = Math.max(0, ms);
    if (span < MINUTE) return 'less than a minute';
    if (span < HOUR) return plural(Math.ceil(span / MINUTE), 'min', 'min');
    if (span < DAY) { const h = Math.floor(span / HOUR), m = Math.round((span % HOUR) / MINUTE); return m === 60 ? plural(h + 1, 'hr', 'hrs') : plural(h, 'hr', 'hrs') + (m ? ' ' + m + ' min' : ''); }
    const d = Math.floor(span / DAY); return plural(d, 'day', 'days');
  }
  const clock = minutes => { const h = Math.floor(minutes / 60) % 24, m = minutes % 60; return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'am' : 'pm'); };
  const range = e => { const a = clock(e.start), b = clock(e.end); return a.slice(-2) === b.slice(-2) ? a.slice(0, -3) + ' – ' + b : a + ' – ' + b; };
  const dayName = (offset, ms) => offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAYS[weekday(ms)];
  // The whole sentence set for the card.
  function describe(n, now) {
    const e = n.event, where = [e.room, e.building].filter(Boolean).join(', ');
    const out = { state: n.live ? 'live' : (n.startMs - now < HOUR && n.offset === 0 ? 'soon' : 'later'), title: e.title + (e.lab ? ' (Lab)' : ''), time: range(e), where, following: null };
    if (n.live) { out.badge = 'Now'; out.when = 'Ends in ' + wait(n.endMs - now); }
    else if (n.offset === 0) { out.badge = 'Next'; out.when = 'Starts in ' + wait(n.startMs - now); }
    else { out.badge = dayName(n.offset, n.startMs); out.when = n.offset === 1 ? 'Starts at ' + clock(e.start) : DAYS[weekday(n.startMs)] + ' at ' + clock(e.start); }
    if (n.following) out.following = { title: n.following.event.title + (n.following.event.lab ? ' (Lab)' : ''), at: clock(n.following.event.start) };
    return out;
  }
  const savedAgo = (record, now) => { const r = sanitize(record); return r.savedAt && now - r.savedAt > STALE_NOTE ? Math.floor((now - r.savedAt) / DAY) : 0; };

  // ---- the card ------------------------------------------------------------------------------------------------------------------------------
  function mk(doc, tag, cls, text) { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  // Fills (or refreshes) a card element. record may be null: then the card says how to get a next class (when `suggest` is given, with a link and a way to hide it).
  function fill(doc, node, record, now, suggest) {
    const n = next(record, now);
    node.replaceChildren();
    if (!n) {
      if (!suggest || sanitize(record).hint) { node.hidden = true; return false; }
      node.hidden = false; node.dataset.state = 'empty';
      const text = mk(doc, 'div', 'bs-next-main');
      text.append(mk(doc, 'b', '', 'See your next class here'), mk(doc, 'span', 'bs-next-when', 'Open your Time Table once and Campuslit remembers it on this device. Nothing is sent anywhere.'));
      const side = mk(doc, 'div', 'bs-next-actions');
      if (suggest.href) { const a = mk(doc, 'a', 'bs-next-btn', 'Open Time Table'); a.href = suggest.href; side.append(a); }
      const hide = mk(doc, 'button', 'bs-next-hide', 'Hide'); hide.type = 'button'; hide.addEventListener('click', () => { if (suggest.onHide) suggest.onHide(); });
      side.append(hide); node.append(mk(doc, 'div', 'bs-next-badge', 'Tip'), text, side);
      return true;
    }
    const d = describe(n, now), ago = savedAgo(record, now);
    node.hidden = false; node.dataset.state = d.state;
    const main = mk(doc, 'div', 'bs-next-main');
    main.append(mk(doc, 'b', '', d.title), mk(doc, 'span', 'bs-next-when', d.when + ' · ' + d.time));
    if (d.where) main.append(mk(doc, 'small', '', d.where));
    if (ago) main.append(mk(doc, 'small', 'bs-next-old', 'Time table saved ' + ago + ' days ago. Open it again to refresh.'));
    node.append(mk(doc, 'div', 'bs-next-badge', d.badge), main);
    if (d.following) { const then = mk(doc, 'div', 'bs-next-then'); then.append(mk(doc, 'span', '', 'Then'), mk(doc, 'b', '', d.following.at), mk(doc, 'small', '', d.following.title)); node.append(then); }
    else if (n.live && n.leftToday <= 1) { const then = mk(doc, 'div', 'bs-next-then'); then.append(mk(doc, 'span', '', 'Last class'), mk(doc, 'b', '', 'today')); node.append(then); }
    node.setAttribute('aria-label', 'Your next class: ' + d.title + '. ' + d.when + '.');
    return true;
  }

  // ---- the note on this device ------------------------------------------------------------------------------------------------------------
  const area = () => { const api = root.browser || root.chrome; return api && api.storage && api.storage.local ? api.storage.local : null; };
  const io = {
    available: () => !!area(),
    async read() { const a = area(); return a ? sanitize((await a.get(KEY))[KEY]) : empty(); },
    // read the latest copy, change it, write it back: two open tabs cannot overwrite each other
    async update(change) { const a = area(); if (!a) return empty(); const next = sanitize(change(sanitize((await a.get(KEY))[KEY]))); await a.set({ [KEY]: next }); return next; },
    async forget() { const a = area(); if (a) await a.remove(KEY); },
    subscribe(cb) { const api = root.browser || root.chrome; if (api && api.storage && api.storage.onChanged) api.storage.onChanged.addListener((changes, name) => { if (name === 'local' && changes[KEY]) cb(sanitize(changes[KEY].newValue)); }); }
  };

  // ---- the card on a page -----------------------------------------------------------------------------------------------------------------
  // One card per page. mount() is safe to call again and again (the portals redraw their pages): it keeps a single card, refreshes it every 30 seconds,
  // follows the note when another tab changes it, and, when the setting is off, takes the card away and forgets the note (once).
  const state = { doc: null, node: null, timer: 0, record: null, loaded: false, subscribed: false, forgot: false, suggest: null, version: 0, sig: '' };
  // The portals change their pages all the time and mount() runs after each change. Redrawing the card every time would swap its buttons for new ones between a
  // press and a release, and the click would never happen. So it is drawn again only when what it shows may have changed: a new note, or the next 15 seconds.
  function paint(force) {
    if (!state.node || !state.node.isConnected) return;
    const sig = state.version + ':' + Math.floor(Date.now() / 15000) + ':' + (state.suggest ? 1 : 0);
    if (!force && sig === state.sig && state.node.childNodes.length) return;
    state.sig = sig;
    const suggest = state.suggest ? { href: state.suggest.href, onHide: () => { io.update(r => ({ ...r, hint: true })).catch(() => {}); } } : null;
    fill(state.doc, state.node, state.record, Date.now(), suggest);
  }
  function unmount() {
    clearInterval(state.timer); state.timer = 0;
    if (state.node) state.node.remove();
    state.node = null; state.loaded = false; state.record = null;
  }
  // opts: { on, place(node) -> true when the card was put on the page, suggest: { href } | null }
  function mount(doc, opts) {
    if (!io.available() || !doc || !opts) return;
    if (!opts.on) { unmount(); if (!state.forgot) { state.forgot = true; io.forget().catch(() => {}); } return; }
    state.forgot = false; state.doc = doc; state.suggest = opts.suggest || null;
    if (!state.node || !state.node.isConnected) {
      if (state.node) state.node.remove();
      const node = mk(doc, 'section', 'bs-next'); node.hidden = true; node.setAttribute('role', 'region');
      if (!opts.place(node)) return;
      state.node = node;
    }
    if (!state.timer) state.timer = setInterval(() => { if (!doc.hidden) paint(); }, 15000);
    if (!state.loaded) { state.loaded = true; io.read().then(r => { state.record = r; state.version++; paint(); }).catch(() => { state.loaded = false; }); }
    if (!state.subscribed) { state.subscribed = true; io.subscribe(r => { state.record = r; state.version++; paint(); }); }
    paint();
  }
  // Called when the time table page has been read: keep a note of the classes (and nothing else about you).
  function remember(schedule) {
    if (!io.available()) return Promise.resolve(null);
    return io.update(previous => fromSchedule(schedule, Date.now(), previous) || previous);
  }

  root.BahriaNextClass = { mount, unmount, remember, KEY, empty, sanitize, fromSchedule, usable, next, describe, wait, clock, range, fill, savedAgo, io, KEEP };
})(globalThis);
