// Deterministic composer: every visual state is a pure function of the time t (seconds). render.mjs calls __frame(t) for t = 0, 1/30, 2/30 ... and captures each result.
// The pictures are the real extension running on the invented sample pages; the times come from the sound (out/<scene>/timing.json), so picture and voice cannot drift apart.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const LAND = document.documentElement.classList.contains('land');          // landscape 1920x1080 (LinkedIn): the window fills the frame, captions along the bottom
  const VIEW = LAND ? { w: 1440, h: 810, pw: 1440, ph: 1100 } : { w: 1000, h: 1120, pw: 1000, ph: 1120 };   // w,h: what the window shows; pw,ph: the page behind it (the camera pans over it)
  const OFF = VIEW.w + 100, CX = VIEW.w / 2, CY = VIEW.h / 2;
  const E = { lin: u => u, out: u => 1 - Math.pow(1 - u, 3), in: u => u * u * u, io: u => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2), back: u => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); } };
  // keys: [[time, value, easing-into-this-key], ...]
  function track(keys, t) {
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

  const WIN_S = LAND ? 1.08 : .88;                  // the browser window is drawn a little smaller to leave room for captions (portrait: inside Instagram's safe area)
  const CUR = LAND ? [[1560, 860], [1540, 870]] : [[840, 1240], [860, 1250]];   // where the cursor first appears (themes, install)
  const SL = .55;                                  // how long a slide between pages takes
  const DOT_THEMES = ['navy', 'classic', 'midnight', 'pearl', 'sage', 'rose'];
  let T = null, ready = false, btnPos = [0, 0];                      // T: the timeline, built from the sound
  const G = {};                                     // page groups by name
  const frames = {};                                // the pictures (iframes) that are loaded right now, by name
  const capEls = {};                                // caption elements
  const applied = new Map();

  // ---------------------------------------------------------------- loading
  async function loadFrame(host, page, settings, hideCss) {
    const f = document.createElement('iframe'); f.tabIndex = -1; f.title = ''; host.append(f);
    await new Promise(r => { f.onload = r; f.src = page; });
    await settle(700);
    await post(f, settings, true);
    if (hideCss) { const st = f.contentDocument.createElement('style'); st.textContent = hideCss; f.contentDocument.head.append(st); }
    return f;
  }
  async function post(f, settings, first) {
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
  function group(name, url, withHandle) {
    const el = document.createElement('div'); el.className = 'pg'; el.dataset.name = name;
    const cam = document.createElement('div'); cam.className = 'cam'; el.append(cam);
    let handle = null;
    if (withHandle) { handle = document.createElement('div'); handle.className = 'handle'; handle.innerHTML = '<b></b>'; cam.append(handle); }
    $('view').append(el);
    return (G[name] = { name, url, el, cam, handle, off: [[0, OFF]], S: [[0, 1]], X: [[0, CX]], Y: [[0, CY]], wipe: null, pos: 0 });
  }

  // ---------------------------------------------------------------- the timeline (all times come from the sound)
  function build(timing) {
    const at = {}; for (const l of timing.lines) at[l.id] = l.at;
    const sx = {}; for (const e of timing.sfx) sx[e.id] = e.at;
    T = { duration: timing.duration, at, sx, caps: [] };
    const sentences = timing.lines.flatMap(l => l.sentences).sort((x, y) => x.t0 - y.t0);
    T.caps = sentences.map((sn, i) => ({ t0: sn.t0 - .06, t1: Math.min(sn.t1 + .55, i + 1 < sentences.length ? sentences[i + 1].t0 - .03 : 1e9), words: sn.words, small: sn.small }));

    const w1 = sx.wipe1, w2 = sx.wipe2;
    // page order: lms -> cms -> tt -> theme -> due -> att -> srch -> install ; each slides in from the right and out to the left
    const order = [['lms', null, sx.slide1], ['cms', sx.slide1, sx.slide2], ['tt', sx.slide2, sx.slide3], ['theme', sx.slide3, sx.slide4], ['due', sx.slide4, sx.slide5], ['att', sx.slide5, sx.slide6], ['srch', sx.slide6, sx.slide7], ['install', sx.slide7, sx.end]];
    for (const [name, inAt, outAt] of order) {
      const g = G[name], keys = [];
      if (inAt === null) keys.push([0, 0]); else keys.push([0, OFF], [inAt + .05, OFF], [inAt + .05 + SL, 0, 'io']);
      if (outAt) keys.push([outAt + .05, 0], [outAt + .05 + SL, -OFF, 'io']);
      g.off = keys; g.inAt = inAt; g.outAt = outAt;
    }
    // ----- LMS: stock page, push in, wipe to Campuslit, tour of the new dashboard
    G.lms.S = [[0, 1.0], [w1 - .15, 1.07, 'out'], [w1 + 1.9, 1.02], [w1 + 2.55, 1.5], [sx.slide1, 1.3]];
    G.lms.Y = [[0, 560], [w1 - .15, 380, 'out'], [w1 + 1.9, 560], [w1 + 2.55, 170], [sx.slide1, 640]];
    G.lms.X = [[0, 500], [w1 + 1.9, 500], [w1 + 2.55, 605], [sx.slide1, 605]];
    G.lms.wipe = [[w1 + .15, 0], [w1 + 1.9, 1, 'io']];
    // ----- CMS
    const cin = sx.slide1 + .05 + SL;
    G.cms.S = [[0, 1.0], [w2 + 1.7, 1.0], [sx.slide2, 1.2, 'io']];
    G.cms.X = [[0, 500], [w2 + 1.7, 500], [sx.slide2, 620, 'io']];
    G.cms.Y = [[0, 560], [w2 + 1.7, 560], [sx.slide2, 330, 'io']];
    G.cms.wipe = [[w2 + .15, 0], [w2 + 1.7, 1, 'io']];
    // ----- timetable
    const tin = sx.slide2 + .05 + SL;
    G.tt.S = [[0, 1.0], [tin + .5, 1.0], [sx.slide3, 1.45, 'io']];
    G.tt.X = [[0, 500], [tin + .5, 500], [sx.slide3, 665, 'io']];
    G.tt.Y = [[0, 560], [tin + .5, 560], [sx.slide3, 600, 'io']];
    // ----- themes: stay at scale 1 so the circular reveal reads clearly
    G.theme.S = [[0, 1.0]]; G.theme.X = [[0, 500]]; G.theme.Y = [[0, 560]];
    // ----- extras (cameras tuned per page)
    G.due.S = [[0, 1.0], [sx.slide4 + .7, 1.0], [sx.slide4 + 1.5, 1.4, 'io']];
    G.due.X = [[0, 500], [sx.slide4 + .7, 500], [sx.slide4 + 1.5, 645, 'io']]; G.due.Y = [[0, 560], [sx.slide4 + .7, 560], [sx.slide4 + 1.5, 300, 'io']];
    G.att.S = [[0, 1.0], [sx.slide5 + .7, 1.0], [sx.slide5 + 1.5, 1.4, 'io']];
    G.att.X = [[0, 500], [sx.slide5 + .7, 500], [sx.slide5 + 1.5, 630, 'io']]; G.att.Y = [[0, 560], [sx.slide5 + .7, 560], [sx.slide5 + 1.5, 420, 'io']];
    G.srch.S = [[0, 1.0], [sx.key - .1, 1.0], [sx.key + .7, 1.5, 'io']]; G.srch.X = [[0, 500]]; G.srch.Y = [[0, 560], [sx.key - .1, 560], [sx.key + .7, 300, 'io']];
    if (LAND) landCams(sx, w1, w2);
  }
  // landscape: the pages show their wide desktop layout, so the cameras are tuned again (centres are in page pixels, 1440 wide)
  function landCams(sx, w1, w2) {
    for (const g of Object.values(G)) { g.S = [[0, 1]]; g.X = [[0, CX]]; g.Y = [[0, CY]]; }
    const tin = sx.slide2 + .05 + SL;
    // LMS: stock page pushes in, wipe, then the new dashboard (greeting and course cards)
    G.lms.S = [[0, 1.0], [w1 + 1.9, 1.0], [w1 + 2.55, 1.25], [sx.slide1, 1.25]];
    G.lms.X = [[0, CX], [w1 + 1.9, CX], [w1 + 2.55, 820], [sx.slide1, 860]];
    G.lms.Y = [[0, CY], [w1 + 1.9, CY], [w1 + 2.55, 330], [sx.slide1, 400]];
    G.cms.S = [[0, 1.0], [w2 + 1.7, 1.0], [sx.slide2, 1.2, 'io']];
    G.cms.X = [[0, CX], [w2 + 1.7, CX], [sx.slide2, 800, 'io']]; G.cms.Y = [[0, CY], [w2 + 1.7, CY], [sx.slide2, 340, 'io']];
    G.tt.S = [[0, 1.0], [tin + .5, 1.0], [sx.slide3, 1.2, 'io']];
    G.tt.X = [[0, CX], [tin + .5, CX], [sx.slide3, 850, 'io']]; G.tt.Y = [[0, CY], [tin + .5, CY], [sx.slide3, 345, 'io']];
    G.due.S = [[0, 1.0], [sx.slide4 + .7, 1.0], [sx.slide4 + 1.5, 1.6, 'io']];
    G.due.X = [[0, CX], [sx.slide4 + .7, CX], [sx.slide4 + 1.5, 700, 'io']]; G.due.Y = [[0, CY], [sx.slide4 + .7, CY], [sx.slide4 + 1.5, 250, 'io']];
    G.att.S = [[0, 1.0], [sx.slide5 + .7, 1.0], [sx.slide5 + 1.5, 1.45, 'io']];
    G.att.X = [[0, CX], [sx.slide5 + .7, CX], [sx.slide5 + 1.5, 790, 'io']]; G.att.Y = [[0, CY], [sx.slide5 + .7, CY], [sx.slide5 + 1.5, 390, 'io']];
    G.srch.S = [[0, 1.0], [sx.key - .1, 1.0], [sx.key + .7, 1.5, 'io']];
    G.srch.X = [[0, CX], [sx.key - .1, CX], [sx.key + .7, 720, 'io']]; G.srch.Y = [[0, CY], [sx.key - .1, CY], [sx.key + .7, 270, 'io']];
  }

  // ---------------------------------------------------------------- per-frame state
  function setGroups(t) {
    let urlNow = G.lms.url;
    for (const g of Object.values(G)) {
      const off = track(g.off, t);
      g.pos = off;
      g.el.style.display = Math.abs(off) >= VIEW.w + 1 ? 'none' : '';
      g.el.style.transform = `translateX(${off}px)`;
      if (Math.abs(off) < VIEW.w / 2) urlNow = g.url;
      const s = track(g.S, t);
      const cx = Math.min(VIEW.pw - VIEW.w / 2 / s, Math.max(VIEW.w / 2 / s, track(g.X, t)));
      const cy = Math.min(VIEW.ph - VIEW.h / 2 / s, Math.max(VIEW.h / 2 / s, track(g.Y, t)));
      g.cam.style.transform = `translate(${VIEW.w / 2 - cx * s}px, ${VIEW.h / 2 - cy * s}px) scale(${s})`;
      if (g.wipe) {
        const h = track(g.wipe, t), top = g.cam.querySelectorAll('iframe')[1];
        if (top) top.style.clipPath = `inset(0 ${(1 - h) * 100}% 0 0)`;
        g.handle.style.display = h > .002 && h < .998 ? 'block' : 'none';
        g.handle.style.left = (h * VIEW.pw) + 'px';
        g.handle.style.transform = `scaleX(${1 / Math.max(.5, s)})`;
      }
    }
    if ($('url').textContent !== urlNow) $('url').textContent = urlNow;
    document.querySelector('.bar em').style.visibility = urlNow.startsWith('campuslit') ? 'hidden' : 'visible';
  }
  function setCaptions(t) {
    const host = $('caps');
    host.classList.toggle('endmode', LAND && t >= T.sx.end);      // landscape: captions drop under the closing card
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
        if (LAND) { w.classList.toggle('seen', t >= t0 - .02); const u = (t - t0) / .32; w.style.transform = u > 0 && u < 1 ? `scale(${1 + .06 * Math.sin(Math.PI * u)}) translateY(${-6 * Math.sin(Math.PI * u)}px)` : ''; }
      });
      n++;
    }
    for (let i = n; i in capEls; i++) capEls[i].style.display = 'none';
  }

  // ---------------------------------------------------------------- themes: dock, circular reveal, custom colour sweep
  let seq = [], dots = [], clicks = [], curKeys = null, hueKeys = null, trackBox = null;
  function paletteOf(key) {
    const th = BahriaStudio.themes[key]; return th ? [th.nav, th.accent] : ['#0b1d40', '#2f5bea'];
  }
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
    // the theme sequence: Bahria (navy) first, then one click per tick, then the custom colour
    const s = T.sx, view = $('view').getBoundingClientRect();
    seq = [{ t: 0, key: 'navy', dot: 0 }, { t: s.theme1, key: 'midnight', dot: 2 }, { t: s.theme2, key: 'sage', dot: 4 }, { t: s.theme3, key: 'rose', dot: 5 }, { t: s.theme4, key: 'pearl', dot: 3 }, { t: s.custom, key: 'custom', dot: 6 }];
    seq.forEach(q => { const p = T.dotPos[q.dot]; q.x = (p[0] - (view.left - box.left)) / WIN_S; q.y = (p[1] - (view.top - box.top)) / WIN_S; });
    // custom accent sweeps through green, blue, violet, pink
    hueKeys = [[0, 150], [s.custom + .05, 150], [s.custom + .75, 215, 'io'], [s.custom + 1.35, 280, 'io'], [s.slide4 - .05, 335, 'io']];
    // cursor: arrives at each dot just before its click, then follows the slider knob
    const cx = [[0, CUR[0][0]]], cy = [[0, CUR[0][1]]];
    const startAt = T.sx.slide3 + .3;
    cx.push([startAt, CUR[0][0]]); cy.push([startAt, CUR[0][1]]);
    clicks = [];
    seq.slice(1).forEach(q => { const p = T.dotPos[q.dot]; const a = q.t - .08; cx.push([a, p[0], 'io']); cy.push([a, p[1], 'io']); cx.push([q.t + .12, p[0]]); cy.push([q.t + .12, p[1]]); clicks.push([q.t, p[0], p[1]]); });
    const knob = t => trackBox.x0 + (trackBox.x1 - trackBox.x0) * ((track(hueKeys, t) % 360) / 360);
    const ts = T.sx.custom + .45;
    cx.push([ts, knob(ts), 'io']); cy.push([ts, trackBox.y, 'io']);
    for (let tt = ts + .1; tt < T.sx.slide4 - .05; tt += .1) { cx.push([tt, knob(tt), 'lin']); cy.push([tt, trackBox.y, 'lin']); }
    cx.push([T.sx.slide4, knob(T.sx.slide4 - .06) + 60, 'io']); cy.push([T.sx.slide4, trackBox.y + 80, 'io']);
    curKeys = { x: cx, y: cy, show: [[0, 0], [startAt - .15, 0], [startAt, 1, 'lin'], [T.sx.slide4 - .1, 1], [T.sx.slide4 + .25, 0, 'lin']] };
    T.themeIn = T.sx.slide3 + .05 + SL;
  }
  async function setThemes(t) {
    let k = 0; for (let i = 0; i < seq.length; i++) if (t >= seq[i].t) k = i;
    const cur = seq[k], prev = seq[Math.max(0, k - 1)];
    const reveal = k === 0 ? 1 : ramp(t, cur.t, .85, 'out');
    const A = frames.thA, B = frames.thB;
    if (!A || !B) { $('dock').style.opacity = '0'; return false; }
    const a = await post(A, settingsFor(prev.key, t));
    const b = await post(B, settingsFor(cur.key, t));
    const r = Math.max(0, reveal * 1900);
    B.style.clipPath = `circle(${r}px at ${cur.x}px ${cur.y}px)`;
    // dock
    const dockOn = ramp(t, T.themeIn, .4) * (1 - ramp(t, T.sx.slide4 - .1, .3, 'in'));
    $('dock').style.opacity = String(dockOn);
    const custom = t >= T.sx.custom + .2;
    $('dots').style.opacity = custom ? '0' : '1';
    $('slider').style.opacity = custom ? '1' : '0';
    dots.forEach((d, i) => d.classList.toggle('on', i === cur.dot && t >= cur.t - .02 || (k === 0 && i === 0)));
    const name = cur.key === 'custom' ? 'My theme' : BahriaStudio.themes[cur.key].name;
    if ($('tname').textContent !== name) $('tname').textContent = name;
    const knob = $('slider').querySelector('.track b'); knob.style.left = ((track(hueKeys, t) % 360) / 360 * 100) + '%';
    return a || b;
  }

  // ---------------------------------------------------------------- the search window (Ctrl+K), typed letter by letter
  async function setSearch(t) {
    const f = frames.srch;
    if (!f) { $('keys').style.opacity = '0'; return false; }
    const doc = f.contentDocument, s = T.sx;
    const want = t >= s.key + .05 && t < s.slide7 + .6;
    let typed = 0; for (let i = 1; s['type' + i] !== undefined; i++) if (t >= s['type' + i]) typed = i;
    const text = 'assig'.slice(0, typed);
    const dlg = doc.querySelector('dialog.bs-qs');
    let changed = false;
    if (want && !(dlg && dlg.open)) { doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })); changed = true; await settle(120); }
    if (!want && dlg && dlg.open) { dlg.close(); changed = true; }
    const d2 = doc.querySelector('dialog.bs-qs');
    if (want && d2 && d2.open) {
      const input = d2.querySelector('input');
      if (input.value !== text) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); changed = true; }
    }
    if (changed) { doc.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* done */ } }); await settle(60); }
    // the key cap: pops in, holds, shrinks away as the window opens
    const k = $('keys'), a = ramp(t, s.key - .35, .22, 'back') * (1 - ramp(t, s.key + .45, .2, 'in'));
    k.style.opacity = String(Math.min(1, a)); k.style.transform = `scale(${.7 + .3 * Math.min(1, a)})`;
    return changed;
  }

  // ---------------------------------------------------------------- install card, cursor, ripple, end card
  function buildInstall() {
    const g = group('install', 'campuslit-bu.vercel.app', false); g.el.classList.add('install');
    g.cam.remove();
    g.el.innerHTML = '<svg viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="30" fill="#0b1d40"/><path d="M80.57 81.21A30 30 0 1 1 80.57 46.79" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"/><circle cx="98" cy="64" r="8.5" fill="#f2b84b"/></svg><h1>campus<span>lit</span></h1><p>The redesign for Bahria University</p><div class="row"><b>Free</b><b>Private</b><b>One click</b></div><div class="btn" id="btn">Add to Chrome</div>';
    g.cam = document.createElement('div');   // keeps setGroups happy (no camera on this page)
    g.el.style.transform = 'none';
    const box = $('frame').getBoundingClientRect(), r = $('btn').getBoundingClientRect();
    btnPos = [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
    g.el.style.transform = `translateX(${OFF}px)`;
  }
  function setInstall(t) {
    const s = T.sx, btn = $('btn'), added = t >= s.click;
    btn.classList.toggle('added', added);
    const label = added ? 'Added to Chrome' : 'Add to Chrome';
    if (btn.textContent !== label) btn.textContent = label;
    const press = 1 - .06 * Math.max(0, 1 - Math.abs(t - s.click - .05) / .1);
    btn.style.transform = `scale(${added ? press : 1})`;
  }
  function setCursor(t) {
    let show = 0, x = 0, y = 0;
    const s = T.sx;
    if (curKeys) { show = track(curKeys.show, t); x = track(curKeys.x, t); y = track(curKeys.y, t); }
    // second cursor path: install page
    const a = s.slide7 + .35, b = s.click - .12;
    if (t >= a - .3 && t < s.end) {
      show = ramp(t, a - .3, .3, 'lin') * (1 - ramp(t, s.click + .5, .3, 'lin'));
      x = track([[a, CUR[1][0]], [b, btnPos[0] + 40, 'io']], t); y = track([[a, CUR[1][1]], [b, btnPos[1] + 20, 'io']], t);
    }
    const cu = $('cursor'); cu.style.opacity = String(show);
    const down = [...clicks, [s.click, 0, 0]].some(c => Math.abs(t - c[0] - .04) < .08);
    cu.style.transform = `translate(${x - 13}px, ${y - 7}px) scale(${down ? .86 : 1})`;
    // click ripple
    const list = [...clicks.map(c => [c[0], c[1], c[2]]), [s.click, btnPos[0] + 40, btnPos[1] + 20]];
    let rp = null; for (const c of list) if (t >= c[0] && t - c[0] < .5) rp = c;
    const r = $('ripple');
    if (rp) { const u = (t - rp[0]) / .5; r.style.opacity = String(.95 * (1 - u)); r.style.transform = `translate(${rp[1]}px, ${rp[2]}px) scale(${.3 + 1.1 * E.out(u)})`; }
    else r.style.opacity = '0';
  }
  function setEnd(t) {
    const e = T.sx.end, u = ramp(t, e - .1, .5, 'io');
    $('end').style.opacity = String(u);
    if (!LAND) { const w = $('win'); w.style.opacity = String(1 - u); w.style.transform = `scale(${WIN_S * (1 - .06 * u)})`; }
    $('ring').style.strokeDasharray = '1'; $('ring').style.strokeDashoffset = String(1 - ramp(t, e + .15, .85, 'io'));
    const d = ramp(t, e + 1.0, .5, 'back'); $('dot').setAttribute('r', String(8.5 * d));
    const mk = $('mark'); const pop = ramp(t, e - .05, .6, 'back'); mk.style.transform = `scale(${.6 + .4 * pop})`; mk.style.opacity = String(Math.min(1, pop * 2));
    const rise = (id, at) => { const el = $(id), v = ramp(t, e + at, .5, 'out'); el.style.opacity = String(v); el.style.transform = `translateY(${(1 - v) * 34}px)`; };
    rise('word', .5); rise('tag', .7); rise('chips', .9); rise('site', 1.1); rise('fine', 1.4);
  }
  function setWindow(t) {
    const w = $('win'), s = T.sx, endU = ramp(t, s.end - .1, .5, 'io');
    const e = ramp(t, 0, 2.2, 'out'), tilt = 1 - e;
    const calm = Math.max(ramp(t, s.slide3 - .3, .4, 'lin') * (1 - ramp(t, s.slide4 + .2, .4, 'lin')), ramp(t, s.slide7 - .2, .4, 'lin'));   // no sway while the cursor has to hit the dock and the button
    const fl = 1 - calm;
    let ry = -17 * tilt + fl * 1.2 * Math.sin(t * .9), rx = 13 * tilt + fl * .7 * Math.sin(t * .7 + 1), sc = WIN_S * (.84 + .16 * e), dz = -140 * tilt;
    let sw = 0; for (let i = 1; i <= 7; i++) { const u = (t - s['slide' + i] - .05) / SL; if (u > 0 && u < 1) sw = Math.max(sw, Math.sin(Math.PI * u)); }
    ry += 6 * sw; sc *= 1 - .03 * sw;
    if (t > s.hit1) sc *= 1 + .028 * Math.exp(-(t - s.hit1) * 7);
    sc *= 1 - .06 * endU;
    w.style.opacity = String(1 - endU);
    w.style.transform = `translateZ(${dz}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${sc})`;
    // glare sweeping over the window at every page change and both reveals
    let sh = null; for (const a of [s.wipe1 + .15, s.wipe2 + .15, ...[1, 2, 3, 4, 5, 6, 7].map(i => s['slide' + i] + .05)]) { const u = (t - a) / .75; if (u > 0 && u < 1) sh = u; }
    const el = $('shine'); el.style.opacity = sh === null ? '0' : String(.9 * Math.sin(Math.PI * sh)); el.style.transform = `translateX(${((sh || 0) * 2 - 1) * 100}%)`;
  }
  function setBackdrop(t) {
    if (LAND) {
      $('orbA').style.transform = `translate(${240 + 120 * Math.sin(t * .31)}px, ${60 + 80 * Math.cos(t * .27)}px)`;
      $('orbB').style.transform = `translate(${1180 + 140 * Math.cos(t * .23)}px, ${420 + 90 * Math.sin(t * .35)}px)`;
      $('orbC').style.transform = `translate(${700 + 160 * Math.sin(t * .19 + 2)}px, ${-120 + 70 * Math.cos(t * .3)}px)`;
      $('bar').firstElementChild.style.width = (100 * clamp01(t / T.duration)) + '%';
    }
    $('glow').style.transform = `scale(${1 + .04 * Math.sin(t * 1.3)})`; $('glow').style.opacity = String(.72 + .1 * Math.sin(t * .9));
    $('grid').style.backgroundPosition = `0 ${(t * 9) % 72}px`;
  }

  // ---------------------------------------------------------------- pages are loaded when needed and dropped when done (keeps memory low on a small PC)
  async function ensure(g, want) {
    if (!g.specs) return;
    if (want && !g.loaded) {
      g.loaded = true;
      g.el.style.display = ''; g.el.style.transform = 'none'; g.el.style.zIndex = '50';      // shown once, so scroll-reveals and entrance animations finish before any frame is captured
      for (const [key, page, settings, hide] of g.specs) frames[key] = await loadFrame(g.cam, page, settings, hide);
      if (g.handle) g.cam.append(g.handle);
      await settle(900);
      for (const f of g.cam.querySelectorAll('iframe')) f.contentDocument.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* done */ } });
      g.el.style.zIndex = '';
    } else if (!want && g.loaded) {
      g.loaded = false;
      for (const [key] of g.specs) { const f = frames[key]; if (f) { applied.delete(f); f.remove(); delete frames[key]; } }
    }
  }

  // ---------------------------------------------------------------- init / frame
  window.__init = async function (name) {
    const sc = name || 'full';
    const timing = await (await fetch('/__out/' + sc + '/timing.json', { cache: 'no-store' })).json();
    const gl = group('lms', 'lms.bahria.edu.pk', true), gc = group('cms', 'cms.bahria.edu.pk', true), gt = group('tt', 'cms.bahria.edu.pk', false);
    const gh = group('theme', 'lms.bahria.edu.pk', false), gd = group('due', 'lms.bahria.edu.pk', false), ga = group('att', 'cms.bahria.edu.pk', false), gs = group('srch', 'lms.bahria.edu.pk', false);
    const navy = { theme: 'navy' }, off = { enabled: false };
    const LMS = '/preview/lms/dashboard.html', CMS = '/preview/cms/dashboard.html', TT = '/preview/cms/timetable.html', ATT = '/preview/cms/attendance.html';
    const HIDE = '.bs-remind, .bs-tip { display: none !important; }';
    gl.specs = [['lmsOld', LMS, off], ['lmsNew', LMS, navy]]; gc.specs = [['cmsOld', CMS, off], ['cmsNew', CMS, navy]]; gt.specs = [['ttNew', TT, navy]];
    gh.specs = [['thA', LMS, navy, HIDE], ['thB', LMS, navy, HIDE]]; gd.specs = [['due', '/preview/lms/assignments.html', navy, '.bs-remind { display: none !important; }']];
    ga.specs = [['att', ATT, navy]]; gs.specs = [['srch', LMS, navy]];
    buildInstall(); build(timing); buildDock();
    for (const g of Object.values(G)) g.need = [g.inAt == null ? -1e9 : g.inAt - 1.2, (g.outAt || 1e9) + .05 + SL + .4];
    ready = true; return T.duration;
  };
  window.__frame = async function (t) {
    for (const g of Object.values(G)) await ensure(g, t >= g.need[0] && t <= g.need[1]);
    setGroups(t); setCaptions(t); setBackdrop(t); setInstall(t); setCursor(t); setEnd(t); if (LAND) setWindow(t);
    const a = await setThemes(t), b = await setSearch(t);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return a || b || true;
  };
  window.__duration = () => T.duration;
})();
