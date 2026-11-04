// The Instagram cover: the same LMS page twice, stock on the left and Campuslit on the right, split down the middle.
(function () {
  'use strict';
  const settle = ms => new Promise(r => setTimeout(r, ms));
  async function load(host, settings) {
    const f = document.createElement('iframe'); f.tabIndex = -1; f.title = ''; host.append(f);
    await new Promise(r => { f.onload = r; f.src = '/preview/lms/dashboard.html'; });
    await settle(800);
    f.contentWindow.postMessage({ type: 'campuslit-settings', settings }, location.origin);
    await settle(900);
    const doc = f.contentDocument;
    const hide = doc.createElement('style'); hide.textContent = '.bs-remind, .bs-tip { display: none !important; }'; doc.head.append(hide);
    doc.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* done */ } });
  }
  (async () => {
    await load(document.getElementById('before'), { enabled: false });
    await load(document.getElementById('after'), { theme: 'navy' });
    await settle(600);
    window.__ready = true;
  })();
})();
