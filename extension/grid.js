// Spreadsheet drawing for the file preview, shared by the new (.xlsx) and old (.xls) readers: number and date formats, and the sheet tabs with their tables.
// Safe by construction: every cell is made with createElement and textContent, never from the file's own markup, and formulas are never run (the last saved result is shown).
(function (root) {
  'use strict';
  const LIMITS = { rows: 1000, cols: 60, cells: 60000 };

  const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

  // ---- formats
  const BUILTIN = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 37: '#,##0', 38: '#,##0', 39: '#,##0.00', 40: '#,##0.00' };
  const bare = code => String(code || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  const BUILTIN_DATES = id => (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58);
  // Is a number format a date or time format? (Format ids below 164 are built in; the rest carry their own pattern.)
  function isDate(id, code) {
    if (code === undefined || code === null || code === '') return BUILTIN_DATES(id);
    const c = bare(code).toLowerCase();
    return /[dmyhs]/.test(c) && !/^[#0,.%\s?_*()$+-]*$/.test(c) && !/^general$/.test(c);
  }
  const BUILTIN_DATE = { 14: 'dd/mm/yyyy', 15: 'd mmm yy', 16: 'd mmm', 17: 'mmm yy', 18: 'hh:mm', 19: 'hh:mm:ss', 20: 'hh:mm', 21: 'hh:mm:ss', 22: 'dd/mm/yyyy hh:mm', 45: 'mm:ss', 46: 'hh:mm:ss', 47: 'mm:ss' };
  const dateCode = (id, code) => code || BUILTIN_DATE[id] || 'dd/mm/yyyy';   // the pattern a date cell is drawn with (built-in formats carry none in the file)
  const plain = v => Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(12)));
  function formatNumber(v, id, code) {
    if (!Number.isFinite(v)) return String(v);
    const pattern = code || BUILTIN[id];
    if (!pattern || /^general$/i.test(pattern)) return plain(v);
    const first = bare(String(pattern).split(';')[0]);
    if (!/[0#]/.test(first) || /e[+-]/i.test(first)) return plain(v);
    const pct = first.includes('%'), dec = Math.min(10, ((/\.([0#]+)/.exec(first) || [])[1] || '').length), x = pct ? v * 100 : v;
    const parts = Math.abs(x).toFixed(dec).split('.');
    if (first.includes(',')) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (x < 0 && /[1-9]/.test(parts.join('')) ? '-' : '') + parts.join('.') + (pct ? '%' : '');
  }
  const two = n => String(n).padStart(2, '0'), MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatDate(serial, code, is1904) {
    if (!Number.isFinite(serial) || serial < 0 || serial > 2958465) return String(serial);
    const base = is1904 ? Date.UTC(1904, 0, 1) : serial < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
    const d = new Date(base + Math.round(serial * 86400000)), c = bare(code).toLowerCase();
    const hasTime = /h|s|am\/pm/.test(c), hasDate = /y|d/.test(c) || (!hasTime && /m/.test(c));
    const date = /mmm/.test(c) ? d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : two(d.getUTCDate()) + '/' + two(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
    const time = two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + (/s/.test(c.replace(/am\/pm/g, '')) ? ':' + two(d.getUTCSeconds()) : '');
    return hasDate && hasTime ? date + ' ' + time : hasTime ? time : date;
  }

  // ---- drawing
  // sheets: [{ name, rows: Map(row -> Map(col -> { text, right })), merges: [{ r1, c1, r2, c2 }], widths: Map(col -> px), maxRow, maxCol }]
  function render(doc, sheets, notes) {
    const mk = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const wrap = mk('div', 'bs-xl');
    let cut = false;
    const shown = sheets.filter(s => !s.hidden);
    const panes = [], tabs = [];
    const tabBar = mk('div', 'bs-xl-tabs'); tabBar.setAttribute('role', 'tablist');

    shown.forEach((sh, n) => {
      const rows = Math.min(sh.maxRow + 1, LIMITS.rows), cols = Math.min(sh.maxCol + 1, LIMITS.cols);
      if (sh.maxRow + 1 > LIMITS.rows || sh.maxCol + 1 > LIMITS.cols) cut = true;
      const pane = mk('div', 'bs-xl-pane'); pane.setAttribute('role', 'tabpanel');
      if (rows <= 0 || cols <= 0) pane.append(mk('p', 'bs-pv-note', 'This sheet is empty.'));
      else {
        const spans = new Map(), covered = new Set();
        for (const m of sh.merges || []) {
          const r2 = Math.min(m.r2, rows - 1), c2 = Math.min(m.c2, cols - 1);
          if (m.r1 >= rows || m.c1 >= cols || (r2 === m.r1 && c2 === m.c1)) continue;
          spans.set(m.r1 + ':' + m.c1, { rs: r2 - m.r1 + 1, cs: c2 - m.c1 + 1 });
          for (let r = m.r1; r <= r2; r++) for (let c = m.c1; c <= c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(r + ':' + c);
        }
        const table = mk('table', 'bs-xl-grid'), colgroup = mk('colgroup'), head = mk('thead'), body = mk('tbody');
        colgroup.append(mk('col', 'bs-xl-numcol'));
        for (let c = 0; c < cols; c++) { const col = mk('col'); const w = sh.widths && sh.widths.get(c); if (w) col.style.width = Math.max(36, Math.min(420, Math.round(w))) + 'px'; colgroup.append(col); }
        const hr = mk('tr'); hr.append(mk('th', 'bs-xl-corner'));
        for (let c = 0; c < cols; c++) hr.append(mk('th', 'bs-xl-col', colName(c)));
        head.append(hr);
        let cells = 0;
        for (let r = 0; r < rows; r++) {
          const tr = mk('tr'), row = sh.rows.get(r); tr.append(mk('th', 'bs-xl-row', String(r + 1)));
          for (let c = 0; c < cols; c++) {
            if (covered.has(r + ':' + c)) continue;
            const cell = row && row.get(c), td = mk('td', cell && cell.right ? 'r' : '', cell ? cell.text : '');
            const sp = spans.get(r + ':' + c); if (sp) { if (sp.rs > 1) td.rowSpan = sp.rs; if (sp.cs > 1) td.colSpan = sp.cs; td.classList.add('m'); }
            tr.append(td);
            if (++cells > LIMITS.cells) { cut = true; break; }
          }
          body.append(tr);
          if (cells > LIMITS.cells) break;
        }
        table.append(colgroup, head, body); pane.append(table);
      }
      pane.hidden = n !== 0; panes.push(pane);
      if (shown.length > 1) {
        const tab = mk('button', 'bs-xl-tab', sh.name || 'Sheet ' + (n + 1)); tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', n === 0 ? 'true' : 'false');
        tab.addEventListener('click', () => { panes.forEach((p, i) => { p.hidden = i !== n; tabs[i].setAttribute('aria-selected', i === n ? 'true' : 'false'); }); });
        tabs.push(tab); tabBar.append(tab);
      }
    });
    if (!shown.length) wrap.append(mk('p', 'bs-pv-note', 'This workbook has no visible sheets.'));
    if (shown.length > 1) wrap.append(tabBar);
    for (const p of panes) wrap.append(p);
    return { node: wrap, cut };
  }

  root.BahriaGrid = { LIMITS, colName, isDate, dateCode, formatNumber, formatDate, render };
})(globalThis);
