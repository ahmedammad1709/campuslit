// "4 problems with the Bahria University Portal. All fixed." Deterministic composer: every visual state is a pure function of the time t (seconds).
// render.mjs calls __frame(t) for t = 0, 1/30, 2/30 ... and captures each result. All times come from the sound (out/<scene>/timing.json:
// the voice lines and the sound effects), so the picture, the voice, the effects and the music cannot drift apart.
// The pictures are the real extension running on the invented sample pages; nothing here touches a real portal.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const VIEW = { w: 1440, h: 810, pw: 1440, ph: 1100 };          // w,h: what the window shows; pw,ph: the page behind it (the camera pans over it)
  const OFF = VIEW.w + 100, CX = VIEW.w / 2, CY = VIEW.h / 2, WIN_S = 1.08, SL = .55;
  const E = { lin: u => u, out: u => 1 - Math.pow(1 - u, 3), in: u => u * u * u, io: u => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2), back: u => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); } };
  function track(keys, t) {                                     // keys: [[time, value, easing-into-this-key], ...]
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i], [t1, v1, ease] = keys[i + 1];
      if (t < t1) return v0 + (v1 - v0) * (E[ease || 'io'])((t - t0) / (t1 - t0));
    }
    return keys[keys.length - 1][1];
  }
  const clamp01 = u => Math.max(0, Math.min(1, u));
  const ramp = (t, a, d, ease) => (E[ease || 'out'])(clamp01((t - a) / d));
  const settle = ms => new Promise(r => setTimeout(r, ms));
  const DOT_THEMES = ['navy', 'classic', 'midnight', 'pearl', 'sage', 'rose'];
  const FILL = 1.7;                                              // seconds the calendar takes to fill with classes
  let T = null, btnPos = [0, 0];
  const G = {}, frames = {}, capEls = {}, applied = new Map();
  const pages = { LMS: '/preview/lms/dashboard.html', CMS: '/preview/cms/dashboard.html', TT: '/preview/cms/timetable.html', ASG: '/preview/lms/assignments.html', CAL: '/__video/calmock.html' };
  const HIDE = '.bs-remind, .bs-tip { display: none !important; }';

  // ---------------------------------------------------------------- loading
  async function post(f, settings, first) {
    if (!settings) return false;
    const key = JSON.stringify(settings);
    if (!first && applied.get(f) === key) return false;
    applied.set(f, key);
    f.contentWindow.postMessage({ type: 'campuslit-settings', settings }, location.origin);
    await settle(first ? 700 : 90);
    const doc = f.contentDocument;
    doc.documentElement.style.scrollBehavior = 'auto';
    doc.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* already finished */ } });
    return true;
  }
  async function loadFrame(host, page, settings, hideCss) {
    const f = document.createElement('iframe'); f.tabIndex = -1; f.title = ''; host.append(f);
    await new Promise(r => { f.onload = r; f.src = page; });
    await settle(700);
    await post(f, settings, true);
    if (hideCss) { const st = f.contentDocument.createElement('style'); st.textContent = hideCss; f.contentDocument.head.append(st); }
    return f;
  }
  function group(name, url, withHandle) {
    const el = document.createElement('div'); el.className = 'pg'; el.dataset.name = name;
    const cam = document.createElement('div'); cam.className = 'cam'; el.append(cam);
    let handle = null;
    if (withHandle) { handle = document.createElement('div'); handle.className = 'handle'; handle.innerHTML = '<b></b>'; }
    $('view').append(el);
    return (G[name] = { name, url, el, cam, handle, off: [[0, OFF]], S: [[0, 1]], X: [[0, CX]], Y: [[0, CY]], wipe: null, pos: 0, marks: [], markEls: [] });
  }
  // a time table in the portal's stock look: days down the side, a 15-minute column for every slot, so it is far wider than the screen
  function readEvents(doc) {
    const j = JSON.parse(doc.getElementById('BodyPH_hfCalendarJson').value);
    return j.eventsData.map(e => {
      const m = e.timing.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/), d = e.data;
      return { day: e.weekDay, start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4], title: d.courseTitle, short: d.shortCourseTitle, room: d.roomName + ' · ' + d.buildingAlias, css: d.cssClass };
    });
  }
  function injectGrid(doc, events) {
    const table = doc.querySelector('#timeTable'); if (!table) return;
    const S0 = 8 * 60, S1 = 19 * 60, N = (S1 - S0) / 15, names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const hue = ['#5b8db8', '#6aa57e', '#b88f5b', '#8a78b5', '#b5707a', '#5fa3a8'], idx = new Map();
    let html = '<thead><tr><th class="d">Day</th>';
    for (let h = 8; h < 19; h++) html += `<th colspan="4">${h > 12 ? h - 12 : h}:00 ${h < 12 ? 'AM' : 'PM'}</th>`;
    html += '</tr></thead><tbody>';
    for (let d = 1; d <= 5; d++) {
      html += `<tr><th class="d">${names[d - 1]}</th>`; let col = 0;
      events.filter(e => e.day === d).sort((a, b) => a.start - b.start).forEach(e => {
        const s = (e.start - S0) / 15, n = (e.end - e.start) / 15; if (!idx.has(e.title)) idx.set(e.title, idx.size);
        if (s > col) html += `<td colspan="${s - col}"></td>`;
        html += `<td class="ev" colspan="${n}" style="background:${hue[idx.get(e.title) % hue.length]}">${e.short}<br>${e.room}</td>`; col = s + n;
      });
      if (col < N) html += `<td colspan="${N - col}"></td>`; html += '</tr>';
    }
    table.innerHTML = html + '</tbody>';
    const st = doc.createElement('style');
    st.textContent = '#timeTable{border-collapse:collapse;table-layout:fixed;width:2160px;max-width:none;background:#fff;font-size:11px;color:#333}#timeTable th,#timeTable td{border:1px solid #cfd4da;padding:3px 4px;height:62px;overflow:hidden;white-space:nowrap;text-align:left;vertical-align:top}#timeTable thead th{height:34px;background:#eceff2;font-weight:600;text-align:left;color:#444}#timeTable th.d{width:100px;background:#eceff2;vertical-align:middle;color:#444}#timeTable td.ev{color:#fff;font-weight:600;line-height:1.25;border-color:#fff;white-space:normal;font-size:11px}';
    doc.head.append(st);
  }

  // ---------------------------------------------------------------- the timeline (all times come from the sound)
  function build(timing) {
    const at = {}; for (const l of timing.lines) at[l.id] = l.at;
    const sx = {}; for (const e of timing.sfx) sx[e.id] = e.at;
    T = { duration: timing.duration, at, sx, caps: [] };
    const sentences = timing.lines.flatMap(l => l.sentences).sort((x, y) => x.t0 - y.t0);
    T.caps = sentences.map((sn, i) => ({ t0: sn.t0 - .06, t1: Math.min(sn.t1 + .55, i + 1 < sentences.length ? sentences[i + 1].t0 - .03 : 1e9), words: sn.words, small: sn.small }));
    // chapter: [card start, card end, wipe]
    T.ch = [1, 2, 3, 4].map(n => ({ n, a: sx['card' + n], b: sx['card' + n + 'end'], wipe: sx['wipe' + n] }));
    const swapAt = n => (n < 4 ? sx['card' + (n + 1)] : sx.end) + .5;          // pages change under the next chapter card
    const swap0 = n => sx['card' + n] + .5;
    const vis = (g, a, b) => { g.off = [[0, OFF], [a - .001, OFF], [a, 0, 'lin'], [b, 0], [b + .001, OFF, 'lin']]; g.inAt = a; g.outAt = b; };
    const slideIn = (g, inAt, b) => { g.off = [[0, OFF], [inAt + .05, OFF], [inAt + .05 + SL, 0, 'io'], [b, 0], [b + .001, OFF, 'lin']]; g.inAt = inAt; g.outAt = b; };
    const w = n => T.ch[n - 1].wipe;
    // ----- chapter 1: the look
    G.lms.off = [[0, 0], [swapAt(1) - .001, 0], [swapAt(1), OFF, 'lin']]; G.lms.inAt = null; G.lms.outAt = swapAt(1);
    G.lms.S = [[0, 1], [w(1) + 1.9, 1], [w(1) + 2.5, 1.25, 'io'], [sx.dockIn - .6, 1.25], [sx.dockIn - .05, 1, 'io']];
    G.lms.X = [[0, CX], [w(1) + 1.9, CX], [w(1) + 2.5, 820, 'io'], [sx.dockIn - .6, 820], [sx.dockIn - .05, CX, 'io']];
    G.lms.Y = [[0, CY], [w(1) + 1.9, CY], [w(1) + 2.5, 330, 'io'], [sx.dockIn - .6, 330], [sx.dockIn - .05, CY, 'io']];
    G.lms.wipe = [[w(1) + .15, 0], [w(1) + 1.9, 1, 'io']];
    // ----- chapter 2: the time table
    vis(G.tt, swap0(2), swapAt(2));
    G.tt.S = [[0, 1], [w(2) + 1.9, 1], [w(2) + 2.6, 1.25, 'io']];
    G.tt.X = [[0, CX], [w(2) + 1.9, CX], [w(2) + 2.6, 864, 'io']];
    G.tt.Y = [[0, CY], [w(2) + 1.9, CY], [w(2) + 2.6, 300, 'io']];
    G.tt.wipe = [[w(2) + .15, 0], [w(2) + 1.9, 1, 'io']];
    slideIn(G.cal, sx.slideCal, swapAt(2));
    // ----- chapter 3: deadlines and reminders
    vis(G.asg, swap0(3), swapAt(3));
    G.asg.S = [[0, 1], [w(3) + 1.0, 1], [w(3) + 1.7, 1.5, 'io']];
    G.asg.X = [[0, CX], [w(3) + 1.0, CX], [w(3) + 1.7, 700, 'io']];
    G.asg.Y = [[0, CY], [w(3) + 1.0, CY], [w(3) + 1.7, 262, 'io']];
    G.asg.wipe = [[w(3) + .15, 0], [w(3) + 1.9, 1, 'io']];
    slideIn(G.rem, sx.slideRem, swapAt(3));
    // ----- chapter 4: search
    vis(G.cmsS, swap0(4), swapAt(4));
    G.cmsS.S = [[0, 1], [sx.key1 - .1, 1], [sx.key1 + .7, 1.4, 'io']];
    G.cmsS.X = [[0, CX], [sx.key1 - .1, CX], [sx.key1 + .7, 720, 'io']];
    G.cmsS.Y = [[0, CY], [sx.key1 - .1, CY], [sx.key1 + .7, 300, 'io']];
    G.cmsS.wipe = [[w(4) + .15, 0], [w(4) + 1.9, 1, 'io']];
    slideIn(G.lmsS, sx.slideL, swapAt(4));
    G.lmsS.S = [[0, 1], [sx.key2 - .1, 1], [sx.key2 + .7, 1.5, 'io']];
    G.lmsS.X = [[0, CX], [sx.key2 - .1, CX], [sx.key2 + .7, 720, 'io']];
    G.lmsS.Y = [[0, CY], [sx.key2 - .1, CY], [sx.key2 + .7, 270, 'io']];
    slideIn(G.install, sx.slideI, swapAt(4));
    G.install.cam = null;
    // problem markers: [frame, selector, label, appears, vanishes, side, grow]
    const gone = n => w(n) - .05;
    G.lms.marks = [['lmsOld', '.main-header', 'A dated header', sx.mk1a, gone(1), 'below'], ['lmsOld', '.content table, .box table, table', 'Tiny, cramped table', sx.mk1b, gone(1), 'below'], ['lmsOld', '.main-sidebar', 'A plain list of links', sx.mk1c, gone(1), 'in']];
    G.tt.marks = [['ttOld', '.table-responsive', 'A grid wider than your screen', sx.mk2a, gone(2), 'below'], ['ttOld', '#timeTable td.ev', 'Tiny cells', sx.mk2b, gone(2), 'below']];
    G.asg.marks = [['asgOld', 'table', 'Dates, but no countdown', sx.mk3a, gone(3), 'below'], ['asgOld', 'select', 'One course at a time', sx.mk3b, gone(3), 'below']];
    G.cmsS.marks = [['cmsOld', '#sideBar', 'Dozens of links, no search', sx.mk4a, gone(4), 'in'], ['cmsOld', '#header', 'No search anywhere', sx.mk4b, gone(4), 'below']];
    // tag in the window bar: PROBLEM n, then FIXED
    T.tags = [];
    T.ch.forEach((c, i) => { T.tags.push([c.b + .1, c.wipe + .1, 'Problem ' + c.n, false]); T.tags.push([c.wipe + 1.3, i < 3 ? T.ch[i + 1].a : sx.slideI, 'Fixed', true]); });
  }

  // ---------------------------------------------------------------- per-frame state
  function viewToFrame(vx, vy) { return [960 + (vx - CX) * WIN_S, 498 + (60 + vy - 435) * WIN_S]; }
  function camAt(g, t) {
    const s = track(g.S, t);
    const cx = Math.min(VIEW.pw - VIEW.w / 2 / s, Math.max(VIEW.w / 2 / s, track(g.X, t)));
    const cy = Math.min(VIEW.ph - VIEW.h / 2 / s, Math.max(VIEW.h / 2 / s, track(g.Y, t)));
    return { s, cx, cy };
  }
  function pageToFrame(g, px, py, t) { const { s, cx, cy } = camAt(g, t); return viewToFrame(CX + (px - cx) * s, CY + (py - cy) * s); }
  function setGroups(t) {
    let urlNow = G.lms.url;
    for (const g of Object.values(G)) {
      const off = track(g.off, t); g.pos = off;
      g.el.style.display = Math.abs(off) >= VIEW.w + 1 ? 'none' : '';
      g.el.style.transform = `translateX(${off}px)`;
      if (Math.abs(off) < VIEW.w / 2) urlNow = g.url;
      if (!g.cam) continue;
      const { s, cx, cy } = camAt(g, t);
      g.cam.style.transform = `translate(${VIEW.w / 2 - cx * s}px, ${VIEW.h / 2 - cy * s}px) scale(${s})`;
      if (g.wipe) {
        const h = track(g.wipe, t), top = g.cam.querySelectorAll('iframe')[1];
        if (top) top.style.clipPath = `inset(0 ${(1 - h) * 100}% 0 0)`;
        if (g.handle) { g.handle.style.display = h > .002 && h < .998 ? 'block' : 'none'; g.handle.style.left = (h * VIEW.pw) + 'px'; g.handle.style.transform = `scaleX(${1 / Math.max(.5, s)})`; }
      }
      // markers: pop in, pulse, vanish when the fix wipes in
      g.marks.forEach((m, i) => {
        const el = g.markEls[i]; if (!el) return;
        const u = ramp(t, m[3], .38, 'back'), v = 1 - ramp(t, m[4], .25, 'in');
        el.style.opacity = String(Math.min(clamp01(u), v));
        el.style.transform = `scale(${.9 + .1 * u + .012 * Math.sin((t - m[3]) * 7) * (v > 0 ? 1 : 0)})`;
      });
    }
    if ($('url').textContent !== urlNow) $('url').textContent = urlNow;
    document.querySelector('.bar em').style.visibility = urlNow.startsWith('campuslit') ? 'hidden' : 'visible';
  }
  function setCaptions(t) {
    const host = $('caps');
    host.classList.toggle('endmode', t >= T.sx.end);
    let n = 0;
    for (const c of T.caps) {
      if (t < c.t0 || t > c.t1) continue;
      const age = t - c.t0, left = c.t1 - t;
      const el = capEls[n] || (capEls[n] = (() => { const d = document.createElement('div'); d.className = 'cap'; host.append(d); return d; })());
      if (el.dataset.key !== String(c.t0)) {
        el.dataset.key = String(c.t0); el.textContent = '';
        for (const w of c.words) { const span = document.createElement('span'); span.className = 'w' + (c.small ? ' sm' : ''); span.textContent = w.w; span.dataset.t = w.t0; span.dataset.e = w.t1; el.append(span); }
      }
      el.style.display = 'flex';
      const a = E.out(Math.min(1, age / .22)), b = Math.min(1, left / .16);
      el.style.opacity = String(Math.min(a, b));
      el.style.transform = `translateY(${(1 - a) * 22}px) scale(${.94 + .06 * a})`;
      el.querySelectorAll('.w').forEach(w => {
        const t0 = +w.dataset.t;
        w.classList.toggle('on', t >= t0 && t < Math.max(+w.dataset.e, t0 + .25));
        w.classList.toggle('seen', t >= t0 - .02);
        const u = (t - t0) / .32; w.style.transform = u > 0 && u < 1 ? `scale(${1 + .06 * Math.sin(Math.PI * u)}) translateY(${-6 * Math.sin(Math.PI * u)}px)` : '';
      });
      n++;
    }
    for (let i = n; i in capEls; i++) capEls[i].style.display = 'none';
  }
  function setTag(t) {
    const el = $('tag'); let seg = null;
    for (const s of T.tags) if (t >= s[0] && t < s[1]) seg = s;
    if (!seg) { el.style.opacity = '0'; return; }
    if (el.textContent !== seg[2]) { el.textContent = seg[2]; el.classList.toggle('fixed', seg[3]); }
    const a = ramp(t, seg[0], .3, 'back'), b = 1 - ramp(t, seg[1] - .25, .25, 'in');
    el.style.opacity = String(Math.min(clamp01(a), b)); el.style.transform = `scale(${.8 + .2 * Math.min(1, a)})`;
  }
  function cardEnvelope(t) {                                   // 0..1: how much a chapter card covers the frame
    let best = 0;
    for (const c of T.ch) { const e = ramp(t, c.a - .02, .42, 'out') * (1 - ramp(t, c.b, .45, 'in')); best = Math.max(best, e); }
    return best;
  }
  function setCard(t) {
    const el = $('card'); let c = null;
    for (const x of T.ch) if (t >= x.a - .05 && t <= x.b + .5) c = x;
    if (!c) { el.style.opacity = '0'; return; }
    const enter = ramp(t, c.a - .02, .42, 'out'), exit = ramp(t, c.b, .45, 'in');
    el.style.opacity = '1'; el.style.transform = `translateY(${(1 - enter) * 100 - exit * 100}%)`;
    $('cardnum').textContent = '0' + c.n; $('cardnum').style.transform = `scale(${.7 + .3 * ramp(t, c.a + .05, .5, 'back')})`;
    const dots = $('carddots').children; for (let i = 0; i < 4; i++) dots[i].classList.toggle('on', i < c.n);
  }

  // ---------------------------------------------------------------- themes: dock, circular reveal, custom colour sweep
  let seq = [], dots = [], hueKeys = null, trackBox = null;
  const segs = [];                                              // cursor paths: {a, b, x:[...], y:[...], show:[...], clicks:[[t,x,y]]}
  function paletteOf(key) { const th = BahriaStudio.themes[key]; return th ? [th.nav, th.accent] : ['#0b1d40', '#2f5bea']; }
  function customAt(h) { return BahriaStudio.generateCustom({ accent: BahriaStudio.fromHsl(h, .7, .5), mode: 'light', side: 'deep', name: 'My theme' }); }
  function settingsFor(key, t) { return key === 'custom' ? { theme: 'custom', custom: customAt(track(hueKeys, t)) } : { theme: key }; }
  function buildDock() {
    const host = $('dots');
    DOT_THEMES.forEach(k => { const i = document.createElement('i'); const [a, b] = paletteOf(k); i.style.background = `linear-gradient(135deg, ${a} 50%, ${b} 50%)`; if (k === 'classic') i.style.boxShadow = 'inset 0 0 0 2px rgba(11,29,64,.22)'; host.append(i); });
    const plus = document.createElement('i'); plus.className = 'plus'; host.append(plus);
    dots = [...host.children];
    const box = $('frame').getBoundingClientRect();
    const cen = el => { const r = el.getBoundingClientRect(); return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2]; };
    T.dotPos = dots.map(cen);
    const tr = $('slider').querySelector('.track'); $('slider').style.opacity = 1; const r = tr.getBoundingClientRect(); $('slider').style.opacity = 0;
    trackBox = { x0: r.left - box.left, x1: r.right - box.left, y: r.top - box.top + r.height / 2 };
    const s = T.sx, view = $('view').getBoundingClientRect();
    seq = [{ t: 0, key: 'navy', dot: 0 }, { t: s.th1, key: 'midnight', dot: 2 }, { t: s.th2, key: 'sage', dot: 4 }, { t: s.th3, key: 'rose', dot: 5 }, { t: s.th4, key: 'pearl', dot: 3 }, { t: s.custom, key: 'custom', dot: 6 }];
    seq.forEach(q => { const p = T.dotPos[q.dot]; q.x = (p[0] - (view.left - box.left)) / WIN_S; q.y = (p[1] - (view.top - box.top)) / WIN_S; });
    hueKeys = [[0, 150], [s.custom + .05, 150], [s.custom + .8, 215, 'io'], [s.custom + 1.5, 280, 'io'], [s.dockOut - .1, 335, 'io']];
    const cx = [[0, 1500]], cy = [[0, 900]], clicks = [], startAt = s.dockIn + .3;
    cx.push([startAt, 1500]); cy.push([startAt, 900]);
    seq.slice(1).forEach(q => { const p = T.dotPos[q.dot]; const a = q.t - .08; cx.push([a, p[0], 'io']); cy.push([a, p[1], 'io']); cx.push([q.t + .12, p[0]]); cy.push([q.t + .12, p[1]]); clicks.push([q.t, p[0], p[1]]); });
    const knob = t => trackBox.x0 + (trackBox.x1 - trackBox.x0) * ((track(hueKeys, t) % 360) / 360);
    const ts = s.custom + .5;
    cx.push([ts, knob(ts), 'io']); cy.push([ts, trackBox.y, 'io']);
    for (let tt = ts + .1; tt < s.dockOut - .1; tt += .1) { cx.push([tt, knob(tt), 'lin']); cy.push([tt, trackBox.y, 'lin']); }
    cx.push([s.dockOut, knob(s.dockOut - .12) + 60, 'io']); cy.push([s.dockOut, trackBox.y + 80, 'io']);
    segs.push({ a: startAt - .2, b: s.dockOut + .3, x: cx, y: cy, show: [[0, 0], [startAt - .15, 0], [startAt, 1, 'lin'], [s.dockOut - .15, 1], [s.dockOut + .25, 0, 'lin']], clicks });
  }
  async function setThemes(t) {
    const A = frames.lmsNew, B = frames.lmsAlt;
    if (!A || !B) { $('dock').style.opacity = '0'; return false; }
    B.style.display = t >= T.sx.dockIn - .3 ? '' : 'none';
    if (t < T.sx.dockIn - .3) { $('dock').style.opacity = '0'; return false; }
    let k = 0; for (let i = 0; i < seq.length; i++) if (t >= seq[i].t) k = i;
    const cur = seq[k], prev = seq[Math.max(0, k - 1)];
    const reveal = k === 0 ? 1 : ramp(t, cur.t, .85, 'out');
    const a = await post(A, settingsFor(prev.key, t));
    const b = await post(B, settingsFor(cur.key, t));
    B.style.clipPath = `circle(${Math.max(0, reveal * 1900)}px at ${cur.x}px ${cur.y}px)`;
    $('dock').style.opacity = String(ramp(t, T.sx.dockIn, .4) * (1 - ramp(t, T.sx.dockOut - .1, .3, 'in')));
    const custom = t >= T.sx.custom + .2;
    $('dots').style.opacity = custom ? '0' : '1'; $('slider').style.opacity = custom ? '1' : '0';
    dots.forEach((d, i) => d.classList.toggle('on', i === cur.dot && t >= cur.t - .02 || (k === 0 && i === 0)));
    const name = cur.key === 'custom' ? 'My theme' : BahriaStudio.themes[cur.key].name;
    if ($('tname').textContent !== name) $('tname').textContent = name;
    $('slider').querySelector('.track b').style.left = ((track(hueKeys, t) % 360) / 360 * 100) + '%';
    return a || b;
  }

  // ---------------------------------------------------------------- the time table: Add to calendar, the file, the calendar
  async function setTable(t) {
    const f = frames.ttNew, s = T.sx; if (!f) { $('chip').style.opacity = '0'; return false; }
    const doc = f.contentDocument, btn = doc.querySelector('.bs-tt-export'), panel = doc.querySelector('.bs-tt-exportpanel'), go = doc.querySelector('.bs-tt-exportgo');
    let changed = false;
    if (btn && panel) {
      const want = t >= s.openPanel && t < s.slideCal + .6;
      if (want === panel.hidden) { btn.click(); changed = true; }
      const msg = doc.querySelector('.bs-tt-exportmsg');
      if (want && t >= s.goClick && msg && msg.hidden && go) { f.contentWindow.HTMLAnchorElement.prototype.click = function () { /* the video never downloads anything */ }; go.click(); changed = true; }
    }
    if (changed) { doc.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* done */ } }); await settle(60); }
    // the file chip: it drops in, fills, and says Saved
    const chip = $('chip'), a = ramp(t, s.chipIn, .35, 'back'), o = 1 - ramp(t, s.slideCal + .3, .3, 'in'), p = ramp(t, s.chipIn + .1, .8, 'io');
    chip.style.opacity = String(Math.min(clamp01(a), o)); chip.style.transform = `translateY(${(1 - Math.min(1, a)) * -24}px)`;
    $('chipbar').style.width = (p * 100) + '%'; chip.classList.toggle('done', p >= .999);
    const sub = p >= .999 ? 'Saved. Open it to add your classes.' : 'Downloading'; if ($('chipsub').textContent !== sub) $('chipsub').textContent = sub;
    return changed;
  }
  function setCalendar(t) {
    const f = frames.cal; if (!f || !f.contentWindow.__fill) return;
    f.contentWindow.__fill(clamp01((t - T.sx.fill1) / FILL));
  }
  function setReminder(t) {
    const f = frames.remNew; if (!f) return;
    const el = f.contentDocument.querySelector('.bs-remind'); if (!el) return;
    const u = ramp(t, T.sx.remPop, .5, 'back'), v = 1 - ramp(t, T.sx.remPop + 3.2, .3, 'in');
    el.style.setProperty('bottom', 'auto', 'important'); el.style.setProperty('top', '540px', 'important');   // the page is taller than the window shows: keep the popup inside the picture
    el.style.setProperty('opacity', String(clamp01(u) * v), 'important'); el.style.setProperty('transform', `translateY(${(1 - Math.min(1, u)) * 34}px) scale(${.92 + .08 * Math.min(1, u)})`, 'important');
  }

  // ---------------------------------------------------------------- the search window (Ctrl+K), typed letter by letter, on both portals
  async function searchPhase(f, keyAt, ids, text, from, to, t) {
    const doc = f.contentDocument, s = T.sx;
    const want = t >= from && t < to;
    let typed = 0; ids.forEach((id, i) => { if (t >= s[id]) typed = i + 1; });
    const dlg = doc.querySelector('dialog.bs-qs');
    let changed = false;
    if (want && !(dlg && dlg.open)) { doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })); changed = true; await settle(120); }
    if (!want && dlg && dlg.open) { dlg.close(); changed = true; }
    const d2 = doc.querySelector('dialog.bs-qs');
    if (want && d2 && d2.open) { const input = d2.querySelector('input'), v = text.slice(0, typed); if (input.value !== v) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); changed = true; } }
    if (changed) { doc.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* done */ } }); await settle(60); }
    return changed;
  }
  async function setSearch(t) {
    const s = T.sx; let changed = false;
    if (frames.cmsNew) changed = (await searchPhase(frames.cmsNew, s.key1, ['k1t1', 'k1t2', 'k1t3'], 'att', s.key1 + .05, s.slideL + .6, t)) || changed;
    if (frames.lmsSrch) changed = (await searchPhase(frames.lmsSrch, s.key2, ['k2t1', 'k2t2', 'k2t3', 'k2t4', 'k2t5'], 'assig', s.key2 + .05, s.slideI + .6, t)) || changed;
    const cap = (k, a, b) => ramp(t, k - .35, .22, 'back') * (1 - ramp(t, k + .45, .2, 'in'));
    const a = Math.max(cap(s.key1), cap(s.key2)), el = $('keys');
    el.style.opacity = String(Math.min(1, a)); el.style.transform = `scale(${.7 + .3 * Math.min(1, a)})`;
    return changed;
  }

  // ---------------------------------------------------------------- install card, cursor, ripple, end card
  function buildInstall() {
    const g = group('install', 'campuslit-bu.vercel.app', false); g.el.classList.add('install');
    g.cam.remove();
    g.el.innerHTML = '<svg viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="30" fill="#0b1d40"/><path d="M80.57 81.21A30 30 0 1 1 80.57 46.79" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"/><circle cx="98" cy="64" r="8.5" fill="#f2b84b"/></svg><h1>campus<span>lit</span></h1><p>The redesign for Bahria University</p><div class="row"><b>Free</b><b>Private</b><b>One click</b></div><div class="btn" id="btn">Add to Chrome</div>';
    g.cam = null;
    g.el.style.transform = 'none';
    const box = $('frame').getBoundingClientRect(), r = $('btn').getBoundingClientRect();
    btnPos = [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
    g.el.style.transform = `translateX(${OFF}px)`;
  }
  function setInstall(t) {
    const s = T.sx, btn = $('btn'), added = t >= s.click;
    btn.classList.toggle('added', added);
    const label = added ? 'Added to Chrome' : 'Add to Chrome'; if (btn.textContent !== label) btn.textContent = label;
    btn.style.transform = `scale(${added ? 1 - .06 * Math.max(0, 1 - Math.abs(t - s.click - .05) / .1) : 1})`;
  }
  function setCursor(t) {
    let show = 0, x = 0, y = 0, clicks = [];
    for (const sg of segs) if (t >= sg.a && t <= sg.b) { show = track(sg.show, t); x = track(sg.x, t); y = track(sg.y, t); }
    segs.forEach(sg => clicks.push(...sg.clicks));
    const cu = $('cursor'); cu.style.opacity = String(show);
    const down = clicks.some(c => Math.abs(t - c[0] - .04) < .08);
    cu.style.transform = `translate(${x - 13}px, ${y - 7}px) scale(${down ? .86 : 1})`;
    let rp = null; for (const c of clicks) if (t >= c[0] && t - c[0] < .5) rp = c;
    const r = $('ripple');
    if (rp) { const u = (t - rp[0]) / .5; r.style.opacity = String(.95 * (1 - u)); r.style.transform = `translate(${rp[1]}px, ${rp[2]}px) scale(${.3 + 1.1 * E.out(u)})`; } else r.style.opacity = '0';
  }
  function setEnd(t) {
    const e = T.sx.end, u = ramp(t, e - .1, .5, 'io');
    $('end').style.opacity = String(u);
    $('ring').style.strokeDasharray = '1'; $('ring').style.strokeDashoffset = String(1 - ramp(t, e + .15, .85, 'io'));
    $('dot').setAttribute('r', String(8.5 * ramp(t, e + 1.0, .5, 'back')));
    const mk = $('mark'), pop = ramp(t, e - .05, .6, 'back'); mk.style.transform = `scale(${.6 + .4 * pop})`; mk.style.opacity = String(Math.min(1, pop * 2));
    const rise = (id, a) => { const el = $(id), v = ramp(t, e + a, .5, 'out'); el.style.opacity = String(v); el.style.transform = `translateY(${(1 - v) * 34}px)`; };
    rise('word', .5); rise('tag2', .7); rise('chips', .9); rise('site', 1.1); rise('fine', 1.4);
  }
  // the window: tilts in, floats, swings on page changes, steps back under a chapter card, glare on each reveal
  function setWindow(t) {
    const w = $('win'), s = T.sx, endU = ramp(t, s.end - .1, .5, 'io');
    const e = ramp(t, 0, 2.2, 'out'), tilt = 1 - e;
    const calm = Math.max(ramp(t, s.dockIn - .4, .4, 'lin') * (1 - ramp(t, s.dockOut + .2, .4, 'lin')), ramp(t, s.openPanel - .9, .4, 'lin') * (1 - ramp(t, s.slideCal - .1, .3, 'lin')), ramp(t, s.slideI - .2, .4, 'lin'));
    const fl = 1 - calm;
    let ry = -17 * tilt + fl * 1.2 * Math.sin(t * .9), rx = 13 * tilt + fl * .7 * Math.sin(t * .7 + 1), sc = WIN_S * (.84 + .16 * e), dz = -140 * tilt;
    let sw = 0; for (const id of ['slideCal', 'slideRem', 'slideL', 'slideI']) { const u = (t - s[id] - .05) / SL; if (u > 0 && u < 1) sw = Math.max(sw, Math.sin(Math.PI * u)); }
    const ce = cardEnvelope(t);
    ry += 6 * sw - 5 * ce; sc *= (1 - .03 * sw) * (1 - .07 * ce); rx += 3 * ce;
    if (t > s.hw1) sc *= 1 + .028 * Math.exp(-(t - s.hw1) * 7);
    sc *= 1 - .06 * endU;
    w.style.opacity = String(1 - endU);
    w.style.transform = `translateZ(${dz}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${sc})`;
    let sh = null; for (const a of [1, 2, 3, 4].map(n => T.ch[n - 1].wipe + .15).concat(['slideCal', 'slideRem', 'slideL', 'slideI'].map(id => s[id] + .05))) { const u = (t - a) / .75; if (u > 0 && u < 1) sh = u; }
    const el = $('shine'); el.style.opacity = sh === null ? '0' : String(.9 * Math.sin(Math.PI * sh)); el.style.transform = `translateX(${((sh || 0) * 2 - 1) * 100}%)`;
  }
  function setBackdrop(t) {
    $('orbA').style.transform = `translate(${240 + 120 * Math.sin(t * .31)}px, ${60 + 80 * Math.cos(t * .27)}px)`;
    $('orbB').style.transform = `translate(${1180 + 140 * Math.cos(t * .23)}px, ${420 + 90 * Math.sin(t * .35)}px)`;
    $('orbC').style.transform = `translate(${700 + 160 * Math.sin(t * .19 + 2)}px, ${-120 + 70 * Math.cos(t * .3)}px)`;
    $('grid').style.backgroundPosition = `0 ${(t * 9) % 72}px`;
    $('glow').style.opacity = String(.72 + .1 * Math.sin(t * .9));
    $('bar').firstElementChild.style.width = (100 * clamp01(t / T.duration)) + '%';
  }

  // ---------------------------------------------------------------- pages are loaded when needed and dropped when done (keeps memory low on a small PC)
  async function ensure(g, want) {
    if (!g.specs) return;
    if (want && !g.loaded) {
      g.loaded = true;
      g.el.style.display = ''; g.el.style.transform = 'none'; g.el.style.zIndex = '50';
      if (g.cam) g.cam.style.transform = 'none';
      for (const [key, page, settings, hide, after] of g.specs) { frames[key] = await loadFrame(g.cam, page, settings, hide); if (after) await after(frames[key], g); }
      await settle(900);
      for (const f of g.cam.querySelectorAll('iframe')) { try { f.contentDocument.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* done */ } }); } catch (e) { /* not an extension page */ } }
      if (g.handle) g.cam.append(g.handle);
      // problem markers: measured from the real elements of the stock page
      g.markEls = g.marks.map(m => {
        const f = frames[m[0]], doc = f && f.contentDocument, node = doc && (doc.querySelector(m[1]));
        if (!node) { console.warn('marker target not found', m[0], m[1]); return null; }
        const r = node.getBoundingClientRect(), pad = 10;
        const el = document.createElement('div'); el.className = 'mk ' + (m[5] || '');
        el.style.left = (r.left - pad) + 'px'; el.style.top = (r.top - pad) + 'px'; el.style.width = (r.width + 2 * pad) + 'px'; el.style.height = (r.height + 2 * pad) + 'px';
        const label = document.createElement('u'); label.textContent = m[2]; el.append(label); g.cam.append(el); return el;
      });
      if (g.afterAll) await g.afterAll(g);
      g.el.style.zIndex = '';
    } else if (!want && g.loaded) {
      g.loaded = false;
      for (const [key] of g.specs) { const f = frames[key]; if (f) { applied.delete(f); f.remove(); delete frames[key]; } }
      g.markEls.forEach(el => el && el.remove()); g.markEls = [];
    }
  }

  // ---------------------------------------------------------------- init / frame
  window.__init = async function (name) {
    const sc = name || 'glowup';
    const timing = await (await fetch('/__out/' + sc + '/timing.json', { cache: 'no-store' })).json();
    const gl = group('lms', 'lms.bahria.edu.pk', true), gt = group('tt', 'cms.bahria.edu.pk', true), gc = group('cal', 'My calendar', false);
    const ga = group('asg', 'lms.bahria.edu.pk', true), gr = group('rem', 'lms.bahria.edu.pk', false), gm = group('cmsS', 'cms.bahria.edu.pk', true), gs = group('lmsS', 'lms.bahria.edu.pk', false);
    const navy = { theme: 'navy' }, off = { enabled: false };
    gl.specs = [['lmsOld', pages.LMS, off], ['lmsNew', pages.LMS, navy, HIDE], ['lmsAlt', pages.LMS, navy, HIDE]];
    gt.specs = [['ttOld', pages.TT, off, null, async (f) => { T.events = readEvents(f.contentDocument); injectGrid(f.contentDocument, T.events); }], ['ttNew', pages.TT, navy, HIDE]];
    gc.specs = [['cal', pages.CAL, null, null, async (f) => { for (let i = 0; i < 50 && !f.contentWindow.__setEvents; i++) await settle(100); f.contentWindow.__setEvents(T.events || []); }]];
    ga.specs = [['asgOld', pages.ASG, off], ['asgNew', pages.ASG, navy, '.bs-remind { display: none !important; }']];
    gr.specs = [['remNew', pages.LMS, navy, '.bs-tip { display: none !important; } .bs-remind { animation: none !important; transition: none !important; }']];
    gm.specs = [['cmsOld', pages.CMS, off], ['cmsNew', pages.CMS, navy, HIDE]];
    gs.specs = [['lmsSrch', pages.LMS, navy, HIDE]];
    buildInstall(); build(timing); buildDock();
    // cursor on the time table: to "Add to calendar", then to "Download calendar file" (positions measured from the real buttons)
    gt.afterAll = async () => {
      const f = frames.ttNew, doc = f.contentDocument, s = T.sx, btn = doc.querySelector('.bs-tt-export'), panel = doc.querySelector('.bs-tt-exportpanel'), go = doc.querySelector('.bs-tt-exportgo');
      if (!btn || !panel || !go || segs.some(q => q.tt)) return;
      const centre = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
      const p1 = pageToFrame(gt, ...centre(btn), s.click1);
      btn.click(); doc.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* done */ } }); await settle(200);
      const p2 = pageToFrame(gt, ...centre(go), s.goClick);
      btn.click(); doc.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* done */ } }); await settle(100);
      segs.push({ tt: true, a: s.click1 - 1.1, b: s.goClick + .9, clicks: [[s.click1, p1[0], p1[1]], [s.goClick, p2[0], p2[1]]],
        x: [[s.click1 - 1.1, 1480], [s.click1 - .1, p1[0], 'io'], [s.click1 + .35, p1[0]], [s.goClick - .1, p2[0], 'io'], [s.goClick + .5, p2[0]], [s.goClick + .9, p2[0] + 120, 'io']],
        y: [[s.click1 - 1.1, 820], [s.click1 - .1, p1[1], 'io'], [s.click1 + .35, p1[1]], [s.goClick - .1, p2[1], 'io'], [s.goClick + .5, p2[1]], [s.goClick + .9, p2[1] + 80, 'io']],
        show: [[0, 0], [s.click1 - 1.1, 0], [s.click1 - .85, 1, 'lin'], [s.goClick + .6, 1], [s.goClick + .9, 0, 'lin']] });
    };
    const s = T.sx;
    segs.push({ a: s.slideI + .3, b: s.click + .9, clicks: [[s.click, btnPos[0] + 40, btnPos[1] + 20]],
      x: [[s.slideI + .35, 1560], [s.click - .12, btnPos[0] + 40, 'io']], y: [[s.slideI + .35, 860], [s.click - .12, btnPos[1] + 20, 'io']],
      show: [[0, 0], [s.slideI + .3, 0], [s.slideI + .65, 1, 'lin'], [s.click + .5, 1], [s.click + .8, 0, 'lin']] });
    for (const g of Object.values(G)) g.need = g.name === 'lms' ? [-1e9, g.outAt + .4] : g.name === 'install' ? [g.inAt - 1.2, g.outAt + .4] : [g.inAt - 1.4, g.outAt + .4];
    return T.duration;
  };
  window.__frame = async function (t) {
    for (const g of Object.values(G)) await ensure(g, t >= g.need[0] && t <= g.need[1]);
    setGroups(t); setCaptions(t); setTag(t); setCard(t); setBackdrop(t); setInstall(t); setCursor(t); setEnd(t); setWindow(t);
    const a = await setThemes(t), b = await setSearch(t), c = await setTable(t);
    setCalendar(t); setReminder(t);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return a || b || c || true;
  };
  window.__duration = () => T.duration;
})();
