(function () {
  'use strict';
  // header border once the page scrolls
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  onScroll(); addEventListener('scroll', onScroll, { passive: true });

  // fade-ins (content stays visible if IntersectionObserver is missing)
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    items.forEach(el => io.observe(el));
  } else items.forEach(el => el.classList.add('in'));

  // theme gallery
  const shot = document.getElementById('theme-shot');
  const names = { bahria: 'Bahria', crystal: 'Crystal', midnight: 'Midnight', linen: 'Linen', grove: 'Grove', bloom: 'Bloom', custom: 'a custom' };
  document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    const id = chip.dataset.theme;
    shot.src = 'assets/shots/lms-' + id + '.webp';
    shot.alt = id === 'custom' ? 'The LMS dashboard in a custom theme made in the Studio: dark rose.' : 'The LMS dashboard in the ' + names[id] + ' theme.';
  }));
})();
