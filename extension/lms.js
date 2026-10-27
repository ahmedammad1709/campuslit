(function () {
  'use strict';
  // Structural helpers for the LMS redesign. Only adds presentation hooks (data attributes, a greeting,
  // course badges, a tap-to-read popover). Never reads form values, changes links or form actions,
  // sends anything anywhere, or stores page content. disable() restores every node it touched.
  const owned = new Set();
  const attrs = new Map();   // node -> Set(attribute names we added)
  const titles = new Map();  // node -> original title text
  let pop = null;
  let listening = false;
  let counter = 0;
  function mark(node, name, value = '') {
    if (!node || node.hasAttribute(name)) return;
    node.setAttribute(name, value);
    if (!attrs.has(node)) attrs.set(node, new Set());
    attrs.get(node).add(name);
  }
  function make(tag, cls, text) {
    const node = document.createElement(tag); node.className = cls;
    if (text) node.textContent = text;
    owned.add(node); return node;
  }
  function initials(text) {
    const words = text.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1 || /\d/.test(w));
    const letters = words.slice(0, 2).map(w => w[0]).join('');
    return (letters || text.slice(0, 2)).toUpperCase();
  }
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Late night';
  }
  function hidePop() { if (pop) { pop.remove(); owned.delete(pop); pop = null; } }
  function showPop(target) {
    hidePop();
    const text = target.getAttribute('data-bs-title');
    if (!text) return;
    pop = make('div', 'bs-pop', text); pop.setAttribute('role', 'tooltip'); pop.dataset.for = target.dataset.bsTipId;
    document.body.append(pop);
    const r = target.getBoundingClientRect(), w = pop.offsetWidth;
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
    pop.style.left = left + 'px'; pop.style.top = r.bottom + 10 + 'px';
    pop.style.setProperty('--arrow', Math.max(12, r.left + r.width / 2 - left - 5) + 'px');
  }
  function onClick(event) {
    const tip = event.target.closest && event.target.closest('[data-bs-tip]');
    if (tip) {
      event.preventDefault();
      if (pop && pop.dataset.for === tip.dataset.bsTipId) hidePop(); else showPop(tip);
    } else if (!(event.target.closest && event.target.closest('.bs-pop'))) hidePop();
  }
  function onKey(event) {
    if (event.key === 'Escape') hidePop();
    else if ((event.key === 'Enter' || event.key === ' ') && event.target.matches && event.target.matches('[data-bs-tip]')) onClick(event);
  }
  function dashboard() {
    const content = document.querySelector('.content-wrapper > section.content');
    if (!content) return;
    const rows = [...content.querySelectorAll('.table > tbody > tr')].filter(r => !r.querySelector('th') && r.querySelectorAll('td').length >= 4);
    rows.forEach(row => {
      if (row.querySelector('.bs-chip')) return;
      const cells = row.querySelectorAll('td');
      const title = (cells[1] ? cells[1].textContent : '').trim();
      row.setAttribute('data-kind', /\blab\b/i.test(title) ? 'Lab' : 'Theory');
      const chip = make('span', 'bs-chip', initials(title)); chip.setAttribute('aria-hidden', 'true');
      row.prepend(chip);
      attrs.set(row, new Set(['data-kind']));
    });
    if (content.querySelector('.bs-hero')) return;
    const nameNode = document.querySelector('.user-menu > a > span');
    const first = ((nameNode && nameNode.textContent) || '').trim().split(/\s+/)[0];
    const semCell = rows.length ? rows[0].querySelectorAll('td')[3] : null;
    const semester = semCell ? semCell.textContent.trim() : '';
    const hero = make('section', 'bs-hero');
    const text = make('div', '');
    const name = first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : '';
    text.append(make('h2', '', name ? greeting() + ', ' + name : greeting()),
      make('p', '', rows.length ? (semester || 'This semester') + ' · ' + rows.length + (rows.length === 1 ? ' course' : ' courses') : 'Your courses will appear here once they sync from CMS.'));
    const stats = make('div', 'bs-hero-stats');
    const stat = (value, label) => { const s = make('div', 'bs-stat'); s.append(make('b', '', String(value)), make('span', '', label)); return s; };
    const labs = rows.filter(r => r.getAttribute('data-kind') === 'Lab').length;
    stats.append(stat(rows.length - labs, 'Theory'), stat(labs, 'Labs'));
    hero.append(text, stats);
    content.prepend(hero);
  }
  // ---------- Assignments page: what is open, what is due next ----------
  // Reads only text the page already shows (titles, the two deadline labels, the portal's own "Deadline Exceeded" box, whether a
  // submission link exists). It never reads link addresses, file boxes or anything typed, makes no request and stores nothing.
  // The portal shows one course at a time, so this covers the course selected on the page.
  const DL = () => globalThis.BahriaDeadlines || null;
  let due = null;   // { sig, rows: [{ tr, chip, info }], card, nodes, trs, timer }
  const flat = node => { const copy = node.cloneNode(true); copy.querySelectorAll('.bs-due-chip').forEach(n => n.remove()); return copy.textContent.replace(/\s+/g, ' ').trim(); };
  function dueScan() {
    const content = document.querySelector('.content-wrapper section.content') || document;
    for (const table of content.querySelectorAll('table')) {
      const head = [...table.querySelectorAll('tr')].find(tr => tr.querySelector('th'));
      if (!head) continue;
      const names = [...head.querySelectorAll('th')].map(th => th.textContent.replace(/\s+/g, ' ').trim().toLowerCase());
      const at = test => names.findIndex(test);
      const iDeadline = at(n => n.includes('deadline')), iTitle = at(n => n.includes('title')), iSub = at(n => n.includes('added submission')), iAction = at(n => n === 'action');
      if (iDeadline < 0) continue;
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        if (tr.querySelector('th')) return;
        const cells = tr.querySelectorAll(':scope > td');
        if (cells.length <= iDeadline) return;
        const labels = [...cells[iDeadline].querySelectorAll('small, .label')];
        const texts = (labels.length ? labels : [cells[iDeadline]]).map(node => {
          const tip = (node.getAttribute('title') || node.getAttribute('data-bs-title') || '').trim().toLowerCase();   // the portal tags them "Extended" and "Actual"
          return { text: flat(node), extended: tip.startsWith('extend') || node.classList.contains('label-warning') };
        });
        const action = iAction >= 0 && cells[iAction] ? cells[iAction] : null;
        const subCell = iSub >= 0 && cells[iSub] ? cells[iSub] : null;
        const actionText = action ? flat(action) : '';
        const control = !!(action && action.querySelector('input:not([type="hidden"]), button, textarea, select'));
        const subText = subCell ? flat(subCell) : '';
        rows.push({
          tr, chipCell: iTitle >= 0 && cells[iTitle] ? cells[iTitle] : cells[iDeadline],   // the status sits beside the title: the deadline column is often off-screen to the right
          title: (iTitle >= 0 && cells[iTitle] ? flat(cells[iTitle]) : '').slice(0, 80),
          texts,
          portalClosed: /exceed|closed|expired|deadline (?:has )?passed/i.test(actionText) ? true : control ? false : null,
          control,
          submitted: !!(subCell && subCell.querySelector('a') && subText && !/no submission|not submitted|^[-\u2013\u2014. ]+$/i.test(subText))
        });
      });
      return { table, rows };
    }
    return null;
  }
  function dueClear() {
    if (due) { clearInterval(due.timer); due.nodes.forEach(n => { n.remove(); owned.delete(n); }); due.trs.forEach(tr => { tr.removeAttribute('data-bs-due'); attrs.delete(tr); }); }
    due = null;
  }
  // With no course chosen, list what is open in the courses you have already looked at, from the reminder note (if reminders are on).
  function dueOthers(card, D, now) {
    const list = rem.on && rem.data ? D.upcoming(rem.data, now).slice(0, 4) : [];
    const sub = card.querySelector('.bs-due-sub'), ul = card.querySelector('.bs-due-others');
    ul.textContent = ''; sub.textContent = list.length ? 'Not submitted yet, in courses you have opened' : ''; sub.hidden = !list.length;
    list.forEach(item => { const li = make('li', ''); li.append(make('b', '', item.title), ' \u00b7 ' + (item.course ? item.course + ' \u00b7 ' : '') + 'due in ' + D.duration(item.left)); ul.append(li); });
  }
  function dueRender() {
    const D = DL(); if (!D || !due) return;
    const now = Date.now();
    const classified = due.rows.map(r => D.classify(r.info, now));
    due.rows.forEach((r, i) => {
      const c = classified[i], text = D.describe(c);
      r.chip.textContent = text; r.chip.hidden = !text; r.chip.dataset.level = c.level;
      r.tr.setAttribute('data-bs-due', c.state);
    });
    due.classified = classified;
    const sum = D.summarize(classified), next = sum.nextIndex >= 0 ? due.rows[sum.nextIndex] : null;
    const card = due.card;
    card.dataset.level = next ? classified[sum.nextIndex].level : sum.open ? 'warn' : 'none';
    const main = card.querySelector('.bs-due-main'); main.textContent = '';
    if (due.noCourse) { dueOthers(card, D, now); main.textContent = 'Choose a course below to see what is due in it.'; card.dataset.level = 'none'; }
    else if (next) {
      const c = classified[sum.nextIndex];
      main.append('Next: ', make('b', '', next.info.title || 'Assignment'), ' ' + D.describe(c).toLowerCase());
      if (next.info.dateText) main.append(make('small', '', next.info.dateText));
    } else if (sum.open) main.textContent = 'Open, but the deadline could not be checked here. See the portal.';
    else if (sum.total) main.textContent = 'Nothing is open in this course right now.';
    else main.textContent = 'No assignments are listed for this course.';
    const counts = card.querySelector('.bs-due-counts'); counts.textContent = '';
    if (!due.noCourse) [[sum.open, 'open'], [sum.submitted, 'submitted'], [sum.closed, 'closed, not submitted']].forEach(([n, label]) => { if (!n) return; const li = make('li', ''); li.append(make('b', '', String(n)), ' ' + label); counts.append(li); });
  }
  function assignmentsPage() {
    const D = DL();
    if (!D || document.readyState === 'loading') return;      // wait for the whole table: a partial one would give a wrong "next"
    const found = dueScan();
    if (!found) { dueClear(); return; }
    const noCourse = !!document.querySelector('#courseId') && !chosen('#courseId');   // the portal says "Please select a course": there is nothing to count yet
    const sig = [noCourse, ...found.rows.map(r => [r.title, r.texts.map(t => t.text).join('~'), r.portalClosed, r.submitted, r.control].join('|'))].join('#');
    if (due && due.sig === sig && due.card.isConnected) return;
    dueClear();
    const card = make('section', 'bs-due'); card.setAttribute('role', 'region'); card.setAttribute('aria-label', 'Assignments at a glance');
    const head = make('div', 'bs-due-head'); head.append(make('h3', '', 'Due soon'), make('span', '', noCourse ? 'No course chosen' : 'This course only'));
    card.append(head, make('p', 'bs-due-main'), make('ul', 'bs-due-counts'), make('p', 'bs-due-sub'), make('ul', 'bs-due-others'), make('p', 'bs-due-hint', noCourse ? 'The portal shows one course at a time.' : 'This is the course selected below. Choose another course to see its assignments.'));
    const nodes = [card], trs = [];
    const rows = found.rows.map(r => {
      const eff = D.effectiveDeadline(r.texts);
      const chip = make('div', 'bs-due-chip'); chip.hidden = true; r.chipCell.append(chip); nodes.push(chip); trs.push(r.tr);
      const info = { deadlineMs: eff ? eff.ms : NaN, portalClosed: r.portalClosed, hasControl: r.control, submitted: r.submitted, title: r.title,
        dateText: eff ? ((r.texts.filter(t => D.parseDeadline(t.text) === eff.ms)[0] || {}).text || '') : '' };
      return { tr: r.tr, chip, info };
    });
    const anchor = found.table.closest('.box') || found.table.closest('.table-responsive') || found.table;
    anchor.parentNode.insertBefore(card, anchor);
    due = { sig, rows, card, nodes, trs, noCourse, timer: setInterval(() => { if (!document.hidden) dueRender(); }, 30000) };
    dueRender(); remSave(due.classified);
  }
  const SIDE_KEY = 'bahriaStudioSidebarWidth';
  const store = (globalThis.browser || globalThis.chrome || {}).storage;
  // ---------- Reminder: the next assignment you have not submitted, as a popup you can cross away ----------
  // The portal shows one course at a time, so to remind you on another page this keeps a short note on this device only:
  // course, assignment title and deadline of assignments that are open and not submitted. It is never sent anywhere.
  // The settings page can turn reminders off (which also forgets the note) or forget it on demand.
  const REM_KEY = 'bahriaStudioReminders';
  const rem = { on: true, preview: false, sample: null, data: null, loaded: false, node: null, shown: '', timer: null, listener: null, forgot: false };
  const remArea = () => (store && store.local ? store.local : null);
  const chosen = selector => {   // the course or semester the page itself has selected (as the server wrote it), as plain text
    const select = document.querySelector(selector); if (!select) return '';
    const option = select.querySelector('option[selected]') || (select.selectedOptions && select.selectedOptions[0]);
    return option && option.getAttribute('value') !== '' ? option.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  };
  // Change the note: read the latest copy, apply the change, write it back (so two open tabs cannot overwrite each other).
  function remWrite(change) {
    const D = DL(); if (!D) return;
    rem.data = change(rem.data); remRender();            // show the effect straight away
    const area = remArea(); if (!area || rem.preview) return;
    area.get(REM_KEY).then(d => { const next = change(d[REM_KEY]); return JSON.stringify(next) === JSON.stringify(D.sanitize(d[REM_KEY])) ? null : area.set({ [REM_KEY]: next }); })
      .catch(() => { /* the reminder simply will not be remembered */ });
  }
  function remSave(classified) {
    const D = DL(); if (!D || !rem.on || !due || !Array.isArray(classified)) return;
    const course = chosen('#courseId'), semester = chosen('#semesterId');
    if (!course) return;                                 // cannot tell which course this is: remember nothing rather than the wrong thing
    const items = due.rows.map((r, i) => ({ title: r.info.title, c: classified[i] })).filter(x => x.c && x.c.state === 'open').map(x => ({ title: x.title, due: x.c.ms }));
    remWrite(data => D.remember(data, { semester, course }, items, Date.now()));
  }
  function remHide() { if (rem.node) { rem.node.remove(); owned.delete(rem.node); } rem.node = null; rem.shown = ''; }
  function remRender() {
    const D = DL();
    if (due && due.noCourse && due.card.isConnected) dueRender();
    const live = D && rem.on && rem.data && document.documentElement.dataset.bsRoute !== 'assignments' && document.querySelector('.main-sidebar') && (rem.preview || window.top === window);
    const list = live ? D.upcoming(rem.data, Date.now()) : [];
    if (!list.length) { remHide(); return; }
    const top = list[0], sig = top.id + '#' + list.length;
    if (!rem.node || !rem.node.isConnected || rem.shown !== sig) {
      remHide();
      const node = make('aside', 'bs-remind'); node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); node.setAttribute('aria-label', 'Assignment reminder');
      const link = [...document.querySelectorAll('.sidebar-menu a')].find(a => /^\s*assignments\s*$/i.test(a.textContent));
      const go = make('a', 'bs-remind-go', 'Open Assignments'); go.setAttribute('href', (link && link.getAttribute('href')) || 'Assignments.php');
      const x = make('button', 'bs-remind-x', '\u00d7'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss reminder'); x.title = 'Dismiss for a few hours';
      x.addEventListener('click', () => remWrite(data => D.dismiss(data, top.id, Date.now())));
      const body = make('div', 'bs-remind-body');
      body.append(make('b', 'bs-remind-kicker', 'Not submitted yet'), make('p', 'bs-remind-title'), make('p', 'bs-remind-meta'), make('p', 'bs-remind-more'), make('small', 'bs-remind-note'), go);
      node.append(body, x); document.body.append(node); rem.node = node; rem.shown = sig;
    }
    const age = Date.now() - top.savedAt, set = (cls, text) => { const n = rem.node.querySelector('.' + cls); n.textContent = text; n.hidden = !text; };
    rem.node.dataset.level = top.left < 24 * 3600000 ? 'bad' : top.left < 72 * 3600000 ? 'warn' : 'info';
    set('bs-remind-title', top.title);
    set('bs-remind-meta', (top.course ? top.course + ' \u00b7 ' : '') + 'due in ' + D.duration(top.left));
    set('bs-remind-more', list.length > 1 ? '+' + (list.length - 1) + ' more open this week' : '');
    set('bs-remind-note', age > 3600000 ? 'Checked on the Assignments page ' + D.duration(age) + ' ago. Open it to refresh.' : '');
  }
  function remMount() {
    const area = remArea(), D = DL();
    if (!D) return;
    if (!rem.on) {                                       // switched off: forget what was remembered, once
      remHide();
      if (!rem.forgot && area && !rem.preview) { rem.forgot = true; area.get(REM_KEY).then(d => { if (d[REM_KEY] !== undefined) return area.remove(REM_KEY); }).catch(() => {}); }
      return;
    }
    rem.forgot = false;
    if (!rem.timer) rem.timer = setInterval(() => { if (!document.hidden) remRender(); }, 30000);
    if (!rem.loaded) {
      rem.loaded = true;
      if (rem.preview) rem.data = typeof rem.sample === 'function' ? rem.sample() : null;
      else if (area) {
        area.get(REM_KEY).then(d => { rem.data = D.sanitize(d[REM_KEY]); remRender(); }).catch(() => { rem.loaded = false; });
        if (!rem.listener && store.onChanged) { rem.listener = (changes, name) => { if (name === 'local' && changes[REM_KEY]) { rem.data = D.sanitize(changes[REM_KEY].newValue); remRender(); } }; store.onChanged.addListener(rem.listener); }
      }
    }
    remRender();
  }
  function remDisable() {
    remHide(); clearInterval(rem.timer); rem.timer = null;
    if (rem.listener && store && store.onChanged) store.onChanged.removeListener(rem.listener);
    rem.listener = null; rem.loaded = false; rem.data = null; rem.forgot = false;
  }

  let resizer = null;
  function setSide(px, save) {
    const w = Math.round(Math.min(420, Math.max(200, px)));
    document.documentElement.style.setProperty('--bs-side', w + 'px');
    if (resizer) resizer.setAttribute('aria-valuenow', String(w));
    if (save && store && store.local) { try { store.local.set({ [SIDE_KEY]: w }); } catch (e) { /* width just will not persist */ } }
    return w;
  }
  function currentSide() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bs-side'), 10) || 250; }
  function mountResizer() {
    const side = document.querySelector('.main-sidebar');
    if (!side || resizer) return;
    resizer = make('div', 'bs-resizer');
    resizer.setAttribute('role', 'separator'); resizer.setAttribute('aria-orientation', 'vertical'); resizer.setAttribute('aria-label', 'Resize sidebar (double-click to reset)');
    resizer.setAttribute('aria-valuemin', '200'); resizer.setAttribute('aria-valuemax', '420'); resizer.tabIndex = 0;
    side.append(resizer);
    resizer.addEventListener('pointerdown', e => {
      e.preventDefault(); resizer.setPointerCapture(e.pointerId); resizer.classList.add('dragging'); document.documentElement.classList.add('bs-dragging');
      const move = ev => setSide(ev.clientX, false);
      const up = () => { resizer.removeEventListener('pointermove', move); resizer.removeEventListener('pointerup', up); resizer.classList.remove('dragging'); document.documentElement.classList.remove('bs-dragging'); setSide(currentSide(), true); };
      resizer.addEventListener('pointermove', move); resizer.addEventListener('pointerup', up);
    });
    resizer.addEventListener('dblclick', () => { document.documentElement.style.removeProperty('--bs-side'); if (store && store.local) store.local.remove(SIDE_KEY); });
    resizer.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); setSide(currentSide() + (e.key === 'ArrowRight' ? 16 : -16), true);
    });
    if (store && store.local) store.local.get(SIDE_KEY).then(d => { if (Number.isFinite(d[SIDE_KEY])) setSide(d[SIDE_KEY], false); }).catch(() => {});
  }
  function mount(settings, env) {
    const root = document.documentElement;
    if (!document.body) return;
    if (settings && typeof settings.reminders === 'boolean') rem.on = settings.reminders;
    if (env && env.preview) { rem.preview = true; rem.sample = env.sample; }
    const route = (location.pathname.split('/').pop() || 'index').replace(/\.(php|html)$/i, '').toLowerCase();
    if (root.dataset.bsRoute !== route) root.dataset.bsRoute = route;
    // The portal hard-codes Dashboard as the active item on every page; mark the real current page instead.
    const items = [...document.querySelectorAll('.sidebar-menu > li')];
    const current = items.find(li => { const a = li.querySelector(':scope > a'); const href = a ? (a.getAttribute('href') || '') : ''; return href.split('?')[0].split('/').pop().replace(/\.(php|html)$/i, '').toLowerCase() === route; });
    if (current) {
      items.forEach(li => { if (li !== current && li.classList.contains('active')) mark(li, 'data-bs-demote'); });
      mark(current, 'data-bs-current'); const link = current.querySelector(':scope > a'); if (link) mark(link, 'aria-current', 'page');
    }
    // A bell badge that carries no number is only visual noise.
    document.querySelectorAll('.notifications-menu > a > .label').forEach(l => { if (!l.textContent.trim()) mark(l, 'data-bs-empty'); });
    // Hover-only comments become tap and keyboard friendly.
    document.querySelectorAll('.label[title]').forEach(label => {
      const text = label.getAttribute('title').trim();
      if (!text || titles.has(label)) return;
      titles.set(label, text); label.removeAttribute('title');
      label.setAttribute('data-bs-title', text); label.setAttribute('data-bs-tip', ''); label.dataset.bsTipId = String(++counter);
      label.tabIndex = 0; label.setAttribute('role', 'button'); label.setAttribute('aria-label', label.textContent.trim() + ': ' + text);
      attrs.set(label, new Set(['data-bs-title', 'data-bs-tip', 'data-bs-tip-id', 'tabindex', 'role', 'aria-label']));
    });
    if (!listening) { listening = true; document.addEventListener('click', onClick); document.addEventListener('keydown', onKey); addEventListener('scroll', hidePop, true); }
    mountResizer();
    if (route === 'dashboard') dashboard();
    if (route === 'assignments') { try { assignmentsPage(); } catch (e) { /* the original table stays as it was */ } }
    try { remMount(); } catch (e) { /* no reminder, nothing else affected */ }
  }
  function disable() {
    hidePop(); dueClear(); remDisable();
    if (listening) { listening = false; document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); removeEventListener('scroll', hidePop, true); }
    owned.forEach(node => node.remove()); owned.clear();
    titles.forEach((text, node) => node.setAttribute('title', text)); titles.clear();
    attrs.forEach((names, node) => names.forEach(name => node.removeAttribute(name))); attrs.clear();
    resizer = null; document.documentElement.style.removeProperty('--bs-side');
    delete document.documentElement.dataset.bsRoute;
  }
  globalThis.BahriaLms = { mount, disable };
})();
