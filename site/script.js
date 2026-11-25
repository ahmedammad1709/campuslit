(function () {
  'use strict';
  // Everything here is a nicety: the pages read fine without JavaScript (the comparison shows half and half, details open by hand).
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('.site-header');

  // header turns light once the page scrolls (pages with a light top keep it light)
  if (header && !header.classList.contains('light')) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
    onScroll(); addEventListener('scroll', onScroll, { passive: true });
  }

  // menu button on small screens
  const button = document.querySelector('.menu-btn');
  if (button && header) {
    const set = open => { header.classList.toggle('open', open); button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); };
    button.addEventListener('click', () => set(!header.classList.contains('open')));
    header.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => set(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  }

  // fade-ins (content stays visible if IntersectionObserver is missing)
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .06 });
    items.forEach(el => io.observe(el));
  } else items.forEach(el => el.classList.add('in'));

  // milestone: 1,000+ installs. A mosaic of 1,000 dots, one per install, lights up as the number counts to 1,000, a shimmer sweeps over it, and a short burst of confetti follows
  // (with reduced motion, or without the observer, the finished picture is simply there)
  document.querySelectorAll('[data-milestone]').forEach(card => {
    const number = card.querySelector('[data-count]'), layer = card.querySelector('.confetti'), cv = card.querySelector('.mosaic'), target = Number(number && number.dataset.count) || 0;
    if (!number || !target) return;
    const ctx = cv && cv.getContext ? cv.getContext('2d') : null, fmt = n => n.toLocaleString('en-US');
    let cols = 100, cell = 10, W = 0, H = 0, now = target;
    const size = () => {
      if (!ctx) return;
      W = cv.clientWidth || 600; cols = W < 700 ? 50 : 100; cell = W / cols; H = Math.ceil(cell * Math.ceil(target / cols));
      const dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (count, sweep) => {
      if (!ctx) return; ctx.clearRect(0, 0, W, H);
      const r = cell * .34;
      for (let i = 0; i < target; i++) {
        const x = (i % cols + .5) * cell, y = (Math.floor(i / cols) + .5) * cell;
        let rr = r, fill = 'rgba(255,255,255,.12)';
        if (i < count) {
          const behind = count - i; fill = '#f2b84b';
          if (behind < 36 && count < target) { rr = r * (1 + .55 * (1 - behind / 36)); fill = behind < 6 ? '#fff6dd' : '#ffd88a'; }
          const near = sweep === null ? 1 : Math.abs(x / W - sweep) / .08;   // a soft wave: brightest in the middle, fading to gold at its edges
          if (near < 1) { const k = 1 - near; rr = r * (1 + .55 * k); fill = 'rgb(255,' + Math.round(184 + 71 * k) + ',' + Math.round(75 + 180 * k) + ')'; }
        }
        ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.fillStyle = fill; ctx.fill();
      }
    };
    const still = () => { number.textContent = fmt(target); size(); draw(target, null); };
    window.addEventListener('resize', () => { size(); draw(now, null); });
    if (reduced || !('IntersectionObserver' in window)) { still(); return; }
    number.textContent = '0'; size(); draw(0, null); now = 0;
    const burst = () => {
      if (!layer) return;
      const colors = ['#f2b84b', '#ffd88a', '#2f5bea', '#8fb0ff', '#ffffff', '#ff7a8a'];
      for (let i = 0; i < 56; i++) {
        const piece = document.createElement('span'), rand = (lo, hi) => lo + Math.random() * (hi - lo);
        piece.style.left = rand(4, 96) + '%'; piece.style.background = colors[i % colors.length];
        piece.style.setProperty('--x', rand(-70, 70) + 'px'); piece.style.setProperty('--r', rand(300, 900) + 'deg'); piece.style.setProperty('--d', rand(2.2, 3.6) + 's'); piece.style.setProperty('--delay', rand(0, .7) + 's');
        layer.append(piece);
      }
      setTimeout(() => layer.replaceChildren(), 5000);
    };
    const run = () => {
      const start = performance.now(), span = 2600, sweepSpan = 900;
      const frame = t => {
        const u = Math.min(1, (t - start) / span), eased = 1 - Math.pow(1 - u, 2.4);
        now = Math.round(target * eased); number.textContent = fmt(now); draw(now, null);
        if (u < 1) { requestAnimationFrame(frame); return; }
        now = target; number.textContent = fmt(target); card.classList.add('is-done'); burst();
        const s0 = performance.now();
        const shimmer = tt => { const v = Math.min(1, (tt - s0) / sweepSpan); draw(target, v < 1 ? -.05 + 1.1 * v : null); if (v < 1) requestAnimationFrame(shimmer); };
        requestAnimationFrame(shimmer);
      };
      requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(entries => { if (!entries.some(e => e.isIntersecting)) return; io.disconnect(); run(); }, { threshold: .45 });
    io.observe(card);
  });

  // before / after comparisons: a range input drives the split
  document.querySelectorAll('[data-compare]').forEach(box => {
    const range = box.querySelector('.compare-range');
    const set = value => { box.style.setProperty('--pos', value + '%'); range.setAttribute('aria-valuetext', Math.round(value) + '% shows the portal before Campuslit'); };
    range.addEventListener('input', () => set(range.value));
    set(range.value);
    // one slow sweep the first time it scrolls into view, so it is obvious that it moves
    if ('IntersectionObserver' in window && !reduced && box.hasAttribute('data-sweep')) {
      const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        io.disconnect();
        const start = performance.now(), from = 92, to = Number(range.value);
        let touched = false; range.addEventListener('pointerdown', () => { touched = true; }, { once: true });
        const step = now => { if (touched) return; const t = Math.min(1, (now - start) / 1500), eased = 1 - Math.pow(1 - t, 3), v = from + (to - from) * eased; range.value = v; set(v); if (t < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }, { threshold: .5 });
      io.observe(box);
    }
  });

  // feature tabs: one panel at a time; arrow keys, Home and End move between them. Without JavaScript every panel simply shows.
  document.querySelectorAll('[data-tabs]').forEach(box => {
    const tabs = [...box.querySelectorAll('[role="tab"]')], panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
    const show = (index, focus) => {
      tabs.forEach((t, i) => { const on = i === index; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; panels[i].hidden = !on; panels[i].classList.toggle('fresh', on && box.hasAttribute('data-ready') && !reduced && focus !== undefined); });
      if (focus) tabs[index].focus();
      const bar = tabs[index].parentElement; if (bar.scrollWidth > bar.clientWidth) tabs[index].scrollIntoView({ inline: 'center', block: 'nearest' });
    };
    box.setAttribute('data-ready', '');
    tabs.forEach((t, i) => t.addEventListener('click', () => show(i, false)));
    box.querySelector('[role="tablist"]').addEventListener('keydown', e => {
      const now = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
      const next = e.key === 'ArrowRight' ? (now + 1) % tabs.length : e.key === 'ArrowLeft' ? (now - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (next >= 0) { e.preventDefault(); show(next, true); }
    });
    show(0);
  });

  // praise: the wall of comments slides slowly (cards are cloned to loop forever); the LinkedIn post loads only when someone asks for it
  const wall = document.querySelector('.wall');
  if (wall && !reduced) {
    const SPEED = 38;   // pixels per second: slow enough to read
    const build = () => {
      wall.classList.remove('live');
      wall.querySelectorAll('[data-clone]').forEach(n => n.remove());
      wall.querySelectorAll('.row').forEach(row => {
        const track = row.querySelector('.track'), originals = [...track.children];
        if (!originals.length) return;
        wall.classList.add('live');
        const gap = parseFloat(getComputedStyle(track).columnGap) || 16;
        const setWidth = originals.reduce((w, c) => w + c.getBoundingClientRect().width + gap, 0);
        const copies = Math.ceil(row.clientWidth / setWidth) + 1;
        for (let i = 0; i < copies; i++) originals.forEach(c => { const k = c.cloneNode(true); k.setAttribute('data-clone', ''); k.setAttribute('aria-hidden', 'true'); k.tabIndex = -1; track.append(k); });
        track.style.setProperty('--wall-shift', -setWidth + 'px'); track.style.setProperty('--wall-time', (setWidth / SPEED) + 's');
      });
    };
    let timer = 0;
    build(); addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(build, 250); });
  }
  // the LinkedIn post: loaded by default, but only when the visitor scrolls close to it (so people who never get there never contact LinkedIn); the button is the fallback
  const embedButton = document.querySelector('[data-embed]');
  if (embedButton) {
    const post = document.querySelector('.lpost'), face = document.querySelector('.lp-face'), host = document.querySelector('.lp-host');
    let loaded = false;
    const load = () => {
      const src = embedButton.dataset.embed || '';
      if (loaded || !post || !face || !host || !src.startsWith('https://www.linkedin.com/embed/')) return;
      loaded = true;
      const frame = document.createElement('iframe');
      frame.className = 'lp-embed'; frame.title = 'The LinkedIn post'; frame.src = src; frame.setAttribute('allowfullscreen', ''); frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.addEventListener('load', () => { face.hidden = true; host.hidden = false; post.classList.add('embedded'); });
      host.append(frame);
    };
    embedButton.addEventListener('click', load);
    if ('IntersectionObserver' in window && post) {
      const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px 0px' });
      io.observe(post);
    }
  }

  // theme gallery
  const shot = document.getElementById('theme-shot');
  if (shot) {
    const names = { bahria: 'Bahria', crystal: 'Crystal', midnight: 'Midnight', linen: 'Linen', grove: 'Grove', bloom: 'Bloom' };
    document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
      const id = chip.dataset.theme;
      shot.src = 'assets/shots/lms-' + id + '.webp';
      shot.alt = id === 'custom' ? 'The LMS dashboard in a custom theme made in the theme maker: dark rose.' : 'The LMS dashboard in the ' + names[id] + ' theme.';
    }));
  }

  // table of contents on the policy pages follows the reader
  const links = [...document.querySelectorAll('.toc a')];
  if (links.length && 'IntersectionObserver' in window) {
    const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.remove('on')); const a = byId.get(e.target.id); if (a) a.classList.add('on');
    }), { rootMargin: '-20% 0px -70% 0px' });
    byId.forEach((_, id) => { const target = document.getElementById(id); if (target) io.observe(target); });
  }
})();
