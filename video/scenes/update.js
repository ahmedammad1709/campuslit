// "What's new in Campuslit 1.3": deterministic composer. Every picture is a pure function of the time t (seconds); render.mjs calls __frame(t) for every frame.
// All data is invented (Ammad, invented courses and marks). Nothing here touches a real portal.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const E = { lin: u => u, out: u => 1 - Math.pow(1 - u, 3), in: u => u * u * u, io: u => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2), back: u => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); } };
  const clamp01 = u => Math.max(0, Math.min(1, u));
  const ramp = (t, a, d, ease) => (E[ease || 'out'])(clamp01((t - a) / d));
  const win = (t, a, b, d) => ramp(t, a, d || .35) * (1 - ramp(t, b, d || .35));   // 0 -> 1 -> 0 between a and b
  const lerp = (a, b, u) => a + (b - a) * u;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const mix = (c1, c2, u) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const a = p(c1), b = p(c2); return '#' + a.map((v, i) => Math.round(lerp(v, b[i], u)).toString(16).padStart(2, '0')).join(''); };

  // ------------------------------------------------------------ the timeline (seconds). The voice lines in script.json start at the same times.
  const C = {
    hookEnd: 4.7, steps: 4.9,
    notesIn: 4.7, notesOut: 17.0,
    click1: 6.3, v1: [6.4, 8.5], click2: 8.75, v2: [8.85, 10.65], click3: 10.95, v3: [11.05, 12.85],
    dlClick: 14.0, dl: [14.1, 18.4], dlRun: [14.5, 16.7],
    quizIn: 16.8, quizOut: 25.4, mkClick: 18.9, mk: [19.0, 21.4], mkRun: [19.3, 20.9], res: [21.2, 25.6], mkSwitch: 23.6,
    themeIn: 25.2, themeOut: 33.1,
    copyClick: 26.7, youOut: 27.9, chat: [27.7, 29.8], msgAt: 28.3, friend: [29.6, 33.2], typeAt: [30.0, 30.9], addClick: 31.15, recolor: [31.2, 32.2],
    nextIn: 33.0, nextOut: 38.2,
    endIn: 38.1, count: [38.6, 40.4], confettiAt: 39.0,
    duration: 47.5
  };
  const STEPS = ['Preview', 'Download all', 'Marks', 'Share theme', 'Next class'];
  const stepAt = [C.notesIn, C.dlClick - .3, C.quizIn, C.themeIn, C.nextIn];
  let T = null; const P = {}, cursorKeys = [], clicks = [];

  // ------------------------------------------------------------ pages
  const ico = (ext, bg) => `<div class="ico" style="background:${bg}">${ext}</div>`;
  const FILES = [['Lecture 7 - Trees', 'PPTX', '#e8590c', '2.4 MB'], ['Marks Sheet', 'XLSX', '#1f9d63', '86 KB'], ['Lab Files', 'ZIP', '#d99a1c', '5.1 MB'], ['Lecture 6 - Graphs', 'PDF', '#d6336c', '1.8 MB'], ['Assignment 2', 'DOCX', '#2f5bea', '212 KB']];
  function ring(size, stroke, color) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const s = `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e3e9f6" stroke-width="${stroke}"/><circle class="arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg><div class="pc">0%</div>`;
    return { html: s, c };
  }
  function setRing(box, c, u, color) { const a = box.querySelector('.arc'); a.style.strokeDashoffset = String(c * (1 - clamp01(u))); if (color) a.setAttribute('stroke', color); box.querySelector('.pc').textContent = Math.round(clamp01(u) * 100) + '%'; }

  function buildNotes() {
    const pg = h('div', 'page'); pg.append(h('div', 'hd', '<small>Data Structures</small><h1>Lecture Notes</h1>'));
    const body = h('div', 'body'); body.append(h('div', 'sel', '<b><span>Semester</span>Fall 2026</b><b><span>Course</span>Data Structures</b>'));
    const bar = h('div', 'dlbar', '<span>9 files in this course</span>'); const dla = h('div', 'btn', 'Download all (9)'); bar.append(dla); body.append(bar);
    FILES.forEach((f, i) => { const r = h('div', 'row', `${ico(f[1], f[2])}<div class="nm"><b>${f[0]}.${f[1].toLowerCase()}</b><span>${f[3]} &middot; Week ${7 - i}</span></div>`); const pv = h('div', 'btn sm', 'Preview'), dl = h('div', 'btn sm ghost', 'Download'); r.append(pv, dl); body.append(r); P['prev' + i] = pv; });
    P.dlall = dla; pg.append(body);
    // viewers
    pg.append(h('div', 'scrim'));
    const mkv = (name, title, bodyHtml) => { const v = h('div', 'vw', `<div class="vh">${title}<b>&times;</b></div><div class="vb">${bodyHtml}</div>`); const rb = ring(190, 16, '#2f5bea'); const ld = h('div', 'loading'); const inner = h('div', null, '<div class="ringbox">' + rb.html + '</div>Opening&hellip;'); ld.append(inner); v.append(ld); P[name] = { el: v, ld, rb, box: inner.firstChild }; pg.append(v); };
    mkv('vw1', 'Lecture 7 - Trees.pptx', '<div class="slide s1"><h2>Binary Trees</h2><p>Lecture 7 &middot; Data Structures</p></div><div class="slide s2"><h3>Key ideas</h3><ul><li>Root, parent, child</li><li>Depth and height</li><li>Traversals</li></ul><svg width="200" height="170" viewBox="0 0 200 170"><g stroke="#9db3ee" stroke-width="5"><path d="M100 24 60 80M100 24 140 80M60 80 34 140M60 80 86 140M140 80 114 140M140 80 166 140"/></g><g fill="#2f5bea"><circle cx="100" cy="24" r="20"/><circle cx="60" cy="80" r="18"/><circle cx="140" cy="80" r="18"/><circle cx="34" cy="140" r="16"/><circle cx="86" cy="140" r="16"/><circle cx="114" cy="140" r="16"/><circle cx="166" cy="140" r="16"/></g></svg></div><div class="slidenav"><b>&lsaquo;</b><span id="pg">1 / 24</span><b>&rsaquo;</b></div><div class="thumbs"><i class="on"></i><i></i><i></i><i></i><i></i></div>');
    mkv('vw2', 'Marks Sheet.xlsx', '<table class="sheet"><tr><th></th><th>Student</th><th>Quiz 1</th><th>Quiz 2</th><th>Total</th></tr><tr><td>1</td><td>Ayesha K.</td><td class="n">8.5</td><td class="n">9</td><td class="n">17.5</td></tr><tr><td>2</td><td>Ammad A.</td><td class="n">9</td><td class="n">10</td><td class="n">19</td></tr><tr><td>3</td><td>Hamza R.</td><td class="n">7</td><td class="n">8.5</td><td class="n">15.5</td></tr><tr><td>4</td><td>Sana M.</td><td class="n">10</td><td class="n">9.5</td><td class="n">19.5</td></tr><tr><td>5</td><td>Bilal S.</td><td class="n">6.5</td><td class="n">7</td><td class="n">13.5</td></tr></table><div class="tabs"><b class="on">Quizzes</b><b>Assignments</b><b>Attendance</b></div>');
    mkv('vw3', 'Lab Files.zip', '<div class="zrow"><div class="ico" style="background:#6b7a99;width:54px;height:54px">TXT</div>readme.txt<span>1 KB</span></div><div class="zrow"><div class="ico" style="background:#2f5bea;width:54px;height:54px">DOCX</div>Lab 1 - Arrays.docx<span>64 KB</span></div><div class="zrow"><div class="ico" style="background:#d6336c;width:54px;height:54px">PDF</div>Lab 2 - Linked lists.pdf<span>420 KB</span></div><div class="zrow"><div class="ico" style="background:#e8590c;width:54px;height:54px">PPTX</div>Lab 3 - Stacks.pptx<span>1.2 MB</span></div><div class="zrow"><div class="ico" style="background:#1f9d63;width:54px;height:54px">XLSX</div>Results.xlsx<span>38 KB</span></div>');
    // download-all popup
    const rb = ring(260, 22, '#2f5bea'); const pop = h('div', 'pop', '<h4>Downloading lecture notes</h4><div class="ringbox">' + rb.html + '</div><p id="dl-p">Downloading 1 of 9</p><small id="dl-s">Lecture 1 - Introduction.pdf</small><div class="cx">Cancel</div>');
    P.pop = { el: pop, rb, box: pop.querySelector('.ringbox'), p: pop.querySelector('#dl-p'), s: pop.querySelector('#dl-s'), h4: pop.querySelector('h4'), cx: pop.querySelector('.cx') }; pg.append(pop);
    return pg;
  }
  const NAMES = ['Lecture 1 - Introduction', 'Lecture 2 - Arrays', 'Lecture 3 - Lists', 'Lecture 4 - Stacks', 'Lecture 5 - Queues', 'Lecture 6 - Graphs', 'Lecture 7 - Trees', 'Lab Files', 'Assignment 2'];

  const QUIZ = { Quizzes: [['Data Structures', [['Quiz 1', '8.5'], ['Quiz 2', '9']]], ['Database Systems', [['Quiz 1', '7'], ['Quiz 2', null]]], ['Software Engineering', [['Quiz 1', '10']]], ['Operating Systems', [['Quiz 1', '6.5'], ['Quiz 2', null]]]],
    Assignments: [['Data Structures', [['Assignment 1', '18'], ['Assignment 2', null]]], ['Database Systems', [['Assignment 1', '14.5']]], ['Software Engineering', [['Assignment 1', '20'], ['Assignment 2', '17']]], ['Operating Systems', [['Assignment 1', null]]]] };
  function table(kind) {
    let s = '<table class="mt"><thead><tr><th>Course</th><th>' + kind.slice(0, -1) + '</th><th style="text-align:right">Marks</th></tr></thead><tbody>';
    for (const [course, items] of QUIZ[kind]) items.forEach((it, i) => { s += '<tr>' + (i === 0 ? `<td class="c" rowspan="${items.length}">${course}</td>` : '') + `<td class="q">${it[0]}</td><td class="m${it[1] ? '' : ' nm0'}">${it[1] || 'Not marked'}</td></tr>`; });
    return s + '</tbody></table>';
  }
  function buildQuiz() {
    const pg = h('div', 'page'); pg.append(h('div', 'hd', '<small>Data Structures</small><h1>Quizzes</h1>'));
    const body = h('div', 'body'); body.append(h('div', 'sel', '<b><span>Semester</span>Fall 2026</b><b><span>Course</span>Data Structures</b>'));
    const mk = h('div', 'btn', 'Marks overview'); mk.style.cssText = 'width:100%;height:96px;font-size:34px;margin:0 0 22px'; body.append(mk); P.mkbtn = mk;
    body.append(h('div', 'row', '<div class="nm"><b>Quiz 1 &middot; Arrays</b><span>Quiz marks: 8.5</span></div>'), h('div', 'row', '<div class="nm"><b>Quiz 2 &middot; Linked lists</b><span>Quiz marks: 9</span></div>'), h('div', 'row', '<div class="nm"><b>Quiz 3 &middot; Stacks</b><span>Not marked yet</span></div>'));
    pg.append(body);
    const rb = ring(260, 22, '#2f5bea'); const pop = h('div', 'pop', '<h4>Reading your marks</h4><div class="ringbox">' + rb.html + '</div><p id="mk-p">Course 1 of 10</p><small>Quizzes and assignments</small><div class="cx">Cancel</div>');
    P.mkpop = { el: pop, rb, box: pop.querySelector('.ringbox'), p: pop.querySelector('#mk-p') }; pg.append(pop);
    const res = h('div', 'res'); const rh = h('div', 'rh', '<h3>Marks overview</h3>'); const seg = h('div', 'seg', '<i></i><b>Quizzes<span>8 of 10 marked</span></b><b>Assignments<span>9 of 11 marked</span></b>'); rh.append(seg); res.append(rh);
    const tw = h('div'); tw.style.position = 'relative'; const t1 = h('div', null, table('Quizzes')), t2 = h('div', null, table('Assignments')); t2.style.cssText = 'position:absolute;left:0;right:0;top:0'; tw.append(t1, t2); res.append(tw);
    const note = h('div', null, 'Marks are shown as the portal gives them.'); note.style.cssText = 'padding:16px 34px;font-size:21px;color:#7a89a8;font-weight:600'; res.append(note);
    P.res = { el: res, seg: seg.firstChild, thumb: seg.firstChild, t1, t2, tab2: seg.children[2] }; pg.append(res);
    return pg;
  }
  const CODE = 'CL1-4F9K2-ZR7QX-M3P8D';
  function buildTheme(friend) {
    const pg = h('div', 'page'); pg.append(h('div', 'hd', `<small>${friend ? 'Your friend' : 'Settings'}</small><h1>Custom theme</h1>`));
    const body = h('div', 'body');
    if (!friend) { const sh = h('div', 'share', '<h5>Share this theme</h5>'); const row = h('div', 'code'); const cd = h('div', null, CODE); const cp = h('div', 'btn', 'Copy code'); row.append(cd, cp); sh.append(row); P.copy = cp; body.append(sh); }
    else { const sh = h('div', 'share', '<h5>Add a friend&rsquo;s theme</h5>'); const row = h('div', 'code'); const cd = h('div', null, ''); cd.style.color = '#2c3d66'; const ad = h('div', 'btn', 'Add'); row.append(cd, ad); sh.append(row); P.typed = cd; P.add = ad; body.append(sh); }
    body.append(h('div', 'sw', ['#0f2a63', '#2f5bea', '#e7edff', '#f2b84b', '#1f9d63'].map(c => `<i style="background:${c}"></i>`).join('')));
    body.append(h('div', 'prev', '<div class="ph"></div><div class="pb"><i></i><i></i><i></i></div>'));
    pg.append(body); return pg;
  }
  function buildChat() {
    const pg = h('div', 'page chat'); pg.append(h('div', 'ch', '<i></i>Hamza'));
    const m0 = h('div', 'msg them', 'bro your portal looks insane. what theme is that?'); m0.style.top = '190px'; m0.style.opacity = '1';
    const m1 = h('div', 'msg', 'my custom theme. here is the code'); m1.style.top = '380px'; const m2 = h('div', 'msg code2', CODE); m2.style.top = '510px';
    pg.append(m0, m1, m2); P.m1 = m1; P.m2 = m2; return pg;
  }
  function buildNext() {
    const pg = h('div', 'page'); pg.append(h('div', 'hd', '<small>Good morning</small><h1>Hi, Ammad</h1>'));
    const body = h('div', 'body'); const nx = h('div', 'nx', '<span class="tag"><i></i>NOW</span><h3>Data Structures</h3><div class="meta">Room 204 &middot; 9:30 &ndash; 10:50 am</div><div class="left" id="left">Ends in 25 min</div><div class="pb2"><i></i></div><div class="then"><b>Then &middot; Database Systems</b><span>11:00 am</span></div>');
    body.append(nx, h('div', 'mini', '<div>Due soon<b>2</b></div><div>Attendance<b>86%</b></div><div>Quizzes<b>8</b></div>')); pg.append(body);
    P.nx = nx; P.left = nx.querySelector('#left'); P.nbar = nx.querySelector('.pb2 i'); return pg;
  }
  const PAGES = {};
  function build(timing) {
    T = { caps: timing.lines.flatMap(l => l.sentences).sort((x, y) => x.t0 - y.t0).map((sn, i, all) => ({ t0: sn.t0 - .06, t1: Math.min(sn.t1 + .5, i + 1 < all.length ? all[i + 1].t0 - .03 : 1e9), words: sn.words })) };
    const view = $('view');
    PAGES.notes = buildNotes(); PAGES.quiz = buildQuiz(); PAGES.you = buildTheme(false); PAGES.chat = buildChat(); PAGES.friend = buildTheme(true); PAGES.next = buildNext();
    for (const k in PAGES) view.append(PAGES[k]);
    $('steps').append(...STEPS.map(s => h('b', null, s)));
    STEPS.forEach((s, i) => { const d = h('div', null, `<b>${i + 1}</b>${s}`); $('hk-list').append(d); });
    // confetti
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const cols = ['#f2b84b', '#ffd88a', '#2f5bea', '#8fb0ff', '#ffffff', '#ff7a8a'];
    P.conf = Array.from({ length: 90 }, () => { const e = h('i'); e.style.background = cols[Math.floor(rnd() * cols.length)]; $('confetti').append(e); return { e, x: 140 + rnd() * 800, vx: (rnd() - .5) * 700, vy: -(500 + rnd() * 900), d: rnd() * .5, r: rnd() * 720 - 360 }; });
    // measure cursor targets with every page laid out, then hide them again
    for (const k in PAGES) PAGES[k].style.opacity = '1';
    const fr = $('frame').getBoundingClientRect(), at = el => { const r = el.getBoundingClientRect(); return [r.left - fr.left + r.width / 2, r.top - fr.top + r.height / 2]; };
    P.pos = { p0: at(P.prev0), p1: at(P.prev1), p2: at(P.prev2), dl: at(P.dlall), mk: at(P.mkbtn), copy: at(P.copy), add: at(P.add), tab2: at(P.res.tab2) };
    for (const k in PAGES) PAGES[k].style.opacity = '0';
    const p = P.pos;
    // cursor path: [time, x, y]; clicks: [time, x, y]
    cursorKeys.push([5.2, 700, 900], [C.click1 - .05, p.p0[0], p.p0[1]], [C.v1[1] + .1, p.p0[0] + 20, p.p0[1] + 40], [C.click2 - .05, p.p1[0], p.p1[1]], [C.v2[1] + .1, p.p1[0] + 20, p.p1[1] + 40], [C.click3 - .05, p.p2[0], p.p2[1]], [C.v3[1] + .1, p.p2[0] - 60, p.p2[1] + 60],
      [C.dlClick - .05, p.dl[0], p.dl[1]], [C.dl[1] - .5, p.dl[0] - 200, p.dl[1] + 640],
      [C.mkClick - .05, p.mk[0], p.mk[1]], [C.mk[1] - .3, p.mk[0] - 200, p.mk[1] + 640], [C.mkSwitch - .05, p.tab2[0], p.tab2[1]], [C.mkSwitch + .5, p.tab2[0] + 40, p.tab2[1] + 80],
      [C.copyClick - .05, p.copy[0], p.copy[1]], [C.copyClick + .6, p.copy[0] + 30, p.copy[1] + 60],
      [C.addClick - .05, p.add[0], p.add[1]], [C.addClick + .5, p.add[0] + 40, p.add[1] + 60]);
    for (const [t, k] of [[C.click1, 'p0'], [C.click2, 'p1'], [C.click3, 'p2'], [C.dlClick, 'dl'], [C.mkClick, 'mk'], [C.mkSwitch, 'tab2'], [C.copyClick, 'copy'], [C.addClick, 'add']]) clicks.push([t, p[k][0], p[k][1]]);
    P.pos.add2 = p.add;
  }

  // ------------------------------------------------------------ per-frame
  function showPage(el, a, b) { const u = win(T.t, a, b, .4); el.style.opacity = String(u); el.style.display = u > 0 ? '' : 'none'; el.style.transform = `translateX(${(1 - ramp(T.t, a, .45)) * 70 - ramp(T.t, b, .45) * 70}px)`; }
  function viewer(v, span, t) {
    const [a, b] = span, o = win(t, a, b, .22), ld = ramp(t, a, .5, 'lin'), body = ramp(t, a + .55, .2);
    v.el.style.opacity = String(o); v.el.style.transform = `translateY(${(1 - ramp(t, a, .4)) * 60}px) scale(${.96 + .04 * ramp(t, a, .4)})`;
    v.ld.style.opacity = String(1 - body); v.ld.style.display = body >= 1 ? 'none' : '';
    setRing(v.box, v.rb.c, ld, '#2f5bea');
    return o;
  }
  function frame(t) {
    T.t = t; const v = $('view'), w = $('win');
    // hook
    const hk = $('hook'); const hu = win(t, 0.05, C.hookEnd, .35); hk.style.opacity = String(hu); hk.style.display = hu > 0 ? '' : 'none';
    hk.style.transform = `scale(${.9 + .1 * ramp(t, .05, .5, 'back')}) translateY(${-ramp(t, C.hookEnd - .2, .4, 'in') * 60}px)`;
    [...$('hk-list').children].forEach((d, i) => { const u = ramp(t, 1.1 + i * .38, .4, 'back'); d.style.opacity = String(Math.min(1, u * 2)); d.style.transform = `translateX(${(1 - u) * 120}px)`; });
    w.style.opacity = String(ramp(t, C.hookEnd - .5, .5)); w.style.transform = `scale(${.94 + .06 * ramp(t, C.hookEnd - .5, .6)})`;
    // steps
    const st = $('steps'); st.style.opacity = String(ramp(t, C.steps, .4) * (1 - ramp(t, C.endIn - .2, .3)));
    const cur = stepAt.filter(s => t >= s - .01).length - 1;
    [...st.children].forEach((e, i) => { e.className = i === cur ? 'on' : i < cur ? 'done' : ''; });
    // theme colours (the friend's recolor)
    const rc = ramp(t, C.recolor[0], C.recolor[1] - C.recolor[0], 'io');
    w.style.setProperty('--hd1', mix('#0f2a63', '#5a1237', rc)); w.style.setProperty('--hd2', mix('#1b3f93', '#a1235f', rc)); w.style.setProperty('--acc', mix('#2f5bea', '#e0457b', rc)); w.style.setProperty('--accsoft', mix('#e7edff', '#ffe3ee', rc));
    // pages
    showPage(PAGES.notes, C.notesIn, C.notesOut); showPage(PAGES.quiz, C.quizIn, C.quizOut);
    showPage(PAGES.you, C.themeIn, C.youOut); showPage(PAGES.chat, C.chat[0], C.chat[1]); showPage(PAGES.friend, C.friend[0], C.themeOut); showPage(PAGES.next, C.nextIn, C.nextOut);
    $('url').textContent = t < C.quizIn - .2 ? 'lms.bahria.edu.pk/LectureNotes' : t < C.themeIn - .2 ? 'lms.bahria.edu.pk/Quizzes' : t < C.nextIn - .2 ? 'Campuslit settings' : 'lms.bahria.edu.pk';
    // viewers + label
    const o1 = viewer(P.vw1, C.v1, t), o2 = viewer(P.vw2, C.v2, t), o3 = viewer(P.vw3, C.v3, t);
    const vs = PAGES.notes.querySelector('.scrim'); vs.style.opacity = String(Math.max(o1, o2, o3) * 1 + ramp(t, C.dl[0], .3) * (1 - ramp(t, C.dl[1] - .3, .3)) * .9);
    PAGES.notes.querySelector('.thumbs').children; const s2 = ramp(t, C.v1[0] + 1.05, .01, 'lin') > 0;
    const sl = PAGES.notes.querySelectorAll('.slide'); const sw = ramp(t, C.v1[0] + .95, .35, 'io'); sl[0].style.transform = `translateX(${-sw * 940}px)`; sl[1].style.transform = `translateX(${(1 - sw) * 940}px)`;
    const pgEl = PAGES.notes.querySelector('#pg'); pgEl.textContent = sw > .5 ? '2 / 24' : '1 / 24'; PAGES.notes.querySelectorAll('.thumbs i').forEach((e, i) => e.classList.toggle('on', i === (sw > .5 ? 1 : 0)));
    const tabs = PAGES.notes.querySelectorAll('.tabs b'); const tb = t > C.v2[0] + 1.0 ? 1 : 0; tabs.forEach((e, i) => e.classList.toggle('on', i === tb));
    PAGES.notes.querySelectorAll('.zrow').forEach((e, i) => e.classList.toggle('hot', i === 2 && t > C.v3[0] + 1.0));
    const lb = $('label'); const lw = [[C.v1, 'Slides'], [C.v2, 'Spreadsheet'], [C.v3, 'Zip file']].map(([s, n]) => [win(t, s[0] + .35, s[1] - .1, .2), n]).sort((a, b) => b[0] - a[0])[0];
    lb.style.opacity = String(lw[0]); lb.textContent = lw[1]; lb.style.transform = `translateX(-50%) translateY(${(1 - lw[0]) * 20}px)`;
    // download all popup
    const pp = P.pop, pu = win(t, C.dl[0], C.dl[1], .3); pp.el.style.opacity = String(pu); pp.el.style.transform = `scale(${.9 + .1 * ramp(t, C.dl[0], .4, 'back')})`;
    const prog = ramp(t, C.dlRun[0], C.dlRun[1] - C.dlRun[0], 'lin'), done = t >= C.dlRun[1];
    setRing(pp.box, pp.rb.c, prog, done ? '#1f9d63' : '#2f5bea');
    const n = Math.min(9, Math.floor(prog * 9) + 1); pp.p.textContent = done ? 'Saved 9 files' : `Downloading ${n} of 9`; pp.s.textContent = done ? 'Lecture Notes.zip is in your Downloads' : NAMES[n - 1] + '.pdf';
    pp.h4.textContent = done ? 'All done' : 'Downloading lecture notes'; pp.cx.style.visibility = done ? 'hidden' : '';
    if (done) pp.box.querySelector('.pc').textContent = '✓';
    // marks
    const mp = P.mkpop, mu = win(t, C.mk[0], C.mk[1], .3); mp.el.style.opacity = String(mu); mp.el.style.transform = `scale(${.9 + .1 * ramp(t, C.mk[0], .4, 'back')})`;
    const mprog = ramp(t, C.mkRun[0], C.mkRun[1] - C.mkRun[0], 'lin'); setRing(mp.box, mp.rb.c, mprog, '#2f5bea'); mp.p.textContent = `Course ${Math.min(10, Math.floor(mprog * 10) + 1)} of 10`;
    const R = P.res, ru = win(t, C.res[0], C.res[1], .4); R.el.style.opacity = String(ru); R.el.style.transform = `translateY(${(1 - ramp(t, C.res[0], .5, 'out')) * 80}px)`;
    const sw2 = ramp(t, C.mkSwitch, .45, 'io'); R.thumb.style.transform = `translateX(${sw2 * 100}%)`; R.thumb.parentNode.children[1].style.color = sw2 < .5 ? '#fff' : '#7a89a8'; R.thumb.parentNode.children[2].style.color = sw2 < .5 ? '#7a89a8' : '#fff';
    R.t1.style.opacity = String(1 - sw2); R.t1.style.transform = `translateX(${-sw2 * 120}px)`; R.t2.style.opacity = String(sw2); R.t2.style.transform = `translateX(${(1 - sw2) * 120}px)`;
    const rows = R.el.querySelectorAll('tbody tr'); // rows appear one after the other
    R.t1.querySelectorAll('tr').forEach((r, i) => { const u = ramp(t, C.res[0] + .35 + i * .07, .3); r.style.opacity = String(u); });
    // theme sharing
    const cp = P.copy, copied = t >= C.copyClick; cp.textContent = copied ? 'Copied ✓' : 'Copy code'; cp.style.background = copied ? '#1f9d63' : ''; cp.style.transform = `scale(${1 - .06 * Math.exp(-Math.abs(t - C.copyClick - .05) * 14)})`;
    const m1 = P.m1, m2 = P.m2; for (const [m, a] of [[m1, C.msgAt], [m2, C.msgAt + .55]]) { const u = ramp(t, a, .35, 'back'); m.style.opacity = String(Math.min(1, u * 2)); m.style.transform = `translateY(${(1 - u) * 40}px) scale(${.9 + .1 * u})`; }
    const tl = Math.round(CODE.length * ramp(t, C.typeAt[0], C.typeAt[1] - C.typeAt[0], 'lin')); P.typed.textContent = CODE.slice(0, tl) + (tl < CODE.length && t > C.typeAt[0] - .2 ? '|' : '');
    const fl = $('flash'), fu = clamp01((t - C.addClick) / .9); fl.style.opacity = String(fu > 0 && fu < 1 ? .9 * (1 - fu) : 0); fl.style.left = P.pos.add[0] + 'px'; fl.style.top = P.pos.add[1] + 'px'; fl.style.transform = `scale(${.4 + 9 * E.out(fu)})`;
    P.add.style.transform = `scale(${1 - .06 * Math.exp(-Math.abs(t - C.addClick - .05) * 14)})`;
    // next class: time runs fast (a minute every .25 s) and a bar fills
    const k = clamp01((t - C.nextIn - .5) / 3.2), mins = 25 - k * 8; P.left.textContent = `Ends in ${Math.ceil(mins)} min`; P.nbar.style.width = (30 + 22 * k) + '%';
    P.nx.style.transform = `scale(${.96 + .04 * ramp(t, C.nextIn + .1, .5, 'back')})`;
    // end card + confetti
    const eu = ramp(t, C.endIn, .45, 'io'); $('end').style.opacity = String(eu); $('end').style.display = eu > 0 ? '' : 'none';
    const cu = E.out(clamp01((t - C.count[0]) / (C.count[1] - C.count[0]))); $('en-n').textContent = String(Math.round(850 * cu));
    $('en-num').style.transform = `scale(${1 + .06 * Math.exp(-Math.max(0, t - C.count[1]) * 6) * (t >= C.count[1] ? 1 : 0)})`;
    [['en-kicker', 0], ['en-sub', 1.0], ['en-brand', 1.5], ['en-chips', 1.9], ['en-site', 2.3], ['en-fine', 2.6]].forEach(([id, d]) => { const u = ramp(t, C.endIn + .3 + d, .5); $(id).style.opacity = String(u); $(id).style.transform = `translateY(${(1 - u) * 34}px)`; });
    $('en-num').style.opacity = String(ramp(t, C.endIn + .2, .4));
    for (const c of P.conf) { const s = t - C.confettiAt - c.d; if (s < 0 || s > 3.4) { c.e.style.opacity = '0'; continue; } c.e.style.opacity = String(Math.min(1, 3.4 - s)); c.e.style.transform = `translate(${c.x + c.vx * s * .6}px, ${760 + c.vy * s * .55 + 900 * s * s}px) rotate(${c.r * s}deg)`; }
    // captions
    const host = $('caps'); let n2 = 0;
    for (const c of T.caps) {
      if (t < c.t0 || t > c.t1) continue;
      const age = t - c.t0, left = c.t1 - t; const el = P.capEls[n2] || (P.capEls[n2] = (() => { const d = h('div', 'cap'); host.append(d); return d; })());
      if (el.dataset.key !== String(c.t0)) { el.dataset.key = String(c.t0); el.textContent = ''; for (const wd of c.words) { const s = h('span', 'w', null); s.textContent = wd.w; s.dataset.t = wd.t0; s.dataset.e = wd.t1; el.append(s); } }
      el.style.display = 'flex'; const a = E.out(Math.min(1, age / .22)), b = Math.min(1, left / .16); el.style.opacity = String(Math.min(a, b)); el.style.transform = `translateY(${(1 - a) * 22}px) scale(${.94 + .06 * a})`;
      el.querySelectorAll('.w').forEach(wd => { const t0 = +wd.dataset.t; wd.classList.toggle('on', t >= t0 && t < Math.max(+wd.dataset.e, t0 + .25)); });
      n2++;
    }
    for (let i = n2; i in P.capEls; i++) P.capEls[i].style.display = 'none';
    // cursor + ripple
    let show = 0, x = 0, y = 0;
    if (cursorKeys.length && t >= cursorKeys[0][0] - .3 && t <= C.addClick + 1.0) {
      let i = 0; while (i + 1 < cursorKeys.length && t >= cursorKeys[i + 1][0]) i++;
      const a = cursorKeys[i], b = cursorKeys[Math.min(i + 1, cursorKeys.length - 1)];
      const u = b[0] > a[0] ? E.io(clamp01((t - a[0]) / (b[0] - a[0]))) : 1; x = lerp(a[1], b[1], u); y = lerp(a[2], b[2], u);
      // hidden while a full-screen page is not one the cursor works on
      show = ramp(t, cursorKeys[0][0] - .3, .3, 'lin') * (1 - ramp(t, C.addClick + .6, .4, 'lin')) * (1 - win(t, C.dl[1] - .4, C.quizIn + .1, .2) * 0) * (1 - win(t, C.chat[0], C.chat[1] - .1, .2));
      show *= 1 - win(t, C.quizOut - .2, C.themeIn + .6, .2) * (t > C.quizOut - .2 && t < C.themeIn + .2 ? 1 : 0);
    }
    const down = clicks.some(c => Math.abs(t - c[0] - .05) < .08); $('cursor').style.opacity = String(show); $('cursor').style.transform = `translate(${x - 14}px, ${y - 8}px) scale(${down ? .86 : 1})`;
    let rp = null; for (const c of clicks) if (t >= c[0] && t - c[0] < .5) rp = c; const r = $('ripple');
    if (rp) { const u = (t - rp[0]) / .5; r.style.opacity = String(.95 * (1 - u)); r.style.left = rp[1] + 'px'; r.style.top = rp[2] + 'px'; r.style.transform = `scale(${.3 + 1.1 * E.out(u)})`; } else r.style.opacity = '0';
    // backdrop
    $('glow').style.transform = `scale(${1 + .04 * Math.sin(t * 1.3)})`; $('grid').style.backgroundPosition = `0 ${(t * 9) % 72}px`;
  }
  P.capEls = {};
  window.__init = async function (name) {
    const timing = await (await fetch('/__out/' + (name || 'update') + '/timing.json', { cache: 'no-store' })).json();
    build(timing); await new Promise(r => setTimeout(r, 400)); return C.duration;
  };
  window.__frame = async function (t) { frame(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; };
})();
