// The list of what is inside a .zip, for the file preview. Names are shown as text only, sizes as the archive states them, and a file inside can be opened from the list when it is a type that can be previewed.
(function (root) {
  'use strict';
  const MAX_ROWS = 2000;

  const size = n => !Number.isFinite(n) || n < 0 ? '' : n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (Math.round(n / 104857.6) / 10) + ' MB';
  const extOf = name => { const base = name.slice(name.lastIndexOf('/') + 1), dot = base.lastIndexOf('.'); return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''; };

  // zip: a BahriaZip handle. canOpen(ext) says whether a file of that type can be previewed; open(name, ext) is called when its button is pressed.
  function render(zip, doc, canOpen, open) {
    const mk = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const wrap = mk('div', 'bs-ar');
    const all = [...zip.entries.values()].filter(e => !e.name.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(e.name));
    const files = all.filter(e => !e.dir);
    const total = files.reduce((n, e) => n + e.size, 0);
    wrap.append(mk('p', 'bs-ar-sum', files.length + (files.length === 1 ? ' file' : ' files') + (total ? ' · ' + size(total) + ' unpacked' : '')));
    if (!all.length) { wrap.append(mk('p', 'bs-pv-note', 'This archive is empty.')); return { node: wrap, cut: false }; }
    const table = mk('table', 'bs-ar-list'), body = mk('tbody');
    let shown = 0;
    for (const e of all.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (++shown > MAX_ROWS) break;
      const parts = e.name.replace(/\/$/, '').split('/'), depth = Math.min(parts.length - 1, 8), label = parts[parts.length - 1] || e.name;
      const tr = mk('tr', e.dir ? 'dir' : ''), name = mk('td', 'bs-ar-name'), inner = mk('span', '', (e.dir ? '▸ ' : '') + label);
      inner.style.paddingLeft = depth * 18 + 'px'; inner.title = e.name; name.append(inner);
      const sz = mk('td', 'bs-ar-size', e.dir ? '' : size(e.size)), act = mk('td', 'bs-ar-act');
      if (!e.dir) {
        if (e.encrypted) act.append(mk('span', 'bs-ar-lock', 'Password protected'));
        else if (canOpen(extOf(e.name))) {
          const b = mk('button', 'bs-ar-open', 'Preview'); b.type = 'button'; b.setAttribute('aria-label', 'Preview ' + label);
          b.addEventListener('click', () => open(e.name, extOf(e.name), b)); act.append(b);
        }
      }
      tr.append(name, sz, act); body.append(tr);
    }
    table.append(body); wrap.append(table);
    if (all.length > MAX_ROWS) wrap.append(mk('p', 'bs-pv-note', 'Only the first ' + MAX_ROWS + ' entries are listed. Download the file to see everything.'));
    return { node: wrap, cut: all.length > MAX_ROWS };
  }

  root.BahriaArchive = { render, extOf };
})(globalThis);
