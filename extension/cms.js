(function () {
  'use strict';
  // Structural helpers for the CMS redesign. Adds presentation hooks only: marks the current sidebar item,
  // gives alerts a screen-reader role, adds a drag handle to resize the sidebar, and re-draws the dashboard's
  // attendance chart as readable per-course rows using the numbers the page already contains.
  // Never reads form values, changes links or form actions, sends anything anywhere, or stores page content.
  // disable() restores every node and attribute it touched.
  const owned = new Set();
  const attrs = new Map();
  const SIDE_KEY = 'bahriaStudioSidebarWidth';
  const store = (globalThis.browser || globalThis.chrome || {}).storage;
  let resizer = null;
  let attLevels = { ok: 85, warn: 75 };
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
  function setSide(px, save) {
    const w = Math.round(Math.min(420, Math.max(200, px)));
    document.documentElement.style.setProperty('--bs-side', w + 'px');
    if (resizer) resizer.setAttribute('aria-valuenow', String(w));
    if (save && store && store.local) { try { store.local.set({ [SIDE_KEY]: w }); } catch (e) { /* width just will not persist */ } }
    return w;
  }
  function currentSide() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bs-side'), 10) || 260; }
  function mountResizer() {
    const side = document.querySelector('body > form > div#pageContainer > aside#sideBar');
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
  function markCurrent() {
    const here = location.pathname.toLowerCase().replace(/\/$/, '');
    document.querySelectorAll('aside#sideBar a.list-group-item[href]').forEach(a => {
      let path = '';
      try { path = new URL(a.href, location.href).pathname.toLowerCase().replace(/\/$/, ''); } catch (e) { return; }
      if (path && path === here && !a.getAttribute('href').startsWith('#')) mark(a, 'data-bs-current');
    });
  }
  function attendance() {
    const body = document.querySelector('.attendance-container .attendance-body');
    if (!body || body.querySelector('.bs-att')) return;
    let data = null;
    for (const script of document.querySelectorAll('script:not([src])')) {
      const text = script.textContent;
      const at = text.indexOf('renderAttendanceSummaryChart([');
      if (at < 0) continue;
      const match = /renderAttendanceSummaryChart\((\[[\s\S]*?\])\s*\)\s*;/.exec(text.slice(at));
      if (!match) continue;
      try { data = JSON.parse(match[1]); } catch (e) { data = null; }
      if (data) break;
    }
    if (!Array.isArray(data) || !data.length) return;   // leave the original chart in place
    const list = make('div', 'bs-att');
    const legend = make('div', 'bs-att-legend');
    [['var(--bs-ok)', attLevels.ok + '% and above'], [ 'var(--bs-warn)', attLevels.warn + '–' + (attLevels.ok - 1) + '%'], ['var(--bs-bad)', 'Below ' + attLevels.warn + '%']].forEach(([c, t]) => { const s = make('span', '', t); s.style.setProperty('--c', c); legend.append(s); });
    list.append(legend);
    data.forEach(course => {
      const pct = Math.max(0, Math.min(100, parseFloat(course.percentage)));
      if (!Number.isFinite(pct)) return;
      const row = make('div', 'bs-att-row'); row.dataset.level = pct >= attLevels.ok ? 'ok' : pct >= attLevels.warn ? 'warn' : 'bad';
      const label = make('div', ''); label.append(make('b', '', String(course.code || '')));
      const detail = [course.title, Number.isFinite(course.present) && Number.isFinite(course.total) ? course.present + ' of ' + course.total + ' hrs' : ''].filter(Boolean).join(' · ');
      label.append(make('small', '', detail));
      const value = make('span', 'bs-att-pct', (Number.isInteger(pct) ? pct : pct.toFixed(1)) + '%');
      const bar = make('div', 'bs-att-bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuenow', String(pct)); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-label', String(course.code || 'Course') + ' attendance');
      const fill = make('i', ''); fill.style.setProperty('--w', pct + '%'); bar.append(fill);
      row.append(label, value, bar); list.append(row);
    });
    body.append(list);
    mark(document.documentElement, 'data-bs-att');
  }
  // The university's own emblem is referenced from the page (its apple-touch-icon); nothing is bundled or fetched by us.
  function emblemUrl() {
    const link = document.querySelector('link[rel="apple-touch-icon"][sizes="180x180"]') || document.querySelector('link[rel="apple-touch-icon"]');
    return link ? link.href : '';
  }
  function emblem() {
    const header = document.querySelector('#header .navbar-header');
    const url = emblemUrl();
    if (!header || !url || header.querySelector('.bs-emblem')) return;
    const img = make('img', 'bs-emblem'); img.src = url; img.alt = ''; img.width = 36; img.height = 36; img.setAttribute('aria-hidden', 'true');
    const toggle = header.querySelector('#aSideBar');
    if (toggle) toggle.after(img); else header.prepend(img);
  }
  const SVG = 'http://www.w3.org/2000/svg';
  const ICONS = {
    candidate: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 12v6 M9 15h6',
    student: 'M22 10 12 5 2 10l10 5 10-5z M6 12v5c3 2 9 2 12 0v-5',
    faculty: 'M3 4h18v12H3z M12 16v4 M8 20h8 M7 8h6 M7 12h9',
    alumni: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    staff: 'M3 7h18v13H3z M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M3 13h18',
    executive: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z'
  };
  const BLURBS = {
    candidate: 'Apply for admission online',
    student: 'Courses, attendance, results and fees',
    faculty: 'Classes, attendance and grading',
    alumni: 'Stay connected with the university',
    staff: 'Administrative tools',
    executive: 'Management and oversight'
  };
  function landing() {
    const grid = document.querySelector('.overlay > .portal-container');
    if (!grid) return;
    if (!document.querySelector('.bs-landing-hero')) {
      const hero = make('div', 'bs-landing-hero');
      hero.append(make('h1', '', 'Campus Management System'), make('p', '', 'Choose your portal to sign in to Bahria University.'));
      grid.before(hero);
    }
    grid.querySelectorAll('.portal-card').forEach(card => {
      if (card.querySelector('.bs-card-icon')) return;
      const kind = Object.keys(ICONS).find(k => card.classList.contains(k));
      if (!kind) return;
      const tile = make('span', 'bs-card-icon'); tile.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '26'); svg.setAttribute('height', '26');
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      ICONS[kind].split(' M').forEach((d, i) => { const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', (i ? 'M' : '') + d); svg.append(path); });
      tile.append(svg); card.prepend(tile);
      const heading = card.querySelector('.portal-content h2');
      if (heading) heading.after(make('p', 'bs-card-blurb', BLURBS[kind]));
    });
  }
  // ---------- Time table: week calendar + day list, drawn from the schedule the page already holds ----------
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const VIEW_KEY = 'bahriaStudioTimetableView';
  function clock(min) {
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function short(min) { const h = Math.floor(min / 60) % 24, m = min % 60; return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? 'p' : 'a'); }
  function span(a, b) { return short(a) + '–' + short(b); }
  function hourLabel(min) { const h = Math.floor(min / 60) % 24; return (h % 12 || 12) + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function readSchedule() {
    const input = document.getElementById('BodyPH_hfCalendarJson');
    if (!input || !input.value) return null;
    let data;
    try { data = JSON.parse(input.value); } catch (e) { return null; }
    const step = 1440 / ((data.timeSlots || '').length || 96);
    const events = (Array.isArray(data.eventsData) ? data.eventsData : []).map(ev => {
      const slots = String(ev.timeSlot || '');
      const first = slots.indexOf('1'), last = slots.lastIndexOf('1');
      if (first < 0) return null;
      const d = ev.data || {};
      return { day: Number(ev.weekDay), start: Math.round(first * step), end: Math.round((last + 1) * step), title: d.courseTitle || d.shortCourseTitle || '', short: d.shortCourseTitle || d.courseTitle || '', room: d.roomName || '', building: d.buildingAlias || d.buildingName || '', teacher: d.facultyMemberName || '', teacherShort: d.shortFacultyMemberName || d.facultyMemberName || '', klass: d.className || '', lab: /\blab\b/i.test(d.courseTitle || '') };
    }).filter(e => e && Number.isInteger(e.day) && e.day >= 0 && e.day <= 6);
    if (!events.length) return null;
    return { semester: data.semester || '', step, events };
  }
  function nextClass(events) {
    const now = new Date(), today = now.getDay(), minutes = now.getHours() * 60 + now.getMinutes();
    let best = null;
    events.forEach(e => {
      let offset = (e.day - today + 7) % 7;
      if (offset === 0 && e.end <= minutes) offset = 7;
      const key = offset * 1440 + e.start;
      if (!best || key < best.key) best = { key, e, offset, live: offset === 0 && e.start <= minutes };
    });
    return best;
  }
  function timetable() {
    const host = document.getElementById('BodyPH_updatePanelCalendar');
    if (!host || host.querySelector('.bs-tt')) return;
    const schedule = readSchedule();
    if (!schedule) return;   // leave the original grid in place
    const { events, step } = schedule;
    const used = DAY_ORDER.filter(d => events.some(e => e.day === d) || (d >= 1 && d <= 5));
    const from = Math.floor(Math.min(...events.map(e => e.start)) / 60) * 60;
    const to = Math.ceil(Math.max(...events.map(e => e.end)) / 60) * 60;
    const rows = (to - from) / step;
    const todayIndex = used.indexOf(new Date().getDay());
    const wrap = make('section', 'bs-tt');
    const initial = 'list';
    wrap.dataset.view = initial;

    // toolbar
    const bar = make('div', 'bs-tt-bar');
    const meta = make('div', 'bs-tt-meta');
    const hours = events.reduce((sum, e) => sum + (e.end - e.start), 0) / 60;
    meta.append(make('b', '', schedule.semester || 'This semester'), make('span', '', events.length + ' classes · ' + (Number.isInteger(hours) ? hours : hours.toFixed(1)) + ' hrs a week'));
    const seg = make('div', 'bs-tt-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Time table view');
    const buttons = {};
    [['week', 'Week'], ['list', 'List']].forEach(([id, label]) => {
      const b = make('button', 'bs-tt-segbtn', label); b.type = 'button'; b.setAttribute('aria-pressed', String(id === initial)); buttons[id] = b;
      b.addEventListener('click', () => { wrap.dataset.view = id; Object.entries(buttons).forEach(([k, n]) => n.setAttribute('aria-pressed', String(k === id))); if (store && store.local) { try { store.local.set({ [VIEW_KEY]: id }); } catch (err) { /* view just will not persist */ } } });
      seg.append(b);
    });
    bar.append(meta, seg);

    // next class
    const next = nextClass(events);
    let nextCard = null;
    if (next) {
      nextCard = make('div', 'bs-tt-next');
      const label = next.live ? 'In class now' : next.offset === 0 ? 'Next class today' : next.offset === 1 ? 'Next class tomorrow' : 'Next class ' + DAYS[next.e.day];
      const text = make('div', '');
      text.append(make('small', '', label), make('b', '', next.e.title), make('span', '', [clock(next.e.start) + ' – ' + clock(next.e.end), next.e.room, next.e.teacher].filter(Boolean).join(' · ')));
      nextCard.append(make('i', 'bs-tt-pulse'), text);
      if (next.live) nextCard.dataset.live = 'true';
    }

    // week grid: days are rows, time runs left to right, so the whole week fits on one page
    const week = make('div', 'bs-tt-week');
    const cols = (to - from) / step;
    const grid = make('div', 'bs-tt-grid'); grid.style.setProperty('--cols', String(cols)); grid.style.setProperty('--days', String(used.length));
    grid.append(make('div', 'bs-tt-corner'));
    for (let m = from; m < to; m += 60) {
      const start = (m - from) / step + 2;
      const label = make('div', 'bs-tt-hour', hourLabel(m)); label.style.gridColumn = start + ' / span ' + (60 / step);
      const line = make('div', 'bs-tt-line'); line.style.gridColumn = String(start);
      grid.append(label, line);
    }
    used.forEach((d, i) => {
      const strip = make('div', 'bs-tt-col'); strip.style.gridRow = String(i + 2); if (i === todayIndex) strip.dataset.today = 'true'; grid.append(strip);
      const head = make('div', 'bs-tt-dayhead'); head.style.gridRow = String(i + 2);
      head.append(make('b', '', DAYS[d].slice(0, 3)));
      if (i === todayIndex) head.dataset.today = 'true';
      grid.append(head);
    });
    events.forEach(e => {
      const row = used.indexOf(e.day); if (row < 0) return;
      const block = make('div', 'bs-tt-ev'); block.dataset.kind = e.lab ? 'Lab' : 'Theory';
      block.style.gridRow = String(row + 2); block.style.gridColumn = ((e.start - from) / step + 2) + ' / ' + ((e.end - from) / step + 2);
      block.title = [e.title, e.teacher, e.klass, e.room + (e.building ? ', ' + e.building : ''), clock(e.start) + ' – ' + clock(e.end)].filter(Boolean).join('\n');
      block.append(make('b', '', e.short), make('span', '', e.room), make('small', '', span(e.start, e.end)), make('em', '', e.teacherShort));
      grid.append(block);
    });
    week.append(grid);

    // list view
    const list = make('div', 'bs-tt-list');
    used.forEach((d, i) => {
      const dayEvents = events.filter(e => e.day === d).sort((a, b) => a.start - b.start);
      const section = make('section', 'bs-tt-day'); if (i === todayIndex) section.dataset.today = 'true';
      const head = make('h3', ''); head.append(make('span', '', DAYS[d]), make('small', '', dayEvents.length ? dayEvents.length + (dayEvents.length === 1 ? ' class' : ' classes') : 'No classes'));
      section.append(head);
      dayEvents.forEach(e => {
        const item = make('div', 'bs-tt-item'); item.dataset.kind = e.lab ? 'Lab' : 'Theory';
        const time = make('div', 'bs-tt-time'); time.append(make('b', '', clock(e.start)), make('span', '', clock(e.end)));
        const body = make('div', 'bs-tt-info'); body.append(make('b', '', e.title), make('span', '', [e.room + (e.building ? ' · ' + e.building : ''), e.teacher].filter(Boolean).join(' · ')));
        item.append(time, body, make('em', '', e.lab ? 'Lab' : 'Theory'));
        section.append(item);
      });
      list.append(section);
    });

    wrap.append(bar);
    if (nextCard) wrap.append(nextCard);
    wrap.append(week, list);
    host.prepend(wrap);
    mark(document.documentElement, 'data-bs-tt');
    if (store && store.local) store.local.get(VIEW_KEY).then(d => { if (d[VIEW_KEY] === 'week' || d[VIEW_KEY] === 'list') { wrap.dataset.view = d[VIEW_KEY]; Object.entries(buttons).forEach(([k, n]) => n.setAttribute('aria-pressed', String(k === d[VIEW_KEY]))); } }).catch(() => {});
  }
  // Plain-text statuses in table cells (Verified, Paid, Pending...) get a colour and a dot; the text itself is untouched.
  const STATUS = [
    ['ok', /^(verified|paid|approved|completed|complete|accepted|active|submitted|registered|cleared|passed|pass|yes)$/i],
    ['warn', /^(pending|in progress|processing|under review|partial|partially paid|waiting|n\/a pending)$/i],
    ['bad', /^(unpaid|rejected|failed|fail|overdue|declined|cancelled|canceled|not verified|defaulter|withheld)$/i]
  ];
  function statuses() {
    document.querySelectorAll('#pageContent table td').forEach(td => {
      if (td.children.length || td.hasAttribute('data-bs-status')) return;
      const text = td.textContent.trim();
      if (!text || text.length > 18) return;
      const hit = STATUS.find(([, re]) => re.test(text));
      if (hit) mark(td, 'data-bs-status', hit[0]);
    });
  }
  function mount() {
    const root = document.documentElement;
    if (!document.body) return;
    markCurrent();
    document.querySelectorAll('#pageAlerts_up .alert').forEach(a => mark(a, 'role', 'alert'));
    mountResizer();
    attendance();
    statuses();
    timetable();
    landing();
    emblem();
    void root;
  }
  function disable() {
    owned.forEach(node => node.remove()); owned.clear();
    attrs.forEach((names, node) => names.forEach(name => node.removeAttribute(name))); attrs.clear();
    resizer = null; document.documentElement.style.removeProperty('--bs-side');
  }
  globalThis.BahriaCms = { mount, disable };
})();
