'use strict';
const B = BahriaStudio;
let settings = B.normalize({});
let saving = false;
const status = document.getElementById('status');
const system = matchMedia('(prefers-color-scheme: dark)');

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
// A theme is a small picture of the portal in its own colours (the same drawing the settings page uses), with its name under it.
function sample(p) {
  const s = el('span', 'theme-sample'); s.setAttribute('aria-hidden', 'true');
  for (const [k, v] of [['bg', p.bg], ['nav', p.nav], ['surface', p.surface], ['accent', p.accent], ['ink', p.ink], ['navink', p.navInk]]) s.style.setProperty('--sw-' + k, v);
  const nav = el('span', 'ts-nav'); nav.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  const main = el('span', 'ts-main'), cards = el('span', 'ts-cards'); cards.append(document.createElement('i'), document.createElement('i'));
  main.append(el('i', 'ts-bar'), cards, el('i', 'ts-btn'));
  s.append(nav, main);
  return s;
}
function swatch(p, name, pressed, title) {
  const b = el('button', 'pop-swatch'); b.type = 'button'; b.title = title; b.setAttribute('aria-pressed', String(pressed));
  b.append(sample(p), el('span', 'pop-name', name));
  if (pressed) { const c = el('span', 'pop-check'); c.setAttribute('aria-hidden', 'true'); c.innerHTML = StudioIcons.svg('check'); b.append(c); }
  return b;
}
function render() {
  for (const k of ['enabled', 'cms', 'lms']) document.getElementById(k).checked = settings[k];
  document.getElementById('system-note').textContent = settings.theme === 'custom' ? 'Not used with your custom theme' : 'Midnight when your device is dark';
  document.getElementById('system').checked = settings.mode === 'system';
  const grid = document.getElementById('themes'); grid.replaceChildren();
  for (const [id, theme] of Object.entries(B.themes)) {
    const b = swatch(theme, theme.name, settings.theme === id, theme.name + ' \u00b7 ' + theme.description);
    b.addEventListener('click', () => save({ theme: id, accent: '', mode: 'preset' }));
    grid.append(b);
  }
  // the seventh, on a row of its own: the one theme the user designs (or the way to start it)
  const c = settings.custom;
  let b;
  if (c) {
    b = swatch(B.deriveCustom(c), c.name, settings.theme === 'custom', c.name + ' \u00b7 your custom theme');
    b.insertBefore(el('span', 'pop-note', 'Your theme'), b.querySelector('.pop-check'));   // the tick stays at the far end
    b.addEventListener('click', () => save({ theme: 'custom', accent: '' }));
  } else {
    b = el('button', 'pop-swatch empty'); b.type = 'button'; b.title = 'Design your own theme'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Create your own custom theme');
    const plus = el('span', 'theme-sample'); plus.setAttribute('aria-hidden', 'true'); plus.innerHTML = StudioIcons.svg('plus');
    b.append(plus, el('span', 'pop-name', 'Custom'), el('span', 'pop-note', 'Design your own')); b.addEventListener('click', openStudio);
  }
  b.classList.add('custom');
  grid.append(b);
}
function openStudio() {
  const api = globalThis.browser || globalThis.chrome;
  // Open the settings page straight on its Custom theme section.
  if (StudioStorage.isExtension && api.tabs && api.tabs.create) api.tabs.create({ url: api.runtime.getURL('options.html#studio') });
  else location.href = 'options.html#studio';
}
async function save(patch) {
  if (saving) return; saving = true;
  const focusedId = document.activeElement?.id;
  document.querySelectorAll('button,input').forEach(e => e.disabled = true);
  try {
    const next = patch.power ? B.power(settings, patch.power[0], patch.power[1]) : { ...settings, ...patch };
    settings = await StudioStorage.write(next);
    status.textContent = StudioStorage.isExtension ? 'Saved. Portals update automatically.' : 'Saved in browser preview only.';
  } catch { status.textContent = 'Could not save. Please try again.'; }
  finally { saving = false; render(); document.querySelectorAll('button,input').forEach(e => e.disabled = false); if (focusedId) document.getElementById(focusedId)?.focus(); else document.querySelector('.pop-swatch[aria-pressed="true"]')?.focus(); }
}
for (const k of ['enabled', 'cms', 'lms']) document.getElementById(k).addEventListener('change', e => save({ power: [k, e.target.checked] }));
document.getElementById('system').addEventListener('change', e => save({ mode: e.target.checked ? 'system' : 'preset' }));
document.getElementById('customize').addEventListener('click', () => StudioStorage.openOptions());
StudioStorage.subscribe(value => { if (!saving) { settings = value; render(); } });
StudioStorage.read().then(value => { settings = value; render(); }).catch(() => { render(); status.textContent = 'Could not load saved preferences.'; });
