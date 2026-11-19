// "Marks overview" on the LMS Quizzes page: one popup with the quiz and assignment marks of every course in the semester on screen.
// Pressing the button reads the Quizzes and Assignments page of each course (the same pages the student could open, with their own sign-in, one course at a time,
// gently spaced) and shows the marks the portal gives. Nothing is requested until the button is pressed, nothing is stored, and nothing leaves the browser.
// The portal shows the marks obtained but not the marks they are out of, so no percentages are made up: the popup shows the numbers, their total and their average.
(function () {
  'use strict';
  const N = globalThis.BahriaNotify;
  if (!N) return;
  const LIMITS = { courses: 20, html: 3000000, gap: 220, timeout: 25000 };
  const TOKEN = /^[A-Za-z0-9_.=%-]{8,800}$/;            // the portal's semester and course values: long url-safe codes
  const PAGES = { quiz: 'Quizzes.php', assignment: 'Assignments.php' };

  // ---------------------------------------------------------------- the pure part (tested on its own)
  // The only addresses that may ever be fetched: the LMS's own Quizzes and Assignments pages, on the page's own site, with only the two values the portal itself uses.
  function pageUrl(kind, semester, course, base) {
    try {
      const page = PAGES[kind]; if (!page || typeof semester !== 'string' || typeof course !== 'string' || !TOKEN.test(semester) || !TOKEN.test(course)) return null;
      const here = new URL(base), url = new URL('/Student/' + page, here);
      if (url.origin !== here.origin || url.hostname !== 'lms.bahria.edu.pk' || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
      return url.origin + url.pathname + '?s=' + semester + '&oc=' + course;
    } catch (e) { return null; }
  }
  const fmt = n => { if (!Number.isFinite(n)) return ''; const r = Math.round(n * 100) / 100; return String(r); };
  // rows: [{ title, marks (a number, or null when not marked yet) }]  ->  { count, marked, total, average }
  function stats(rows) {
    const list = Array.isArray(rows) ? rows : [], marked = list.filter(r => r && Number.isFinite(r.marks));
    const total = marked.reduce((a, r) => a + r.marks, 0);
    return { count: list.length, marked: marked.length, total, average: marked.length ? total / marked.length : null };
  }
  // courses: [{ name, quizzes: rows | null, assignments: rows | null, error }]  ->  the numbers for the top of the popup
  function summarize(courses) {
    const list = Array.isArray(courses) ? courses : [], q = list.flatMap(c => (c && c.quizzes) || []), a = list.flatMap(c => (c && c.assignments) || []);
    return { courses: list.length, readable: list.filter(c => c && !c.error).length, failed: list.filter(c => c && c.error).length, quizzes: stats(q), assignments: stats(a),
      withMarks: list.filter(c => c && !c.error && (stats(c.quizzes).marked || stats(c.assignments).marked)).length };
  }

  // ---------------------------------------------------------------- everything below needs the page
  if (typeof document === 'undefined') { globalThis.BahriaMarks = { pageUrl, stats, summarize, fmt, LIMITS }; return; }
  const owned = new Set();
  let overlay = null, run = 0, abort = null, opener = null, keyHandler = null, bar = null;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();

  // The course list of the page itself: its semester and the courses in the drop-down.
  function readChoices() {
    const sem = document.getElementById('semesterId'), course = document.getElementById('courseId');
    if (!sem || !course) return null;
    const picked = sem.querySelector('option[selected]') || (sem.selectedOptions && sem.selectedOptions[0]);
    const semester = picked ? picked.getAttribute('value') : '';
    const courses = [...course.querySelectorAll('option')].filter(o => o.getAttribute('value')).slice(0, LIMITS.courses).map(o => ({ value: o.getAttribute('value'), name: clean(o.textContent).slice(0, 70) }));
    if (!semester || !courses.length) return null;
    return { semester, semesterName: clean(picked.textContent).slice(0, 40), courses };
  }

  async function getPage(kind, semester, course, external) {
    const safe = pageUrl(kind, semester, course, location.href);
    if (!safe) throw new Error('This page could not be opened.');
    const ctl = new AbortController(), stop = () => ctl.abort();
    external.addEventListener('abort', stop);
    const timer = setTimeout(() => ctl.abort(), LIMITS.timeout);
    try {
      const res = await fetch(safe, { credentials: 'same-origin', cache: 'no-store', signal: ctl.signal });
      if (!res.ok) throw new Error('The portal answered ' + res.status + '.');
      const text = (await res.text()).slice(0, LIMITS.html);
      if (!N.signedIn('lms', text, res.url)) throw Object.assign(new Error('Your sign-in on the portal seems to have ended.'), { session: true });
      return text;
    } catch (e) {
      if (external.aborted) throw Object.assign(new Error('Stopped.'), { stopped: true });
      if (e && e.name === 'AbortError') throw new Error('The portal took too long to answer.');
      if (e && e.name === 'TypeError') throw new Error('The connection to the portal failed.');
      throw e;
    } finally { clearTimeout(timer); external.removeEventListener('abort', stop); }
  }
  async function readCourse(choices, course, external) {
    const out = { name: course.name, quizzes: [], assignments: [], error: '' };
    try {
      const [quizHtml, workHtml] = await Promise.all([getPage('quiz', choices.semester, course.value, external), getPage('assignment', choices.semester, course.value, external)]);
      out.quizzes = (N.parseQuizzes(quizHtml) || []).map(r => ({ title: r.title || ('Quiz ' + r.no), marks: r.marks }));
      out.assignments = (N.parseAssignments(workHtml) || []).map(r => ({ title: r.title || 'Assignment', marks: r.marks }));
    } catch (e) { if (e && (e.stopped || e.session)) throw e; out.error = (e && e.message) || 'This course could not be read.'; }
    return out;
  }

  // ---------------------------------------------------------------- the popup (it shares the file preview's look)
  const R = 32, C = 2 * Math.PI * R;
  function ring() {
    const ns = 'http://www.w3.org/2000/svg', wrap = el('span', 'bs-pv-ring'), svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('aria-hidden', 'true');
    const mk = cls => { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '40'); c.setAttribute('cy', '40'); c.setAttribute('r', String(R)); c.setAttribute('fill', 'none'); c.setAttribute('class', cls); return c; };
    const arc = mk('bs-pv-arc'); arc.setAttribute('stroke-dasharray', String(C)); arc.setAttribute('stroke-dashoffset', String(C));
    svg.append(mk('bs-pv-track'), arc);
    const pct = el('span', 'bs-pv-pct', '0%'); wrap.append(svg, pct);
    return { node: wrap, set(f) { const p = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0)); arc.setAttribute('stroke-dashoffset', String(C * (1 - p))); pct.textContent = Math.round(p * 100) + '%'; } };
  }
  function closeDialog() {
    run++;
    if (abort) { try { abort.abort(); } catch (e) { /* done */ } abort = null; }
    if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    document.documentElement.classList.remove('bs-pv-open');
    if (opener && opener.isConnected) { try { opener.focus(); } catch (e) { /* gone */ } }
    opener = null;
  }
  function dialog(semesterName, count) {
    const box = el('div', 'bs-pv'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Marks overview');
    const card = el('div', 'bs-pv-card bs-mk-card'), top = el('div', 'bs-pv-bar'), head = el('div', 'bs-pv-head');
    const badge = el('span', 'bs-pv-badge k-marks', 'A+'); badge.setAttribute('aria-hidden', 'true');
    const lines = el('div', 'bs-pv-lines'); lines.append(el('b', 'bs-pv-title', 'Marks overview'), el('span', 'bs-pv-meta', (semesterName ? semesterName + ' - ' : '') + count + (count === 1 ? ' course' : ' courses')));
    head.append(badge, lines);
    const actions = el('div', 'bs-pv-actions'); top.append(head, actions);
    const body = el('div', 'bs-pv-body bs-mk-body'); card.append(top, body); box.append(card);
    const view = { box, body, actions, onClose: null };
    box.addEventListener('mousedown', e => { if (e.target === box && view.onClose) view.onClose(); });
    keyHandler = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (view.onClose) view.onClose(); return; }
      if (e.key !== 'Tab' || !overlay) return;
      const loop = [...overlay.querySelectorAll('button.bs-pv-act, button.bs-pv-x')]; if (!loop.length) return;
      const first = loop[0], last = loop[loop.length - 1];
      if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyHandler, true);
    overlay = box; document.body.append(box); document.documentElement.classList.add('bs-pv-open');
    return view;
  }
  const button = (view, label, cls, handler) => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', handler); view.actions.append(b); return b; };

  // The results: a switch between Quizzes and Assignments, and one table for the one that is chosen. A course is one block of rows (its name once, then one row per
  // quiz or assignment with its marks, or "Not marked"). Marks are shown as the portal gives them: no totals, averages or percentages, because the portal
  // does not say what they are out of.
  const KINDS = [['quiz', 'Quizzes', 'quizzes'], ['assignment', 'Assignments', 'assignments']];
  function marksCell(row) {
    const td = el('td', 'bs-mk-marks'), has = Number.isFinite(row.marks);
    td.dataset.marked = String(has); td.append(has ? el('b', '', fmt(row.marks)) : el('span', '', 'Not marked'));
    return td;
  }
  function fillTable(table, kind, courses) {
    const label = kind === 'quiz' ? 'Quiz' : 'Assignment', plural = kind === 'quiz' ? 'quizzes' : 'assignments';
    table.replaceChildren();
    const head = el('thead'), hr = el('tr');
    hr.append(el('th', '', 'Course'), el('th', '', label), el('th', 'bs-mk-marks-head', 'Marks')); head.append(hr); table.append(head);
    courses.forEach(c => {
      const body = el('tbody', 'bs-mk-block'); body.dataset.state = c.error ? 'error' : 'ok';
      const rows = c.error ? [] : (kind === 'quiz' ? c.quizzes : c.assignments);
      const first = el('tr'), name = el('th', 'bs-mk-course', c.name); name.scope = 'rowgroup'; name.rowSpan = Math.max(1, rows.length);
      first.append(name);
      if (c.error) { const td = el('td', 'bs-mk-error', 'Could not be read: ' + c.error); td.colSpan = 2; first.append(td); body.append(first); }
      else if (!rows.length) { const td = el('td', 'bs-mk-none', 'No ' + plural + ' posted yet'); td.colSpan = 2; first.append(td); body.append(first); }
      else rows.forEach((row, i) => { const tr = i ? el('tr') : first; tr.append(el('td', 'bs-mk-title', row.title), marksCell(row)); body.append(tr); });
      table.append(body);
    });
  }
  function render(view, choices, courses, again) {
    const sum = summarize(courses);
    view.body.replaceChildren(); view.actions.replaceChildren();
    let kind = 'quiz';
    const tabs = el('div', 'bs-mk-switch'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Choose what to show');
    const wrap = el('div', 'bs-mk-tablewrap'), table = el('table', 'bs-mk-table'); wrap.append(table);
    const buttons = KINDS.map(([id, name, key]) => {
      const s = sum[key], b = el('button', 'bs-mk-tab'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.kind = id;
      b.append(el('b', '', name), el('span', '', s.count ? s.marked + ' of ' + s.count + ' marked' : 'None posted'));
      return b;
    });
    const select = (id, focus) => {
      kind = id; buttons.forEach(b => { const on = b.dataset.kind === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      fillTable(table, id, courses); wrap.scrollTop = 0; if (focus) buttons.find(b => b.dataset.kind === id).focus();
    };
    buttons.forEach(b => { b.addEventListener('click', () => select(b.dataset.kind, false)); tabs.append(b); });
    tabs.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault(); const at = KINDS.findIndex(k => k[0] === kind), next = e.key === 'Home' ? 0 : e.key === 'End' ? KINDS.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + KINDS.length) % KINDS.length;
      select(KINDS[next][0], true);
    });
    const intro = el('div', 'bs-mk-intro'); intro.append(el('span', '', sum.courses + (sum.courses === 1 ? ' course' : ' courses') + (choices.semesterName ? ' in ' + choices.semesterName : '')), tabs);
    view.body.append(intro, wrap, el('p', 'bs-pv-note', 'Marks are shown as the portal gives them: the marks you obtained, not what they are out of. Pages are read once, when you open this window.'));
    select('quiz', false);
    view.onClose = closeDialog;
    if (sum.failed) button(view, 'Try the failed ones again', 'bs-pv-act', () => again());
    button(view, 'Close', 'bs-pv-x', closeDialog).focus();
  }

  async function start(from) {
    const choices = readChoices(); if (!choices) return;
    closeDialog(); opener = from;
    const mine = run, view = dialog(choices.semesterName, choices.courses.length);
    abort = new AbortController(); const external = abort.signal;
    const progress = ring(), label = el('span', 'bs-pv-label', 'Starting...'), sub = el('span', 'bs-bulk-file', ''), msg = el('div', 'bs-pv-msg bs-mk-loading');
    msg.setAttribute('role', 'status'); msg.append(progress.node, label, sub); view.body.append(msg);
    let stopped = false; view.onClose = () => { stopped = true; if (abort) abort.abort(); closeDialog(); };
    button(view, 'Cancel', 'bs-pv-x', () => view.onClose()).focus();

    const courses = [], n = choices.courses.length;
    const failure = text => {
      view.body.replaceChildren(); view.actions.replaceChildren(); view.onClose = closeDialog;
      const m = el('div', 'bs-pv-msg'), bad = el('span', 'bs-pv-bad', '!'); bad.setAttribute('aria-hidden', 'true'); m.append(bad, el('p', '', text)); view.body.append(m);
      button(view, 'Close', 'bs-pv-x', closeDialog).focus();
    };
    const readAll = async (indexes) => {
      for (let k = 0; k < indexes.length; k++) {
        if (mine !== run || stopped) return false;
        const i = indexes[k], course = choices.courses[i];
        label.textContent = 'Reading ' + (k + 1) + ' of ' + indexes.length; sub.textContent = course.name; progress.set(k / indexes.length);
        courses[i] = await readCourse(choices, course, external);
        if (k + 1 < indexes.length) await sleep(LIMITS.gap);
      }
      progress.set(1);
      return true;
    };
    try {
      if (!(await readAll(choices.courses.map((c, i) => i)))) return;
      if (mine !== run) return;
      const again = async () => {
        const failed = courses.map((c, i) => (c && c.error ? i : -1)).filter(i => i >= 0);
        view.actions.replaceChildren(); view.body.replaceChildren(); view.body.append(msg); view.onClose = () => { stopped = true; if (abort) abort.abort(); closeDialog(); }; button(view, 'Cancel', 'bs-pv-x', () => view.onClose());
        try { if (await readAll(failed)) render(view, choices, courses, again); } catch (e) { if (!(e && e.stopped)) failure((e && e.message) || 'Something went wrong.'); }
      };
      render(view, choices, courses, again);
    } catch (e) {
      if (mine !== run || (e && e.stopped)) return;
      failure(e && e.session ? 'Your sign-in on the portal seems to have ended. Sign in again, then try again.' : (e && e.message) || 'Something went wrong.');
    }
  }

  // ---------------------------------------------------------------- the button on the page
  function mount() {
    if (window !== window.top || location.hostname !== 'lms.bahria.edu.pk' || !document.body || !/\/quizzes\.php$/i.test(location.pathname)) return;
    const choices = readChoices();
    if (!choices) { unmountBar(); return; }
    const signature = choices.semester.slice(-20) + '|' + choices.courses.length;
    if (bar && bar.isConnected && bar.dataset.sig === signature) return;
    unmountBar();
    bar = el('section', 'bs-bulk bs-mk-bar'); bar.dataset.sig = signature; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Marks overview');
    const text = el('div', 'bs-bulk-text');
    text.append(el('b', '', 'Marks overview'), el('span', '', 'Your quiz and assignment marks for all ' + choices.courses.length + (choices.courses.length === 1 ? ' course' : ' courses') + ' in ' + (choices.semesterName || 'this semester') + ', in one place.'));
    const go = el('button', 'bs-bulk-go', 'Open marks overview'); go.type = 'button';
    go.addEventListener('click', () => { if (!overlay) start(go); });
    bar.append(text, go); owned.add(bar);
    const select = document.getElementById('courseId'), anchor = (select && (select.closest('.box') || select.closest('.panel'))) || (select && select.closest('form')) || null;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor); else { unmountBar(); }
  }
  function unmountBar() { if (bar) { bar.remove(); owned.delete(bar); bar = null; } }
  function disable() { closeDialog(); unmountBar(); }
  globalThis.BahriaMarks = { mount, disable, pageUrl, stats, summarize, fmt, LIMITS };
})();
