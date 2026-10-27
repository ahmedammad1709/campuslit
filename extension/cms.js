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
  // The portal serves every submenu collapsed, even the one you are in. Open the group that holds the current page once
  // (never again, so collapsing it by hand sticks), and put it back the way it was when Campuslit is switched off.
  const opened = [];
  function openGroup(link) {
    const group = link.closest('.collapse');
    if (!group || group.classList.contains('in') || group.hasAttribute('data-bs-opened')) return;
    group.setAttribute('data-bs-opened', '');
    const toggle = group.id ? document.querySelector('aside#sideBar a[data-toggle="collapse"][href="#' + group.id + '"]') : null;
    group.classList.add('in'); group.setAttribute('aria-expanded', 'true');
    if (toggle) { toggle.classList.remove('collapsed'); toggle.setAttribute('aria-expanded', 'true'); }
    opened.push({ group, toggle });
  }
  function markCurrent() {
    const here = location.pathname.toLowerCase().replace(/\/$/, '');
    document.querySelectorAll('aside#sideBar a.list-group-item[href]').forEach(a => {
      let path = '';
      try { path = new URL(a.href, location.href).pathname.toLowerCase().replace(/\/$/, ''); } catch (e) { return; }
      if (path && path === here && !a.getAttribute('href').startsWith('#')) { mark(a, 'data-bs-current'); openGroup(a); }
    });
  }
  // ---------- Attendance: per-course rows with a plain "how many hours can I miss" line ----------
  const AT = () => globalThis.BahriaAttendance || null;
  let weeks = 16, shownWeeks = null;   // weeks of classes in a semester (a setting); rows are rebuilt when it changes
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };
  // One course row. Never throws: a bad record becomes a row that says so, or is skipped.
  function attendanceRow(item) {
    const planner = AT(), plan = planner ? planner.plan(item, { weeks }) : { state: 'invalid' };
    const portalPct = num(String(item.percentage === undefined || item.percentage === null ? '' : item.percentage).replace('%', ''));
    const pct = Math.max(0, Math.min(100, Number.isFinite(plan.percent) ? plan.percent : portalPct));
    if (!Number.isFinite(pct)) return null;
    const row = make('div', 'bs-att-row');
    row.dataset.level = plan.level || (plan.state === 'invalid' || plan.state === 'none' ? 'none' : 'warn');
    const label = make('div', ''); label.append(make('b', '', String(item.code || '')));
    const hrs = Number.isFinite(num(item.present)) && Number.isFinite(num(item.total)) ? num(item.present) + ' of ' + num(item.total) + ' hrs' : '';
    label.append(make('small', '', [item.title, hrs].filter(Boolean).join(' · ')));
    const value = make('span', 'bs-att-pct', (Number.isInteger(pct) ? pct : pct.toFixed(1)) + '%');
    const bar = make('div', 'bs-att-bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuenow', String(pct)); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-label', String(item.code || 'Course') + ' attendance');
    const fill = make('i', ''); fill.style.setProperty('--w', pct + '%'); bar.append(fill);
    row.append(label, value, bar);
    if (planner) { const d = planner.describe(plan); const note = make('p', 'bs-att-note', d.text); if (d.title) note.title = d.title; row.append(note); }
    row._plan = plan;
    return row;
  }
  const atRisk = p => p.state === 'recover' || p.state === 'lost' || (p.state === 'ended' && p.level === 'bad');
  function attendanceList(items) {
    const planner = AT(), min = planner ? planner.MIN_PERCENT : 75, comfy = 85;   // the legend's top band (the planner module has no such constant)
    const rows = [];
    items.forEach(item => { try { const r = attendanceRow(item); if (r) rows.push(r); } catch (e) { /* skip this course only */ } });
    if (!rows.length) return null;
    shownWeeks = weeks;
    // Courses at or below the limit first (the panel on the dashboard scrolls), then the rest in the portal's own order.
    const rank = r => (atRisk(r._plan) ? 0 : r._plan.state === 'tight' ? 1 : 2);
    rows.sort((a, b) => rank(a) - rank(b));   // Array.prototype.sort is stable
    const list = make('div', 'bs-att');
    if (planner) {
      const text = planner.summaryText(planner.summarize(rows.map(r => r._plan)));
      if (text) {
        const low = rows.filter(r => atRisk(r._plan)).map(r => (r.querySelector('b') || {}).textContent).filter(Boolean);
        const s = make('p', 'bs-att-summary', text + (low.length ? ': ' + low.join(', ') : '')); s.setAttribute('role', 'status');
        if (low.length) s.dataset.alert = 'true'; list.append(s);
      }
    }
    const legend = make('div', 'bs-att-legend');
    [['var(--bs-ok)', comfy + '% and above'], ['var(--bs-warn)', 'Above ' + min + '%'], ['var(--bs-bad)', min + '% or below']].forEach(([c, t]) => { const s = make('span', '', t); s.style.setProperty('--c', c); legend.append(s); });
    list.append(legend, ...rows);
    return list;
  }
  function dashboardAttendance() {
    const body = document.querySelector('.attendance-container .attendance-body');
    if (!body || body.querySelector('.bs-att')) return;
    let data = null;
    for (const script of document.querySelectorAll('script:not([src])')) {
      const text = script.textContent;
      if (!text.includes('renderAttendanceSummaryChart(')) continue;
      data = AT() ? AT().extractCourses(text) : null;
      if (data) break;
    }
    if (!Array.isArray(data) || !data.length) return;   // leave the original chart in place
    const list = attendanceList(data.filter(c => c && typeof c === 'object'));
    if (!list) return;
    body.append(list);
    mark(document.documentElement, 'data-bs-att');
  }
  // The Attendance page: the same numbers are in its table (present hours print as "20.0 :90.91%"). Add a planner above it.
  function attendancePage() {
    // Wait until the page has finished loading: with a slow connection the table can be only partly there, and a planner built from half a table would be wrong.
    if (document.readyState === 'loading' || document.querySelector('.bs-plan')) return;
    const tables = [...document.querySelectorAll('#pageContent table')];
    for (const table of tables) {
      const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.replace(/\s+/g, ' ').trim().toLowerCase());
      const col = name => heads.findIndex(h => h.includes(name));
      const iCode = col('code'), iTitle = col('registered course'), iCredit = col('credit'), iPresent = col('present'), iTotal = col('total hours');
      if (iPresent < 0 || iTotal < 0) continue;
      const items = [];
      table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length <= Math.max(iPresent, iTotal)) return;
        const m = /^\s*([\d.,]+)\s*(?::\s*([\d.]+)\s*%)?/.exec(cells[iPresent].textContent);
        if (!m) return;
        items.push({ code: iCode >= 0 ? cells[iCode].textContent.trim() : '', title: iTitle >= 0 ? cells[iTitle].textContent.trim() : '', creditHours: iCredit >= 0 ? cells[iCredit].textContent.trim() : undefined, present: m[1], total: cells[iTotal].textContent.trim(), percentage: m[2] });
      });
      const list = items.length ? attendanceList(items) : null;
      if (!list) return;
      const card = make('section', 'bs-plan');
      const caption = table.querySelector('caption');
      const head = make('div', 'bs-plan-head'); head.append(make('h2', '', 'Attendance planner'), make('span', '', caption ? caption.textContent.trim() : ''));
      card.append(head, list);
      (table.closest('.table-responsive') || table).before(card);
      return;
    }
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
  // "Add to calendar": the classes on this page as a downloadable calendar file. Built here from the schedule the page already holds
  // and handed straight to the browser as a download. Nothing is uploaded. The only values read are the three choices in this panel.
  const CAL = () => globalThis.BahriaCalendar || null;
  const longDate = ymd => { const m = /^(\d{4})(\d{2})(\d{2})$/.exec(ymd || ''); return m ? +m[3] + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m[2] - 1] + ' ' + m[1] : ''; };
  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.style.display = 'none';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function exportTools(schedule) {
    const lib = CAL(); if (!lib) return null;
    const button = make('button', 'bs-tt-export', 'Add to calendar'); button.type = 'button'; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'bs-tt-exportpanel');
    const panel = make('div', 'bs-tt-exportpanel'); panel.id = 'bs-tt-exportpanel'; panel.hidden = true; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Add the time table to a calendar');
    const field = (label, control) => { const wrap = make('div', 'bs-tt-field'); const l = make('label', '', label); l.htmlFor = control.id; wrap.append(l, control); return wrap; };
    // no name attributes: if the page's own form is ever submitted, none of these values go with it
    const start = make('input', 'bs-tt-input'); start.id = 'bs-tt-start'; start.type = 'date'; start.value = lib.mondayOf(new Date());
    const count = make('input', 'bs-tt-input'); count.id = 'bs-tt-weeks'; count.type = 'number'; count.min = String(lib.MIN_WEEKS); count.max = String(lib.MAX_WEEKS); count.step = '1'; count.inputMode = 'numeric';
    const remind = make('select', 'bs-tt-input'); remind.id = 'bs-tt-alarm';
    [[0, 'No reminder'], [10, '10 minutes before'], [30, '30 minutes before'], [60, '1 hour before']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = String(v); o.textContent = t; if (v === 10) o.selected = true; remind.append(o); });
    const fields = make('div', 'bs-tt-fields'); fields.append(field('First day of classes', start), field('Weeks of classes', count), field('Reminder', remind));
    const intro = make('p', 'bs-tt-exporthelp', 'Download your classes as a calendar file, then open it to add them to Google Calendar, Apple Calendar or Outlook. If the semester has already started, pick this week\u2019s Monday and the number of weeks left.');
    const message = make('p', 'bs-tt-exportmsg'); message.hidden = true;
    const go = make('button', 'bs-tt-exportgo', 'Download calendar file'); go.type = 'button';
    const cancel = make('button', 'bs-tt-exportcancel', 'Close'); cancel.type = 'button';
    const actions = make('div', 'bs-tt-exportactions'); actions.append(go, cancel);
    panel.append(intro, fields, message, actions);
    const say = (text, bad) => { message.textContent = text; message.hidden = !text; message.dataset.bad = bad ? 'true' : 'false'; message.setAttribute('role', bad ? 'alert' : 'status'); };
    const open = on => {
      panel.hidden = !on; button.setAttribute('aria-expanded', String(on));
      if (on) { count.value = String(Number.isFinite(weeks) ? weeks : 16); say(''); start.focus(); } else button.focus();
    };
    button.addEventListener('click', () => open(panel.hidden));
    cancel.addEventListener('click', () => open(false));
    const run = () => {
      try {
        const built = lib.build(schedule.events, { start: start.value, weeks: count.value, alarm: remind.value, semester: schedule.semester });
        if (!built.ok) { say(built.error, true); return; }
        download(built.text, lib.fileName(schedule.semester));
        say('Downloaded ' + built.count + (built.count === 1 ? ' class' : ' classes') + ', repeating every week until ' + longDate(built.until) + '. Open the file to add them. Opening it again later updates them instead of adding copies.', false);
      } catch (err) { say('Could not create the calendar file. Please try again.', true); }
    };
    go.addEventListener('click', run);
    // these controls sit inside the page's own form: Enter must not submit it
    panel.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target !== cancel && e.target !== go) { e.preventDefault(); run(); }
      else if (e.key === 'Escape') { e.preventDefault(); open(false); }
    });
    return { button, panel };
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
    const tools = make('div', 'bs-tt-tools'); const exporter = exportTools(schedule);
    if (exporter) tools.append(exporter.button);
    tools.append(seg);
    bar.append(meta, tools);

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
    if (exporter) wrap.append(exporter.panel);
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
  function mount(settings) {
    const root = document.documentElement;
    if (!document.body) return;
    if (settings && Number.isFinite(settings.semesterWeeks)) weeks = settings.semesterWeeks;
    if (shownWeeks !== null && shownWeeks !== weeks) { document.querySelectorAll('.bs-att, .bs-plan').forEach(n => { n.remove(); owned.delete(n); }); shownWeeks = null; }
    // Each feature runs on its own: if one fails on an unexpected page, the others (and the page itself) carry on untouched.
    [markCurrent,
      () => document.querySelectorAll('#pageAlerts_up .alert').forEach(a => mark(a, 'role', 'alert')),
      mountResizer, dashboardAttendance, attendancePage, statuses, timetable, landing, emblem
    ].forEach(step => { try { step(); } catch (e) { /* ignore */ } });
    void root;
  }
  function disable() {
    opened.splice(0).forEach(({ group, toggle }) => { group.classList.remove('in'); group.removeAttribute('aria-expanded'); group.removeAttribute('data-bs-opened'); if (toggle) { toggle.classList.add('collapsed'); toggle.setAttribute('aria-expanded', 'false'); } });
    owned.forEach(node => node.remove()); owned.clear();
    attrs.forEach((names, node) => names.forEach(name => node.removeAttribute(name))); attrs.clear();
    resizer = null; document.documentElement.style.removeProperty('--bs-side');
  }
  globalThis.BahriaCms = { mount, disable };
})();
