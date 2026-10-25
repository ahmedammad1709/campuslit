(function () {
  'use strict';
  const api = globalThis.browser || globalThis.chrome;
  const key = 'bahriaStudioPreferences';
  const site = location.hostname === 'cms.bahria.edu.pk' ? 'cms' : location.hostname === 'lms.bahria.edu.pk' ? 'lms' : null;
  if (!site || !api?.storage) return;
  const system = matchMedia('(prefers-color-scheme: dark)');
  let settings = BahriaStudio.normalize({});
  let loaded = false;
  const fontRequested = new Set();
  function render() {
    if (!loaded) return;
    const root = document.documentElement;
    if (!root) return;
    const enabled = settings.enabled && settings[site];
    if (!enabled) { globalThis.BahriaLogin?.disable(); globalThis.BahriaLms?.disable(); globalThis.BahriaCms?.disable(); delete root.dataset.bahriaStudio; return; }
    const file = BahriaStudio.fontFiles[settings.font];
    if (file && !fontRequested.has(settings.font) && typeof FontFace !== 'undefined') {
      fontRequested.add(settings.font);
      // Load a font bundled inside the extension, never from an internet server.
      const font = new FontFace(file[0], 'url("' + api.runtime.getURL(file[1]) + '")', {weight: '100 900', style: 'normal', display: 'swap'});
      font.load().then(face => document.fonts.add(face)).catch(() => { fontRequested.delete(settings.font); });
    }
    BahriaStudio.apply(root, settings, system.matches);
    root.dataset.bahriaStudio = site;
    root.dataset.bsClean = String(settings.cleanBackground);
    root.dataset.bsMotion = String(settings.motion);
    root.dataset.bsPage = /\/logins\//i.test(location.pathname) ? 'login' : /^\/(default\.aspx)?$/i.test(location.pathname) ? 'entry' : 'portal';
    globalThis.BahriaLogin?.mount();
    if (site === 'lms') globalThis.BahriaLms?.mount();
    if (site === 'cms') globalThis.BahriaCms?.mount(settings);
  }
  api.storage.local.get(key).then(data => { settings = BahriaStudio.normalize(data[key]); loaded = true; render(); }).catch(() => { /* Leave the original portal intact if storage is unavailable. */ });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[key]) { settings = BahriaStudio.normalize(changes[key].newValue); loaded = true; render(); }
  });
  system.addEventListener('change', render);
  document.addEventListener('DOMContentLoaded', render, { once: true });
  if (typeof MutationObserver !== 'undefined') {
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; render(); });
    }).observe(document.documentElement, {childList:true, subtree:true});
  }
})();
