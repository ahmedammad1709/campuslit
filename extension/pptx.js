// A small PowerPoint (.pptx) reader for the file preview. A .pptx is a zip of XML files; this draws each slide with its text boxes, tables, pictures and colours where the file puts them.
// Safe by construction: everything is made with createElement and textContent (never from the file's own markup), links are not followed, and only plain picture types are shown.
// It is a faithful sketch, not PowerPoint: gradients, shadows, charts, diagrams, animations and exotic shapes are left out.
(function (root) {
  'use strict';
  const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };   // no svg, emf or wmf
  const LIMITS = { slides: 200, nodes: 60000, images: 80, image: 6 * 1024 * 1024, xml: 12 * 1024 * 1024 };

  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const at = (el, name) => el ? el.getAttribute(name) : null;
  const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const parse = text => { const x = new DOMParser().parseFromString(text, 'application/xml'); if (x.querySelector('parsererror')) throw new Error('This PowerPoint file looks damaged.'); return x; };
  const clean = (base, target) => {
    const parts = (target.startsWith('/') ? target.slice(1) : base + '/' + target).split('/'), out = [];
    for (const p of parts) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p); }
    return out.join('/');
  };
  const deep = (el, name) => el ? [...el.getElementsByTagName('*')].find(n => n.localName === name) || null : null;   // first descendant by its name, whatever prefix the file uses
  const dirOf = p => p.slice(0, p.lastIndexOf('/'));

  // ---- colours: srgbClr and schemeClr (through the theme), with the usual lighten/darken tweaks
  function hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
  function rgb(h, s, l) { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; if (!s) return [l * 255, l * 255, l * 255]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; }
  const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lum = c => { const m = /^#(..)(..)(..)$/.exec(c || ''); return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 : 1; };

  async function render(zip, doc) {
    if (!zip.has('ppt/presentation.xml')) throw new Error('This does not look like a PowerPoint file.');
    const state = { nodes: 0, images: 0, urls: [], cut: false };
    const xmlCache = new Map(), relCache = new Map();
    const xml = async path => { if (!zip.has(path)) return null; if (!xmlCache.has(path)) xmlCache.set(path, parse(await zip.readText(path, LIMITS.xml)).documentElement); return xmlCache.get(path); };
    const relsOf = async path => {   // relationship id -> { type, target (a path inside the zip) }
      if (relCache.has(path)) return relCache.get(path);
      const map = new Map(), rp = dirOf(path) + '/_rels/' + path.slice(path.lastIndexOf('/') + 1) + '.rels';
      if (zip.has(rp)) for (const r of parse(await zip.readText(rp, 4 * 1024 * 1024)).getElementsByTagName('Relationship')) {
        const target = r.getAttribute('Target') || '';
        if (r.getAttribute('TargetMode') === 'External') continue;
        map.set(r.getAttribute('Id'), { type: (r.getAttribute('Type') || '').split('/').pop(), target: clean(dirOf(path), target) });
      }
      relCache.set(path, map); return map;
    };
    const mk = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

    const pres = await xml('ppt/presentation.xml'), presRels = await relsOf('ppt/presentation.xml');
    const size = kid(pres, 'sldSz'), W = num(at(size, 'cx'), 9144000) || 9144000, H = num(at(size, 'cy'), 6858000) || 6858000;
    const slidePaths = kids(kid(pres, 'sldIdLst'), 'sldId').map(s => { const r = presRels.get(s.getAttribute('r:id')); return r && r.target; }).filter(Boolean);
    if (!slidePaths.length) throw new Error('This presentation has no slides.');

    // theme colours
    const theme = new Map(); let clrMap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    for (const [id, r] of presRels) if (r.type === 'slideMaster') { const m = await xml(r.target); const cm = m && kid(m, 'clrMap'); if (cm) for (const a of cm.attributes) clrMap[a.name] = a.value; break; }
    for (const [id, r] of presRels) if (r.type === 'theme') {
      const t = await xml(r.target), scheme = t && deep(t, 'clrScheme');
      if (scheme) for (const c of scheme.children) { const v = c.firstElementChild; theme.set(c.localName, v && (v.localName === 'sysClr' ? '#' + (v.getAttribute('lastClr') || '000000') : '#' + (v.getAttribute('val') || '000000'))); }
      break;
    }
    if (!theme.size) for (const p of ['ppt/theme/theme1.xml']) { const t = await xml(p), scheme = t && deep(t, 'clrScheme'); if (scheme) for (const c of scheme.children) { const v = c.firstElementChild; theme.set(c.localName, v && (v.localName === 'sysClr' ? '#' + (v.getAttribute('lastClr') || '000000') : '#' + (v.getAttribute('val') || '000000'))); } }
    function color(holder) {   // an element that contains srgbClr / schemeClr / sysClr (a solidFill or a color), or null
      const c = holder && [...holder.children].find(x => /^(srgbClr|schemeClr|sysClr|prstClr)$/.test(x.localName));
      if (!c) return null;
      let base = null;
      if (c.localName === 'srgbClr') base = '#' + (c.getAttribute('val') || '000000');
      else if (c.localName === 'sysClr') base = '#' + (c.getAttribute('lastClr') || '000000');
      else if (c.localName === 'prstClr') base = { black: '#000000', white: '#ffffff' }[c.getAttribute('val')] || null;
      else { const v = c.getAttribute('val') || ''; base = theme.get(clrMap[v] || v) || null; }
      if (!base || !/^#[0-9a-f]{6}$/i.test(base)) return null;
      let [h, s, l] = hsl(parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16));
      for (const m of c.children) {
        const v = num(m.getAttribute('val')) / 100000;
        if (m.localName === 'lumMod') l *= v; else if (m.localName === 'lumOff') l += v;
        else if (m.localName === 'tint') l = l + (1 - l) * (1 - v); else if (m.localName === 'shade') l *= v;
      }
      return hex(rgb(h, s, Math.max(0, Math.min(1, l))));
    }
    const fillOf = spPr => { const f = kid(spPr, 'solidFill'); return f ? color(f) : null; };

    const pct = (v, total) => (v / total * 100).toFixed(3) + '%';
    const tx1 = theme.get(clrMap.tx1 || 'dk1') || '#000000';

    // ---- one tree of shapes (a slide, its layout, or its master), drawn into `into`
    async function tree(spTree, ctx, into, tf, onlyDecor) {
      for (const sh of spTree.children) {
        if (++state.nodes > LIMITS.nodes) { state.cut = true; return; }
        const name = sh.localName;
        if (name === 'grpSp') {
          const gp = kid(sh, 'grpSpPr'), xf = kid(gp, 'xfrm'), off = kid(xf, 'off'), ext = kid(xf, 'ext'), cho = kid(xf, 'chOff'), che = kid(xf, 'chExt');
          let t2 = tf;
          if (xf && off && ext && cho && che && num(at(che, 'cx')) && num(at(che, 'cy'))) {
            const sx = num(at(ext, 'cx')) / num(at(che, 'cx')), sy = num(at(ext, 'cy')) / num(at(che, 'cy'));
            t2 = { x: x => tf.x(num(at(off, 'x')) + (x - num(at(cho, 'x'))) * sx), y: y => tf.y(num(at(off, 'y')) + (y - num(at(cho, 'y'))) * sy), w: w => tf.w(w * sx), h: h => tf.h(h * sy) };
          }
          await tree(sh, ctx, into, t2, onlyDecor);
        } else if (name === 'sp') await shape(sh, ctx, into, tf, onlyDecor);
        else if (name === 'pic') await picture(sh, ctx, into, tf);
        else if (name === 'graphicFrame' && !onlyDecor) await frame(sh, ctx, into, tf);
      }
    }
    const IDENT = { x: x => x, y: y => y, w: w => w, h: h => h };
    function place(node, xf, tf) {
      const off = kid(xf, 'off'), ext = kid(xf, 'ext');
      if (!off || !ext) return false;
      const x = num(at(off, 'x')), y = num(at(off, 'y')), w = num(at(ext, 'cx')), h = num(at(ext, 'cy'));
      node.style.left = pct(tf.x(x), W); node.style.top = pct(tf.y(y), H); node.style.width = pct(tf.w(w), W); node.style.height = pct(tf.h(h), H);
      const rot = num(at(xf, 'rot')) / 60000; if (rot) node.style.transform = 'rotate(' + rot + 'deg)';
      return true;
    }

    // placeholders inherit their place and text style from the layout, then the master
    const phOf = sp => { const nv = kid(sp, 'nvSpPr'), p = kid(kid(nv, 'nvPr'), 'ph'); return p ? { type: at(p, 'type') || 'body', idx: at(p, 'idx') } : null; };
    const isTitle = t => t === 'title' || t === 'ctrTitle';
    function findPh(root, ph) {
      const sps = []; (function walk(n) { for (const c of n.children) { if (c.localName === 'sp') sps.push(c); else if (c.localName === 'grpSp') walk(c); } })(root);
      return sps.find(s => { const p = phOf(s); return p && ph.idx && p.idx === ph.idx; }) || sps.find(s => { const p = phOf(s); return p && p.type === ph.type; }) || (isTitle(ph.type) ? sps.find(s => { const p = phOf(s); return p && isTitle(p.type); }) : null) || null;
    }
    const spXfrm = sp => kid(kid(sp, 'spPr'), 'xfrm');
    const lstOf = sp => kid(kid(sp, 'txBody'), 'lstStyle');

    async function shape(sp, ctx, into, tf, onlyDecor) {
      const ph = phOf(sp);
      if (onlyDecor && ph) return;   // a layout's or master's own text prompts are not part of the slide
      const spPr = kid(sp, 'spPr');
      let lay = null, mas = null;
      if (ph && !onlyDecor) { lay = ctx.layoutTree && findPh(ctx.layoutTree, ph); mas = ctx.masterTree && findPh(ctx.masterTree, ph); }
      const xf = spXfrm(sp) || (lay && spXfrm(lay)) || (mas && spXfrm(mas));
      const box = mk('div', 'bs-pp-shape');
      if (!xf || !place(box, xf, tf)) return;
      const fill = fillOf(spPr), geom = kid(spPr, 'prstGeom'), prst = at(geom, 'prst') || '';
      if (fill) box.style.background = fill;
      if (/ellipse|oval/i.test(prst)) box.style.borderRadius = '50%'; else if (/round/i.test(prst)) box.style.borderRadius = '8% / 12%';
      const ln = kid(spPr, 'ln'), lc = ln && fillOf(ln);
      if (lc && !kid(ln, 'noFill')) box.style.border = Math.max(1, num(at(ln, 'w'), 12700) / 12700 * 0.8).toFixed(1) + 'px solid ' + lc;
      const tb = kid(sp, 'txBody');
      if (tb && !(ph && ph.type === 'sldImg')) await text(tb, ph, lay, mas, ctx, box, fill);
      if (!tb && !fill && !(lc && !kid(ln, 'noFill'))) return;   // nothing to see
      into.append(box);
    }

    // text: paragraphs and runs, sized in container units so a slide scales as a whole
    function styleLevel(lst, n) { return lst && kid(lst, 'lvl' + n + 'pPr'); }
    async function text(tb, ph, lay, mas, ctx, box, fill) {
      const body = kid(tb, 'bodyPr'), anchor = at(body, 'anchor') || (ph && isTitle(ph.type) ? 'ctr' : 't');
      const ins = n => num(at(body, n), n === 'lIns' || n === 'rIns' ? 91440 : 45720);
      box.style.padding = [ins('tIns'), ins('rIns'), ins('bIns'), ins('lIns')].map(v => (v / W * 100).toFixed(3) + 'cqw').join(' ');
      box.style.justifyContent = anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start';
      const af = kid(body, 'normAutofit'), scale = af && at(af, 'fontScale') ? num(at(af, 'fontScale')) / 100000 : 1;
      const group = ph ? (isTitle(ph.type) ? 'titleStyle' : /^(body|subTitle|obj|tbl|chart|clipArt|dgm|media|pic)$/.test(ph.type) ? 'bodyStyle' : 'otherStyle') : 'otherStyle';
      const tx = ctx.txStyles && kid(ctx.txStyles, group);
      const chain = n => [styleLevel(lstOf(tb.parentNode), n), lay && styleLevel(lstOf(lay), n), mas && styleLevel(lstOf(mas), n), tx && styleLevel(tx, n)].filter(Boolean);
      const bg = fill || ctx.bg || '#ffffff';
      let counters = [];
      for (const p of kids(tb, 'p')) {
        if (++state.nodes > LIMITS.nodes) { state.cut = true; return; }
        const pPr = kid(p, 'pPr'), lvl = Math.min(9, num(at(pPr, 'lvl')) + 1), levels = [pPr, ...chain(lvl)].filter(Boolean);
        const pick = f => { for (const l of levels) { const v = f(l); if (v !== null && v !== undefined) return v; } return null; };
        const el = mk('p', 'bs-pp-p'), algn = pick(l => at(l, 'algn')) || (ph && /ctrTitle|subTitle/.test(ph.type) ? 'ctr' : 'l');
        el.style.textAlign = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : 'left';
        const marL = num(pick(l => at(l, 'marL')), 0), indent = num(pick(l => at(l, 'indent')), 0);
        const lnSpc = pick(l => { const s = kid(kid(l, 'lnSpc'), 'spcPct'); return s ? at(s, 'val') : null; });
        el.style.lineHeight = lnSpc ? String(Math.max(.8, Math.min(2, num(lnSpc) / 100000 * 1.2))) : '1.2';
        const bef = pick(l => { const s = kid(kid(l, 'spcBef'), 'spcPts'); return s ? at(s, 'val') : null; });
        if (bef) el.style.marginTop = (num(bef) / 100 * 12700 / W * 100).toFixed(3) + 'cqw';
        // size: the run's own, then what the shape, layout, master and text styles say
        const defSize = num(pick(l => { const d = kid(l, 'defRPr'); return d ? at(d, 'sz') : null; }), ph && isTitle(ph.type) ? 4400 : ph ? 2800 : 1800);
        const fs = sz => (num(sz, defSize) / 100 * 12700 * scale / W * 100).toFixed(3) + 'cqw';
        el.style.fontSize = fs(defSize);
        // bullets
        let bullet = '';
        const buNone = pick(l => kid(l, 'buNone') ? true : null), buChar = pick(l => { const b = kid(l, 'buChar'); return b ? at(b, 'char') : null; }), buNum = pick(l => kid(l, 'buAutoNum') ? true : null);
        if (!buNone) { if (buChar) bullet = buChar + ' '; else if (buNum) { counters[lvl] = (counters[lvl] || 0) + 1; bullet = counters[lvl] + '. '; } }
        if (!buNum) counters[lvl] = 0;
        if (marL) el.style.paddingLeft = (marL / W * 100).toFixed(3) + 'cqw';
        if (indent && bullet) el.style.textIndent = (indent / W * 100).toFixed(3) + 'cqw';
        if (bullet) el.append(mk('span', 'bs-pp-bu', bullet));
        let any = false;
        const textColor = rPr => { const c = rPr && color(kid(rPr, 'solidFill')); if (c) return c; const d = pick(l => { const f = kid(kid(l, 'defRPr'), 'solidFill'); return f ? color(f) : null; }); return d; };
        for (const r of p.children) {
          if (r.localName === 'br') { el.append(doc.createElement('br')); continue; }
          if (r.localName !== 'r' && r.localName !== 'fld') continue;
          const t = kid(r, 't'); if (!t) continue;
          const rPr = kid(r, 'rPr'), span = mk('span', '', t.textContent); any = true;
          if (rPr && at(rPr, 'sz')) span.style.fontSize = fs(at(rPr, 'sz'));
          if (rPr && /^(1|true)$/.test(at(rPr, 'b') || '')) span.style.fontWeight = '700';
          if (rPr && /^(1|true)$/.test(at(rPr, 'i') || '')) span.style.fontStyle = 'italic';
          if (rPr && at(rPr, 'u') && at(rPr, 'u') !== 'none') span.style.textDecoration = 'underline';
          if (rPr && /strike/.test(at(rPr, 'strike') || '')) span.style.textDecoration = (span.style.textDecoration ? span.style.textDecoration + ' ' : '') + 'line-through';
          const base = rPr && num(at(rPr, 'baseline')); if (base) { span.style.verticalAlign = base > 0 ? 'super' : 'sub'; span.style.fontSize = 'smaller'; }
          let c = textColor(rPr);
          if (!c) c = lum(bg) < .45 ? '#ffffff' : tx1;
          else if (Math.abs(lum(c) - lum(bg)) < .12) c = lum(bg) < .45 ? '#ffffff' : '#111111';   // never let text vanish into its background
          span.style.color = c; el.append(span);
        }
        if (!any && !bullet) { el.append(doc.createElement('br')); el.style.minHeight = '1em'; }
        else if (!any) continue;
        box.append(el);
      }
    }

    // pictures
    async function picture(pic, ctx, into, tf) {
      if (state.images >= LIMITS.images) { state.cut = true; return; }
      const spPr = kid(pic, 'spPr'), xf = kid(spPr, 'xfrm'), bf = kid(pic, 'blipFill'), blip = bf && kid(bf, 'blip');
      const id = blip && (blip.getAttribute('r:embed') || blip.getAttribute('embed')), rel = id && ctx.rels.get(id);
      if (!rel || !xf) return;
      const type = IMAGE_TYPES[rel.target.slice(rel.target.lastIndexOf('.') + 1).toLowerCase()];
      if (!type || !zip.has(rel.target)) return;
      try {
        const data = await zip.read(rel.target, LIMITS.image), box = mk('div', 'bs-pp-pic');
        if (!place(box, xf, tf)) return;
        const img = mk('img'); img.alt = ''; img.src = URL.createObjectURL(new Blob([data], { type })); state.urls.push(img.src); state.images++;
        const src = kid(bf, 'srcRect');   // a cropped picture shows only part of the image
        if (src) {
          const l = num(at(src, 'l')) / 100000, t = num(at(src, 't')) / 100000, r = num(at(src, 'r')) / 100000, b = num(at(src, 'b')) / 100000, vw = 1 - l - r, vh = 1 - t - b;
          if (vw > .02 && vh > .02) { img.style.position = 'absolute'; img.style.width = (100 / vw).toFixed(2) + '%'; img.style.height = (100 / vh).toFixed(2) + '%'; img.style.left = (-l / vw * 100).toFixed(2) + '%'; img.style.top = (-t / vh * 100).toFixed(2) + '%'; }
        }
        box.append(img); into.append(box);
      } catch (e) { /* a picture that cannot be read is left out */ }
    }

    // tables, and a quiet placeholder for charts and diagrams
    async function frame(gf, ctx, into, tf) {
      const xf = kid(gf, 'xfrm'), box = mk('div', 'bs-pp-frame');
      if (!place(box, xf, tf)) return;
      const tbl = deep(gf, 'tbl');
      if (!tbl) { box.append(mk('div', 'bs-pp-skip', 'Chart or diagram (not shown in the preview)')); into.append(box); return; }
      const table = mk('table', 'bs-pp-table'), grid = kid(tbl, 'tblGrid'), cols = kids(grid, 'gridCol').map(c => num(at(c, 'w')));
      const total = cols.reduce((a, b) => a + b, 0) || 1, cg = mk('colgroup');
      for (const w of cols) { const c = mk('col'); c.style.width = (w / total * 100).toFixed(2) + '%'; cg.append(c); }
      table.append(cg);
      for (const tr of kids(tbl, 'tr')) {
        if (++state.nodes > LIMITS.nodes) { state.cut = true; break; }
        const row = mk('tr');
        for (const tc of kids(tr, 'tc')) {
          if (at(tc, 'hMerge') === '1' || at(tc, 'vMerge') === '1') continue;
          const td = mk('td'), pr = kid(tc, 'tcPr'), f = fillOf(pr);
          if (at(tc, 'gridSpan')) td.colSpan = Math.max(1, Math.min(30, num(at(tc, 'gridSpan'), 1)));
          if (at(tc, 'rowSpan')) td.rowSpan = Math.max(1, Math.min(60, num(at(tc, 'rowSpan'), 1)));
          if (f) td.style.background = f;
          const tb = kid(tc, 'txBody');
          if (tb) { const cell = mk('div', 'bs-pp-cell'); await text(tb, null, null, null, ctx, cell, f); td.append(cell); }
          row.append(td);
        }
        table.append(row);
      }
      box.append(table); into.append(box);
    }

    // ---- the slides
    const deck = mk('div', 'bs-pp');
    let n = 0;
    for (const path of slidePaths.slice(0, LIMITS.slides)) {
      n++;
      const sx = await xml(path); if (!sx) continue;
      const rels = await relsOf(path), layoutRel = [...rels.values()].find(r => r.type === 'slideLayout');
      const layout = layoutRel && await xml(layoutRel.target), lrels = layoutRel ? await relsOf(layoutRel.target) : new Map();
      const masterRel = [...lrels.values()].find(r => r.type === 'slideMaster'), master = masterRel && await xml(masterRel.target), mrels = masterRel ? await relsOf(masterRel.target) : new Map();
      const sld = kid(sx, 'cSld'), bgOf = n => { const b = kid(kid(n, 'cSld'), 'bg'), p = kid(b, 'bgPr'), r = kid(b, 'bgRef'); return p ? fillOf(p) : r ? color(r) : null; };
      const bg = bgOf(sx) || (layout && bgOf(layout)) || (master && bgOf(master)) || '#ffffff';
      const card = mk('section', 'bs-pp-slide'); card.setAttribute('aria-label', 'Slide ' + n);
      const slide = mk('div', 'bs-pp-canvas'); slide.style.background = bg; slide.style.aspectRatio = W + ' / ' + H;
      const txStyles = master && kid(master, 'txStyles');
      const base = { bg, txStyles, rels, layoutTree: layout && kid(kid(layout, 'cSld'), 'spTree'), masterTree: master && kid(kid(master, 'cSld'), 'spTree') };
      const showMaster = at(sx, 'showMasterSp') !== '0' && !(layout && at(layout, 'showMasterSp') === '0');
      if (master && showMaster && base.masterTree) await tree(base.masterTree, { ...base, rels: mrels }, slide, IDENT, true);
      if (layout && showMaster && base.layoutTree) await tree(base.layoutTree, { ...base, rels: lrels }, slide, IDENT, true);
      if (sld && kid(sld, 'spTree')) await tree(kid(sld, 'spTree'), base, slide, IDENT, false);
      card.append(slide, mk('div', 'bs-pp-num', 'Slide ' + n + ' of ' + slidePaths.length));
      deck.append(card);
      if (state.cut && state.nodes > LIMITS.nodes) break;
    }
    if (slidePaths.length > LIMITS.slides) state.cut = true;
    return { node: deck, urls: state.urls, cut: state.cut };
  }

  root.BahriaPptx = { render };
})(globalThis);
