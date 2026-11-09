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
