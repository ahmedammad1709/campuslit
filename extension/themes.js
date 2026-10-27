(function (root) {
  'use strict';
  // ---- the six built-in themes -------------------------------------------------------------------------------
  const themes = {
    navy: { name: 'Bahria', description: 'Deep navy, gold accents', bg: '#f3f5fa', surface: '#ffffff', soft: '#e8edfa', ink: '#0e1a33', muted: '#58698a', line: '#e0e6f2', nav: '#0b1d40', navInk: '#c7d3ee', accent: '#2f5bea', gold: '#f2b84b', dark: false },
    classic: { name: 'Crystal', description: 'Bright, clear, focused', bg: '#f8f9fc', surface: '#ffffff', soft: '#edf1ff', ink: '#292d3b', muted: '#677083', line: '#e5e8f0', nav: '#fcfcfe', navInk: '#4a5366', accent: '#4263eb', gold: '#4263eb', dark: false },
    midnight: { name: 'Midnight', description: 'A quieter kind of dark', bg: '#191a20', surface: '#23242c', soft: '#323645', ink: '#efeff5', muted: '#b0b2c3', line: '#3a3b47', nav: '#1f2028', navInk: '#d8d9e5', accent: '#a5b5ff', gold: '#a5b5ff', dark: true },
    pearl: { name: 'Linen', description: 'Warm, soft, considered', bg: '#f7f6f3', surface: '#fffefd', soft: '#f0ebe3', ink: '#35342f', muted: '#726b60', line: '#e5e0d8', nav: '#f5f2ec', navInk: '#5a5348', accent: '#80613d', gold: '#80613d', dark: false },
    sage: { name: 'Grove', description: 'A breath of fresh air', bg: '#f5f8f6', surface: '#ffffff', soft: '#e5f1eb', ink: '#253b31', muted: '#607366', line: '#dce7df', nav: '#f0f5f2', navInk: '#466151', accent: '#2d7c5b', gold: '#2d7c5b', dark: false },
    rose: { name: 'Bloom', description: 'A softer point of view', bg: '#fcf7fa', surface: '#ffffff', soft: '#f9e8f1', ink: '#422d3c', muted: '#826578', line: '#eddee7', nav: '#fcf0f6', navInk: '#76506a', accent: '#b73c7d', gold: '#b73c7d', dark: false }
  };
  const CUSTOM_ESSENTIALS = ['bg', 'surface', 'nav', 'ink', 'accent'];
  const CUSTOM_OPTIONAL = ['soft', 'line', 'muted', 'navInk', 'gold'];
  const defaults = { enabled: true, cms: true, lms: true, theme: 'navy', mode: 'preset', accent: '', font: 'jakarta', fontSize: 15, density: 'comfortable', radius: 10, motion: true, cleanBackground: false, custom: null, semesterWeeks: 16, reminders: true };
  const fonts = { jakarta: '"Bahria Jakarta", "Plus Jakarta Sans", "Segoe UI", sans-serif', manrope: '"Bahria Manrope", Manrope, "Segoe UI", sans-serif', sora: '"Bahria Sora", Sora, "Segoe UI", sans-serif', inter: '"Bahria Inter", Inter, Arial, sans-serif', system: '"Segoe UI", system-ui, sans-serif', humanist: '"Trebuchet MS", "Segoe UI", sans-serif', serif: 'Georgia, "Times New Roman", serif' };
  const HEX = /^#[0-9a-f]{6}$/i;

  // ---- colour maths -----------------------------------------------------------------------------------------
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const x = rgb(a), y = rgb(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }   // t = 0 gives a, t = 1 gives b
  function toHsl(hex) {
    const [r, g, b] = rgb(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  function luminance(hex) {
    const c = rgb(hex).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  }
  function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  const isDark = hex => ratio(hex, '#ffffff') > ratio(hex, '#000000');

  // ---- custom theme: validation, derivation, generation, accessibility -------------------------------------
  function normalizeCustom(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const out = {};
    for (const key of CUSTOM_ESSENTIALS) {
      if (typeof input[key] !== 'string' || !HEX.test(input[key])) return null;
      out[key] = input[key].toLowerCase();
    }
    for (const key of CUSTOM_OPTIONAL) out[key] = typeof input[key] === 'string' && HEX.test(input[key]) ? input[key].toLowerCase() : '';
    const name = typeof input.name === 'string' ? input.name.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) : '';
    out.name = name || 'My theme';
    return out;
  }
  // The user picks five colours; the rest are derived so the theme stays coherent. Anything they set by hand wins.
  function deriveCustom(c) {
    const dark = isDark(c.bg), navDark = isDark(c.nav);
    let muted = c.muted;
    if (!muted) { muted = c.ink; for (let t = .42; t >= 0; t -= .04) { const m = mix(c.ink, c.surface, t); if (ratio(m, c.surface) >= 4.5) { muted = m; break; } } }
    let navInk = c.navInk;
    if (!navInk) { const base = navDark ? '#ffffff' : c.ink; navInk = navDark ? '#ffffff' : '#000000'; for (let t = .2; t >= 0; t -= .04) { const m = mix(base, c.nav, t); if (ratio(m, c.nav) >= 4.5) { navInk = m; break; } } }
    return {
      name: c.name || 'My theme', description: 'Your own palette',
      bg: c.bg, surface: c.surface, ink: c.ink, nav: c.nav, accent: c.accent,
      soft: c.soft || mix(c.surface, c.accent, dark ? .17 : .09),
      line: c.line || mix(c.bg, c.ink, dark ? .16 : .1),
      muted, navInk,
      gold: c.gold || (navDark ? '#f2b84b' : c.accent),
      dark
    };
  }
  function customFromPalette(p, name) {
    return normalizeCustom({ bg: p.bg, surface: p.surface, nav: p.nav, ink: p.ink, accent: p.accent, name: name || 'My theme' });
  }
  // Builds a full coherent palette from one brand colour. mode: 'light' | 'dark'. side: 'deep' | 'tinted' | 'soft'.
  function generateCustom({ accent, mode = 'light', side = 'deep', name = 'My theme' }) {
    const [h, s0] = toHsl(accent), k = Math.max(.25, Math.min(1, s0 / .5));
    const dark = mode === 'dark';
    const surface = dark ? fromHsl(h, .14 * k, .135) : '#ffffff';
    let brand = accent;   // keep the accent clearly visible on the cards (3.3:1), nudging lightness only as far as needed
    for (let i = 0; i < 50 && ratio(brand, surface) < 3.3; i++) { const [bh, bs, bl] = toHsl(brand); brand = fromHsl(bh, bs, bl + (dark ? .02 : -.02)); }
    const navs = dark ? { deep: fromHsl(h, .18 * k, .065), tinted: fromHsl(h, .32 * k, .15), soft: fromHsl(h, .14 * k, .17) }
                      : { deep: fromHsl(h, .6 * k, .15), tinted: fromHsl(h, .45 * k, .93), soft: fromHsl(h, .25 * k, .99) };
    return normalizeCustom({
      bg: dark ? fromHsl(h, .16 * k, .095) : fromHsl(h, .32 * k, .965),
      surface,
      ink: dark ? fromHsl(h, .2 * k, .94) : fromHsl(h, .38 * k, .13),
      nav: navs[side] || navs.deep, accent: brand, name
    });
  }
  function surpriseCustom() {
    const hues = [214, 232, 262, 292, 330, 350, 12, 28, 42, 156, 172, 190];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const dark = Math.random() < .3, h = pick(hues);
    const options = { mode: dark ? 'dark' : 'light', side: pick(['deep', 'tinted', 'soft']), accent: fromHsl(h, .68, dark ? .66 : .5) };
    return { options, custom: generateCustom(options) };
  }
  function contrastReport(custom) {
    const p = deriveCustom(custom), onAccent = ratio(p.accent, '#ffffff') >= ratio(p.accent, '#000000') ? '#ffffff' : '#000000';
    const row = (id, label, hint, fg, bg, min) => { const r = ratio(fg, bg); return { id, label, hint, fg, bg, ratio: Math.round(r * 10) / 10, min, pass: r >= min }; };
    return [
      row('ink-bg', 'Text on page', 'Body text over the page background', p.ink, p.bg, 4.5),
      row('ink-surface', 'Text on cards', 'Headings and tables on cards', p.ink, p.surface, 4.5),
      row('muted', 'Secondary text', 'Captions and labels', p.muted, p.surface, 4.5),
      row('navInk', 'Sidebar text', 'Menu items on the sidebar', p.navInk, p.nav, 4.5),
      row('button', 'Button label', 'Text on accent buttons', onAccent, p.accent, 4.5),
      row('accent', 'Accent on cards', 'Accent must stay visible on cards', p.accent, p.surface, 3)
    ];
  }
  // Repairs only what fails; everything that already passes is left exactly as the user set it.
  function fixCustom(c) {
    const n = { ...c };
    // If no text colour can be read on both the page and the cards (a dark page behind light cards, say),
    // pull the page toward the cards just far enough that one can.
    const edge = t => Math.max(...['#000000', '#ffffff'].map(k => Math.min(ratio(k, n.bg), ratio(k, n.surface))));
    for (let i = 0; i <= 25 && edge() < 6; i++) n.bg = mix(c.bg, n.surface, i / 25);
    const worst = ink => Math.min(ratio(ink, n.bg), ratio(ink, n.surface));
    const candidates = ['#000000', '#ffffff'].map(target => { let ink = c.ink; for (let i = 0; i <= 25 && worst(ink) < 7; i++) ink = mix(c.ink, target, i / 25); return ink; });
    n.ink = worst(candidates[0]) >= worst(candidates[1]) ? candidates[0] : candidates[1];
    for (let i = 0; i <= 25 && ratio(n.accent, n.surface) < 3.2; i++) n.accent = mix(c.accent, isDark(n.surface) ? '#ffffff' : '#000000', i / 25);
    if (n.muted && ratio(n.muted, n.surface) < 4.5) n.muted = '';
    if (n.navInk && ratio(n.navInk, n.nav) < 4.5) n.navInk = '';
    return normalizeCustom(n);
  }

  // ---- settings ---------------------------------------------------------------------------------------------
  function normalize(input) {
    const value = input && typeof input === 'object' ? input : {};
    const s = { ...defaults };
    for (const key of ['enabled', 'cms', 'lms', 'motion', 'cleanBackground', 'reminders']) if (typeof value[key] === 'boolean') s[key] = value[key];
    for (const [key, allowed] of Object.entries({ theme: [...Object.keys(themes), 'custom'], mode: ['preset', 'system'], font: Object.keys(fonts), density: ['compact', 'comfortable', 'spacious'] })) if (allowed.includes(value[key])) s[key] = value[key];
    for (const [key, min, max] of [['fontSize', 13, 19], ['radius', 0, 20], ['semesterWeeks', 8, 24]]) if (Number.isFinite(value[key])) s[key] = Math.min(max, Math.max(min, Math.round(value[key])));
    if (typeof value.accent === 'string' && HEX.test(value.accent)) s.accent = value.accent;
    s.custom = normalizeCustom(value.custom);
    if (s.theme === 'custom' && !s.custom) s.theme = defaults.theme;
    return s;
  }
  function palette(input, systemDark = false) {
    const s = normalize(input);
    const t = s.theme === 'custom' ? deriveCustom(s.custom) : (s.mode === 'system' && systemDark ? themes.midnight : themes[s.theme]);   // a custom theme is never swapped for Midnight
    const accent = s.accent || t.accent;
    const onAccent = ratio(accent, '#ffffff') >= ratio(accent, '#000000') ? '#ffffff' : '#000000';
    const link = ratio(accent, t.surface) >= 4.5 ? accent : t.ink;
    return { ...t, accent, onAccent, link };
  }
  function apply(element, input, systemDark = false) {
    const s = normalize(input), p = palette(s, systemDark);
    for (const key of ['bg', 'surface', 'soft', 'ink', 'muted', 'line', 'nav', 'navInk', 'accent', 'gold', 'onAccent', 'link']) element.style.setProperty('--bs-' + key, p[key]);
    element.style.setProperty('--bs-navOn', ratio(p.nav, '#ffffff') >= ratio(p.nav, p.ink) ? '#ffffff' : p.ink);
    element.style.setProperty('--bs-font', fonts[s.font]);
    element.style.setProperty('--bs-size', s.fontSize + 'px');
    element.style.setProperty('--bs-radius', s.radius + 'px');
    element.style.setProperty('--bs-pad', ({compact: 8, comfortable: 13, spacious: 18})[s.density] + 'px');
    element.dataset.bsDark = String(p.dark);
  }
  const fontFiles = { jakarta: ['Bahria Jakarta', 'fonts/jakarta-latin.woff2'], manrope: ['Bahria Manrope', 'fonts/manrope-latin.woff2'], sora: ['Bahria Sora', 'fonts/sora-latin.woff2'], inter: ['Bahria Inter', 'fonts/inter-latin.woff2'] };
  // Master switch with two children. Master on/off forces both portals on/off; a portal switch changes only that portal,
  // and the master follows: on while at least one portal is on.
  function power(current, key, value) {
    const s = normalize(current), on = Boolean(value);
    if (key === 'enabled') return { ...s, enabled: on, cms: on, lms: on };
    const next = { ...s, [key]: on };
    next.enabled = next.cms || next.lms;
    return next;
  }
  root.BahriaStudio = {
    power, fontFiles, themes, defaults, normalize, palette, apply, ratio, fonts, luminance,
    CUSTOM_ESSENTIALS, CUSTOM_OPTIONAL, normalizeCustom, deriveCustom, customFromPalette, generateCustom, surpriseCustom, contrastReport, fixCustom, mix, toHsl, fromHsl, isDark
  };
})(globalThis);
