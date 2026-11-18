// File preview on the LMS: a Preview button beside each download link (Lecture Notes, your own submissions, assignment files) and a viewer on top of the page.
// The file is fetched with the student's own sign-in, kept in memory only, shown, and forgotten when the viewer closes. Nothing is saved, stored or sent anywhere.
(function () {
  'use strict';
  const P = globalThis.BahriaPreview, Z = globalThis.BahriaZip, D = globalThis.BahriaDocx, X = globalThis.BahriaXlsx, Pp = globalThis.BahriaPptx, A = globalThis.BahriaArchive, L = globalThis.BahriaLegacy, G = globalThis.BahriaGrid;
  if (!P || !Z || !D || !X || !Pp || !A || !L || !G) return;
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
  // A progress ring: fills as the file arrives, with the percentage in the middle. With no usable size it turns instead of filling.
  const R = 32, C = 2 * Math.PI * R;
  function ring() {
    const ns = 'http://www.w3.org/2000/svg', wrap = el('span', 'bs-pv-ring'), svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('aria-hidden', 'true');
    const mk = cls => { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '40'); c.setAttribute('cy', '40'); c.setAttribute('r', String(R)); c.setAttribute('fill', 'none'); c.setAttribute('class', cls); return c; };
    const bar = mk('bs-pv-arc'); bar.setAttribute('stroke-dasharray', String(C)); bar.setAttribute('stroke-dashoffset', String(C));
    svg.append(mk('bs-pv-track'), bar);
    const pct = el('span', 'bs-pv-pct', '0%');
    wrap.append(svg, pct);
    return { node: wrap, set(f) {
      if (f === null) { wrap.classList.add('turn'); bar.setAttribute('stroke-dashoffset', String(C * .72)); pct.textContent = ''; return; }
      wrap.classList.remove('turn'); const p = Math.max(0, Math.min(1, f));
      bar.setAttribute('stroke-dashoffset', String(C * (1 - p))); pct.textContent = Math.round(p * 100) + '%';
    } };
  }
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
    const title = el('b', 'bs-pv-title', info.name || 'File'), meta = el('span', 'bs-pv-meta', info.ext.toUpperCase());
    const badge = el('span', 'bs-pv-badge k-' + P.kindOf(info.ext), (info.ext || 'file').slice(0, 4).toUpperCase()); badge.setAttribute('aria-hidden', 'true');
    const lines = el('div', 'bs-pv-lines'); lines.append(title, meta);
    head.append(badge, lines);
    const actions = el('div', 'bs-pv-actions');
    const closeBtn = el('button', 'bs-pv-x', 'Close'); closeBtn.type = 'button'; closeBtn.addEventListener('click', close);
    actions.append(closeBtn);
    bar.append(head, actions);
    const body = el('div', 'bs-pv-body'), msg = el('div', 'bs-pv-msg'), label = el('span', 'bs-pv-label', 'Loading…'); msg.setAttribute('role', 'status');
    const dial = ring(); msg.append(dial.node, label);
    body.append(msg);
    card.append(bar, body); box.append(card);
    box.addEventListener('mousedown', e => { if (e.target === box) close(); });
    keyHandler = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab' || !overlay) return;
      const loop = [...overlay.querySelectorAll('a.bs-pv-act, button.bs-pv-act, button.bs-pv-x')], first = loop[0], last = loop[loop.length - 1];   // Tab stays inside the viewer
      if (!first) return;
      if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyHandler, true);
    overlay = box; document.body.append(box); document.documentElement.classList.add('bs-pv-open');
    closeBtn.focus();
    // The link did not say what the file is; once the answer comes back the heading learns it.
    const learn = got => { info = got; title.textContent = got.name; meta.textContent = got.ext.toUpperCase(); badge.textContent = got.ext.slice(0, 4).toUpperCase(); badge.className = 'bs-pv-badge k-' + P.kindOf(got.ext); box.setAttribute('aria-label', 'Preview of ' + got.name); };
    return { box, body, msg, label, dial, actions, closeBtn, meta, learn };
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

  async function readLimited(res, onProgress) {
    const known = +res.headers.get('content-length') || 0;
    if (known > P.MAX_BYTES) throw new Error('big');
    if (!res.body || !res.body.getReader) { const buf = new Uint8Array(await res.arrayBuffer()); if (buf.length > P.MAX_BYTES) throw new Error('big'); return buf; }
    const reader = res.body.getReader(), parts = []; let total = 0, last = 0;
    onProgress(known ? 0 : null);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > P.MAX_BYTES) { try { await reader.cancel(); } catch (e) { /* stopped */ } throw new Error('big'); }
      parts.push(value);
      const now = performance.now();
      if (now - last > 50) { last = now; onProgress(known && total <= known ? total / known : null); }   // more bytes than announced: the length was for a compressed copy, so show a turning ring instead
    }
    const out = new Uint8Array(total); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
    onProgress(1);
    return out;
  }

  // Shows one file's bytes in the viewer, by kind. A zip lists its files and lets each previewable one open in place (depth 1), with a way back to the list.
  async function present(view, bytes, info, mine, depth) {
    if (!P.sniff(bytes, info.ext)) throw new Error('This file does not look like a real ' + info.ext.toUpperCase() + ' file, so it is not shown.');
    view.meta.textContent = info.ext.toUpperCase() + ' · ' + P.readableSize(bytes.length);
    const kind = P.kindOf(info.ext), saved = keep(new Blob([bytes], { type: P.mimeFor(info.ext) })), added = [];
    view.body.textContent = '';
    const note = text => view.body.append(el('p', 'bs-pv-note', text));
    const adopt = made => { made.urls.forEach(u => urls.push(u)); };
    if (kind === 'pdf') {
      const frame = el('iframe', 'bs-pv-frame'); frame.title = info.name; frame.src = saved; view.body.append(frame);
      const back = () => { if (overlay === view.box && (document.activeElement === frame || document.activeElement === document.body)) view.closeBtn.focus(); };
      frame.addEventListener('load', back); setTimeout(back, 500);
      added.push(action(view, 'Open in new tab', saved, { target: '_blank', rel: 'noopener' }));
    } else if (kind === 'image') {
      const img = el('img', 'bs-pv-img'); img.alt = info.name; img.src = saved; view.body.append(img);
      added.push(action(view, 'Open in new tab', saved, { target: '_blank', rel: 'noopener' }));
    } else if (kind === 'text') {
      const text = new TextDecoder('utf-8').decode(bytes.subarray(0, 1000000)), pre = el('pre', 'bs-pv-text'); pre.textContent = text; view.body.append(pre);
      if (bytes.length > 1000000) note('Only the first part of this file is shown. Download it to see everything.');
    } else if (kind === 'docx') {
      const made = await D.render(Z.open(bytes), document);
      if (mine !== run) { made.urls.forEach(u => URL.revokeObjectURL(u)); return added; }
      adopt(made); view.body.append(made.node);
      if (made.cut) note('This is a long document, so only the first part is shown. Download it to see everything.');
      note('A simple preview: some layout, fonts and shapes are not shown. Download the file for the exact look.');
    } else if (kind === 'xlsx') {
      const made = await X.render(Z.open(bytes), document);
      if (mine !== run) return added;
      view.body.append(made.node);
      if (made.cut) note('This is a large workbook, so only the first ' + G.LIMITS.rows + ' rows and ' + G.LIMITS.cols + ' columns of each sheet are shown. Download it to see everything.');
      note('Values only: formulas show their last saved result, and charts, pictures and colours are not shown. Download the file for the exact look.');
    } else if (kind === 'pptx') {
      const made = await Pp.render(Z.open(bytes), document);
      if (mine !== run) { made.urls.forEach(u => URL.revokeObjectURL(u)); return added; }
      adopt(made); view.body.append(made.node);
      if (made.cut) note('This is a large presentation, so only part of it is shown. Download it to see everything.');
      note('A simple preview: gradients, shadows, charts, animations and some fonts are not shown. Download the file for the exact look.');
    } else if (kind === 'legacy') {
      const made = L.render(bytes, document);
      if (mine !== run) return added;
      view.meta.textContent = made.type.toUpperCase() + ' · ' + P.readableSize(bytes.length);
      view.body.append(made.node);
      if (made.cut) note('This is a long file, so only the first part is shown. Download it to see everything.');
      note(made.note);
    } else if (kind === 'zip') {
      const zip = Z.open(bytes), made = A.render(zip, document, ext => P.supported(ext) && (depth > 0 ? P.kindOf(ext) !== 'zip' : true), async (name, ext, from) => {
        if (mine !== run) return;
        const list = made.node, label = name.slice(name.lastIndexOf('/') + 1), inner = { name: label, ext }, mark = view.body.scrollTop;
        const back = el('button', 'bs-pv-act', '‹ Back to the files'); back.type = 'button';
        view.body.textContent = ''; view.body.append(el('div', 'bs-pv-msg', 'Opening ' + label + '…'));
        let extras = [];
        added.forEach(a => { a.style.display = 'none'; });   // the archive's own Download waits while a file inside is open
        const restore = () => { extras.forEach(x => x.remove()); back.remove(); added.forEach(a => { a.style.display = ''; }); view.body.textContent = ''; view.body.append(list); view.meta.textContent = info.ext.toUpperCase() + ' · ' + P.readableSize(bytes.length); view.learn(info); view.body.scrollTop = mark; if (from && from.isConnected) from.focus(); };
        back.addEventListener('click', restore); view.actions.insertBefore(back, view.closeBtn); back.focus();
        try {
          const data = await zip.read(name, P.MAX_BYTES);
          if (mine !== run) return;
          view.learn(inner); extras = await present(view, data, inner, mine, depth + 1);
        } catch (e) {
          if (mine !== run) return;
          view.body.textContent = ''; const msg = el('div', 'bs-pv-msg'), bad = el('span', 'bs-pv-bad', '!'); bad.setAttribute('aria-hidden', 'true');
          msg.append(bad, el('p', '', e && e.message === 'big' ? 'This file is larger than ' + P.readableSize(P.MAX_BYTES) + ', so it is not previewed.' : (e && e.message) || 'This file could not be opened.')); view.body.append(msg);
        }
      });
      view.body.append(made.node);
      if (made.cut) note('Only the first part of the list is shown. Download the file to see everything.');
    } else throw new Error('This type of file cannot be previewed.');
    added.push(action(view, 'Download', saved, { download: info.name }, true));
    return added;
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
      const ctype = res.headers.get('content-type') || '';
      if (!info.ext) {   // the link was scrambled: the answer says what the file is
        const named = P.nameFromHeaders(res.headers), ext = named ? named.ext : P.extFromType(ctype);
        if (ext) {
          info = { name: named ? named.name : 'File.' + ext, ext }; view.learn(info);
          if (!P.supported(ext)) { try { await res.body.cancel(); } catch (e) { /* stopped */ } clearTimeout(giveUp); throw new Error('A .' + ext + ' file cannot be previewed here. Download it from the portal.'); }
        }
      }
      if (/text\/html/i.test(ctype) && P.kindOf(info.ext) !== 'text') throw new Error('The portal sent a page instead of the file. Your sign-in may have ended: sign in again and retry.');
      const slow = setTimeout(() => { if (mine === run) view.label.textContent = 'Still loading… the portal is slow to answer.'; }, 8000);
      let bytes; try { bytes = await readLimited(res, f => { if (mine === run) view.dial.set(f); }); } finally { clearTimeout(slow); clearTimeout(giveUp); }
      if (mine === run) { view.label.textContent = 'Opening…'; view.dial.set(1); }
      if (mine !== run) return;
      if (!info.ext) {   // still unknown: the first bytes decide
        let ext = P.extFromBytes(bytes);
        if (ext === 'zip') { try { const z = Z.open(bytes); ext = z.has('word/document.xml') ? 'docx' : z.has('xl/workbook.xml') ? 'xlsx' : z.has('ppt/presentation.xml') ? 'pptx' : 'zip'; } catch (e) { /* stays a zip */ } }
        else if (ext === 'doc') { try { ext = L.detect(L.open(bytes)) || 'doc'; } catch (e) { /* stays doc */ } }
        if (!ext) throw new Error('This kind of file cannot be previewed. Download it from the portal.');
        info = { name: 'File.' + ext, ext }; view.learn(info);
        if (!P.supported(ext)) throw new Error('A .' + ext + ' file cannot be previewed here. Download it from the portal.');
      }
      await present(view, bytes, info, mine, 0);
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
      const safe = P.fileUrl(a.getAttribute('href'), location.href);
      if (!safe) return;
      const info = P.parseKey(safe) || { name: '', ext: '' };   // the portal scrambles k= now: then the kind is learned when the file comes
      if (info.ext && !P.supported(info.ext)) return;
      a.setAttribute('data-bs-pv', '');
      const b = el('button', 'bs-pv-btn'); b.type = 'button'; b.title = 'View ' + (info.name || 'this file') + ' here, without downloading it'; b.setAttribute('aria-label', 'Preview ' + (info.name || 'file'));
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
