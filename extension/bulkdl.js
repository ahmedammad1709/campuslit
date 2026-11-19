// "Download all" on the LMS Lecture Notes page: every file listed for the course on screen, fetched one at a time with the student's own sign-in and handed to the
// browser as one zip. A popup shows a progress ring and which file is being fetched. Nothing is requested until the button is pressed, nothing is sent anywhere,
// and the files only live in memory until the zip is saved (or the popup is closed).
(function () {
  'use strict';
  const P = globalThis.BahriaPreview, ZW = globalThis.BahriaZipWrite;
  if (!P || !ZW) return;
  const LIMITS = { files: 150, total: 400 * 1024 * 1024, file: 150 * 1024 * 1024, perFile: 120000, gap: 120 };
  const owned = new Set();
  let overlay = null, run = 0, abort = null, urls = [], opener = null, keyHandler = null, bar = null;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
  const chosen = selector => {   // the course the page itself has selected, as plain text
    const select = document.querySelector(selector); if (!select) return '';
    const option = select.querySelector('option[selected]') || (select.selectedOptions && select.selectedOptions[0]);
    return option && option.getAttribute('value') !== '' ? clean(option.textContent).slice(0, 80) : '';
  };

  // The ring, as in the file preview: it fills with the share of files done, with the percentage in the middle.
  const R = 32, C = 2 * Math.PI * R;
  function ring() {
    const ns = 'http://www.w3.org/2000/svg', wrap = el('span', 'bs-pv-ring'), svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('aria-hidden', 'true');
    const mk = cls => { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '40'); c.setAttribute('cy', '40'); c.setAttribute('r', String(R)); c.setAttribute('fill', 'none'); c.setAttribute('class', cls); return c; };
    const arc = mk('bs-pv-arc'); arc.setAttribute('stroke-dasharray', String(C)); arc.setAttribute('stroke-dashoffset', String(C));
    svg.append(mk('bs-pv-track'), arc);
    const pct = el('span', 'bs-pv-pct', '0%'); wrap.append(svg, pct);
    return { node: wrap, set(f) { const p = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0)); arc.setAttribute('stroke-dashoffset', String(C * (1 - p))); pct.textContent = Math.round(p * 100) + '%'; } };
  }
  const size = n => P.readableSize(n);

  // ---------------------------------------------------------------- the files on the page
  function collect() {
    const scope = document.querySelector('.content-wrapper section.content') || document, found = [], seen = new Set();
    for (const a of scope.querySelectorAll('table a[href*="Download.php"]')) {
      if (a.closest('.bs-pv, .bs-bulk')) continue;
      const safe = P.fileUrl(a.getAttribute('href'), location.href);
      if (!safe || seen.has(safe)) continue;
      seen.add(safe);
      const row = a.closest('tr'), cells = row ? [...row.querySelectorAll(':scope > td')] : [];
      const week = cells[0] ? clean(cells[0].textContent) : '', title = cells[1] ? clean(cells[1].textContent) : '';
      found.push({ href: a.getAttribute('href'), label: (title || clean(a.textContent) || 'Lecture').slice(0, 90), week: /^\d{1,3}$/.test(week) ? week : '', table: a.closest('table') });
    }
    return found;
  }

  // ---------------------------------------------------------------- one file
  // Returns { name, bytes }. Throws an Error whose message is meant for the student. `external` is the "stop everything" signal.
  async function fetchOne(item, index, onProgress, external) {
    const safe = P.fileUrl(item.href, location.href);
    if (!safe) throw new Error('This link is not a file on the LMS.');
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (external.aborted) throw Object.assign(new Error('Stopped.'), { stopped: true });
      const ctl = new AbortController(), stop = () => ctl.abort();
      external.addEventListener('abort', stop);
      let timedOut = false; const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, LIMITS.perFile);
      try {
        const res = await fetch(safe, { credentials: 'same-origin', signal: ctl.signal });
        if (!res.ok) { last = new Error('The portal answered ' + res.status + '.'); last.retry = res.status >= 500; if (last.retry) continue; throw last; }
        const type = res.headers.get('content-type') || '';
        if (/text\/html/i.test(type)) throw Object.assign(new Error('The portal sent a page instead of the file. Your sign-in may have ended.'), { session: true });
        const known = +res.headers.get('content-length') || 0;
        if (known > LIMITS.file) throw new Error('This file is larger than ' + size(LIMITS.file) + '.');
        const parts = []; let total = 0;
        if (res.body && res.body.getReader) {
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > LIMITS.file) { try { await reader.cancel(); } catch (e) { /* stopped */ } throw new Error('This file is larger than ' + size(LIMITS.file) + '.'); }
            parts.push(value); onProgress(known && total <= known ? total / known : 0);
          }
        } else { const buf = new Uint8Array(await res.arrayBuffer()); parts.push(buf); total = buf.length; }
        if (!total) throw new Error('The portal sent an empty file.');
        const bytes = new Uint8Array(total); let at = 0; for (const p of parts) { bytes.set(p, at); at += p.length; }
        const named = P.nameFromHeaders(res.headers), ext = named ? '' : P.extFromType(type);
        const name = named ? named.name : String(index + 1).padStart(2, '0') + ' ' + item.label + (ext ? '.' + ext : '');
        return { name, bytes };
      } catch (e) {
        if (external.aborted) throw Object.assign(new Error('Stopped.'), { stopped: true });
        if (timedOut) { last = new Error('The portal took too long to send this file.'); continue; }
        if (e && (e.session || (e.message && !/^TypeError|Failed to fetch|NetworkError|network/i.test(e.name + ' ' + e.message)))) throw e;
        last = new Error('The connection to the portal failed.');                       // a network error: one more try
      } finally { clearTimeout(timer); external.removeEventListener('abort', stop); }
    }
    throw last || new Error('This file could not be downloaded.');
  }

  // ---------------------------------------------------------------- the popup
  function closeDialog() {
    run++;                                               // anything still running is dropped
    if (abort) { try { abort.abort(); } catch (e) { /* done */ } abort = null; }
    if (keyHandler) { document.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
    if (overlay) { overlay.remove(); overlay = null; }
    urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    document.documentElement.classList.remove('bs-pv-open');
    if (opener && opener.isConnected) { try { opener.focus(); } catch (e) { /* gone */ } }
    opener = null;
  }
  function dialog(course, count) {
    const box = el('div', 'bs-pv'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Download all lecture notes');
    const card = el('div', 'bs-pv-card bs-bulk-card'), top = el('div', 'bs-pv-bar'), head = el('div', 'bs-pv-head');
    const badge = el('span', 'bs-pv-badge k-zip', 'ZIP'); badge.setAttribute('aria-hidden', 'true');
    const lines = el('div', 'bs-pv-lines'); lines.append(el('b', 'bs-pv-title', 'Lecture notes' + (course ? ' - ' + course : '')), el('span', 'bs-pv-meta', count + (count === 1 ? ' file' : ' files')));
    head.append(badge, lines);
    const actions = el('div', 'bs-pv-actions'); top.append(head, actions);
    const body = el('div', 'bs-pv-body bs-bulk-body'); card.append(top, body); box.append(card);
    box.addEventListener('mousedown', e => { if (e.target === box && view.onClose) view.onClose(); });
    const view = { box, body, actions, onClose: null, lines, meta: lines.querySelector('.bs-pv-meta') };
    keyHandler = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (view.onClose) view.onClose(); return; }
      if (e.key !== 'Tab' || !overlay) return;
      const loop = [...overlay.querySelectorAll('button.bs-pv-act, button.bs-pv-x')]; if (!loop.length) return;
      const first = loop[0], last = loop[loop.length - 1];
      if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyHandler, true);
    overlay = box; document.body.append(box); document.documentElement.classList.add('bs-pv-open');
    return view;
  }
  const button = (view, label, cls, handler) => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', handler); view.actions.append(b); return b; };

  function save(blob, name) {
    const url = URL.createObjectURL(blob); urls.push(url);
    const link = document.createElement('a'); link.href = url; link.download = name; link.style.display = 'none';
    document.body.append(link); link.click(); link.remove();
    return url;
  }

  async function start(items, course, from) {
    closeDialog(); opener = from;
    const mine = run, n = items.length, view = dialog(course, n);
    abort = new AbortController(); const external = abort.signal;
    const progress = ring(), label = el('span', 'bs-pv-label', 'Starting...'), file = el('span', 'bs-bulk-file', ''), msg = el('div', 'bs-pv-msg bs-bulk-msg');
    msg.setAttribute('role', 'status'); msg.append(progress.node, label, file); view.body.append(msg);
    const cancel = button(view, 'Cancel', 'bs-pv-x', () => view.onClose && view.onClose());
    let stopped = false; view.onClose = () => { stopped = true; if (abort) abort.abort(); };
    cancel.focus();

    const writer = ZW.writer(), failed = [], tooBig = []; let done = 0, bytes = 0, sessionEnded = false;
    for (let i = 0; i < n && !stopped; i++) {
      if (mine !== run) return;
      const item = items[i];
      label.textContent = 'Downloading ' + (i + 1) + ' of ' + n; file.textContent = item.label;
      progress.set(i / n);
      try {
        const got = await fetchOne(item, i, f => { if (mine === run) progress.set((i + f) / n); }, external);
        if (mine !== run) return;
        if (bytes + got.bytes.length > LIMITS.total) { tooBig.push(item.label); continue; }
        await writer.add(got.name, got.bytes); bytes += got.bytes.length; done++;
      } catch (e) {
        if (mine !== run) return;
        if (e && e.stopped) break;
        if (e && /too many files|too large|must be bytes/i.test(e.message || '')) { failed.push({ label: item.label, why: e.message }); continue; }
        failed.push({ label: item.label, why: (e && e.message) || 'It could not be downloaded.' });
        if (e && e.session) { sessionEnded = true; for (let k = i + 1; k < n; k++) failed.push({ label: items[k].label, why: 'Not tried: your sign-in ended.' }); break; }
      }
      progress.set((i + 1) / n);
      if (i + 1 < n && !stopped) await sleep(LIMITS.gap);
    }
    if (mine !== run) return;
    if (stopped && !done) { closeDialog(); return; }   // stopped before anything was fetched: nothing to show
    view.actions.replaceChildren(); view.body.replaceChildren();

    // ---- the result
    const name = ZW.safeName((course || 'Lecture notes') + ' - lecture notes') + '.zip';
    const result = el('div', 'bs-pv-msg bs-bulk-result');
    const mark = el('span', done ? 'bs-bulk-ok' : 'bs-pv-bad', done ? '✓' : '!'); mark.setAttribute('aria-hidden', 'true');
    const title = el('b', 'bs-bulk-title');
    const bits = [];
    if (stopped) bits.push(done ? 'Stopped. ' + done + (done === 1 ? ' file was' : ' files were') + ' downloaded before you stopped.' : 'Stopped.');
    else if (done) bits.push('Saved ' + done + ' of ' + n + (n === 1 ? ' file' : ' files') + ' (' + size(bytes) + ') as ' + name + '.');
    else bits.push('Nothing could be downloaded.');
    title.textContent = bits[0]; result.append(mark, title);
    if (sessionEnded) result.append(el('p', 'bs-bulk-note', 'Your sign-in on the portal seems to have ended. Sign in again, then try again.'));
    if (tooBig.length) result.append(el('p', 'bs-bulk-note', tooBig.length + (tooBig.length === 1 ? ' file was' : ' files were') + ' left out so the zip stays under ' + size(LIMITS.total) + ': ' + tooBig.slice(0, 5).join(', ') + (tooBig.length > 5 ? ' and ' + (tooBig.length - 5) + ' more' : '') + '. Download them one by one from the page.'));
    if (failed.length && !sessionEnded) {
      result.append(el('p', 'bs-bulk-note', failed.length + (failed.length === 1 ? ' file' : ' files') + ' could not be downloaded. Try them again from the page:'));
      const ul = el('ul', 'bs-bulk-failed'); for (const f of failed.slice(0, 8)) ul.append(el('li', '', f.label + ' - ' + f.why)); if (failed.length > 8) ul.append(el('li', '', 'and ' + (failed.length - 8) + ' more'));
      result.append(ul);
    }
    view.body.append(result);
    view.onClose = closeDialog;
    if (done) {
      const blob = writer.finish();
      const go = () => save(blob, name);
      if (!stopped) go();                                                     // the zip is saved at once; "Save again" is there in case it was missed
      const again = button(view, stopped ? 'Save ' + done + (done === 1 ? ' file' : ' files') : 'Save again', 'bs-pv-act' + (stopped ? ' primary' : ''), go);
      button(view, 'Close', 'bs-pv-x', closeDialog);
      (stopped ? again : view.actions.lastChild).focus();
    } else { button(view, 'Close', 'bs-pv-x', closeDialog).focus(); }
  }

  // ---------------------------------------------------------------- the button on the page
  function mount() {
    if (window !== window.top || location.hostname !== 'lms.bahria.edu.pk' || !document.body || !/\/lecturenotes\.php$/i.test(location.pathname)) return;
    const found = collect();
    if (!found.length) { unmountBar(); return; }
    const items = found.slice(0, LIMITS.files), count = items.length, course = chosen('#courseId');
    const signature = count + '|' + course + '|' + items.map(i => i.href.slice(-24)).join(',');
    if (bar && bar.isConnected && bar.dataset.sig === signature) return;
    unmountBar();
    bar = el('section', 'bs-bulk'); bar.dataset.sig = signature; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Download all lecture notes');
    const text = el('div', 'bs-bulk-text');
    text.append(el('b', '', 'Download all lecture notes'), el('span', '', count + (count === 1 ? ' file' : ' files') + (found.length > count ? ' (the first ' + count + ' of ' + found.length + ')' : '') + ' in this course, saved as one zip.'));
    const go = el('button', 'bs-bulk-go', 'Download all (' + count + ')'); go.type = 'button';
    go.addEventListener('click', () => { if (!overlay) start(items, course, go); });
    bar.append(text, go); owned.add(bar);
    const table = items[0].table, anchor = table.closest('.box') || table.closest('.table-responsive') || table;
    anchor.parentNode.insertBefore(bar, anchor);
  }
  function unmountBar() { if (bar) { bar.remove(); owned.delete(bar); bar = null; } }
  function disable() { closeDialog(); unmountBar(); }
  globalThis.BahriaBulk = { mount, disable };
})();
