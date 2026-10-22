'use strict';
// Studio: the custom theme maker inside the settings page.
// It never touches storage itself. It reads the settings being edited through ctx.get() and reports changes through
// ctx.setCustom(...) / ctx.restoreCustom(...) / ctx.removeCustom(), and the settings page does the saving.
// All text goes through textContent, so a theme name can never inject markup.
const StudioUI = (() => {
  const B = () => BahriaStudio;
  const ESSENTIAL = [
    { key: 'bg', label: 'Page background', hint: 'Behind your cards' },
    { key: 'surface', label: 'Cards & panels', hint: 'Tables, boxes and menus' },
    { key: 'nav', label: 'Sidebar & header', hint: 'The navigation block' },
    { key: 'ink', label: 'Text', hint: 'Headings and body copy' },
    { key: 'accent', label: 'Accent', hint: 'Buttons, links and highlights' }
  ];
  const FINE = [
    { key: 'soft', label: 'Soft fill', hint: 'Table headers and hover rows' },
    { key: 'line', label: 'Borders', hint: 'Dividers and outlines' },
    { key: 'muted', label: 'Secondary text', hint: 'Captions and labels' },
    { key: 'navInk', label: 'Sidebar text', hint: 'Menu items' },
    { key: 'gold', label: 'Highlight marker', hint: 'Marks the current page' }
  ];
  let ctx = null, root = null, built = false, undo = null, toastTimer = 0, armTimer = 0;
  let qp = { brand: '#2f5bea', mode: 'light', side: 'deep' }, qpReady = false;
  const refs = { rows: {}, fine: {} };

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function ic(name) { const s = document.createElement('span'); s.dataset.icon = name; s.dataset.iconDone = name; s.innerHTML = StudioIcons.svg(name); return s; }
  function btn(cls, label, icon) { const b = el('button', 'btn ' + cls); b.type = 'button'; if (icon) b.append(ic(icon)); b.append(document.createTextNode(label)); return b; }
  const HEX6 = /^#[0-9a-f]{6}$/i;

  // One colour control: native picker behind a swatch, plus a typed hex field that validates as you type.
  function colorControl(label, onValue) {
    const sw = el('label', 'swatch'), picker = document.createElement('input');
    picker.type = 'color'; picker.setAttribute('aria-label', label + ' color'); sw.append(picker);
    const hex = el('input', 'hex'); hex.type = 'text'; hex.maxLength = 7; hex.spellcheck = false; hex.autocomplete = 'off'; hex.setAttribute('aria-label', label + ' hex code'); hex.name = 'hex-' + label.toLowerCase().replace(/\W+/g, '-');
    const set = value => { sw.style.setProperty('--c', value); if (picker.value !== value) picker.value = value; if (document.activeElement !== hex) hex.value = value.toUpperCase(); hex.removeAttribute('aria-invalid'); };
    picker.addEventListener('input', () => onValue(picker.value));
    hex.addEventListener('input', () => {
      const t = hex.value.trim(), full = t.startsWith('#') ? t : '#' + t;
      if (HEX6.test(full)) { hex.removeAttribute('aria-invalid'); onValue(full.toLowerCase()); }
      else if (t && !/^#?[0-9a-f]{0,6}$/i.test(t)) hex.setAttribute('aria-invalid', 'true');
      else hex.removeAttribute('aria-invalid');
    });
    hex.addEventListener('blur', () => {
      const t = hex.value.trim().replace(/^#/, '');
      if (/^[0-9a-f]{3}$/i.test(t)) { onValue('#' + t.split('').map(c => c + c).join('').toLowerCase()); }
      else { hex.value = picker.value.toUpperCase(); hex.removeAttribute('aria-invalid'); }
    });
    return { sw, hex, picker, set };
  }
  function colorRow(def, fine) {
    const row = el('div', 'color-row'), control = colorControl(def.label, value => commit(def.key, value));
    const meta = el('div', 'color-meta'), title = el('strong', '', def.label);
    meta.append(title, el('small', '', def.hint));
    const wrap = el('div', 'hex-wrap');
    let pill = null, reset = null;
    if (fine) {
      pill = el('span', 'auto-pill', 'Auto'); title.append(document.createTextNode(' '), pill);
      reset = el('button', 'reset-auto', 'Reset'); reset.type = 'button'; reset.setAttribute('aria-label', 'Reset ' + def.label + ' to automatic');
      reset.addEventListener('click', () => commit(def.key, ''));
      wrap.append(control.hex, reset);
    } else wrap.append(control.hex);
    row.append(control.sw, meta, wrap);
    return { row, control, pill, reset };
  }
  function commit(key, value) { const c = ctx.get().custom; if (c) ctx.setCustom({ ...c, [key]: value }); }

  function toast(message, withUndo) {
    clearTimeout(toastTimer);
    const host = refs.toast; host.replaceChildren();
    const bar = el('div', 'toast'); bar.setAttribute('role', 'status');
    bar.append(el('span', '', message));
    if (withUndo) { const u = el('button', ''); u.type = 'button'; u.append(ic('undo'), document.createTextNode('Undo')); u.addEventListener('click', doUndo); bar.append(u); }
    host.append(bar);
    toastTimer = setTimeout(() => host.replaceChildren(), 9000);
  }
  function bulk(next, message) {
    const s = ctx.get();
    undo = { custom: s.custom, theme: s.theme };
    ctx.setCustom(next);
    toast(message, true);
  }
  function doUndo() {
    if (!undo) return;
    const u = undo; undo = null;
    ctx.restoreCustom(u.custom, u.theme);
    toast('Change undone.', false);
  }
  const currentName = () => { const c = ctx.get().custom; return c ? c.name : 'My theme'; };

  function build() {
    root.replaceChildren();
    // ---- empty state ----
    const empty = el('div', 'studio-empty');
    refs.start = btn('primary', 'Start from the current theme');
    const random0 = btn('secondary', 'Random palette');
    refs.start.addEventListener('click', () => bulk(B().customFromPalette(B().palette(ctx.get()), 'My theme'), 'Custom theme created.'));
    random0.addEventListener('click', () => randomPalette('My theme'));
    const rowBtns = el('div', 'btn-row'); rowBtns.append(refs.start, random0);
    const steps = el('ol', 'steps');
    for (const t of ['Start from the theme you are using, or from a random palette.', 'Change any color. Campuslit works out the rest and checks that text stays readable.', 'Save, and it appears as your seventh theme here and in the toolbar popup.']) steps.append(el('li', '', t));
    empty.append(el('h3', '', 'No custom theme yet'), el('p', '', 'Make a theme that is yours. You can change every color afterwards.'), steps, rowBtns);
    refs.empty = empty;

    // ---- editor ----
    const ed = el('div', 'studio-editor');
    const bar = el('div', 'studio-bar'), nameWrap = el('div', 'studio-name');
    const nameLabel = el('label', 'sr-only', 'Theme name'); nameLabel.htmlFor = 'studio-name';
    refs.name = document.createElement('input'); refs.name.id = 'studio-name'; refs.name.type = 'text'; refs.name.maxLength = 24; refs.name.autocomplete = 'off'; refs.name.spellcheck = false; refs.name.name = 'theme-name'; refs.name.placeholder = 'Name your theme…';
    refs.name.addEventListener('input', () => commit('name', refs.name.value));
    nameWrap.append(nameLabel, refs.name);
    bar.append(nameWrap);
    refs.inactive = el('div', 'inactive-note'); refs.inactive.append(el('span', '', 'You are previewing another theme.'));
    refs.use = btn('secondary sm', 'Use this theme'); refs.use.addEventListener('click', () => ctx.selectCustom()); refs.inactive.append(refs.use);
    refs.strip = el('div', 'palette-strip'); refs.strip.setAttribute('role', 'img');
    refs.stripCells = ['Page', 'Cards', 'Sidebar', 'Text', 'Accent'].map(t => { const s = el('span', '', t); refs.strip.append(s); return s; });

    // quick palette
    const quick = el('div', 'quick'); const qh = el('h4', '', 'Generate from a color'); quick.append(qh);
    const split = el('div', 'quick-split');
    const left = el('div'); left.append(el('span', 'field-label', 'Brand color')); left.firstChild.style.marginTop = '0';
    const brand = colorControl('Brand', value => { qp.brand = value; brand.set(value); });
    refs.brand = brand; const pick = el('div', 'brand-pick'); pick.append(brand.sw, brand.hex); left.append(pick);
    const right = el('div'); const ml = el('span', 'field-label', 'Mode'); ml.style.marginTop = '0'; ml.id = 'qp-mode-label'; right.append(ml);
    refs.mode = el('div', 'segmented block'); refs.mode.setAttribute('role', 'group'); refs.mode.setAttribute('aria-labelledby', 'qp-mode-label');
    for (const [id, label, icon] of [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']]) {
      const b = el('button', ''); b.type = 'button'; b.dataset.mode = id; b.append(ic(icon), document.createTextNode(label)); b.addEventListener('click', () => { qp.mode = id; syncQuick(); }); refs.mode.append(b);
    }
    right.append(refs.mode); split.append(left, right); quick.append(split);
    const sl = el('span', 'field-label', 'Sidebar style'); sl.id = 'qp-side-label'; quick.append(sl);
    refs.side = el('div', 'segmented block'); refs.side.setAttribute('role', 'group'); refs.side.setAttribute('aria-labelledby', 'qp-side-label');
    for (const [id, label] of [['deep', 'Deep'], ['tinted', 'Tinted'], ['soft', 'Soft']]) { const b = el('button', '', label); b.type = 'button'; b.dataset.side = id; b.addEventListener('click', () => { qp.side = id; syncQuick(); }); refs.side.append(b); }
    quick.append(refs.side);
    const gen = btn('primary', 'Generate palette'), sur = btn('secondary', 'Random palette');
    gen.addEventListener('click', () => bulk(B().generateCustom({ accent: qp.brand, mode: qp.mode, side: qp.side, name: currentName() }), 'New palette generated.'));
    sur.addEventListener('click', () => randomPalette(currentName()));
    const qb = el('div', 'btn-row'); qb.append(gen, sur); quick.append(qb);
    const pl = el('span', 'field-label', 'Or copy the colors of a theme'); quick.append(pl);
    const chips = el('div', 'chips');
    for (const [id, t] of Object.entries(B().themes)) {
      const chip = el('button', 'preset-chip'); chip.type = 'button'; chip.style.setProperty('--a', t.nav); chip.style.setProperty('--b', t.accent);
      chip.append(document.createElement('i'), document.createTextNode(t.name));
      chip.setAttribute('aria-label', 'Copy colors from ' + t.name);
      chip.addEventListener('click', () => bulk(B().customFromPalette(t, currentName()), t.name + ' colors copied.'));
      chips.append(chip);
    }
    quick.append(chips);

    // colours
    const colors = el('section', 'group'); const ct = el('div', 'group-title'); ct.append(el('h3', '', 'Colors')); colors.append(ct);
    for (const def of ESSENTIAL) { const r = colorRow(def, false); refs.rows[def.key] = r; colors.append(r.row); }
    const fine = el('details', 'fine'); const fs = el('summary'); fs.append(el('span', '', 'Fine-tune'), el('small', '', 'Optional. Everything here is automatic.'));
    fine.append(fs);
    for (const def of FINE) { const r = colorRow(def, true); refs.fine[def.key] = r; fine.append(r.row); }
    colors.append(fine);

    // accessibility
    const a11y = el('section', 'a11y'); const ah = el('div', 'a11y-head'); const at = el('h4', '', 'Readability');
    refs.summary = el('span', 'a11y-summary'); refs.summary.setAttribute('role', 'status'); refs.summary.setAttribute('aria-live', 'polite');
    ah.append(at, refs.summary); refs.list = el('ul'); refs.fix = btn('secondary sm', 'Fix automatically'); refs.fix.addEventListener('click', () => bulk(B().fixCustom(ctx.get().custom), 'Readability fixed.'));
    a11y.append(ah, refs.list, refs.fix);

    refs.toast = el('div'); refs.toast.setAttribute('aria-live', 'polite');
    const foot = el('div', 'studio-foot');
    refs.remove = btn('danger sm', 'Remove custom theme', 'trash');
    refs.remove.addEventListener('click', () => {
      if (!refs.remove.dataset.armed) { refs.remove.dataset.armed = '1'; refs.remove.lastChild.textContent = 'Click again to remove'; clearTimeout(armTimer); armTimer = setTimeout(disarm, 4000); return; }
      disarm(); undo = null; ctx.removeCustom();
    });
    foot.append(refs.remove);
    ed.append(bar, refs.inactive, refs.strip, refs.toast, quick, colors, a11y, foot);
    refs.editor = ed;
    root.append(empty, ed);
    built = true;
  }
  function disarm() { clearTimeout(armTimer); if (refs.remove) { delete refs.remove.dataset.armed; refs.remove.lastChild.textContent = 'Remove custom theme'; } }
  function randomPalette(name) {
    const r = B().surpriseCustom();
    qp = { brand: r.options.accent, mode: r.options.mode, side: r.options.side };
    bulk(B().normalizeCustom({ ...r.custom, name }), 'Random palette applied.');
  }
  function syncQuick() {
    refs.brand.set(qp.brand);
    refs.mode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === qp.mode)));
    refs.side.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === qp.side)));
  }

  function refresh() {
    if (!built) return;
    const s = ctx.get(), c = s.custom;
    refs.empty.hidden = Boolean(c); refs.editor.hidden = !c;
    if (!c) { qpReady = false; disarm(); return; }
    const p = B().deriveCustom(c);
    if (!qpReady) { qp = { brand: c.accent, mode: p.dark ? 'dark' : 'light', side: qp.side }; qpReady = true; syncQuick(); }
    if (document.activeElement !== refs.name) refs.name.value = c.name;
    refs.inactive.hidden = s.theme === 'custom';
    [p.bg, p.surface, p.nav, p.ink, p.accent].forEach((v, i) => { refs.stripCells[i].style.background = v; refs.stripCells[i].style.color = B().ratio(v, '#ffffff') >= B().ratio(v, '#000000') ? '#ffffff' : '#000000'; });
    refs.strip.setAttribute('aria-label', 'Palette preview: ' + c.name);
    for (const def of ESSENTIAL) refs.rows[def.key].control.set(c[def.key]);
    for (const def of FINE) { const r = refs.fine[def.key]; r.control.set(p[def.key]); r.pill.hidden = Boolean(c[def.key]); r.reset.hidden = !c[def.key]; }
    // readability checks
    const report = B().contrastReport(c), failing = report.filter(r => !r.pass).length;
    refs.summary.className = 'a11y-summary ' + (failing ? 'bad' : 'ok');
    refs.summary.textContent = failing ? failing + (failing === 1 ? ' check needs attention' : ' checks need attention') : 'All checks pass';
    refs.fix.hidden = !failing;
    refs.list.replaceChildren(...report.map(r => {
      const li = el('li'), aa = el('span', 'sample-aa', 'Aa'); aa.style.background = r.bg; aa.style.color = r.fg; aa.setAttribute('aria-hidden', 'true');
      const t = el('div'); t.append(el('strong', '', r.label), el('small', '', r.hint));
      const score = el('span', 'score ' + (r.pass ? 'ok' : 'bad')); score.append(ic(r.pass ? 'check' : 'eye'), document.createTextNode(r.ratio.toFixed(1) + ':1'));
      score.title = (r.pass ? 'Passes' : 'Below') + ' the ' + r.min + ':1 guideline';
      li.append(aa, t, score); return li;
    }));
  }
  function init(context) { ctx = context; root = document.getElementById('studio-root'); build(); refresh(); }
  return { init, refresh };
})();
