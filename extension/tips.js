(function () {
  'use strict';
  // One-time hints on the portals: a small note beside a Campuslit feature the first time it appears ("this is what this does").
  // At most one hint per page load, each shown once, never over the quick-search window, and all of them can be turned off in settings.
  // Which hints you have dismissed is a few yes/no facts in this browser's extension storage (see guide.js); nothing is sent anywhere.
  const api = globalThis.browser || globalThis.chrome;
  const G = globalThis.BahriaGuide;
  const owned = new Set();
  const state = { on: false, preview: false, loaded: false, loading: false, guide: null, node: null, anchor: null, key: null, timer: 0, listening: false, shownThisPage: false, frame: 0 };
  const SHOW_AFTER = 1200;   // ms: let the page and Campuslit's own screens settle first
  const topFrame = () => window.top === window;
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const visible = node => { if (!node || !node.isConnected) return false; const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const device = () => ({ mac: /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || ''), touch: !!(globalThis.matchMedia && matchMedia('(hover: none)').matches) });
  const dialogOpen = () => !!document.querySelector('dialog[open]');

  // The hints that could apply to this page, in priority order, each with the thing it points at.
  function candidates() {
    const list = [];
    const plan = document.querySelector('.bs-att-note') || document.querySelector('.bs-plan-head h2');
    if (visible(plan)) list.push({ key: 'attendance', anchor: plan, kind: 'pop' });
    const card = document.querySelector('.bs-due');
    if (card && card.querySelector('.bs-due-main') && visible(card)) list.push({ key: 'assignments', anchor: card, kind: 'note' });
    const calendar = document.querySelector('.bs-tt-export');
    if (visible(calendar)) list.push({ key: 'timetable', anchor: calendar, kind: 'pop', ring: true });
    const search = document.querySelector('.bs-qs-btn');
    if (visible(search)) list.push({ key: 'search', anchor: search, kind: 'pop', ring: true });
    return list;
  }

  function persist(key) {
    state.guide = G.mark(state.guide, key);   // remembered at once, so it cannot reappear while the write is in flight
    if (!api || !api.storage) return Promise.resolve();
    return api.storage.local.get(G.KEY).then(data => api.storage.local.set({ [G.KEY]: G.mark(data[G.KEY], key) })).catch(() => { /* a hint that cannot be remembered will simply show again next time */ });
  }

  // ---------- the hint itself ----------
  function remove() {
    clearTimeout(state.timer); state.timer = 0;
    if (state.frame) { cancelAnimationFrame(state.frame); state.frame = 0; }
    if (state.anchor) { state.anchor.classList.remove('bs-tip-target'); }
    if (state.node) { state.node.remove(); owned.delete(state.node); }
    state.node = null; state.anchor = null; state.key = null;
  }
  function dismiss() { const key = state.key; remove(); if (key) persist(key); }

  function place() {
    state.frame = 0;
    const node = state.node, anchor = state.anchor;
    if (!node || !anchor || node.dataset.kind !== 'pop') return;
    if (!anchor.isConnected) { remove(); return; }
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, r = anchor.getBoundingClientRect();
    const offscreen = r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw;
    node.style.visibility = offscreen ? 'hidden' : '';
    const width = Math.min(320, vw - 24); node.style.width = width + 'px';
    const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, vw - width - 12));
    const height = node.offsetHeight, below = r.bottom + 12 + height <= vh - 12 || r.top - 12 - height < 12;
    node.dataset.place = below ? 'below' : 'above';
    node.style.left = left + 'px'; node.style.top = Math.max(12, below ? r.bottom + 12 : r.top - 12 - height) + 'px';
    const arrow = Math.max(20, Math.min(r.left + r.width / 2 - left, width - 20)); node.style.setProperty('--arrow', arrow + 'px');
  }
  const schedulePlace = () => { if (state.node && !state.frame) state.frame = requestAnimationFrame(place); };

  function show(found) {
    const text = G.hint(found.key, device());
    if (!text) return;
    const node = make('div', 'bs-tip'); node.dataset.kind = found.kind; node.dataset.key = found.key; node.setAttribute('role', 'status'); node.setAttribute('aria-label', 'Tip');
    const body = make('div', 'bs-tip-body');
    body.append(make('span', 'bs-tip-kicker', 'Tip'), make('p', 'bs-tip-title', text.title), make('p', 'bs-tip-text', text.text));
    const ok = make('button', 'bs-tip-ok', 'Got it'); ok.type = 'button'; ok.addEventListener('click', dismiss);
    if (found.kind === 'pop') { const arrow = make('span', 'bs-tip-arrow'); arrow.setAttribute('aria-hidden', 'true'); node.append(arrow, body, ok); document.body.append(node); }
    else { node.append(body, ok); found.anchor.after(node); }
    owned.add(node);
    state.node = node; state.anchor = found.anchor; state.key = found.key; state.shownThisPage = true;
    if (found.ring) found.anchor.classList.add('bs-tip-target');
    place();
  }

  function consider() {
    state.timer = 0;
    if (!state.on || state.shownThisPage || state.node || !state.loaded || state.preview) return;
    if (document.visibilityState !== 'visible' || dialogOpen()) { schedule(); return; }
    const found = candidates(), key = G.pick(state.guide, found.map(c => c.key));
    if (key) show(found.find(c => c.key === key));
  }
  function schedule() { if (!state.timer && !state.node && !state.shownThisPage) state.timer = setTimeout(consider, SHOW_AFTER); }

  // ---------- wiring ----------
  function onKey(e) { if (e.key === 'Escape' && state.node && !dialogOpen() && !e.defaultPrevented) dismiss(); }
  function onGuideChange(changes, area) {
    if (area !== 'local' || !changes[G.KEY]) return;
    state.guide = G.sanitize(changes[G.KEY].newValue);
    if (state.key && G.isSeen(state.guide, state.key)) remove();   // dismissed in another tab
  }
  function load() {
    if (state.loaded || state.loading || !api || !api.storage) return;
    state.loading = true;
    api.storage.local.get(G.KEY).then(data => { state.guide = G.sanitize(data[G.KEY]); state.loaded = true; state.loading = false; schedule(); }).catch(() => { state.loading = false; });
  }
  function teardown() {
    remove();
    if (state.listening) {
      document.removeEventListener('keydown', onKey, true); removeEventListener('resize', schedulePlace); removeEventListener('scroll', schedulePlace, true); document.removeEventListener('visibilitychange', schedule);
      if (api && api.storage && api.storage.onChanged) api.storage.onChanged.removeListener(onGuideChange);
      state.listening = false;
    }
    owned.forEach(n => n.remove()); owned.clear();
    state.on = false;
  }

  // opts: { enabled (the "show tips" setting), preview }
  function mount(opts) {
    state.preview = !!(opts && opts.preview);
    const wanted = !(opts && opts.enabled === false) && !state.preview && topFrame() && document.body && G && api && api.storage;
    if (!wanted) { if (state.on) teardown(); return; }
    state.on = true;
    if (!state.listening) {
      document.addEventListener('keydown', onKey, true); addEventListener('resize', schedulePlace); addEventListener('scroll', schedulePlace, true); document.addEventListener('visibilitychange', schedule);
      if (api.storage.onChanged) api.storage.onChanged.addListener(onGuideChange);
      state.listening = true;
    }
    if (!state.loaded) { load(); return; }
    if (state.node) { if (!state.anchor || !state.anchor.isConnected) remove(); else schedulePlace(); }
    schedule();
  }
  // Called when a feature is used for real (e.g. quick search opened), so its hint never shows afterwards.
  function used(key) {
    if (!G || (state.guide && G.isSeen(state.guide, key))) return;
    if (state.key === key) { remove(); }
    persist(key);
  }

  globalThis.BahriaTips = { mount, disable: teardown, used };
})();
