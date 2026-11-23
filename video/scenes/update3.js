// "What's new in Campuslit 1.3" built from real screenshots (video/shots, git-ignored). Deterministic: every picture is a pure function of the time t.
// A camera (centre x/y in screenshot pixels + zoom) pans over each landscape screenshot so it fills the portrait window.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const E = { lin: u => u, out: u => 1 - Math.pow(1 - u, 3), in: u => u * u * u, io: u => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2), back: u => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); } };
  const clamp01 = u => Math.max(0, Math.min(1, u));
  const ramp = (t, a, d, ease) => (E[ease || 'out'])(clamp01((t - a) / d));
  const win = (t, a, b, d) => ramp(t, a, d || .35) * (1 - ramp(t, b, d || .35));
  const lerp = (a, b, u) => a + (b - a) * u;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const VW = 1920, VH = 1080, OX = 0, OY = 0;   // the window's picture area inside the 1080x1920 frame

  const C = { hookEnd: 4.7, steps: 4.9, endIn: 38.1, count: [38.6, 40.4], confettiAt: 39.0, duration: 47.5 };
  const STEPS = ['Preview', 'Download all', 'Marks', 'Share theme', 'Next class'], stepAt = [4.7, 12.8, 16.8, 25.1, 32.9];
  // layers: file, visible from/to, camera keys [t, cx, cy, zoom], highlight boxes (screenshot pixels), blur patches
  const L = [
    { id: 'notes', f: '01_notes.png', a: 4.6, b: 6.45, cam: [[4.6, 950, 404, .74], [5.9, 1157, 521, 1.5]] },
    { id: 'load', f: '2a_previewLoading.png', a: 6.35, b: 7.6, rings: [{ cx: 959.5, cy: 226.5, s: 6.45, e: 7.45 }], cam: [[6.35, 960, 446, 1.2], [7.6, 960, 412, 1.3]] },
    { id: 'pdf', zm: 1, f: '2b_previewOpen.png', a: 7.5, b: 10.15, cam: [[7.5, 960, 563, .95], [10.1, 960, 535, 1.0]] },
    { id: 'docx', zm: 1, f: 'docx_preview.png', a: 10.05, b: 12.95, cam: [[10.05, 960, 546, .98], [12.9, 960, 535, 1.0]], blur: [[413, 49, 530, 26]] },
    { id: 'notes2', f: '01_notes.png', a: 12.8, b: 14.15, cam: [[12.8, 1300, 250, .9], [13.9, 1740, 228, 1.5]] },
    { id: 'dl', f: '5_downloadAll.png', a: 14.05, b: 15.7, rings: [{ cx: 960, cy: 394, s: 14.15, e: 15.55, label: { x: 960, y: 471, w: 240, h: 26, fmt: p => 'Downloading ' + Math.max(1, Math.min(15, Math.ceil(p * 15))) + ' of 15' } }], cam: [[14.05, 960, 410, 1.3], [15.7, 960, 410, 1.42]] },
    { id: 'done', f: '5_downloaded.png', a: 15.6, b: 17.05, cam: [[15.6, 888, 340, 1.35], [17.0, 888, 340, 1.45]] },
    { id: 'qbtn', f: 'marks_overview_button.png', a: 16.9, b: 19.2, cam: [[16.9, 1100, 300, .72], [18.6, 1755, 213, 1.4]] },
    { id: 'mload', f: 'marks_overview_loading.png', a: 19.05, b: 21.4, rings: [{ cx: 960, cy: 236.5, s: 19.15, e: 21.25, label: { x: 960, y: 314, w: 200, h: 26, fmt: p => 'Reading ' + Math.max(1, Math.min(10, Math.ceil(p * 10))) + ' of 10' } }], cam: [[19.05, 960, 446, 1.2], [21.35, 960, 405, 1.32]] },
    { id: 'mres', zm: 1, f: '7_marks_showing_popup.png', a: 21.3, b: 25.5, cam: [[21.3, 960, 422, 1.0], [25.4, 960, 422, 1.0]], hl: [[1105, 133, 350, 72, 22.6, 24.2], [1325, 372, 105, 30, 24.2, 25.4], [1325, 439, 105, 30, 24.4, 25.4], [1325, 601, 105, 30, 24.6, 25.4]] },
    { id: 'theme', f: 'theme_change.png', a: 25.1, b: 30.5, cam: [[25.1, 950, 300, .62], [26.3, 790, 275, 1.4], [28.0, 790, 275, 1.4], [28.9, 1485, 275, 1.4]], hl: [[467, 242, 648, 64, 25.8, 27.6], [1160, 242, 650, 64, 28.8, 30.4]] },
    { id: 'blue', zm: 1, f: 'portalin_blue.png', a: 30.2, b: 33.1, cam: [[30.2, 640, 430, 1.3], [33.0, 640, 430, 1.34]] },
    { id: 'green', zm: 1, f: 'portalin_green.png', a: 30.2, b: 33.1, cam: [[30.2, 640, 430, 1.3], [33.0, 640, 430, 1.34]], reveal: [30.9, 31.9] },
    { id: 'next', zm: 1.2, f: '10_next_class.png', a: 32.95, b: 38.3, cam: [[32.95, 1100, 300, .66], [34.4, 1100, 380, 1.0], [37.5, 1100, 385, 1.04]], hl: [[340, 325, 1518, 112, 34.0, 37.2]] }
  ];
  const byId = {}; for (const l of L) byId[l.id] = l;
  const FADE = .6;
  for (let i = 0; i < L.length - 1; i++) { const n = L[i + 1]; if (L[i].id === 'blue' || L[i].id === 'green') continue; L[i].b = n.a + FADE; }
  byId.blue.b = byId.next.a + FADE; byId.green.b = byId.next.a + FADE;
  const LANDCAM = {
    notes: [[4.6, 960, 404, 1.0], [5.9, 1150, 440, 1.6]],
    load: [[6.35, 960, 418, 1.0], [7.6, 960, 418, 1.4]],
    pdf: [[7.5, 960, 417, 1.0], [10.1, 960, 417, 1.36]],
    docx: [[10.05, 960, 417, 1.0], [12.9, 960, 417, 1.36]],
    notes2: [[12.8, 960, 404, 1.0], [13.9, 1350, 330, 1.6]],
    dl: [[14.05, 960, 450, 1.5], [15.7, 960, 450, 1.65]],
    done: [[15.6, 888, 380, 1.5], [17.0, 888, 380, 1.65]],
    qbtn: [[16.9, 960, 419, 1.0], [18.6, 1300, 330, 1.7]],
    mload: [[19.05, 960, 418, 1.0], [21.35, 960, 418, 1.45]],
    mres: [[21.3, 960, 422, 1.3], [25.4, 960, 430, 1.34]],
    theme: [[25.1, 960, 408, 1.0], [26.3, 800, 400, 1.7], [28.0, 800, 400, 1.7], [28.9, 1250, 400, 1.7]],
    blue: [[30.2, 960, 415, 1.0], [33.0, 960, 415, 1.06]],
    green: [[30.2, 960, 415, 1.0], [33.0, 960, 415, 1.06]],
    next: [[32.95, 950, 415, 1.0], [34.4, 1100, 360, 1.24], [37.5, 1100, 365, 1.28]]
  };
  for (const id in LANDCAM) byId[id].cam = LANDCAM[id];
  const LABELS = [[7.6, 9.9, 'No download needed'], [10.25, 12.6, 'PDF, Word, Slides and more'], [21.6, 23.5, 'Every course, one table'], [23.7, 25.3, 'Not marked = not graded yet'], [26.0, 27.8, 'Copy your theme code'], [29.0, 30.3, 'Paste a friend’s code'], [31.3, 33.0, 'Same look, in seconds'], [34.0, 37.3, 'Your next class, on the dashboard']];
  // clicks: [time, layer, x, y] in screenshot pixels
  const CLICKS = [[6.3, 'notes', 1157, 521], [14.0, 'notes2', 1740, 228], [18.9, 'qbtn', 1755, 213], [26.9, 'theme', 1020, 275], [30.25, 'theme', 1729, 276]];
  let T = null; const P = { caps: {}, size: {} };

  function camAt(l, t) { const c = camRaw(l, t), W = l.img.naturalWidth || 1900, H = l.img.naturalHeight || 830; c[2] = Math.max(VW / W, VH / H, c[2]); const z = c[2]; c[0] = W * z >= VW ? Math.min(Math.max(c[0], VW / 2 / z), W - VW / 2 / z) : W / 2; c[1] = H * z >= VH ? Math.min(Math.max(c[1], VH / 2 / z), H - VH / 2 / z) : H / 2; return c; }
  function camRaw(l, t) {
    const k = l.cam; if (t <= k[0][0]) return k[0].slice(1);
    for (let i = 0; i < k.length - 1; i++) if (t < k[i + 1][0]) { const u = E.io(clamp01((t - k[i][0]) / (k[i + 1][0] - k[i][0]))); return [1, 2, 3].map(j => lerp(k[i][j], k[i + 1][j], u)); }
    return k[k.length - 1].slice(1);
  }
  const toFrame = (l, t, x, y) => { const [cx, cy, z] = camAt(l, t); return [OX + VW / 2 + (x - cx) * z, OY + VH / 2 + (y - cy) * z]; };

  function build(timing) {
    T = { caps: timing.lines.flatMap(l => l.sentences).sort((x, y) => x.t0 - y.t0).map((sn, i, all) => ({ t0: sn.t0 - .06, t1: Math.min(sn.t1 + .5, i + 1 < all.length ? all[i + 1].t0 - .03 : 1e9), words: sn.words })) };
    const view = $('view');
    for (const l of L) {
      const el = h('div', 'shot'), img = new Image(); img.src = '/__shots/' + l.f; el.append(img); l.el = el; l.img = img;
      const bg = h('div', 'shotbg'); bg.style.backgroundImage = 'url(/__shots/' + l.f + ')'; l.bg = bg; view.append(bg);
      for (const [x, y, w, hh] of (l.blur || [])) { const b = h('div'); b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hh}px;backdrop-filter:blur(14px);background:rgba(255,255,255,.72);border-radius:6px`; el.append(b); }
      l.rg = (l.rings || []).map(o => { const R = 38.5, circ = 2 * Math.PI * R, d = h('div'); d.style.cssText = 'position:absolute;left:' + (o.cx - 46) + 'px;top:' + (o.cy - 46) + 'px;width:92px;height:92px;background:#f3f5fa;border-radius:50%'; d.innerHTML = '<svg viewBox="0 0 92 92" width="92" height="92" style="transform:rotate(-90deg);position:absolute;left:0;top:0"><circle cx="46" cy="46" r="' + R + '" fill="none" stroke="#e1e7f3" stroke-width="5.5"/><circle class="arc" cx="46" cy="46" r="' + R + '" fill="none" stroke="#2f5bea" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ + '"/></svg><div class="pc" style="position:absolute;inset:0;display:grid;place-items:center;font:800 20px Jakarta,sans-serif;color:#0b1d40">0%</div>'; el.append(d); let lab = null; if (o.label) { lab = h('div'); lab.style.cssText = 'position:absolute;left:' + (o.label.x - o.label.w / 2) + 'px;top:' + (o.label.y - o.label.h / 2) + 'px;width:' + o.label.w + 'px;height:' + o.label.h + 'px;background:#f3f5fa;display:grid;place-items:center;font:600 17.5px Jakarta,sans-serif;color:#4a5878;white-space:nowrap'; el.append(lab); } return { o, d, arc: d.querySelector('.arc'), pc: d.querySelector('.pc'), lab, circ }; });
      l.hls = (l.hl || []).map(([x, y, w, hh, a, b]) => { const d = h('div', 'hl'); d.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${hh}px`; el.append(d); return { d, a, b }; });
      view.append(el);
    }
    $('steps').append(...STEPS.map(s => h('b', null, s)));
    STEPS.forEach((s, i) => $('hk-list').append(h('div', null, `<b>${i + 1}</b>${s}`)));
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; const cols = ['#f2b84b', '#ffd88a', '#2f5bea', '#8fb0ff', '#ffffff', '#ff7a8a'];
    P.conf = Array.from({ length: 90 }, () => { const e = h('i'); e.style.background = cols[Math.floor(rnd() * cols.length)]; $('confetti').append(e); return { e, x: 100 + rnd() * 1720, vx: (rnd() - .5) * 700, vy: -(500 + rnd() * 900), d: rnd() * .5, r: rnd() * 720 - 360 }; });
  }

  function frame(t) {
    const w = $('win');
    // hook
    const hk = $('hook'), hu = win(t, 0.05, C.hookEnd, .35); hk.style.opacity = String(hu); hk.style.display = hu > 0 ? '' : 'none';
    hk.style.transform = `scale(${.9 + .1 * ramp(t, .05, .5, 'back')}) translateY(${-ramp(t, C.hookEnd - .2, .4, 'in') * 60}px)`;
    [...$('hk-list').children].forEach((d, i) => { const u = ramp(t, 1.0 + i * .38, .4, 'back'); d.style.opacity = String(Math.min(1, u * 2)); d.style.transform = `translateX(${(1 - u) * 120}px)`; });
    w.style.opacity = String(ramp(t, C.hookEnd - .5, .5) * (1 - ramp(t, C.endIn - .1, .5, 'io'))); w.style.transform = `scale(${.94 + .06 * ramp(t, C.hookEnd - .5, .6)})`;
    const st = $('steps'); st.style.opacity = String(ramp(t, C.steps, .4) * (1 - ramp(t, C.endIn - .2, .3)));
    $('glass').style.opacity = st.style.opacity; const cur = stepAt.filter(s => t >= s - .01).length - 1; [...st.children].forEach((e, i) => { e.className = i === cur ? 'on' : i < cur ? 'done' : ''; });
    $('url').textContent = t < 16.8 ? 'lms.bahria.edu.pk/LectureNotes' : t < 25.1 ? 'lms.bahria.edu.pk/Quizzes' : t < 30.2 ? 'Campuslit settings' : 'lms.bahria.edu.pk';
    // screenshots
    for (const l of L) {
      const visible = l.id === 'green' ? ramp(t, l.a, .2) * (1 - ramp(t, l.b - FADE, FADE, 'io')) : ramp(t, l.a, FADE, 'io') * (1 - ramp(t, l.b - FADE, FADE, 'io')), inU = ramp(t, l.a, .95, 'out'), outU = ramp(t, l.b - FADE, FADE, 'in'), zk = (1 + .07 * (1 - inU)) * (1 + .035 * outU);
      l.el.style.opacity = String(visible); l.el.style.display = visible > 0 ? '' : 'none'; l.bg.style.opacity = String(visible); l.bg.style.display = l.el.style.display;
      if (visible <= 0) continue;
      const [cx, cy, z0] = camAt(l, t), z = z0 * zk; l.el.style.transform = `translate(${VW / 2 - cx * z}px, ${VH / 2 - cy * z}px) scale(${z})`;
      if (l.reveal) { l.bg.style.clipPath = 'circle(' + (ramp(t, l.reveal[0], l.reveal[1] - l.reveal[0], 'io') * 2600) + 'px at 50% 45%)'; const r = ramp(t, l.reveal[0], l.reveal[1] - l.reveal[0], 'io'); l.el.style.clipPath = `circle(${r * 2600}px at ${l.img.naturalWidth * .5}px ${l.img.naturalHeight * .45}px)`; }
      for (const g of l.rg) { const p = ramp(t, g.o.s, g.o.e - g.o.s, 'io'); g.arc.style.strokeDashoffset = String(g.circ * (1 - p)); g.pc.textContent = Math.round(p * 100) + '%'; if (g.lab) g.lab.textContent = g.o.label.fmt(p); }
      for (const o of l.hls) { const u = win(t, o.a, o.b, .25); o.d.style.opacity = String(u * (.75 + .25 * Math.sin(t * 9))); o.d.style.transform = `scale(${1 + .03 * Math.sin(t * 9)})`; }
    }
    // labels
    const lb = $('label'); let best = null; for (const [a, b, txt] of LABELS) { const u = win(t, a, b, .2); if (u > 0 && (!best || u > best[0])) best = [u, txt]; }
    lb.style.opacity = '0'; if (best) { lb.textContent = best[1]; lb.style.transform = `translateX(-50%) translateY(${(1 - best[0]) * 20}px)`; }
    // end card
    const eu = ramp(t, C.endIn, .45, 'io'); $('end').style.opacity = String(eu); $('end').style.display = eu > 0 ? '' : 'none';
    const cu = E.out(clamp01((t - C.count[0]) / (C.count[1] - C.count[0]))); $('en-n').textContent = String(Math.round(850 * cu));
    $('en-num').style.transform = `scale(${1 + .06 * Math.exp(-Math.max(0, t - C.count[1]) * 6) * (t >= C.count[1] ? 1 : 0)})`;
    [['en-kicker', 0], ['en-sub', 1.0], ['en-brand', 1.5], ['en-chips', 1.9], ['en-site', 2.3], ['en-fine', 2.6]].forEach(([id, d]) => { const u = ramp(t, C.endIn + .3 + d, .5); $(id).style.opacity = String(u); $(id).style.transform = `translateY(${(1 - u) * 34}px)`; });
    $('en-num').style.opacity = String(ramp(t, C.endIn + .2, .4));
    for (const c of P.conf) { const s = t - C.confettiAt - c.d; if (s < 0 || s > 3.4) { c.e.style.opacity = '0'; continue; } c.e.style.opacity = String(Math.min(1, 3.4 - s)); c.e.style.transform = `translate(${c.x + c.vx * s * .6}px, ${520 + c.vy * s * .5 + 800 * s * s}px) rotate(${c.r * s}deg)`; }
    // captions
    const host = $('caps'); let n = 0;
    for (const c of T.caps) {
      if (t < c.t0 || t > c.t1) continue;
      const age = t - c.t0, left = c.t1 - t, el = P.caps[n] || (P.caps[n] = (() => { const d = h('div', 'cap'); host.append(d); return d; })());
      if (el.dataset.key !== String(c.t0)) { el.dataset.key = String(c.t0); el.textContent = ''; for (const wd of c.words) { const s = h('span', 'w', null); s.textContent = wd.w; s.dataset.t = wd.t0; s.dataset.e = wd.t1; el.append(s); } }
      el.style.display = 'flex'; const a = E.out(Math.min(1, age / .22)), b = Math.min(1, left / .16); el.style.opacity = String(Math.min(a, b)); el.style.transform = `translateY(${(1 - a) * 22}px) scale(${.94 + .06 * a})`;
      el.querySelectorAll('.w').forEach(wd => { const t0 = +wd.dataset.t; wd.classList.toggle('on', t >= t0 && t < Math.max(+wd.dataset.e, t0 + .25)); });
      n++;
    }
    for (let i = n; i in P.caps; i++) P.caps[i].style.display = 'none';
    // cursor: it glides to each click point (kept in step with the camera), clicks, and drifts away
    let show = 0, x = 0, y = 0, ripple = null;
    for (const [ct, id, sx, sy] of CLICKS) {
      if (t < ct - 1.0 || t > ct + .75) continue;
      const l = byId[id], target = toFrame(l, Math.min(t, ct), sx, sy), start = [target[0] + 260, target[1] + 200];
      const u = E.io(clamp01((t - (ct - 1.0)) / .95)), d = ramp(t, ct, .7, 'out');
      x = lerp(start[0], target[0], u) + 50 * d; y = lerp(start[1], target[1], u) + 60 * d;
      if (t > ct) { const p = toFrame(l, t, sx, sy); x = p[0] + 50 * d; y = p[1] + 60 * d; }
      show = ramp(t, ct - 1.0, .25, 'lin') * (1 - ramp(t, ct + .45, .3, 'lin'));
      if (t >= ct && t - ct < .5) ripple = [(t - ct) / .5, toFrame(l, t, sx, sy)];
    }
    const down = CLICKS.some(c => Math.abs(t - c[0] - .05) < .08);
    $('cursor').style.opacity = String(show); $('cursor').style.transform = `translate(${x - 14}px, ${y - 8}px) scale(${down ? .86 : 1})`;
    const r = $('ripple'); if (ripple) { r.style.opacity = String(.95 * (1 - ripple[0])); r.style.left = ripple[1][0] + 'px'; r.style.top = ripple[1][1] + 'px'; r.style.transform = `scale(${.3 + 1.1 * E.out(ripple[0])})`; } else r.style.opacity = '0';
    $('bar').firstElementChild.style.width = (100 * clamp01(t / C.duration)) + '%'; $('glow').style.transform = `scale(${1 + .04 * Math.sin(t * 1.3)})`; $('grid').style.backgroundPosition = `0 ${(t * 9) % 72}px`;
  }
  window.__init = async function (name) {
    const timing = await (await fetch('/__out/' + (name || 'update') + '/timing.json', { cache: 'no-store' })).json();
    build(timing); await Promise.all(L.map(l => l.img.decode().catch(() => null)));
    if (window.PLAIN) for (const l of L) { const cv = document.createElement('canvas'), W = l.img.naturalWidth, H = l.img.naturalHeight; cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.drawImage(l.img, 0, 0); const avg = y => { const d = cx.getImageData(Math.round(W * .3), y, Math.round(W * .5), 1).data; let s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } const n = d.length / 4; return 'rgb(' + s.map(v => Math.round(v / n)).join(',') + ')'; }; l.bg.style.backgroundImage = 'linear-gradient(to bottom, ' + avg(2) + ' 50%, ' + avg(H - 3) + ' 50%)'; l.bg.style.filter = 'none'; l.bg.style.left = '0'; l.bg.style.top = '0'; l.bg.style.width = VW + 'px'; l.bg.style.height = VH + 'px'; }
    return C.duration;
  };
  window.__frame = async function (t) { frame(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; };
})();
