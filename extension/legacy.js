// A careful reader for the old Office files (.doc, .xls, .ppt) for the file preview. They are not zip files but "compound files": a small file system inside the file.
// Best effort by design: Word shows its text, Excel its sheets (values only) and PowerPoint the text of its slides. Layout, pictures and formatting are not shown.
// Everything is bounds-checked and read-only; nothing is ever run, and everything is drawn with textContent.
(function (root) {
  'use strict';
  const G = root.BahriaGrid;
  const MAX_STREAM = 60 * 1024 * 1024, MAX_CHARS = 1500000, MAX_SLIDES = 300;
  const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const u16 = (b, o) => (b[o] | b[o + 1] << 8) >>> 0;
  const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
  const need = (ok, msg) => { if (!ok) throw new Error(msg || 'This file looks damaged.'); };
  const f64 = (b, o) => new DataView(b.buffer, b.byteOffset + o, 8).getFloat64(0, true);
  // Windows-1252 written out (the 0x80-0x9F range holds the curly quotes, dashes and the euro sign), so it reads the same in every browser
  const CP1252 = [0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178];
  const latin = (b, from, to) => {
    let out = '';
    for (let i = from; i < to; i += 8192) out += String.fromCharCode.apply(null, Array.from(b.subarray(i, Math.min(to, i + 8192)), c => c >= 0x80 && c < 0xa0 ? CP1252[c - 0x80] : c));
    return out;
  };
  const wide = (b, from, to) => new TextDecoder('utf-16le').decode(b.subarray(from, to));

  // ---- the compound file: sectors, the allocation table, directory entries, and the mini stream for small ones
  function open(bytes) {
    need(bytes instanceof Uint8Array && bytes.length >= 512 && SIG.every((v, i) => bytes[i] === v), 'This is not an old Office file.');
    const shift = u16(bytes, 30), miniShift = u16(bytes, 32);
    need(shift === 9 || shift === 12);
    const ss = 1 << shift, ms = 1 << miniShift, nFat = u32(bytes, 44), dirStart = u32(bytes, 48), cutoff = u32(bytes, 56), miniStart = u32(bytes, 60), difStart = u32(bytes, 68), nDif = u32(bytes, 72);
    const SPECIAL = 0xfffffffa, maxSectors = Math.floor(bytes.length / ss) + 2;
    const at = s => (s + 1) * ss;
    const sector = s => { need(s < maxSectors && at(s) < bytes.length); return bytes.subarray(at(s), Math.min(bytes.length, at(s) + ss)); };

    const fatIds = [];
    for (let i = 0; i < 109 && fatIds.length < nFat; i++) { const s = u32(bytes, 76 + 4 * i); if (s > SPECIAL) break; fatIds.push(s); }
    for (let d = difStart, n = 0; d <= SPECIAL && n < Math.min(nDif, 4096) && fatIds.length < nFat; n++) {
      const sec = sector(d);
      for (let i = 0; i < ss / 4 - 1 && fatIds.length < nFat; i++) { const s = u32(sec, 4 * i); if (s > SPECIAL) break; fatIds.push(s); }
      d = u32(sec, ss - 4);
    }
    const fat = [];
    for (const f of fatIds) { const sec = sector(f); for (let i = 0; i + 4 <= sec.length; i += 4) fat.push(u32(sec, i)); }

    const chain = (table, start) => { const out = []; for (let s = start; s <= SPECIAL && out.length <= table.length; s = table[s]) { need(s < table.length); out.push(s); } return out; };
    function readFat(start, size) {
      const ids = chain(fat, start), want = size === undefined ? ids.length * ss : size; need(want <= MAX_STREAM);
      const out = new Uint8Array(Math.min(want, ids.length * ss)); let o = 0;
      for (const s of ids) { if (o >= out.length) break; const part = sector(s).subarray(0, out.length - o); out.set(part, o); o += part.length; }
      return out;
    }

    const dir = readFat(dirStart), entries = new Map(); let rootEntry = null;
    for (let p = 0; p + 128 <= dir.length; p += 128) {
      const type = dir[p + 66], len = u16(dir, p + 64);
      if (type !== 1 && type !== 2 && type !== 5) continue;
      const name = wide(dir, p, p + Math.max(0, Math.min(64, len - 2))), e = { name, type, start: u32(dir, p + 116), size: u32(dir, p + 120) };
      if (type === 5) rootEntry = e; else if (!entries.has(name)) entries.set(name, e);
    }
    let miniFat = null, miniData = null;
    const mini = () => {
      if (!miniData) {
        need(rootEntry);
        const mf = readFat(miniStart); miniFat = []; for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i));
        miniData = readFat(rootEntry.start, rootEntry.size);
      }
      return miniData;
    };
    function read(name) {
      const e = entries.get(name);
      if (!e || e.type !== 2) return null;
      need(e.size <= MAX_STREAM);
      if (e.size >= cutoff) return readFat(e.start, e.size);
      const data = mini(), ids = chain(miniFat, e.start), out = new Uint8Array(e.size); let o = 0;
      for (const s of ids) { if (o >= out.length) break; need(s * ms < data.length); const part = data.subarray(s * ms, Math.min(data.length, s * ms + ms)).subarray(0, out.length - o); out.set(part, o); o += part.length; }
      return out;
    }
    return { has: name => entries.has(name), read, names: () => [...entries.keys()] };
  }
  const detect = ole => ole.has('WordDocument') ? 'doc' : (ole.has('Workbook') || ole.has('Book')) ? 'xls' : ole.has('PowerPoint Document') ? 'ppt' : null;

  // ---- Word: the text, from the piece table that says where each stretch of text lives
  function tidy(raw) {
    let out = '', code = 0;
    for (const ch of raw) {
      const c = ch.charCodeAt(0);
      if (c === 0x13) { code++; continue; }
      if (c === 0x14) { if (code) code = 0; continue; }   // the field's code ends; its result is shown
      if (c === 0x15) continue;
      if (code) continue;
      if (c === 0x0d || c === 0x0c) out += '\n';
      else if (c === 0x0b) out += ' ';
      else if (c === 0x07) out += '\u0007';
      else if (c === 0x1e) out += '-';
      else if (c === 0x09 || c >= 0x20) out += ch;
    }
    return out.replace(/\u0007\u0007/g, '\n').replace(/\u0007/g, '  |  ');
  }
  function docText(ole) {
    const w = ole.read('WordDocument');
    need(w && w.length > 0x1b0 && u16(w, 0) === 0xa5ec, 'This Word file is in a format the preview cannot read.');
    const flags = u16(w, 10);
    need(!(flags & 0x0100), 'This file is password protected.');
    const t = ole.read(flags & 0x0200 ? '1Table' : '0Table'); need(t);
    const fcClx = u32(w, 0x1a2), lcbClx = u32(w, 0x1a6), ccp = u32(w, 0x4c);
    need(lcbClx > 0 && fcClx + lcbClx <= t.length);
    let p = fcClx; const end = fcClx + lcbClx;
    while (p < end && t[p] === 1) p += 3 + u16(t, p + 1);
    need(p < end && t[p] === 2);
    const lcb = u32(t, p + 1), plc = p + 5, n = Math.floor((lcb - 4) / 12);
    need(n > 0 && n < 200000 && plc + lcb <= t.length);
    let raw = '';
    for (let i = 0; i < n && raw.length < Math.min(ccp, MAX_CHARS); i++) {
      const c1 = u32(t, plc + 4 * i), c2 = Math.min(u32(t, plc + 4 * (i + 1)), ccp);
      if (c2 <= c1) continue;
      const fcRaw = u32(t, plc + 4 * (n + 1) + 8 * i + 2), compressed = (fcRaw & 0x40000000) !== 0, count = c2 - c1;
      if (compressed) { const from = (fcRaw & 0x3fffffff) >>> 1; need(from <= w.length); raw += latin(w, from, Math.min(w.length, from + count)); }
      else { need(fcRaw <= w.length); raw += wide(w, fcRaw, Math.min(w.length, fcRaw + count * 2)); }
    }
    return tidy(raw).slice(0, MAX_CHARS);
  }

  // ---- Excel (the format used from Excel 97 on): records, with the shared string table that may continue across records
  function* records(b, start) {
    for (let p = start; p + 4 <= b.length;) { const id = u16(b, p), len = u16(b, p + 2); if (p + 4 + len > b.length) return; yield { id, d: b.subarray(p + 4, p + 4 + len), at: p }; p += 4 + len; }
  }
  function xlString(d, o) {   // cch (2 bytes), flags, then the characters: returns { text, end }
    const cch = u16(d, o), flags = d[o + 2]; let p = o + 3, runs = 0, ext = 0;
    if (flags & 8) { runs = u16(d, p); p += 2; } if (flags & 4) { ext = u32(d, p); p += 4; }
    const bytes = cch * (flags & 1 ? 2 : 1); need(p + bytes <= d.length);
    return { text: flags & 1 ? wide(d, p, p + bytes) : latin(d, p, p + bytes), end: p + bytes + runs * 4 + ext };
  }
  function sst(chunks) {
    const strings = []; let ci = 0, p = 8;
    const byte = () => { while (ci < chunks.length && p >= chunks[ci].length) { ci++; p = 0; } need(ci < chunks.length); return chunks[ci][p++]; };
    const skip = k => { while (k > 0) { if (ci >= chunks.length) return; const take = Math.min(k, chunks[ci].length - p); p += take; k -= take; if (k > 0) { ci++; p = 0; } } };
    const unique = u32(chunks[0], 4);
    try {
      for (let s = 0; s < unique && s < 2000000; s++) {
        const cch = byte() | byte() << 8, flags = byte(); let runs = 0, ext = 0;
        if (flags & 8) runs = byte() | byte() << 8; if (flags & 4) ext = (byte() | byte() << 8 | byte() << 16 | byte() << 24) >>> 0;
        let remaining = cch, w = flags & 1, text = '';
        while (remaining > 0) {
          if (ci >= chunks.length) break;
          if (p >= chunks[ci].length) { ci++; if (ci >= chunks.length) break; p = 0; w = chunks[ci][p++] & 1; continue; }
          const per = w ? 2 : 1, n = Math.min(remaining, Math.floor((chunks[ci].length - p) / per)); if (n <= 0) break;
          text += w ? wide(chunks[ci], p, p + n * 2) : latin(chunks[ci], p, p + n); p += n * per; remaining -= n;
        }
        skip(runs * 4 + ext); strings.push(text);
      }
    } catch (e) { /* the strings read so far are kept */ }
    return strings;
  }
  const ERRORS = { 0: '#NULL!', 7: '#DIV/0!', 15: '#VALUE!', 23: '#REF!', 29: '#NAME?', 36: '#NUM!', 42: '#N/A' };
  const rk = v => { let n; if (v & 2) n = v >> 2; else { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, (v & 0xfffffffc) >>> 0, true); n = b.getFloat64(0, true); } return v & 1 ? n / 100 : n; };
  function xlsSheets(ole) {
    const wb = ole.read('Workbook') || ole.read('Book'); need(wb && wb.length > 8);
    need(u16(wb, 0) === 0x0809 && u16(wb, 4) >= 0x0600, 'This is a very old Excel file (Excel 5 or older), which the preview cannot read. Download it to open it.');
    let is1904 = false; const formats = new Map(), xfs = [], bounds = []; let chunks = null, last = null;
    for (const r of records(wb, 0)) {
      if (r.id === 0x002f) need(false, 'This file is password protected.');
      else if (r.id === 0x0022) is1904 = u16(r.d, 0) === 1;
      else if (r.id === 0x041e) formats.set(u16(r.d, 0), xlString(r.d, 2).text);
      else if (r.id === 0x00e0) xfs.push(u16(r.d, 2));
      else if (r.id === 0x0085) { const cch = r.d[6], flags = r.d[7]; bounds.push({ pos: u32(r.d, 0), hidden: r.d[4] !== 0 || r.d[5] !== 0, name: flags & 1 ? wide(r.d, 8, 8 + cch * 2) : latin(r.d, 8, 8 + cch) }); }
      else if (r.id === 0x00fc) { chunks = [r.d]; last = 'sst'; continue; }
      else if (r.id === 0x003c && last === 'sst') { chunks.push(r.d); continue; }
      else if (r.id === 0x000a) break;
      last = null;
    }
    const strings = chunks ? sst(chunks) : [];
    const fmt = (xf, n) => { const id = xfs[xf] || 0, code = formats.get(id); return G.isDate(id, code) ? G.formatDate(n, G.dateCode(id, code), is1904) : G.formatNumber(n, id, code); };
    const sheets = [];
    for (const b of bounds.slice(0, 60)) {
      const sh = { name: b.name, hidden: b.hidden, rows: new Map(), merges: [], widths: new Map(), maxRow: -1, maxCol: -1 };
      sheets.push(sh);
      if (b.pos + 4 > wb.length || u16(wb, b.pos) !== 0x0809 || u16(wb, b.pos + 4 + 2) !== 0x0010) { sh.hidden = true; continue; }   // not a worksheet (a chart sheet, a macro sheet)
      const put = (r, c, text, right) => {
        if (text === '' || text === undefined) return;
        sh.maxRow = Math.max(sh.maxRow, r); sh.maxCol = Math.max(sh.maxCol, c);
        if (r >= G.LIMITS.rows || c >= G.LIMITS.cols) return;
        let row = sh.rows.get(r); if (!row) sh.rows.set(r, row = new Map()); row.set(c, { text, right: !!right });
      };
      let depth = 0, pending = null;
      for (const r of records(wb, b.pos)) {
        const d = r.d;
        if (r.id === 0x0809) { depth++; continue; }
        if (r.id === 0x000a) { if (--depth <= 0) break; continue; }
        if (depth !== 1) continue;
        if (r.id === 0x00fd) put(u16(d, 0), u16(d, 2), strings[u32(d, 6)]);
        else if (r.id === 0x0203) put(u16(d, 0), u16(d, 2), fmt(u16(d, 4), f64(d, 6)), true);
        else if (r.id === 0x027e) put(u16(d, 0), u16(d, 2), fmt(u16(d, 4), rk(u32(d, 6))), true);
        else if (r.id === 0x00bd) { const row = u16(d, 0), first = u16(d, 2), n = Math.floor((d.length - 6) / 6); for (let i = 0; i < n; i++) put(row, first + i, fmt(u16(d, 4 + 6 * i), rk(u32(d, 6 + 6 * i))), true); }
        else if (r.id === 0x0204 || r.id === 0x00d6) { try { put(u16(d, 0), u16(d, 2), xlString(d, 6).text); } catch (e) { /* skipped */ } }
        else if (r.id === 0x0205) put(u16(d, 0), u16(d, 2), d[7] ? (ERRORS[d[6]] || '#ERROR') : d[6] ? 'TRUE' : 'FALSE', true);
        else if (r.id === 0x0006) {
          const row = u16(d, 0), col = u16(d, 2), xf = u16(d, 4);
          if (u16(d, 12) === 0xffff) { if (d[6] === 0) pending = { row, col }; else if (d[6] === 1) put(row, col, d[8] ? 'TRUE' : 'FALSE', true); else if (d[6] === 2) put(row, col, ERRORS[d[8]] || '#ERROR', true); }
          else put(row, col, fmt(xf, f64(d, 6)), true);
        } else if (r.id === 0x0207 && pending) { try { put(pending.row, pending.col, xlString(d, 0).text); } catch (e) { /* skipped */ } pending = null; }
        else if (r.id === 0x00e5) { const n = u16(d, 0); for (let i = 0; i < n && 2 + i * 8 + 8 <= d.length; i++) sh.merges.push({ r1: u16(d, 2 + i * 8), r2: u16(d, 4 + i * 8), c1: u16(d, 6 + i * 8), c2: u16(d, 8 + i * 8) }); }
        else if (r.id === 0x007d) { const lo = u16(d, 0), hi = Math.min(u16(d, 2), lo + 200), w = u16(d, 4) / 256 * 7 + 5; for (let c = lo; c <= hi; c++) sh.widths.set(c, w); }
      }
    }
    return sheets;
  }

  // ---- PowerPoint: the text of each slide (text boxes and placeholders), in order
  function pptSlides(ole) {
    const d = ole.read('PowerPoint Document'); need(d && d.length > 8);
    const rec = (p, end) => { need(p + 8 <= end); return { ver: d[p] & 15, inst: u16(d, p) >> 4, type: u16(d, p + 2), len: u32(d, p + 4), body: p + 8 }; };
    const clean = t => t.replace(/\u0000/g, '').replace(/\r\n?/g, '\r');
    const atom = (r, into, kind) => {
      if (r.body + r.len > d.length) return;
      if (r.type === 0x0f9f) kind.v = u32(d, r.body);
      else if (r.type === 0x0fa0) { into.push({ kind: kind.v, text: clean(wide(d, r.body, r.body + (r.len & ~1))) }); kind.v = 1; }
      else if (r.type === 0x0fa8) { into.push({ kind: kind.v, text: clean(latin(d, r.body, r.body + r.len)) }); kind.v = 1; }
    };
    const gather = (from, to, into, depth) => {   // every text atom below a record
      const kind = { v: 1 };
      for (let p = from; p + 8 <= to;) {
        const r = rec(p, to); if (r.body + r.len > to) break;
        if (r.ver === 15 && depth < 14 && r.type !== 0x03f0 && r.type !== 0x03f8) gather(r.body, r.body + r.len, into, depth + 1); else atom(r, into, kind);
        p = r.body + r.len;
      }
    };
    const lists = [], boxes = [];
    for (let p = 0; p + 8 <= d.length;) {
      const r = rec(p, d.length); if (r.body + r.len > d.length) break;
      if (r.type === 0x2f14) need(false, 'This file is password protected.');
      if (r.type === 0x03e8) {   // the document: its slide list holds the placeholder text, one group per slide
        for (let q = r.body; q + 8 <= r.body + r.len;) {
          const c = rec(q, r.body + r.len); if (c.body + c.len > r.body + r.len) break;
          if (c.type === 0x0ff0 && c.inst === 0) {
            let group = null; const kind = { v: 1 };
            for (let k = c.body; k + 8 <= c.body + c.len;) {
              const a = rec(k, c.body + c.len); if (a.body + a.len > c.body + c.len) break;
              if (a.type === 0x03f3) { group = []; lists.push(group); kind.v = 1; } else if (group) atom(a, group, kind);
              k = a.body + a.len;
            }
          }
          q = c.body + c.len;
        }
      } else if (r.type === 0x03ee) { const into = []; gather(r.body, r.body + r.len, into, 0); boxes.push(into); }
      p = r.body + r.len;
    }
    const n = Math.min(MAX_SLIDES, Math.max(lists.length, boxes.length)), slides = [];
    for (let i = 0; i < n; i++) slides.push([...(lists[i] || []), ...(boxes[i] || [])].filter(x => x.text.trim()));
    if (!slides.some(s => s.length)) { const all = []; gather(0, d.length, all, 0); if (all.length) return [all.filter(x => x.text.trim())]; }
    return slides;
  }

  // ---- drawing
  function render(bytes, doc) {
    const ole = open(bytes), kind = detect(ole), mk = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    need(kind, 'This old Office file is not a Word, Excel or PowerPoint file the preview can read.');
    const wrap = mk('div', 'bs-lg');
    if (kind === 'xls') {
      const made = G.render(doc, xlsSheets(ole));
      return { type: kind, node: made.node, urls: [], cut: made.cut, note: 'An older Excel file: the preview shows the values only, without colours, formulas or charts. Download the file for the exact look.' };
    }
    if (kind === 'doc') {
      const text = docText(ole), page = mk('div', 'bs-docx bs-lg-doc');
      let gap = false;
      for (const line of text.split('\n')) {
        if (!line.trim()) { if (!gap && page.firstChild) page.append(mk('p', 'bs-lg-gap')); gap = true; continue; }
        gap = false; const p = mk('p'); line.split(' ').forEach((part, i) => { if (i) p.append(doc.createElement('br')); p.append(doc.createTextNode(part)); }); page.append(p);
      }
      if (!page.firstChild) page.append(mk('p', '', 'This document has no text.'));
      wrap.append(page);
      return { type: kind, node: wrap, urls: [], cut: text.length >= MAX_CHARS, note: 'An older Word file: the preview shows the text only, without pictures, tables or formatting. Download the file for the exact look.' };
    }
    const slides = pptSlides(ole);
    slides.forEach((items, i) => {
      const card = mk('section', 'bs-lg-slide'); card.setAttribute('aria-label', 'Slide ' + (i + 1));
      card.append(mk('div', 'bs-lg-slide-n', 'Slide ' + (i + 1) + ' of ' + slides.length));
      if (!items.length) card.append(mk('p', 'bs-lg-empty', 'No text on this slide.'));
      for (const it of items) for (const para of it.text.split('\r')) {
        if (!para.trim()) continue;
        const heading = it.kind === 0 || it.kind === 5, p = mk(heading ? 'h3' : 'p', heading ? 'bs-lg-title' : 'bs-lg-text');
        para.split('\u000b').forEach((part, k) => { if (k) p.append(doc.createElement('br')); p.append(doc.createTextNode(part)); });
        card.append(p);
      }
      wrap.append(card);
    });
    if (!slides.length) wrap.append(mk('p', 'bs-pv-note', 'No slide text was found in this file.'));
    return { type: kind, node: wrap, urls: [], cut: false, note: 'An older PowerPoint file: the preview shows the text of each slide only, without pictures, shapes or design. Download the file for the exact look.' };
  }

  root.BahriaLegacy = { open, detect, docText, xlsSheets, pptSlides, render, SIG };
})(globalThis);
