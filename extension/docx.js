// A small Word (.docx) reader for the file preview. A .docx is a zip of XML files; this turns the text, headings, bold and italic, lists, tables and pictures into a page.
// Safe by construction: everything is made with createElement and textContent (never from the file's own markup), links are shown as text, and only plain picture types are shown.
(function (root) {
  'use strict';
  const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };   // no svg, emf or wmf
  const LIMITS = { nodes: 40000, chars: 1500000, images: 40, image: 6 * 1024 * 1024, depth: 4 };

  const kids = (el, name) => [...el.children].filter(c => c.localName === name);
  const kid = (el, name) => kids(el, name)[0] || null;
  const att = (el, name) => el ? (el.getAttribute('w:' + name) ?? el.getAttribute(name)) : null;
  const rel = (el, name) => el ? (el.getAttribute('r:' + name) ?? el.getAttribute(name)) : null;
  const on = el => { if (!el) return false; const v = att(el, 'val'); return v === null || !/^(0|false|off|none)$/i.test(v); };

  async function render(zip, doc, notes) {
    const state = { nodes: 0, chars: 0, images: 0, urls: [], cut: false, rels: new Map() };
    const parse = text => { const x = new DOMParser().parseFromString(text, 'application/xml'); if (x.querySelector('parsererror')) throw new Error('This Word file looks damaged.'); return x; };
    if (!zip.has('word/document.xml')) throw new Error('This does not look like a Word document.');
    const xml = parse(await zip.readText('word/document.xml', 12 * 1024 * 1024));
    if (zip.has('word/_rels/document.xml.rels')) {
      for (const r of parse(await zip.readText('word/_rels/document.xml.rels')).getElementsByTagName('Relationship')) state.rels.set(r.getAttribute('Id'), r.getAttribute('Target') || '');
    }
    const body = [...xml.documentElement.children].find(c => c.localName === 'body');
    const page = doc.createElement('div'); page.className = 'bs-docx';
    if (!body) return { node: page, urls: state.urls, cut: false };
    const mk = (tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };

    async function picture(drawing, into) {
      if (state.images >= LIMITS.images) { state.cut = true; return; }
      const blip = drawing.getElementsByTagName('a:blip')[0];
      const id = blip && rel(blip, 'embed'), target = id && state.rels.get(id);
      if (!target) return;
      const clean = ('word/' + target.replace(/^\/?(word\/)?/, '')).split('/').filter(p => p && p !== '.' && p !== '..').join('/');
      const type = IMAGE_TYPES[clean.slice(clean.lastIndexOf('.') + 1).toLowerCase()];
      if (!type || !zip.has(clean)) return;
      try {
        const data = await zip.read(clean, LIMITS.image);
        const img = mk('img'); img.alt = ''; img.src = URL.createObjectURL(new Blob([data], { type })); state.urls.push(img.src); state.images++;
        into.append(img);
      } catch (e) { /* a picture that cannot be read is left out */ }
    }

    async function inline(p, into) {
      for (const node of [...p.children]) {
        if (++state.nodes > LIMITS.nodes || state.chars > LIMITS.chars) { state.cut = true; return; }
        const name = node.localName;
        if (name === 'r') {
          const pr = kid(node, 'rPr');
          const wrap = [];
          if (pr) {
            if (on(kid(pr, 'b'))) wrap.push('strong');
            if (on(kid(pr, 'i'))) wrap.push('em');
            const u = kid(pr, 'u'); if (u && on(u)) wrap.push('u');
            if (on(kid(pr, 'strike'))) wrap.push('s');
            const va = att(kid(pr, 'vertAlign'), 'val'); if (va === 'superscript') wrap.push('sup'); else if (va === 'subscript') wrap.push('sub');
          }
          const span = mk('span'), color = pr && att(kid(pr, 'color'), 'val');
          if (color && /^[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== 'ffffff') span.style.color = '#' + color;
          let holder = span;
          for (const tag of wrap) { const w = mk(tag); holder.append(w); holder = w; }
          for (const c of node.children) {
            if (c.localName === 't') { const t = c.textContent; state.chars += t.length; holder.append(doc.createTextNode(t)); }
            else if (c.localName === 'tab') holder.append(doc.createTextNode(' '));
            else if (c.localName === 'br' || c.localName === 'cr') { if (att(c, 'type') !== 'page') holder.append(mk('br')); }
            else if (c.localName === 'drawing') await picture(c, into);
          }
          if (span.childNodes.length) into.append(span);
        } else if (name === 'hyperlink' || name === 'smartTag' || name === 'ins' || name === 'fldSimple') await inline(node, into);   // links are shown as plain text, never as links
      }
    }

    async function paragraph(p, list, depth) {
      const pr = kid(p, 'pPr'), style = pr && att(kid(pr, 'pStyle'), 'val') || '';
      const level = /^heading\s*([1-6])$/i.exec(style), numbered = pr && kid(pr, 'numPr');
      let el;
      if (/^title$/i.test(style)) el = mk('h1', 'bs-docx-title'); else if (level) el = mk('h' + Math.min(6, +level[1] + 1)); else if (numbered) el = mk('li'); else el = mk('p');
      const jc = pr && att(kid(pr, 'jc'), 'val');
      if (jc === 'center' || jc === 'right') el.style.textAlign = jc; else if (jc === 'both') el.style.textAlign = 'justify';
      await inline(p, el);
      if (!el.childNodes.length && el.localName === 'p') el.append(mk('br'));
      return { el, numbered: !!numbered, indent: numbered ? Math.max(0, Math.min(6, +(att(kid(numbered, 'ilvl'), 'val') || 0))) : 0 };
    }

    async function blocks(parent, into, depth) {
      let ul = null;
      for (const node of [...parent.children]) {
        if (++state.nodes > LIMITS.nodes || state.chars > LIMITS.chars) { state.cut = true; return; }
        const name = node.localName;
        if (name === 'p') {
          const r = await paragraph(node, ul, depth);
          if (r.numbered) { if (!ul) { ul = mk('ul'); into.append(ul); } r.el.style.marginLeft = (r.indent * 1.4) + 'em'; ul.append(r.el); }
          else { ul = null; into.append(r.el); }
        } else if (name === 'tbl') {
          ul = null;
          if (depth >= LIMITS.depth) continue;
          const table = mk('table'), tbody = mk('tbody'); table.append(tbody);
          for (const tr of kids(node, 'tr')) {
            const row = mk('tr');
            for (const tc of kids(tr, 'tc')) {
              const cell = mk('td'), span = +att(kid(kid(tc, 'tcPr') || tc, 'gridSpan'), 'val');
              if (span > 1 && span < 40) cell.colSpan = span;
              await blocks(tc, cell, depth + 1);
              row.append(cell);
            }
            tbody.append(row);
          }
          into.append(table);
        } else if (name === 'sdt') { const content = kid(node, 'sdtContent'); if (content) await blocks(content, into, depth); }
      }
    }
    await blocks(body, page, 0);
    return { node: page, urls: state.urls, cut: state.cut };
  }
  root.BahriaDocx = { render };
})(globalThis);
