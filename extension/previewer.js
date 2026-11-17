// File preview on the LMS: a Preview button beside each download link (Lecture Notes, your own submissions, assignment files) and a viewer on top of the page.
// The file is fetched with the student's own sign-in, kept in memory only, shown, and forgotten when the viewer closes. Nothing is saved, stored or sent anywhere.
(function () {
  'use strict';
  const P = globalThis.BahriaPreview, Z = globalThis.BahriaZip, D = globalThis.BahriaDocx;
  if (!P || !Z || !D) return;
  const owned = new Set();
  let overlay = null, timedOut = false, urls = [], abort = null, opener = null, keyHandler = null, run = 0;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  const eye = () => {
    const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '14'); s.setAttribute('height', '14'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    const a = document.createElementNS(ns, 'path'); a.setAttribute('d', 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z');
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3');
    s.append(a, c); return s;
  };
  const keep = blob => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

  // ---------------------------------------------------------------- the viewer
  function close() {
    run++;                                              // anything still loading is dropped
    if (abort) { try { abort.abort(); } catch (e) { /* already done */ } abort = null; }
    if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    document.documentElement.classList.remove('bs-pv-open');
    if (opener && opener.isConnected) { try { opener.focus(); } catch (e) { /* gone */ } }
    opener = null;
  }
  function viewer(info) {
    const box = el('div', 'bs-pv'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Preview of ' + info.name);
    const card = el('div', 'bs-pv-card'), bar = el('div', 'bs-pv-bar'), head = el('div', 'bs-pv-head');
    const title = el('b', 'bs-pv-title', info.name), meta = el('span', 'bs-pv-meta', info.ext.toUpperCase());
    const badge = el('span', 'bs-pv-badge k-' + P.kindOf(info.ext), info.ext.slice(0, 4).toUpperCase()); badge.setAttribute('aria-hidden', 'true');
    const lines = el('div', 'bs-pv-lines'); lines.append(title, meta);
    head.append(badge, lines);
    const actions = el('div', 'bs-pv-actions');
    const closeBtn = el('button', 'bs-pv-x', 'Close'); closeBtn.type = 'button'; closeBtn.addEventListener('click', close);
    actions.append(closeBtn);
    bar.append(head, actions);
    const body = el('div', 'bs-pv-body'), msg = el('div', 'bs-pv-msg'), label = el('span', 'bs-pv-label', 'Loading…'); msg.setAttribute('role', 'status');
    msg.append(el('span', 'bs-pv-spin'), label);
    body.append(msg);
    card.append(bar, body); box.append(card);
    box.addEventListener('mousedown', e => { if (e.target === box) close(); });
    keyHandler = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab' || !overlay) return;
      const loop = [...overlay.querySelectorAll('a.bs-pv-act, button.bs-pv-x')], first = loop[0], last = loop[loop.length - 1];   // Tab stays inside the viewer
      if (!first) return;
      if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyHandler, true);
    overlay = box; document.body.append(box); document.documentElement.classList.add('bs-pv-open');
    closeBtn.focus();
    return { box, body, msg, label, actions, closeBtn, meta };
  }
  function action(view, label, href, extra, primary) {
    const a = el('a', 'bs-pv-act' + (primary ? ' primary' : ''), label); a.href = href; Object.assign(a, extra || {});
    view.actions.insertBefore(a, view.closeBtn); return a;
  }
  function fail(view, text, portalHref) {
    view.body.textContent = '';
    const msg = el('div', 'bs-pv-msg'); const mark = el('span', 'bs-pv-bad', '!'); mark.setAttribute('aria-hidden', 'true'); msg.append(mark, el('p', '', text));
    if (portalHref) { const a = el('a', 'bs-pv-act', 'Download from the portal'); a.href = portalHref; a.target = '_blank'; a.rel = 'noopener'; msg.append(a); }
    view.body.append(msg);
  }

  async function readLimited(res) {
    // One read of the whole body is the fastest way. The size is checked before and after (a percentage was misleading: the portal's length is for the compressed file).
    if ((+res.headers.get('content-length') || 0) > P.MAX_BYTES) throw new Error('big');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > P.MAX_BYTES) throw new Error('big');
    return buf;
  }

  async function open(href, info, from) {
    close(); opener = from;
    const view = viewer(info), mine = run, portalHref = href;
    try {
      const safe = P.fileUrl(href, location.href);
      if (!safe) throw new Error('This link is not a file on the LMS.');
      abort = new AbortController(); timedOut = false; const giveUp = setTimeout(() => { timedOut = true; try { abort.abort(); } catch (e) { /* done */ } }, 60000);
      const res = await fetch(safe, { credentials: 'same-origin', signal: abort.signal });
      if (mine !== run) return;
      if (!res.ok) throw new Error('The portal answered ' + res.status + '. Try again, or sign in again.');
      if (/text\/html/i.test(res.headers.get('content-type') || '') && P.kindOf(info.ext) !== 'text') throw new Error('The portal sent a page instead of the file. Your sign-in may have ended: sign in again and retry.');
      const slow = setTimeout(() => { if (mine === run) view.label.textContent = 'Still loading… the portal is slow to answer.'; }, 8000);
      let bytes; try { bytes = await readLimited(res); } finally { clearTimeout(slow); clearTimeout(giveUp); }
      if (mine === run) view.label.textContent = 'Opening…';
      if (mine !== run) return;
      if (!P.sniff(bytes, info.ext)) throw new Error('This file does not look like a real ' + info.ext.toUpperCase() + ' file, so it is not shown.');
      view.meta.textContent = info.ext.toUpperCase() + ' · ' + P.readableSize(bytes.length);
      const mime = P.mimeFor(info.ext), blob = new Blob([bytes], { type: mime }), kind = P.kindOf(info.ext);
      const saved = keep(blob);
      view.body.textContent = '';
      if (kind === 'pdf') {
        const frame = el('iframe', 'bs-pv-frame'); frame.title = info.name; frame.src = saved; view.body.append(frame);
        const back = () => { if (overlay === view.box && (document.activeElement === frame || document.activeElement === document.body)) view.closeBtn.focus(); };
        frame.addEventListener('load', back); setTimeout(back, 500);
        action(view, 'Open in new tab', saved, { target: '_blank', rel: 'noopener' });
      } else if (kind === 'image') {
        const img = el('img', 'bs-pv-img'); img.alt = info.name; img.src = saved; view.body.append(img);
        action(view, 'Open in new tab', saved, { target: '_blank', rel: 'noopener' });
      } else if (kind === 'text') {
        const text = new TextDecoder('utf-8').decode(bytes.subarray(0, 1000000)), pre = el('pre', 'bs-pv-text'); pre.textContent = text; view.body.append(pre);
        if (bytes.length > 1000000) view.body.append(el('p', 'bs-pv-note', 'Only the first part of this file is shown. Download it to see everything.'));
      } else if (kind === 'docx') {
        const made = await D.render(Z.open(bytes), document);
        if (mine !== run) { made.urls.forEach(u => URL.revokeObjectURL(u)); return; }
        made.urls.forEach(u => urls.push(u));
        view.body.append(made.node);
        if (made.cut) view.body.append(el('p', 'bs-pv-note', 'This is a long document, so only the first part is shown. Download it to see everything.'));
        view.body.append(el('p', 'bs-pv-note', 'A simple preview: some layout, fonts and shapes are not shown. Download the file for the exact look.'));
      } else throw new Error('This type of file cannot be previewed yet.');
      action(view, 'Download', saved, { download: info.name }, true);
    } catch (e) {
      if (mine !== run) return;
      if (timedOut) return fail(view, 'The portal took too long to send this file. Try again, or download it from the portal.', portalHref);
      if (e && e.name === 'AbortError') return;
      const text = e && e.message === 'big' ? 'This file is larger than ' + P.readableSize(P.MAX_BYTES) + ', so it is not previewed.' : (e && e.message) || 'The file could not be opened.';
      fail(view, text, portalHref);
    }
  }

  // ---------------------------------------------------------------- the buttons
  function mount() {
    if (window !== window.top || location.hostname !== 'lms.bahria.edu.pk' || !document.body) return;
    document.querySelectorAll('a[href*="Download.php"]').forEach(a => {
      if (a.hasAttribute('data-bs-pv') || a.closest('.bs-pv')) return;   // never decorate the viewer's own links
      const safe = P.fileUrl(a.getAttribute('href'), location.href), info = safe && P.parseKey(safe);
      if (!info || !P.supported(info.ext)) return;
      a.setAttribute('data-bs-pv', '');
      const b = el('button', 'bs-pv-btn'); b.type = 'button'; b.title = 'View ' + info.name + ' here, without downloading it'; b.setAttribute('aria-label', 'Preview ' + info.name);
      b.append(eye(), document.createTextNode(' Preview'));
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(safe, info, b); });
      a.after(b); owned.add(b);
    });
  }
  function disable() {
    close();
    owned.forEach(b => b.remove()); owned.clear();
    document.querySelectorAll('a[data-bs-pv]').forEach(a => a.removeAttribute('data-bs-pv'));
  }
  globalThis.BahriaPreviewer = { mount, disable };
})();
