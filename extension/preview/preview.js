(function () {
  'use strict';
  // Runs inside the sample pages embedded in the settings page. Receives the settings being edited from the parent
  // and applies them exactly as the content scripts would on the real portal. Nothing here talks to the network.
  const site = document.currentScript.dataset.site;            // 'lms' or 'cms'
  const mount = () => (site === 'lms' ? globalThis.BahriaLms : globalThis.BahriaCms);
  const system = matchMedia('(prefers-color-scheme: dark)');
  let settings = BahriaStudio.normalize({});
  let got = false;

  // Invented reminders for the settings preview, so the popup can be seen (and crossed away) without touching real storage.
  function sample() {
    const D = globalThis.BahriaDeadlines; if (!D) return null;
    const now = Date.now(), H = 3600000;
    let data = D.remember(null, { semester: 'Fall-2026', course: 'Data Structures' }, [{ title: 'Assignment 2: Trees and Graphs', due: now + 53 * H }], now - 2 * H);
    data = D.remember(data, { semester: 'Fall-2026', course: 'Database Systems' }, [{ title: 'Lab Task 3: Hash Tables', due: now + 120 * H }], now - 2 * H);
    return data;
  }

  function apply() {
    const root = document.documentElement;
    BahriaStudio.apply(root, settings, system.matches);
    const active = settings.enabled && settings[site];
    if (!active) {
      const helper = mount(); if (helper) helper.disable();
      delete root.dataset.bahriaStudio; delete root.dataset.bsClean; delete root.dataset.bsMotion; delete root.dataset.bsPage;
      return;
    }
    root.dataset.bahriaStudio = site;
    root.dataset.bsClean = String(settings.cleanBackground);
    root.dataset.bsMotion = String(settings.motion);
    root.dataset.bsPage = 'portal';
    const helper = mount(); if (helper) helper.mount(settings, { preview: true, sample });
  }

  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent) return;
    const data = event.data;
    if (data && data.type === 'campuslit-settings') { settings = BahriaStudio.normalize(data.settings); got = true; apply(); }
  });
  system.addEventListener('change', apply);

  // A little of the portals' own behaviour so the sample feels real.
  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (/^[\w-]+\.html$/.test(href)) return;   // another sample page: let it load
    event.preventDefault();
    const collapse = link.matches('[data-toggle="collapse"]') ? document.querySelector(href) : null;
    if (collapse) { collapse.classList.toggle('in'); link.classList.toggle('collapsed'); return; }
    if (link.id === 'aSideBar') { const box = document.getElementById('pageContainer'); if (box) box.classList.toggle('HideSideBar'); return; }
    if (link.matches('.sidebar-toggle')) { document.body.classList.toggle('sidebar-collapse'); return; }
    if (link.matches('.dropdown-toggle') && link.parentElement) { const open = link.parentElement.classList.toggle('open'); document.querySelectorAll('.dropdown.open').forEach(li => { if (li !== link.parentElement) li.classList.remove('open'); }); void open; }
  });
  // Sample deadlines are set relative to now, so the invented assignments never look stale. Written the way the portal prints them (Pakistan time).
  function freshenDeadlines() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.querySelectorAll('[data-sample-due-hours]').forEach(node => {
      const hours = Number(node.dataset.sampleDueHours); if (!Number.isFinite(hours)) return;
      const d = new Date(Date.now() + hours * 3600000 + 5 * 3600000);   // shift so the UTC fields read as Pakistan time
      const h = d.getUTCHours() % 12 || 12, m = String(d.getUTCMinutes()).padStart(2, '0');
      node.textContent = d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' - ' + h + ':' + m + ' ' + (d.getUTCHours() < 12 ? 'am' : 'pm');
    });
  }
  addEventListener('DOMContentLoaded', () => {
    // Ask the parent for the current settings; render with defaults meanwhile.
    freshenDeadlines();
    apply();
    try { parent.postMessage({ type: 'campuslit-ready' }, location.origin); } catch (e) { /* standalone */ }
  });
  void got;
})();
