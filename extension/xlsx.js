// A small Excel (.xlsx) reader for the file preview. An .xlsx is a zip of XML files; this turns each sheet into a table (values only: formulas show their last saved result).
// Everything is read with DOMParser and drawn with textContent by grid.js, so nothing in the file can become markup or run.
(function (root) {
  'use strict';
  const G = root.BahriaGrid;
  const LIMIT = 24 * 1024 * 1024, MAX_SHEETS = 40;

  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const attr = (el, name) => el ? (el.getAttribute(name) ?? el.getAttribute('r:' + name)) : null;
  const parse = text => { const x = new DOMParser().parseFromString(text, 'application/xml'); if (x.querySelector('parsererror')) throw new Error('This Excel file looks damaged.'); return x; };
  const clean = (base, target) => {   // a relationship target, made into a path inside the zip
    const parts = (target.startsWith('/') ? target.slice(1) : base + '/' + target).split('/'), out = [];
    for (const p of parts) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p); }
    return out.join('/');
  };
  const textOf = si => { let s = ''; (function walk(n) { for (const c of n.children) { if (c.localName === 't') s += c.textContent; else if (c.localName !== 'rPh' && c.localName !== 'phoneticPr') walk(c); } })(si); return s; };
  // "B3" -> row 2, column 1
  function ref(r) {
    const m = /^([A-Z]+)(\d+)$/i.exec(r || ''); if (!m) return null;
    let c = 0; for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
    return { r: +m[2] - 1, c: c - 1 };
  }

  async function render(zip, doc) {
    if (!zip.has('xl/workbook.xml')) throw new Error('This does not look like an Excel workbook.');
    const wb = parse(await zip.readText('xl/workbook.xml', LIMIT));
    const rels = new Map();
    if (zip.has('xl/_rels/workbook.xml.rels')) for (const r of parse(await zip.readText('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')) rels.set(r.getAttribute('Id'), r.getAttribute('Target') || '');
    const wbPr = [...wb.documentElement.children].find(c => c.localName === 'workbookPr'), is1904 = !!wbPr && /^(1|true)$/i.test(wbPr.getAttribute('date1904') || '');

    const shared = [];
    if (zip.has('xl/sharedStrings.xml')) for (const si of parse(await zip.readText('xl/sharedStrings.xml', LIMIT)).documentElement.children) if (si.localName === 'si') shared.push(textOf(si));

    const custom = new Map(), xfs = [];   // number formats: by id, and which one each cell style uses
    if (zip.has('xl/styles.xml')) {
      const st = parse(await zip.readText('xl/styles.xml', LIMIT)).documentElement;
      for (const f of kids(kid(st, 'numFmts'), 'numFmt')) custom.set(+f.getAttribute('numFmtId'), f.getAttribute('formatCode') || '');
      for (const x of kids(kid(st, 'cellXfs'), 'xf')) xfs.push(+x.getAttribute('numFmtId') || 0);
    }
    const shape = id => { const code = custom.get(id); return { id, code, date: G.isDate(id, code) }; };

    const sheets = []; let cells = 0;
    const list = kids(kid(wb.documentElement, 'sheets'), 'sheet').slice(0, MAX_SHEETS);
    for (const s of list) {
      const target = rels.get(attr(s, 'id')), path = target && clean('xl', target);
      const out = { name: s.getAttribute('name') || '', hidden: /hidden/i.test(s.getAttribute('state') || ''), rows: new Map(), merges: [], widths: new Map(), maxRow: -1, maxCol: -1 };
      sheets.push(out);
      if (!path || !zip.has(path) || /chartsheet|dialogsheet/i.test(target)) { out.hidden = out.hidden || /chartsheet|dialogsheet/i.test(target || ''); continue; }
      const ws = parse(await zip.readText(path, LIMIT)).documentElement;
      for (const cols of kids(ws, 'cols')) for (const c of kids(cols, 'col')) {
        const w = parseFloat(c.getAttribute('width')), lo = +c.getAttribute('min') - 1, hi = Math.min(+c.getAttribute('max') - 1, lo + 200);
        if (w > 0 && lo >= 0) for (let i = lo; i <= hi; i++) out.widths.set(i, w * 7 + 6);
      }
      for (const m of kids(kid(ws, 'mergeCells'), 'mergeCell')) {
        const [a, b] = (m.getAttribute('ref') || '').split(':'), p = ref(a), q = ref(b || a);
        if (p && q) out.merges.push({ r1: p.r, c1: p.c, r2: q.r, c2: q.c });
      }
      for (const row of kids(kid(ws, 'sheetData'), 'row')) {
        let nextCol = 0;
        const rowIndex = row.getAttribute('r') ? +row.getAttribute('r') - 1 : null;
        for (const c of kids(row, 'c')) {
          if (++cells > 400000) break;
          const at = ref(c.getAttribute('r')) || { r: rowIndex === null ? out.maxRow + 1 : rowIndex, c: nextCol };
          nextCol = at.c + 1;
          const t = c.getAttribute('t') || 'n', v = kid(c, 'v'), raw = v ? v.textContent : '';
          let text = '', right = false;
          if (t === 's') text = shared[+raw] ?? '';
          else if (t === 'str') text = raw;
          else if (t === 'inlineStr') { const is = kid(c, 'is'); text = is ? textOf(is) : ''; }
          else if (t === 'b') { text = raw === '1' ? 'TRUE' : 'FALSE'; right = true; }
          else if (t === 'e') text = raw;
          else if (raw !== '') {
            const n = Number(raw);
            if (Number.isFinite(n)) { const f = shape(xfs[+c.getAttribute('s') || 0] || 0); text = f.date ? G.formatDate(n, G.dateCode(f.id, f.code), is1904) : G.formatNumber(n, f.id, f.code); right = true; }
            else text = raw;
          }
          if (text === '') continue;   // styled but empty cells add nothing
          out.maxRow = Math.max(out.maxRow, at.r); out.maxCol = Math.max(out.maxCol, at.c);
          if (at.r >= G.LIMITS.rows || at.c >= G.LIMITS.cols) continue;   // beyond what is shown (the note says so)
          let r = out.rows.get(at.r); if (!r) out.rows.set(at.r, r = new Map());
          r.set(at.c, { text, right });
        }
      }
    }
    const made = G.render(doc, sheets);
    return { node: made.node, urls: [], cut: made.cut };
  }

  root.BahriaXlsx = { render };
})(globalThis);
