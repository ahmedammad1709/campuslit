(function (root) {
  'use strict';
  const themes = {
    navy: { name: 'Bahria', description: 'Deep navy, gold accents', bg: '#f3f5fa', surface: '#ffffff', soft: '#e8edfa', ink: '#0e1a33', muted: '#58698a', line: '#e0e6f2', nav: '#0b1d40', navInk: '#c7d3ee', accent: '#2f5bea', gold: '#f2b84b', dark: false },
    classic: { name: 'Crystal', description: 'Bright, clear, focused', bg: '#f8f9fc', surface: '#ffffff', soft: '#edf1ff', ink: '#292d3b', muted: '#677083', line: '#e5e8f0', nav: '#fcfcfe', navInk: '#4a5366', accent: '#4263eb', gold: '#4263eb', dark: false },
    midnight: { name: 'Midnight', description: 'A quieter kind of dark', bg: '#191a20', surface: '#23242c', soft: '#323645', ink: '#efeff5', muted: '#b0b2c3', line: '#3a3b47', nav: '#1f2028', navInk: '#d8d9e5', accent: '#a5b5ff', gold: '#a5b5ff', dark: true },
    pearl: { name: 'Linen', description: 'Warm, soft, considered', bg: '#f7f6f3', surface: '#fffefd', soft: '#f0ebe3', ink: '#35342f', muted: '#726b60', line: '#e5e0d8', nav: '#f5f2ec', navInk: '#5a5348', accent: '#80613d', gold: '#80613d', dark: false },
    sage: { name: 'Grove', description: 'A breath of fresh air', bg: '#f5f8f6', surface: '#ffffff', soft: '#e5f1eb', ink: '#253b31', muted: '#607366', line: '#dce7df', nav: '#f0f5f2', navInk: '#466151', accent: '#2d7c5b', gold: '#2d7c5b', dark: false },
    rose: { name: 'Bloom', description: 'A softer point of view', bg: '#fcf7fa', surface: '#ffffff', soft: '#f9e8f1', ink: '#422d3c', muted: '#826578', line: '#eddee7', nav: '#fcf0f6', navInk: '#76506a', accent: '#b73c7d', gold: '#b73c7d', dark: false }
  };
  const defaults = { enabled: true, cms: true, lms: true, theme: 'navy', mode: 'preset', accent: '', font: 'jakarta', fontSize: 15, density: 'comfortable', radius: 10, motion: true, cleanBackground: true };
  const fonts = { jakarta: '"Bahria Jakarta", "Plus Jakarta Sans", "Segoe UI", sans-serif', manrope: '"Bahria Manrope", Manrope, "Segoe UI", sans-serif', sora: '"Bahria Sora", Sora, "Segoe UI", sans-serif', inter: '"Bahria Inter", Inter, Arial, sans-serif', system: '"Segoe UI", system-ui, sans-serif', humanist: '"Trebuchet MS", "Segoe UI", sans-serif', serif: 'Georgia, "Times New Roman", serif' };
  function normalize(input) {
    const value = input && typeof input === 'object' ? input : {};
    const s = { ...defaults };
    for (const key of ['enabled', 'cms', 'lms', 'motion', 'cleanBackground']) if (typeof value[key] === 'boolean') s[key] = value[key];
    for (const [key, allowed] of Object.entries({ theme: Object.keys(themes), mode: ['preset', 'system'], font: Object.keys(fonts), density: ['compact', 'comfortable', 'spacious'] })) if (allowed.includes(value[key])) s[key] = value[key];
    for (const [key, min, max] of [['fontSize', 13, 19], ['radius', 0, 20]]) if (Number.isFinite(value[key])) s[key] = Math.min(max, Math.max(min, Math.round(value[key])));
    if (typeof value.accent === 'string' && /^#[0-9a-f]{6}$/i.test(value.accent)) s.accent = value.accent;
    return s;
  }
  function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  function palette(input, systemDark = false) {
    const s = normalize(input);
    const t = themes[s.mode === 'system' && systemDark ? 'midnight' : s.theme];
    const accent = s.accent || t.accent;
    const onAccent = ratio(accent, '#ffffff') >= ratio(accent, '#000000') ? '#ffffff' : '#000000';
    const link = ratio(accent, t.surface) >= 4.5 ? accent : t.ink;
    return { ...t, accent, onAccent, link };
  }
  function apply(element, input, systemDark = false) {
    const s = normalize(input), p = palette(s, systemDark);
    for (const key of ['bg', 'surface', 'soft', 'ink', 'muted', 'line', 'nav', 'navInk', 'accent', 'gold', 'onAccent', 'link']) element.style.setProperty('--bs-' + key, p[key]);
    element.style.setProperty('--bs-navOn', luminance(p.nav) < .3 ? '#ffffff' : p.ink);
    element.style.setProperty('--bs-font', fonts[s.font]);
    element.style.setProperty('--bs-size', s.fontSize + 'px');
    element.style.setProperty('--bs-radius', s.radius + 'px');
    element.style.setProperty('--bs-pad', ({compact: 8, comfortable: 13, spacious: 18})[s.density] + 'px');
    element.dataset.bsDark = String(p.dark);
  }
  const fontFiles = { jakarta: ['Bahria Jakarta', 'fonts/jakarta-latin.woff2'], manrope: ['Bahria Manrope', 'fonts/manrope-latin.woff2'], sora: ['Bahria Sora', 'fonts/sora-latin.woff2'], inter: ['Bahria Inter', 'fonts/inter-latin.woff2'] };
  root.BahriaStudio = { fontFiles, themes, defaults, normalize, palette, apply, ratio, fonts };
})(globalThis);
