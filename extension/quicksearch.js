(function () {
  'use strict';
  // Quick search: press Ctrl+K (or /) or tap the search button in the header, type a few letters, jump to any page in the menu.
  // It only reads the menu links already on the page (their names and addresses), keeps nothing, sends nothing, and never changes
  // or intercepts those links. Everything it adds is removed again by disable().
  const owned = new Set();
  const state = { on: false, preview: false, listening: false, dialog: null, input: null, list: null, live: null, empty: null, button: null, items: [], shown: [], active: -1, query: '' };
  const SVG = 'http://www.w3.org/2000/svg';
  const MENU = 'aside#sideBar a[href], .main-sidebar .sidebar-menu a[href]';
  const lib = () => globalThis.BahriaSearch || null;

  // Everything is plain elements with text set through textContent. Only the two long-lived roots (the window and the header button) are tracked for removal.
  function make(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; }
  function icon(size) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const circle = document.createElementNS(SVG, 'circle'); circle.setAttribute('cx', '11'); circle.setAttribute('cy', '11'); circle.setAttribute('r', '7');
    const line = document.createElementNS(SVG, 'path'); line.setAttribute('d', 'm20 20-3.5-3.5');
    svg.append(circle, line); return svg;
  }
  const editable = node => !!node && (node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName || '') || node.getAttribute && node.getAttribute('role') === 'textbox');
  const topFrame = () => state.preview || window.top === window;

  // The menu's links: their text, the heading of the submenu they sit in, and where they go.
  function collect() {
    const links = [];
    document.querySelectorAll(MENU).forEach(a => {
      let group = '';
      const sub = a.closest('.list-group-subMenu, .treeview-menu');
      if (sub) {
        let toggle = null;
        try { toggle = sub.id ? document.querySelector('a[href="#' + CSS.escape(sub.id) + '"]') : null; } catch (e) { toggle = null; }
        toggle = toggle || (sub.parentElement && sub.parentElement.querySelector(':scope > a'));
        if (toggle) group = toggle.textContent;
      }
      const raw = (a.getAttribute('href') || '').trim();
      if (!raw || raw.startsWith('#')) return;                        // submenu toggles and empty links are not pages
      links.push({ label: a.textContent, group, href: a.href });      // the address as the browser resolves it (it follows a <base> tag too)
    });
    return links;
  }
  function isHere(href) { try { const u = new URL(href); return u.origin === location.origin && u.pathname.toLowerCase() === location.pathname.toLowerCase(); } catch (e) { return false; } }

  // ---------- the window ----------
  function ensureDialog() {
    if (state.dialog && state.dialog.isConnected) return state.dialog;
    const dialog = make('dialog', 'bs-qs'); owned.add(dialog); dialog.setAttribute('aria-label', 'Search pages');
    const box = make('div', 'bs-qs-box');
    const row = make('div', 'bs-qs-row'); row.append(icon(18));
    const input = make('input', 'bs-qs-input'); input.type = 'text'; input.id = 'bs-qs-input'; input.placeholder = 'Search pages…'; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off'); input.setAttribute('enterkeyhint', 'go'); input.maxLength = 80;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'bs-qs-list'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-label', 'Search pages');
    const esc = make('kbd', 'bs-qs-esc', 'Esc'); esc.setAttribute('aria-hidden', 'true');
    row.append(input, esc);
    const list = make('ul', 'bs-qs-list'); list.id = 'bs-qs-list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Pages');
    const empty = make('p', 'bs-qs-empty'); empty.hidden = true;
    const foot = make('p', 'bs-qs-foot'); foot.append(make('span', '', '↑↓ to move'), make('span', '', 'Enter to open'), make('span', '', 'Ctrl+Enter in a new tab'));
    const live = make('p', 'bs-qs-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    box.append(row, list, empty, foot, live); dialog.append(box); document.body.append(dialog);
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', onInputKey);
    list.addEventListener('mouseover', e => { const li = e.target.closest && e.target.closest('li'); if (li && li.dataset.i !== undefined) setActive(+li.dataset.i, false); });
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });      // a click outside the box
    dialog.addEventListener('close', () => { state.query = ''; });
    Object.assign(state, { dialog, input, list, live, empty }); return dialog;
  }
  function label(node, text, query) {
    const lib_ = lib(), marks = lib_ ? lib_.marks(text, query) : []; let at = 0;
    marks.forEach(([from, to]) => { if (from > at) node.append(text.slice(at, from)); node.append(make('mark', '', text.slice(from, to))); at = to; });
    if (at < text.length) node.append(text.slice(at));
  }
  function render(query) {
    const lib_ = lib(); if (!lib_ || !state.list) return;
    state.query = query;
    state.shown = lib_.rank(state.items, query, query.trim() ? 12 : 60);
    state.list.textContent = '';
    state.shown.forEach(({ item }, i) => {
      const li = make('li', 'bs-qs-item'); li.id = 'bs-qs-opt-' + i; li.dataset.i = String(i); li.setAttribute('role', 'option');
      const a = make('a', 'bs-qs-link'); a.setAttribute('href', item.href); a.tabIndex = -1;
      const name = make('span', 'bs-qs-name'); label(name, item.label, query);
      a.append(name);
      if (item.group) a.append(make('span', 'bs-qs-group', item.group));
      if (isHere(item.href)) { li.dataset.here = 'true'; a.append(make('span', 'bs-qs-here', 'You are here')); }
      li.append(a); state.list.append(li);
    });
    const none = !state.shown.length;
    state.empty.hidden = !none; state.empty.textContent = none ? 'No page matches “' + query.trim().slice(0, 40) + '”.' : '';
    state.live.textContent = none ? 'No pages match' : state.shown.length + (state.shown.length === 1 ? ' page' : ' pages');
    const first = state.shown.findIndex(r => !isHere(r.item.href));
    setActive(none ? -1 : first >= 0 ? first : 0, true);
  }
  function setActive(i, scroll) {
    state.active = i;
    state.list.querySelectorAll('li').forEach(li => li.setAttribute('aria-selected', String(+li.dataset.i === i)));
    if (i >= 0) { state.input.setAttribute('aria-activedescendant', 'bs-qs-opt-' + i); const li = state.list.children[i]; if (li && scroll && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' }); }
    else state.input.removeAttribute('aria-activedescendant');
  }
  function go(newTab) {
    const chosen = state.shown[state.active]; if (!chosen) return;
    const href = chosen.item.href;
    if (newTab) { window.open(href, '_blank', 'noopener'); return; }
    close(); location.assign(href);
  }
  function onInputKey(e) {
    if (e.isComposing) return;
    const n = state.shown.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (n) setActive((state.active + 1) % n, true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) setActive((state.active - 1 + n) % n, true); }
    else if (e.key === 'Enter') { e.preventDefault(); go(e.ctrlKey || e.metaKey); }
  }
  function open() {
    const lib_ = lib(); if (!lib_ || !state.on) return;
    const items = lib_.build(collect(), location.href);
    if (!items.length) return;
    state.items = items;
    const dialog = ensureDialog();
    if (!dialog.open) { if (typeof dialog.showModal !== 'function') return; dialog.showModal(); }
    state.input.value = ''; render(''); state.input.focus();
  }
  function close() { if (state.dialog && state.dialog.open) state.dialog.close(); }

  // ---------- the header button and the keyboard ----------
  function onKey(e) {
    if (!state.on || e.defaultPrevented && !(state.dialog && state.dialog.open)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault(); e.stopPropagation();
      if (state.dialog && state.dialog.open) close(); else open();
    } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !(state.dialog && state.dialog.open) && !editable(e.target)) {
      e.preventDefault(); open();
    }
  }
  function ensureButton() {
    if (state.button && state.button.isConnected) return;
    const lms = document.querySelector('.main-header .navbar-custom-menu > ul.navbar-nav'), cms = document.querySelector('#header .navbar-header');
    if (!lms && !cms) return;
    const button = make('button', 'bs-qs-btn'); button.type = 'button'; button.setAttribute('aria-label', 'Search pages'); button.setAttribute('aria-haspopup', 'dialog'); button.title = 'Search pages (Ctrl+K)';
    button.append(icon(18)); button.addEventListener('click', open);
    if (lms) { const li = make('li', 'bs-qs-li'); li.append(button); lms.prepend(li); state.button = li; }
    else { const toggle = cms.querySelector('.navbar-toggle'); if (toggle) toggle.before(button); else cms.append(button); state.button = button; }
    owned.add(state.button);
  }
  function teardown() {
    close();
    if (state.listening) { document.removeEventListener('keydown', onKey, true); state.listening = false; }
    owned.forEach(node => node.remove()); owned.clear();
    Object.assign(state, { on: false, dialog: null, input: null, list: null, live: null, empty: null, button: null, items: [], shown: [], active: -1 });
  }

  // opts: { enabled (default true), preview }
  function mount(opts) {
    state.preview = !!(opts && opts.preview);
    const wanted = !(opts && opts.enabled === false) && topFrame() && document.body && document.querySelector(MENU) && lib();
    if (!wanted) { if (state.on) teardown(); return; }
    state.on = true;
    ensureButton();
    if (!state.listening) { document.addEventListener('keydown', onKey, true); state.listening = true; }
  }
  globalThis.BahriaQuickSearch = { mount, disable: teardown, open, close };
})();
